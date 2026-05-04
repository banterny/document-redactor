import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { LEGAL } from "./legal.js";

function findRule(subcategory: string): RegexRule {
  const rule = LEGAL.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function matchLegal(text: string): string[] {
  return runRegexPhase(text, "paranoid", LEGAL, { language: "mixed" }).map(
    (c) => c.text,
  );
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  const start = performance.now();
  void matchOne(subcategory, input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("LEGAL registry", () => {
  it("exports exactly 2 rules", () => {
    expect(LEGAL).toHaveLength(2);
  });

  it("every rule id starts with 'legal.'", () => {
    for (const rule of LEGAL) {
      expect(rule.id.startsWith("legal.")).toBe(true);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of LEGAL) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of LEGAL) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe("legal public-reference and contract-structure exclusions", () => {
  it.each([
    ["rejects Korean article references", "제1조"],
    ["rejects Korean article plus paragraph", "제1조 제2항"],
    ["rejects Korean item references", "제3호"],
    ["rejects Korean sub-article references", "제15조의2"],
    ["rejects law-prefixed Korean articles", "민법 제750조"],
    ["rejects Korean privacy statute articles", "개인정보 보호법 제17조"],
    ["rejects Korean law-number forms", "법률 제1234호"],
    ["rejects English section references", "Section 10.1"],
    ["rejects English section parentheticals", "Section 10.1(a)"],
    ["rejects U.S.C. references", "17 U.S.C. § 101"],
    ["rejects larger U.S.C. references", "42 U.S.C. § 1983"],
    ["keeps Article references out of legal candidates", "Article V"],
    ["keeps Clause references out of legal candidates", "Clause 3.2"],
    ["keeps Schedule references out of legal candidates", "Schedule A"],
    ["keeps Exhibit references out of legal candidates", "Exhibit B"],
    ["keeps Korean schedule references out of legal candidates", "별표 1"],
    ["keeps Korean appendix references out of legal candidates", "부속서 2"],
    ["keeps Korean court names out of legal candidates", "서울중앙지방법원"],
    ["keeps Korean supreme court references out of legal candidates", "대법원"],
    ["keeps Korean constitutional court references out of legal candidates", "헌법재판소"],
    ["keeps English reporter citations out of legal candidates", "123 F.3d 456"],
    ["keeps U.S. reporter citations out of legal candidates", "456 U.S. 789"],
    ["keeps S. Ct. citations out of legal candidates", "789 S. Ct. 123"],
    ["keeps court label values out of legal candidates", "Court:Seoul Central District Court"],
    ["keeps Korean court label values out of legal candidates", "법원:서울중앙지방법원"],
  ])("%s", (_name, text) => {
    expect(matchLegal(text)).toEqual([]);
  });
});

describe("legal.ko-case-number", () => {
  it.each([
    ["matches 가합 case numbers", "2024가합12345", ["2024가합12345"]],
    ["matches 나 case numbers", "2023나67890", ["2023나67890"]],
    ["matches 노 case numbers", "2024노1234", ["2024노1234"]],
    ["matches 도 case numbers", "2024도5678", ["2024도5678"]],
    ["matches at the start of the string", "2024가합12345 사건", ["2024가합12345"]],
    ["matches at the end of the string", "사건번호 2024가합12345", ["2024가합12345"]],
    ["matches inside punctuation", "(2024가합12345)", ["2024가합12345"]],
    ["matches 3-syllable case types", "2024구합12345", ["2024구합12345"]],
    ["matches short docket numbers", "2024가1", ["2024가1"]],
    ["rejects year suffixes without dockets", "2024년", []],
    ["rejects out-of-range years", "9999가합12345", []],
    ["rejects ASCII case types", "2024AB12345", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-case-number", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long case-number input", () => {
    expectFast("ko-case-number", "2024가".repeat(5000));
  });
});

describe("legal.legal-context", () => {
  it.each([
    ["matches Korean case-number labels", "사건번호:2024가합12345", ["2024가합12345"]],
    ["matches English Case No. labels", "Case No.123-CV-456", ["123-CV-456"]],
    ["matches Docket No. labels", "Docket No.123-456", ["123-456"]],
    ["matches at the start of the string", "Docket No.123-456, status", ["123-456"]],
    ["matches up to commas", "Docket No.123-456, filed", ["123-456"]],
    ["matches up to newlines", "Docket No.123-456\nNext line", ["123-456"]],
    ["matches generic 사건 labels", "사건:2024가합12345", ["2024가합12345"]],
    ["rejects Court labels", "Court:Seoul Central District Court", []],
    ["rejects Korean court labels", "법원:서울중앙지방법원", []],
    ["rejects labels without values", "사건번호", []],
    ["rejects values longer than the cap", "Case No.: " + "A".repeat(80), []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("legal-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long legal-context input", () => {
    expectFast("legal-context", "Case No.: " + "A".repeat(10000), 100);
  });
});
