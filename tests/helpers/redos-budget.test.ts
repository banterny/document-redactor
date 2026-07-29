/**
 * Self-check for the ReDoS budget instrument.
 *
 * The eighteen co-located `expectFast` helpers are only contention-resistant
 * for as long as `measureMs` is actually thread-scoped. If `threadCpuUsage`
 * ever disappears (a runtime change, or the suite being run under bun rather
 * than node), `nowMs` falls back to wall-clock and every one of those
 * assertions silently goes back to measuring scheduler pressure. Silent
 * degradation of a safety gate is the specific failure mode this repo has been
 * burned by, so it gets a test rather than a comment.
 */
import { Worker } from "node:worker_threads";

import { describe, expect, it } from "vitest";

import { THREAD_CPU_AVAILABLE, measureMs, nowMs } from "./redos-budget.js";

/** Burn CPU on a sibling thread for `ms`, resolving when it has finished. */
function burnOnSiblingThread(ms: number): Promise<void> {
  const source = `
    const { performance } = require("node:perf_hooks");
    const until = performance.now() + ${ms};
    let x = 0;
    while (performance.now() < until) x += Math.sqrt(x + 1);
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, { eval: true });
    worker.on("exit", () => resolve());
    worker.on("error", reject);
  });
}

describe("ReDoS budget instrument", () => {
  it("uses the thread-scoped CPU clock, not wall-clock", () => {
    // If this fails, `nowMs` has fallen back to `performance.now()` and every
    // co-located ReDoS assertion in the suite is contention-sensitive again.
    expect(THREAD_CPU_AVAILABLE).toBe(true);
  });

  it("measures CPU actually burned on this thread", () => {
    // FIXED WORK, not a fixed wall-clock duration. A `while (now() < deadline)`
    // loop burns LESS cpu the more contended the machine is -- it gets a
    // smaller share of a core for the same wall window -- so bounding by time
    // would make this assertion flake under exactly the load it exists to
    // survive. It did: at load average 186 a 50ms wall loop burned under 10ms
    // of CPU. A fixed iteration count burns at least as much CPU under
    // contention as it does idle, so the lower bound below is safe.
    const measured = measureMs(() => {
      let x = 0;
      for (let i = 0; i < 5_000_000; i++) x += Math.sqrt(i);
      expect(x).toBeGreaterThan(0);
    });
    // Generous: this workload costs tens of ms idle. The claim under test is
    // only that the clock advances with work done, not that it is precise.
    expect(measured).toBeGreaterThan(1);
  });

  it("does not bill this thread for a sibling thread's burn", async () => {
    const BURN_MS = 400;

    const wallStart = performance.now();
    const threadStart = nowMs();
    const procStart = process.cpuUsage();

    // This thread stays idle (a timer, not a spin) while the sibling burns.
    await burnOnSiblingThread(BURN_MS);

    const wall = performance.now() - wallStart;
    const thread = nowMs() - threadStart;
    const proc = process.cpuUsage(procStart);
    const processWide = (proc.user + proc.system) / 1000;

    // The sibling really did burn: process-wide CPU saw it.
    expect(processWide).toBeGreaterThan(BURN_MS / 2);
    // Wall-clock also saw it, which is why wall-clock budgets flake.
    expect(wall).toBeGreaterThan(BURN_MS / 2);
    // The thread-scoped clock did not. This is the whole point: an idle thread
    // must not be billed for a sibling's work. Measured in the write-up that
    // motivated this: 2.7ms thread CPU against 1433ms process-wide.
    expect(thread).toBeLessThan(processWide / 3);
  });
});
