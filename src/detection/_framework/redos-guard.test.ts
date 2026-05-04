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

const SMOKE_ADVERSARIAL_INPUTS: readonly string[] = [
  "a".repeat(1_000),
  "1".repeat(1_000),
  "a-".repeat(500),
  " ".repeat(1_000),
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

function benchmarkRegex(source: string, flags: string, input: string): number {
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

for (let i = 0; i < ${WARMUP_RUNS}; i++) scan();
const start = process.hrtime.bigint();
for (let i = 0; i < ${MEASURED_RUNS}; i++) scan();
const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;
process.stdout.write(String(elapsed / ${MEASURED_RUNS}));
`;

  return Number(
    execFileSync("node", ["-e", script], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
      },
    }).trim(),
  );
}

function benchmarkRegexSmoke(pattern: RegExp, input: string): number {
  for (let i = 0; i < SMOKE_WARMUP_RUNS; i++) scanRegex(pattern, input);
  const start = performance.now();
  for (let i = 0; i < SMOKE_MEASURED_RUNS; i++) scanRegex(pattern, input);
  return (performance.now() - start) / SMOKE_MEASURED_RUNS;
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

function benchmarkOperation(fn: () => unknown): number {
  for (let i = 0; i < FUNCTION_WARMUP_RUNS; i++) {
    void fn();
  }
  const start = performance.now();
  for (let i = 0; i < FUNCTION_MEASURED_RUNS; i++) {
    void fn();
  }
  return (performance.now() - start) / FUNCTION_MEASURED_RUNS;
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

  for (const rule of ALL_REGEX_RULES) {
    for (const input of regexInputs) {
      it(`${rule.id} returns within 50ms on ${input.length}-char adversarial input`, () => {
        const elapsed =
          guardMode === "smoke"
            ? benchmarkRegexSmoke(rule.pattern, input)
            : benchmarkRegex(rule.pattern.source, rule.pattern.flags, input);
        expect(elapsed).toBeLessThan(50);
      });
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
