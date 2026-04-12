import { describe, expect, it } from "vitest";

import type { HeuristicContext } from "../../_framework/types.js";

import { REPEATABILITY } from "./repeatability.js";

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

function detect(text: string, ctx: HeuristicContext = makeContext()) {
  return REPEATABILITY.detect(text, ctx);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void detect(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("heuristics.repeatability", () => {
  it.each([
    [
      "detects repeated English multi-word entities",
      "Acme Corp signed. Acme Corp approved. Acme Corp closed.",
      ["Acme Corp"],
    ],
    [
      "detects repeated English single-word entities",
      "Acme delivered. Acme invoiced. Acme settled.",
      ["Acme"],
    ],
    [
      "detects repeated Korean tokens",
      "삼성전자 승인. 삼성전자 통지. 삼성전자 종료.",
      ["삼성전자"],
    ],
  ])("%s", (_name, text, expected) => {
    expect(detect(text).map((c) => c.text)).toEqual(expected);
  });

  it.each([
    [
      "detects mixed-language repeatable entities",
      "Acme Corp signed. 삼성전자 승인. Acme Corp approved. 삼성전자 통지. Acme Corp closed. 삼성전자 종료.",
      ["Acme Corp", "삼성전자"],
    ],
    [
      "emits one candidate even when the token appears four times",
      "Acme Corp signed. Acme Corp approved. Acme Corp closed. Acme Corp renewed.",
      ["Acme Corp"],
    ],
    [
      "detects four-word capitalization clusters at frequency threshold",
      "Alpha Beta Gamma Delta executed. Alpha Beta Gamma Delta approved. Alpha Beta Gamma Delta renewed.",
      ["Alpha Beta Gamma Delta"],
    ],
  ])("%s", (_name, text, expected) => {
    expect(detect(text).map((c) => c.text)).toEqual(expected);
  });

  it.each([
    ["rejects tokens seen only twice", "Acme Corp signed. Acme Corp approved."],
    ["rejects lowercase English tokens", "acme corp signed. acme corp approved. acme corp closed."],
    ["rejects one-syllable Korean tokens", "갑 서명. 갑 통지. 갑 종료."],
  ])("%s", (_name, text) => {
    expect(detect(text)).toEqual([]);
  });

  it("skips structural-definition labels (D9)", () => {
    const ctx = makeContext({
      structuralDefinitions: [
        {
          label: "Acme Corp",
          referent: "Acme Corporation",
          source: "party-declaration",
        },
      ],
    });
    expect(
      detect("Acme Corp signed. Acme Corp approved. Acme Corp closed.", ctx),
    ).toEqual([]);
  });

  it("skips tokens already present in priorCandidates", () => {
    const ctx = makeContext({
      priorCandidates: [
        { text: "Acme Corp", ruleId: "entities.en-corp-suffix", confidence: 1.0 },
      ],
    });
    expect(
      detect("Acme Corp signed. Acme Corp approved. Acme Corp closed.", ctx),
    ).toEqual([]);
  });

  it("skips blacklisted English role words", () => {
    expect(detect("Party attended. Party responded. Party settled.")).toEqual(
      [],
    );
  });

  it("skips blacklisted Korean role words", () => {
    expect(detect("당사자 통지. 당사자 종료. 당사자 승인.")).toEqual([]);
  });

  it("emits confidence 0.5 for repeated candidates", () => {
    expect(
      detect("Acme Corp signed. Acme Corp approved. Acme Corp closed."),
    ).toEqual([
      {
        text: "Acme Corp",
        ruleId: "heuristics.repeatability",
        confidence: 0.5,
      },
    ]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`${"Acme ".repeat(2000)}${"삼성전자 ".repeat(1000)}`);
  });
});
