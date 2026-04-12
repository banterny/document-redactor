import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { ALL_REGEX_RULES } from "./registry.js";

const ADVERSARIAL_INPUTS: readonly string[] = [
  "a".repeat(10_000),
  "1".repeat(10_000),
  "-".repeat(10_000),
  "a-".repeat(5_000),
  "1 ".repeat(5_000),
  " ".repeat(10_000),
];

const WARMUP_RUNS = 25;
const MEASURED_RUNS = 200;

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

function adversarialInputExpr(input: string): string {
  if (input === "a".repeat(10_000)) return `"a".repeat(10_000)`;
  if (input === "1".repeat(10_000)) return `"1".repeat(10_000)`;
  if (input === "-".repeat(10_000)) return `"-".repeat(10_000)`;
  if (input === "a-".repeat(5_000)) return `"a-".repeat(5_000)`;
  if (input === "1 ".repeat(5_000)) return `"1 ".repeat(5_000)`;
  if (input === " ".repeat(10_000)) return `" ".repeat(10_000)`;
  return JSON.stringify(input);
}

describe("ReDoS guard", () => {
  for (const rule of ALL_REGEX_RULES) {
    for (const input of ADVERSARIAL_INPUTS) {
      it(`${rule.id} returns within 50ms on ${input.length}-char adversarial input`, () => {
        const elapsed = benchmarkRegex(
          rule.pattern.source,
          rule.pattern.flags,
          input,
        );
        expect(elapsed).toBeLessThan(50);
      });
    }
  }
});
