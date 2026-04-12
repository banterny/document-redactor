import { describe, expect, it } from "vitest";

import type { StructuralDefinition } from "../../_framework/types.js";

import { DEFINITION_SECTION } from "./definition-section.js";

function parseOne(text: string): readonly StructuralDefinition[] {
  return DEFINITION_SECTION.parse(text);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void parseOne(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("structural.definition-section", () => {
  it.each([
    [
      "extracts English means clauses",
      '"Buyer" means ABC Corporation.',
      [{ label: "Buyer", referent: "ABC Corporation", source: "definition-section" }],
    ],
    [
      "extracts English shall-mean clauses",
      '"Seller" shall mean XYZ Inc.;',
      [{ label: "Seller", referent: "XYZ Inc", source: "definition-section" }],
    ],
    [
      "extracts Korean definition clauses",
      '"갑"이라 함은 A 주식회사를 말한다.',
      [
        {
          label: "갑",
          referent: "A 주식회사를 말한다",
          source: "definition-section",
        },
      ],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it.each([
    [
      "extracts English hereinafter referred-to-as clauses",
      'ABC Corporation (hereinafter referred to as "Buyer")',
      [{ label: "Buyer", referent: "", source: "definition-section" }],
    ],
    [
      "extracts Korean 이하 clauses inside parentheses",
      'A 주식회사(이하 "갑")',
      [{ label: "갑", referent: "", source: "definition-section" }],
    ],
    [
      "extracts Korean 이하 라 칭한다 variants",
      'B 주식회사(이하 "을"라 칭한다)',
      [{ label: "을", referent: "", source: "definition-section" }],
    ],
    [
      "trims referents at the first delimiter",
      '"Buyer" means ABC Corporation; and no further text matters',
      [{ label: "Buyer", referent: "ABC Corporation", source: "definition-section" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it.each([
    ["matches definitions at the start of the document", '"Buyer" means ABC Corporation. filler'],
    ["matches definitions in the middle of the document", `${"x".repeat(300)} "Buyer" means ABC Corporation. ${"y".repeat(300)}`],
    ["matches definitions at the end of the document", `${"x".repeat(600)} "Buyer" means ABC Corporation.`],
  ])("%s", (_name, text) => {
    expect(parseOne(text)).toContainEqual({
      label: "Buyer",
      referent: "ABC Corporation",
      source: "definition-section",
    });
  });

  it.each([
    ["rejects empty text", "", []],
    ["rejects unquoted English labels", "Buyer means ABC Corporation.", []],
    ["rejects missing referents", '"Buyer" means .', []],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it("caps unterminated referents at 200 characters", () => {
    const longReferent = "A".repeat(250);
    const result = parseOne(`"Buyer" means ${longReferent}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      label: "Buyer",
      referent: "A".repeat(200),
      source: "definition-section",
    });
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`"${"A".repeat(5000)}" means ${"B".repeat(5000)}`);
  });
});
