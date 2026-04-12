import { describe, expect, it } from "vitest";

import { normalizeForMatching } from "../../normalize.js";
import type { HeuristicContext } from "../../_framework/types.js";

import { QUOTED_TERM } from "./quoted-term.js";

function makeContext(
  overrides: Partial<HeuristicContext> = {},
): HeuristicContext {
  return {
    structuralDefinitions: [],
    priorCandidates: [],
    documentLanguage: "mixed",
    ...overrides,
  };
}

function detectRaw(text: string, ctx: HeuristicContext = makeContext()) {
  return QUOTED_TERM.detect(normalizeForMatching(text).text, ctx);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void detectRaw(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("heuristics.quoted-term", () => {
  it.each([
    ["detects double-quoted English terms", '"Acme Corp" is the counterparty.', ["Acme Corp"]],
    ["detects single-quoted Korean names", "'김철수'가 서명했다.", ["김철수"]],
    ["detects normalized corner-quoted English terms", "「Acme Corp」 shall survive.", ["Acme Corp"]],
  ])("%s", (_name, text, expected) => {
    expect(detectRaw(text).map((c) => c.text)).toEqual(expected);
  });

  it.each([
    ["detects normalized double-quoted Korean terms", '"갑측"은 본 계약의 당사자다.', ["갑측"]],
    ["detects quoted terms containing spaces", '"Alpha Beta" shall survive.', ["Alpha Beta"]],
    ["detects multiple quoted terms in one string", '"Acme" and "Beta" entered the deal.', ["Acme", "Beta"]],
  ])("%s", (_name, text, expected) => {
    expect(detectRaw(text).map((c) => c.text)).toEqual(expected);
  });

  it.each([
    ["rejects one-character quoted terms", '"A"'],
    ["rejects unmatched quotes", '"Acme'],
    ["rejects quoted terms longer than 50 characters", `"${"A".repeat(51)}"`],
  ])("%s", (_name, text) => {
    expect(detectRaw(text)).toEqual([]);
  });

  it("skips structural-definition labels (D9)", () => {
    const ctx = makeContext({
      structuralDefinitions: [
        { label: "Buyer", referent: "ABC Corporation", source: "definition-section" },
      ],
    });
    expect(detectRaw('"Buyer" shall survive.', ctx)).toEqual([]);
  });

  it("skips terms already present in priorCandidates", () => {
    const ctx = makeContext({
      priorCandidates: [
        { text: "Acme Corp", ruleId: "entities.en-corp-suffix", confidence: 1.0 },
      ],
    });
    expect(detectRaw('"Acme Corp" shall survive.', ctx)).toEqual([]);
  });

  it("skips blacklisted English role words", () => {
    expect(detectRaw('"party" shall survive.')).toEqual([]);
  });

  it("skips blacklisted Korean role words", () => {
    expect(detectRaw('"당사자" shall survive.')).toEqual([]);
  });

  it("emits confidence 0.6 for quoted candidates", () => {
    expect(detectRaw('"Acme Corp" shall survive.')).toEqual([
      {
        text: "Acme Corp",
        ruleId: "heuristics.quoted-term",
        confidence: 0.6,
      },
    ]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`"${"A".repeat(10000)}"`);
  });
});
