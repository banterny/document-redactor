import { describe, expect, it } from "vitest";

import type { StructuralDefinition } from "../../_framework/types.js";

import { PARTY_DECLARATION } from "./party-declaration.js";

function parseOne(text: string): readonly StructuralDefinition[] {
  return PARTY_DECLARATION.parse(text);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void parseOne(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("structural.party-declaration", () => {
  it.each([
    [
      "extracts English party declarations",
      "ABC Corporation (hereinafter as 'Buyer').",
      [{ label: "Buyer", referent: "ABC Corporation", source: "party-declaration" }],
    ],
    [
      "extracts Korean 갑 declarations",
      "A 주식회사(이하 '갑')와 체결된다.",
      [{ label: "갑", referent: "A 주식회사", source: "party-declaration" }],
    ],
    [
      "extracts Korean descriptive role labels",
      'A 주식회사(이하 "매수인"이 함)와 체결된다.',
      [{ label: "매수인", referent: "A 주식회사", source: "party-declaration" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it.each([
    [
      "handles English intermediate descriptions",
      "ABC Corporation, a Delaware corporation (hereinafter as 'Buyer').",
      [{ label: "Buyer", referent: "ABC Corporation", source: "party-declaration" }],
    ],
    [
      "handles English referred-to-as variants",
      'This Agreement is made by and between XYZ Inc. (hereinafter referred to as "Seller").',
      [{ label: "Seller", referent: "XYZ Inc.", source: "party-declaration" }],
    ],
    [
      "handles Korean double-quoted labels",
      'B 주식회사(이하 "을")와 체결된다.',
      [{ label: "을", referent: "B 주식회사", source: "party-declaration" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it("matches declarations fully contained inside the first 2000 characters", () => {
    const phrase = "ABC Corporation (hereinafter as 'Buyer')";
    const text = `${"x".repeat(1800 - phrase.length)}${phrase}${"y".repeat(400)}`;
    expect(parseOne(text)).toEqual([
      { label: "Buyer", referent: "ABC Corporation", source: "party-declaration" },
    ]);
  });

  it("rejects declarations that begin at character 2000", () => {
    const phrase = "ABC Corporation (hereinafter as 'Buyer')";
    const text = `${"x".repeat(2000)}${phrase}`;
    expect(parseOne(text)).toEqual([]);
  });

  it("rejects declarations that start one character before the scan boundary and are truncated", () => {
    const phrase = "ABC Corporation (hereinafter as 'Buyer')";
    const text = `${"x".repeat(1999)}${phrase}`;
    expect(parseOne(text)).toEqual([]);
  });

  it.each([
    ["rejects empty text", ""],
    ["rejects English declarations without hereinafter clauses", "This Agreement is made by and between ABC Corporation and XYZ Inc."],
    ["rejects malformed Korean clauses without closing parentheses", "본 계약은 A 주식회사(이하 '갑'와 체결된다."],
  ])("%s", (_name, text) => {
    expect(parseOne(text)).toEqual([]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`${"A ".repeat(3000)}(hereinafter as 'Buyer')`);
  });
});
