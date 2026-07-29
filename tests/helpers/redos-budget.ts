/**
 * Shared timing primitive for the co-located ReDoS budget assertions.
 *
 * WHY THIS EXISTS
 *
 * Eighteen rule test files each had their own `expectFast`, and every one of
 * them measured with `performance.now()` -- wall-clock. `vitest.config.ts` sets
 * `pool: "threads"`, so every test file runs alongside every other one in a
 * single process. A descheduled thread accrues wall-clock while consuming no
 * cycles, so those assertions measured scheduler pressure as much as they
 * measured the rule.
 *
 * That is not theoretical. Running the suite under 32 CPU hogs on 8 cores
 * (load average 186) failed 7 assertions across 5 files -- uk-nino at 80.3ms,
 * ko-honorific at 72.0ms, uk-phone-domestic at 57.8ms, en-address-context at
 * 53.3ms, ko-case-number at 128.9ms, recitals at 234.6ms, uk-legal-context at
 * 102.7ms -- every one of them a rule that passes the cross-engine CPU-time
 * deep gate comfortably. They were measurement flakes, not rule defects. The
 * same class of flake had already been recorded twice in this repo's history,
 * and the tempting response -- raising the budget until it stops complaining --
 * removes the gate's teeth, which is how four catastrophic rules shipped in the
 * first place.
 *
 * WHAT THIS CHANGES
 *
 * `process.threadCpuUsage()` measures CPU consumed by THIS thread alone.
 * Catastrophic backtracking is pure CPU burn, so thread CPU time is strictly
 * MORE sensitive to the defect these assertions exist to catch, while being
 * largely immune to scheduler noise. This is the same instrument
 * `redos-guard.test.ts` already uses for its in-process paths; this module
 * generalises it rather than inventing anything.
 *
 * Note `process.cpuUsage()` would be actively worse than wall-clock here: it is
 * process-WIDE, so under the threads pool an idle test thread gets billed every
 * sibling's burn on every core. See `redos-budget.test.ts`, which measures
 * exactly that and fails if the instrument ever stops being thread-scoped.
 *
 * WHAT IT DOES NOT FIX
 *
 * CPU time still inflates somewhat under heavy contention through cache
 * pressure and frequency scaling -- it is much better, not perfect. Budgets
 * should still carry headroom over the measured cost rather than hug it.
 */
import { expect } from "vitest";

/**
 * Whether the thread-scoped CPU clock is available. vitest runs test code under
 * node (even when the suite is launched via `bun run test`), where it is; bun's
 * own runtime does not expose it. A silent fall back to wall-clock would
 * reintroduce exactly the blind spot this module removes, so
 * `redos-budget.test.ts` asserts this is true rather than trusting it.
 */
export const THREAD_CPU_AVAILABLE = typeof process.threadCpuUsage === "function";

/** Current thread CPU time in milliseconds, or wall-clock if unavailable. */
export function nowMs(): number {
  if (THREAD_CPU_AVAILABLE) {
    const t = process.threadCpuUsage();
    return (t.user + t.system) / 1000;
  }
  return performance.now();
}

/** Milliseconds of this thread's CPU time consumed by `run`. */
export function measureMs(run: () => void): number {
  const start = nowMs();
  run();
  return nowMs() - start;
}

/**
 * Assert `run` completes within `budgetMs` of this thread's CPU time.
 *
 * Replaces the per-file `expectFast` bodies. Each test file keeps its own
 * thin `expectFast` wrapper, because they differ in what they invoke (a rule
 * by subcategory, a structural parser, a heuristic with a context).
 */
export function expectWithinBudget(run: () => void, budgetMs: number): void {
  expect(measureMs(run)).toBeLessThan(budgetMs);
}
