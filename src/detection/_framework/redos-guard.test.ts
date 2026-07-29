import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { ALL_HEURISTICS, ALL_REGEX_RULES, ALL_STRUCTURAL_PARSERS } from "./registry.js";
import type { HeuristicContext } from "./types.js";

const ADVERSARIAL_INPUTS: readonly string[] = [
  "a".repeat(10_000),
  "1".repeat(10_000),
  "-".repeat(10_000),
  "a-".repeat(5_000),
  "1 ".repeat(5_000),
  " ".repeat(10_000),
];

// Matches ADVERSARIAL_INPUTS' length (10,000 chars). Smoke mode stays
// in-process (no subprocess spawn -- that's the part that was too slow for
// CI, see the guardMode comment below), so a longer input here is cheap for
// well-behaved rules but is what actually exposes "only quadratic, not
// exponential" ReDoS bugs: entities.uk-medical-context, legal.uk-coroner-ref,
// and identifiers.uk-hospital-mrn all measured comfortably under the 50ms
// budget at the previous 1,000-char smoke length (0.2-2.6ms) while taking
// 64-239ms -- several times over budget -- at 10,000 chars. A 1,000-char
// smoke corpus could not have caught three of the four rules fixed in the
// commit that added this comment; only the worst of the four
// (legal.uk-legal-context, ~900ms even at 1,000 chars) was ever visible to
// CI's smoke gate.
const SMOKE_ADVERSARIAL_INPUTS: readonly string[] = [
  "a".repeat(10_000),
  "1".repeat(10_000),
  "a-".repeat(5_000),
  " ".repeat(10_000),
];

const WARMUP_RUNS = 25;
const MEASURED_RUNS = 200;
const SMOKE_WARMUP_RUNS = 3;
const SMOKE_MEASURED_RUNS = 5;
const FUNCTION_WARMUP_RUNS = 20;
const FUNCTION_MEASURED_RUNS = 100;

const PARSER_ADVERSARIAL_INPUTS: Readonly<Record<string, string>> = {
  "structural.definition-section": `"${"A".repeat(5000)}" means ${"B".repeat(5000)}`,
  "structural.signature-block": `${"x".repeat(9000)}Name: ${"A".repeat(1000)}`,
  "structural.party-declaration": `${"A ".repeat(3000)}(hereinafter as 'Buyer')`,
  "structural.recitals": `전문${"가".repeat(5000)}${"주식회사".repeat(1000)}`,
  "structural.header-block": `${"A".repeat(10000)} AGREEMENT`,
};

const DEFAULT_HEURISTIC_CONTEXT: HeuristicContext = {
  structuralDefinitions: [],
  priorCandidates: [],
  documentLanguage: "mixed",
};

const HEURISTIC_ADVERSARIAL_INPUTS: Readonly<Record<string, string>> = {
  "heuristics.capitalization-cluster": `${"A".repeat(5000)} ${"B".repeat(5000)}`,
  "heuristics.quoted-term": `"${"A".repeat(10000)}"`,
  "heuristics.repeatability": `${"Acme ".repeat(2000)}${"삼성전자 ".repeat(1000)}`,
  "heuristics.email-domain-inference": "",
};

const HEURISTIC_CONTEXTS: Readonly<Record<string, HeuristicContext>> = {
  "heuristics.capitalization-cluster": DEFAULT_HEURISTIC_CONTEXT,
  "heuristics.quoted-term": DEFAULT_HEURISTIC_CONTEXT,
  "heuristics.repeatability": DEFAULT_HEURISTIC_CONTEXT,
  "heuristics.email-domain-inference": {
    structuralDefinitions: [],
    priorCandidates: [
      {
        text: `legal@${"a".repeat(5000)}.${"b".repeat(5000)}.com`,
        ruleId: "identifiers.email",
        confidence: 1.0,
      },
    ],
    documentLanguage: "mixed",
  },
};

/**
 * A JavaScript engine this guard benchmarks against.
 *
 * `node` is V8; `bun` is JavaScriptCore. BOTH must be measured, because the
 * cost of a pattern is engine-dependent and this gate previously only ever saw
 * V8 -- it shells out to `node`, and vitest itself runs test code under node,
 * so the in-process paths were V8 as well. There was no JavaScriptCore
 * coverage anywhere in the suite.
 *
 * That blind spot is not theoretical. Measured on this repo's own rules
 * against `" ".repeat(10_000)`:
 *
 *   identifiers.uk-gmc         0.01ms on V8   vs  3651ms on JavaScriptCore
 *   identifiers.uk-sort-code   0.00ms on V8   vs  2558ms on JavaScriptCore
 *   identifiers.uk-nmc         0.00ms on V8   vs  2430ms on JavaScriptCore
 *
 * and entities.uk-inquest-context / financial.amount-context-ko are roughly
 * CUBIC on JavaScriptCore (8x per doubling of input) while flat on V8. V8
 * recognises that these patterns can only match starting at a digit or capital
 * and skips the rest; JavaScriptCore does not, and pays the full backtracking
 * cost at every position.
 *
 * This matters because the shipped artefact is a single HTML file with no
 * declared browser target and no Worker -- detection runs on the main thread,
 * and Safari plus every iOS browser is JavaScriptCore.
 */
interface RegexEngine {
  readonly bin: string;
  readonly label: string;
}

const REGEX_ENGINES: readonly RegexEngine[] = [
  { bin: "node", label: "V8" },
  { bin: "bun", label: "JavaScriptCore" },
];

/**
 * Engines actually present on this machine. A missing engine is surfaced as an
 * explicit failing test below rather than silently skipped -- silently dropping
 * an engine is exactly how the JavaScriptCore gap survived this long.
 */
const AVAILABLE_ENGINES: readonly RegexEngine[] = REGEX_ENGINES.filter((engine) => {
  try {
    execFileSync(engine.bin, ["-e", "process.stdout.write('ok')"], {
      encoding: "utf8",
      timeout: 20_000,
      env: { PATH: process.env.PATH ?? "" },
    });
    return true;
  } catch {
    return false;
  }
});

/**
 * Rules known to exceed the budget on a specific engine, and not yet fixed.
 *
 * This is a NAMED, GREPPABLE list of exactly two exceptions with their measured
 * costs -- deliberately not a raised global budget. Raising the budget until it
 * stops complaining hides everything at once, and is precisely how the original
 * four context-gated rules shipped past a guard that was silently skipping.
 *
 * Each entry is asserted with `it.fails`, so it stays quick, keeps the suite
 * green (meaning a red run again signals NEW breakage), and -- importantly --
 * turns red the moment somebody actually fixes the rule, prompting removal of
 * the exception rather than letting it rot.
 */
const KNOWN_ENGINE_EXCEPTIONS: Readonly<Record<string, string>> = {
  // Measured 77.8ms against the 50ms budget. Cannot take the `(?![ \t])` guard
  // its siblings use: this rule's value body (`[^\n;,]{3,80}`) can legitimately
  // START with whitespace -- a documented, test-pinned behaviour that lets a
  // label at end-of-line bridge to an indented value on the next line. Needs a
  // different technique, not a guard.
  'legal.uk-legal-context::JavaScriptCore::" ".repeat(10_000)':
    "77.8ms vs 50ms budget; guard technique does not apply (body may start with whitespace)",

  // Measured 764.6ms and 411.0ms. A different shape to the other rules fixed
  // here: no positive lookbehind at all, so hoisting a guard measurably does
  // nothing (726ms after). The cost is greedy-run backtracking in
  // `[A-Za-z0-9][A-Za-z0-9&.\-]*` before `\s+`, retried at every position the
  // negative lookbehind admits -- which is why it bites on digits and `a-`
  // repeats but NOT on whitespace. Fixable with atomic-group emulation
  // (`(?=(...))\1`), which is a behaviour-sensitive change worth its own review.
  'entities.ko-corp-suffix::JavaScriptCore::"1".repeat(10_000)':
    "764.6ms vs 50ms budget; greedy-run backtracking, not a lookbehind problem",
  'entities.ko-corp-suffix::JavaScriptCore::"a-".repeat(5_000)':
    "411.0ms vs 50ms budget; same cause as the '1' repeat case",
};

/** Reduced iteration counts for known-slow exceptions, so they fail fast rather than timing out. */
const EXCEPTION_WARMUP_RUNS = 1;
const EXCEPTION_MEASURED_RUNS = 3;

function benchmarkRegex(
  source: string,
  flags: string,
  input: string,
  engine: RegexEngine,
  warmupRuns: number = WARMUP_RUNS,
  measuredRuns: number = MEASURED_RUNS,
): number {
  const inputExpr = adversarialInputExpr(input);
  const script = `
const input = ${inputExpr};
const source = ${JSON.stringify(source)};
const flags = ${JSON.stringify(flags)};
const re = new RegExp(source, flags);

function scan() {
  re.lastIndex = 0;
  let count = 0;
  let m;
  while ((m = re.exec(input)) !== null && count < 10000) count++;
}

for (let i = 0; i < ${warmupRuns}; i++) scan();
// CPU time, not wall-clock. A busy machine steals wall-clock from this
// subprocess without consuming its cycles, so process.hrtime.bigint() here
// measured scheduler noise as if it were regex cost and failed spuriously
// under load. Catastrophic backtracking is pure CPU burn, so user+system CPU
// is strictly MORE sensitive to the defect this gate exists to catch while
// being immune to contention. The budget is unchanged at 50ms.
//
// This is sound here because each measurement gets a dedicated subprocess
// that does nothing else, so process-wide CPU is exactly this benchmark's
// CPU. The in-process paths below cannot use process.cpuUsage() for the same
// reason and use process.threadCpuUsage() instead -- see benchmarkRegexSmoke.
// process.cpuUsage() exists in both node and bun, so this script is portable
// across both engines.
const startCpu = process.cpuUsage();
for (let i = 0; i < ${measuredRuns}; i++) scan();
const cpu = process.cpuUsage(startCpu);
const elapsed = (cpu.user + cpu.system) / 1000;
process.stdout.write(String(elapsed / ${measuredRuns}));
`;

  return Number(
    execFileSync(engine.bin, ["-e", script], {
      encoding: "utf8",
      // A genuinely catastrophic (super-polynomial or non-terminating)
      // pattern can block this subprocess indefinitely -- `bun run
      // test:redos:deep` was observed to hang past 120s with no output
      // before legal.uk-legal-context was fixed. Without a timeout here,
      // that hang is silent and requires a manual kill; with it, the
      // subprocess is killed and execFileSync throws, so the offending
      // test fails loudly instead of stalling the whole suite. 20s gives
      // ample headroom over the legitimate worst case (225 warmup+measured
      // scans just under the 50ms/100ms budget is ~11s).
      timeout: 20_000,
      env: {
        PATH: process.env.PATH ?? "",
      },
    }).trim(),
  );
}

/**
 * Elapsed cost for the IN-PROCESS benchmarks, in milliseconds.
 *
 * These run inside a vitest worker THREAD (vitest.config.ts sets
 * `pool: "threads"`), sharing one process with every other test file executing
 * concurrently. That rules out both of the obvious instruments:
 *
 * - `performance.now()` is wall-clock, so a busy machine inflates it and a
 *   perfectly fast rule fails spuriously. This is what these paths used
 *   before, and it is the flakiness this replaces.
 * - `process.cpuUsage()` is process-WIDE, not thread-scoped, so it would add
 *   every sibling worker's burn on every core. Measured directly here: an
 *   entirely idle main thread was billed 1433ms of CPU while ONE sibling
 *   thread burned for 1500ms. That is worse than the wall-clock it replaces.
 *
 * `process.threadCpuUsage()` is the correct instrument -- same measurement,
 * scoped to this thread alone. Under the identical sibling-burn test it read
 * 2.7ms against that same 1433ms of process-wide CPU.
 *
 * Catastrophic backtracking is pure CPU burn, so thread CPU time is strictly
 * MORE sensitive to the defect this gate exists to catch while being immune to
 * scheduler noise. Budgets are unchanged.
 *
 * Falls back to wall-clock where `threadCpuUsage` is unavailable (it is absent
 * under bun, though vitest runs test code under node, where it exists).
 */
const THREAD_CPU_AVAILABLE = typeof process.threadCpuUsage === "function";

function inProcessElapsedMs(start: number): number {
  if (THREAD_CPU_AVAILABLE) {
    const t = process.threadCpuUsage();
    return (t.user + t.system) / 1000 - start;
  }
  return performance.now() - start;
}

function inProcessStart(): number {
  if (THREAD_CPU_AVAILABLE) {
    const t = process.threadCpuUsage();
    return (t.user + t.system) / 1000;
  }
  return performance.now();
}

function benchmarkRegexSmoke(pattern: RegExp, input: string): number {
  for (let i = 0; i < SMOKE_WARMUP_RUNS; i++) scanRegex(pattern, input);
  const start = inProcessStart();
  for (let i = 0; i < SMOKE_MEASURED_RUNS; i++) scanRegex(pattern, input);
  return inProcessElapsedMs(start) / SMOKE_MEASURED_RUNS;
}

function scanRegex(pattern: RegExp, input: string): void {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(input) !== null && count < 1000) {
    count++;
  }
}

function adversarialInputExpr(input: string): string {
  if (input === "a".repeat(10_000)) return `"a".repeat(10_000)`;
  if (input === "1".repeat(10_000)) return `"1".repeat(10_000)`;
  if (input === "-".repeat(10_000)) return `"-".repeat(10_000)`;
  if (input === "a-".repeat(5_000)) return `"a-".repeat(5_000)`;
  if (input === "1 ".repeat(5_000)) return `"1 ".repeat(5_000)`;
  if (input === " ".repeat(10_000)) return `" ".repeat(10_000)`;
  return JSON.stringify(input);
}

/** Structural parsers and heuristics run in-process too -- same instrument. */
function benchmarkOperation(fn: () => unknown): number {
  for (let i = 0; i < FUNCTION_WARMUP_RUNS; i++) {
    void fn();
  }
  const start = inProcessStart();
  for (let i = 0; i < FUNCTION_MEASURED_RUNS; i++) {
    void fn();
  }
  return inProcessElapsedMs(start) / FUNCTION_MEASURED_RUNS;
}

/**
 * The deep suite uses per-test `node -e` subprocess spawning so each regex
 * benchmark starts with a clean engine state. That is intentionally local-
 * first because it was too slow for GitHub Actions in v1.1.0.
 *
 * CI runs `REDOS_GUARD_MODE=smoke`, which keeps the check in-process and
 * short while still exercising every registered regex on adversarial input.
 * Local `bun run test` continues to run the deep fuzz by default.
 */
const guardMode = process.env.REDOS_GUARD_MODE === "smoke" ? "smoke" : "deep";
const skipInCi =
  (process.env.CI === "true" && process.env.REDOS_GUARD_MODE === undefined) ||
  process.env.SKIP_REDOS_FUZZ === "1";

describe.skipIf(skipInCi)("ReDoS guard", () => {
  const regexInputs =
    guardMode === "smoke" ? SMOKE_ADVERSARIAL_INPUTS : ADVERSARIAL_INPUTS;

  if (guardMode === "deep") {
    // Fail loudly rather than quietly narrowing coverage: a missing engine
    // means a whole class of ReDoS is going unmeasured, which is precisely the
    // failure this cross-engine gate exists to prevent.
    it("benchmarks against every declared engine", () => {
      expect(AVAILABLE_ENGINES.map((e) => e.label).sort()).toEqual(
        REGEX_ENGINES.map((e) => e.label).sort(),
      );
    });
  }

  for (const rule of ALL_REGEX_RULES) {
    for (const input of regexInputs) {
      if (guardMode === "smoke") {
        // Smoke stays in-process and single-engine (whichever engine runs
        // vitest -- currently node/V8). Subprocess spawning is what made the
        // deep gate too slow for CI in v1.1.0, so CI's day-to-day gate cannot
        // afford cross-engine coverage. That remains a real gap: CI is V8-only.
        it(`${rule.id} returns within 50ms on ${input.length}-char adversarial input`, () => {
          expect(benchmarkRegexSmoke(rule.pattern, input)).toBeLessThan(50);
        });
        continue;
      }

      for (const engine of AVAILABLE_ENGINES) {
        const title = `${rule.id} returns within 50ms on ${input.length}-char adversarial input [${engine.label}]`;
        const exceptionKey = `${rule.id}::${engine.label}::${adversarialInputExpr(input)}`;
        const known = KNOWN_ENGINE_EXCEPTIONS[exceptionKey];

        if (known !== undefined) {
          // `it.fails` asserts this DOES still breach the budget. It keeps the
          // suite green while the exception stands, and flips red the moment
          // the rule is actually fixed -- at which point delete the entry from
          // KNOWN_ENGINE_EXCEPTIONS. Reduced iteration counts keep it to about
          // a second instead of burning the full 20s subprocess timeout.
          it.fails(`${title} — KNOWN EXCEPTION: ${known}`, () => {
            const elapsed = benchmarkRegex(
              rule.pattern.source,
              rule.pattern.flags,
              input,
              engine,
              EXCEPTION_WARMUP_RUNS,
              EXCEPTION_MEASURED_RUNS,
            );
            expect(elapsed).toBeLessThan(50);
          });
          continue;
        }

        it(title, () => {
          const elapsed = benchmarkRegex(
            rule.pattern.source,
            rule.pattern.flags,
            input,
            engine,
          );
          expect(elapsed).toBeLessThan(50);
        });
      }
    }
  }

  if (guardMode === "deep") {
    for (const parser of ALL_STRUCTURAL_PARSERS) {
      it(`${parser.id} returns within 100ms on structural adversarial input`, () => {
        const input = PARSER_ADVERSARIAL_INPUTS[parser.id]!;
        const elapsed = benchmarkOperation(() => parser.parse(input));
        expect(elapsed).toBeLessThan(100);
      });
    }

    for (const heuristic of ALL_HEURISTICS) {
      it(`${heuristic.id} returns within 100ms on heuristic adversarial input`, () => {
        const input = HEURISTIC_ADVERSARIAL_INPUTS[heuristic.id]!;
        const context = HEURISTIC_CONTEXTS[heuristic.id]!;
        const elapsed = benchmarkOperation(() => heuristic.detect(input, context));
        expect(elapsed).toBeLessThan(100);
      });
    }
  }
});
