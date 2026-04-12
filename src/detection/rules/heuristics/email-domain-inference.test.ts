import { describe, expect, it } from "vitest";

import type { Candidate, HeuristicContext } from "../../_framework/types.js";

import { EMAIL_DOMAIN_INFERENCE } from "./email-domain-inference.js";

function makeContext(
  priorCandidates: readonly Candidate[],
  overrides: Partial<HeuristicContext> = {},
): HeuristicContext {
  return {
    structuralDefinitions: [],
    priorCandidates,
    documentLanguage: "en",
    ...overrides,
  };
}

function detect(ctx: HeuristicContext) {
  return EMAIL_DOMAIN_INFERENCE.detect("", ctx);
}

function expectFast(ctx: HeuristicContext, budgetMs = 100): void {
  const start = performance.now();
  void detect(ctx);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("heuristics.email-domain-inference", () => {
  it.each([
    [
      "infers Acme Corp from legal@acme-corp.com",
      makeContext([
        { text: "legal@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
      [{ text: "Acme Corp", ruleId: "heuristics.email-domain-inference", confidence: 0.8 }],
    ],
    [
      "infers Acme Corp from personal-prefix email domains",
      makeContext([
        { text: "john.smith@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
      [{ text: "Acme Corp", ruleId: "heuristics.email-domain-inference", confidence: 0.6 }],
    ],
    [
      "strips .co.kr secondary TLDs correctly",
      makeContext([
        { text: "info@samsung.co.kr", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
      [{ text: "Samsung", ruleId: "heuristics.email-domain-inference", confidence: 0.8 }],
    ],
  ])("%s", (_name, ctx, expected) => {
    expect(detect(ctx)).toEqual(expected);
  });

  it.each([
    [
      "infers hyphenated domains into spaced company names",
      makeContext([
        { text: "billing@mega-holdings.io", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
      [{ text: "Mega Holdings", ruleId: "heuristics.email-domain-inference", confidence: 0.8 }],
    ],
    [
      "deduplicates duplicate inferred domains",
      makeContext([
        { text: "legal@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
        { text: "info@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
      [{ text: "Acme Corp", ruleId: "heuristics.email-domain-inference", confidence: 0.8 }],
    ],
    [
      "ignores raw text and operates only on prior email candidates",
      makeContext([
        { text: "contact@northwind.com", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
      [{ text: "Northwind", ruleId: "heuristics.email-domain-inference", confidence: 0.8 }],
    ],
  ])("%s", (_name, ctx, expected) => {
    expect(detect(ctx)).toEqual(expected);
  });

  it.each([
    [
      "ignores non-email prior candidates",
      makeContext([
        { text: "Acme Corp", ruleId: "entities.en-corp-suffix", confidence: 1.0 },
      ]),
    ],
    [
      "ignores malformed email candidates without @",
      makeContext([
        { text: "acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
    ],
    [
      "ignores single-part domains",
      makeContext([
        { text: "legal@localhost", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
    ],
  ])("%s", (_name, ctx) => {
    expect(detect(ctx)).toEqual([]);
  });

  it("skips inferred names that match structural-definition labels (D9)", () => {
    const ctx = makeContext(
      [{ text: "legal@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 }],
      {
        structuralDefinitions: [
          {
            label: "Acme Corp",
            referent: "Acme Corporation",
            source: "party-declaration",
          },
        ],
      },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it("skips inferred names already present in priorCandidates", () => {
    const ctx = makeContext([
      { text: "legal@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
      { text: "Acme Corp", ruleId: "entities.en-corp-suffix", confidence: 1.0 },
    ]);
    expect(detect(ctx)).toEqual([]);
  });

  it("skips blacklisted inferred names like Party", () => {
    const ctx = makeContext([
      { text: "legal@party.com", ruleId: "identifiers.email", confidence: 1.0 },
    ]);
    expect(detect(ctx)).toEqual([]);
  });

  it("skips blacklisted inferred names like Company", () => {
    const ctx = makeContext([
      { text: "legal@company.com", ruleId: "identifiers.email", confidence: 1.0 },
    ]);
    expect(detect(ctx)).toEqual([]);
  });

  it("emits 0.8 for corporate prefixes and 0.6 for personal prefixes", () => {
    const result = detect(
      makeContext([
        { text: "legal@acme-corp.com", ruleId: "identifiers.email", confidence: 1.0 },
        { text: "john@beta.com", ruleId: "identifiers.email", confidence: 1.0 },
      ]),
    );
    expect(result).toEqual([
      {
        text: "Acme Corp",
        ruleId: "heuristics.email-domain-inference",
        confidence: 0.8,
      },
      {
        text: "Beta",
        ruleId: "heuristics.email-domain-inference",
        confidence: 0.6,
      },
    ]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(
      makeContext([
        {
          text: `legal@${"a".repeat(5000)}.${"b".repeat(5000)}.com`,
          ruleId: "identifiers.email",
          confidence: 1.0,
        },
      ]),
    );
  });
});
