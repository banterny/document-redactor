import { describe, expect, it } from "vitest";

import type { HeuristicContext } from "../../_framework/types.js";

import { CAPITALIZATION_CLUSTER } from "./capitalization-cluster.js";

function makeContext(
  overrides: Partial<HeuristicContext> = {},
): HeuristicContext {
  return {
    structuralDefinitions: [],
    priorCandidates: [],
    documentLanguage: "en",
    ...overrides,
  };
}

function detect(text: string, ctx: HeuristicContext = makeContext()) {
  return CAPITALIZATION_CLUSTER.detect(text, ctx);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void detect(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("heuristics.capitalization-cluster", () => {
  it.each([
    ["detects simple personal names", "John Smith signed the agreement.", ["John Smith"]],
    ["detects organization-style clusters", "Acme Holdings Group acquired the assets.", ["Acme Holdings Group"]],
    ["detects location-shaped clusters", "The venue is New York City.", ["New York City"]],
  ])("%s", (_name, text, expected) => {
    expect(detect(text).map((c) => c.text)).toEqual(expected);
  });

  it.each([
    ["detects clusters with repeated spaces", "John   Smith approved it.", ["John   Smith"]],
    ["detects clusters inside punctuation", "(John Smith) signed the agreement.", ["John Smith"]],
    [
      "detects five-word capitalization clusters",
      "Alpha Beta Gamma Delta Epsilon executed the deal.",
      ["Alpha Beta Gamma Delta Epsilon"],
    ],
  ])("%s", (_name, text, expected) => {
    expect(detect(text).map((c) => c.text)).toEqual(expected);
  });

  it.each([
    ["rejects single capitalized words", "Acme signed the agreement."],
    ["rejects lowercase phrases", "john smith signed the agreement."],
    ["rejects all-caps phrases", "JOHN SMITH signed the agreement."],
  ])("%s", (_name, text) => {
    expect(detect(text)).toEqual([]);
  });

  it("skips structural-definition labels (D9)", () => {
    const ctx = makeContext({
      structuralDefinitions: [
        {
          label: "John Smith",
          referent: "ABC Corporation CEO",
          source: "party-declaration",
        },
      ],
    });
    expect(detect("John Smith signed the agreement.", ctx)).toEqual([]);
  });

  it("skips candidates already present in priorCandidates", () => {
    const ctx = makeContext({
      priorCandidates: [
        {
          text: "Acme Corp",
          ruleId: "entities.en-corp-suffix",
          confidence: 1.0,
        },
      ],
    });
    expect(detect("Acme Corp approved the transfer.", ctx)).toEqual([]);
  });

  it("skips candidates whose full phrase is a role-blacklist match by component", () => {
    expect(detect("Buyer Group approved the transfer.")).toEqual([]);
  });

  it("skips candidates when any word is a blacklisted English role", () => {
    expect(detect("Party Representative attended the meeting.")).toEqual([]);
  });

  it("emits confidence 0.7 for every candidate", () => {
    const result = detect("John Smith signed the agreement.");
    expect(result).toEqual([
      {
        text: "John Smith",
        ruleId: "heuristics.capitalization-cluster",
        confidence: 0.7,
      },
    ]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`${"A".repeat(5000)} ${"B".repeat(5000)}`);
  });
});
