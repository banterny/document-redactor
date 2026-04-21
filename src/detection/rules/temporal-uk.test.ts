import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { TEMPORAL_UK } from "./temporal-uk.js";

function findRule(subcategory: string): RegexRule {
  const rule = TEMPORAL_UK.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function matchAtLevel(
  subcategory: string,
  text: string,
  level: "conservative" | "standard" | "paranoid",
): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, level, [rule]).map((c) => c.text);
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  const start = performance.now();
  void matchOne(subcategory, input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

// ---------------------------------------------------------------------------
// Registry-level checks
// ---------------------------------------------------------------------------

describe("TEMPORAL_UK registry", () => {
  it("exports exactly 2 rules", () => {
    expect(TEMPORAL_UK).toHaveLength(2);
  });

  it("every rule id starts with 'temporal.'", () => {
    for (const rule of TEMPORAL_UK) {
      expect(rule.id.startsWith("temporal.")).toBe(true);
    }
  });

  it("every rule has category 'temporal'", () => {
    for (const rule of TEMPORAL_UK) {
      expect(rule.category).toBe("temporal");
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of TEMPORAL_UK) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of TEMPORAL_UK) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — date-en-dmy  (DD/MM/YYYY)
// ---------------------------------------------------------------------------

describe("temporal.date-en-dmy", () => {
  // -- Positive cases -------------------------------------------------------

  it.each([
    ["matches a slash-separated date", "15/03/2024", ["15/03/2024"]],
    ["matches a dot-separated date", "15.03.2024", ["15.03.2024"]],
    ["matches a hyphen-separated date", "15-03-2024", ["15-03-2024"]],
    ["matches start of year range", "01/01/2000", ["01/01/2000"]],
    ["matches end of year", "31/12/2024", ["31/12/2024"]],
    ["matches single-digit day and month", "1/1/2024", ["1/1/2024"]],
    ["matches single-digit day", "1/03/2024", ["1/03/2024"]],
    ["matches single-digit month", "15/3/2024", ["15/3/2024"]],
    ["matches year 1900 (lower bound)", "01/01/1900", ["01/01/1900"]],
    ["matches year 2099 (upper regex bound)", "31/12/2099", ["31/12/2099"]],
    ["matches Feb 29 on a leap year", "29/02/2024", ["29/02/2024"]],
    ["matches at the start of the string", "15/03/2024 was the hearing date", ["15/03/2024"]],
    ["matches at the end of the string", "Date of birth: 15/03/2024", ["15/03/2024"]],
    ["matches inside parentheses", "(15/03/2024)", ["15/03/2024"]],
    ["matches inside square brackets", "[15/03/2024]", ["15/03/2024"]],
    ["matches after a colon", "DOB: 15/03/2024", ["15/03/2024"]],
    [
      "matches multiple dates in a string",
      "From 01/01/2024 to 31/12/2024",
      ["01/01/2024", "31/12/2024"],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy", text)).toEqual(expected);
  });

  // -- Negative cases: post-filter calendar validation ----------------------

  it.each([
    ["rejects Feb 30 (post-filter)", "30/02/2024", []],
    ["rejects Feb 31 (post-filter)", "31/02/2024", []],
    ["rejects Feb 29 on a non-leap year", "29/02/2023", []],
    ["rejects Apr 31 (post-filter)", "31/04/2024", []],
    ["rejects Jun 31 (post-filter)", "31/06/2024", []],
    ["rejects Sep 31 (post-filter)", "31/09/2024", []],
    ["rejects Nov 31 (post-filter)", "31/11/2024", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy", text)).toEqual(expected);
  });

  // -- Negative cases: regex-level rejection --------------------------------

  it.each([
    ["rejects day > 31", "32/01/2024", []],
    ["rejects month > 12", "15/13/2024", []],
    ["rejects day 0", "00/03/2024", []],
    ["rejects month 0", "15/00/2024", []],
    ["rejects year 1899 via regex (only 19xx/20xx pass)", "15/03/1899", []],
    ["rejects year 2100 via regex (only 19xx/20xx pass)", "15/03/2100", []],
    ["rejects year 2101 via regex", "15/03/2101", []],
    ["rejects year in the 1800s via regex", "15/03/1800", []],
    ["rejects year in the 2200s via regex", "15/03/2200", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy", text)).toEqual(expected);
  });

  // -- Negative cases: boundary anchoring -----------------------------------

  it.each([
    ["rejects date preceded by a digit", "215/03/2024", []],
    ["rejects date followed by a digit", "15/03/20245", []],
    ["rejects date embedded in a longer number", "12315/03/202456", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy", text)).toEqual(expected);
  });

  // -- ReDoS safety ---------------------------------------------------------

  it("is ReDoS-safe on long slash-digit input", () => {
    expectFast("date-en-dmy", "15/03/".repeat(2000) + "2024");
  });

  it("is ReDoS-safe on long digit string", () => {
    expectFast("date-en-dmy", "1".repeat(10000));
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — date-en-dmy-short  (DD/MM/YY, paranoid only)
// ---------------------------------------------------------------------------

describe("temporal.date-en-dmy-short", () => {
  // -- Positive cases (paranoid tier) ---------------------------------------

  it.each([
    ["matches a slash-separated short date", "15/03/24", ["15/03/24"]],
    ["matches single-digit day and month", "1/1/24", ["1/1/24"]],
    ["matches a dot-separated short date", "31.12.99", ["31.12.99"]],
    ["matches a dot-separated short date with zero-padding", "01.01.00", ["01.01.00"]],
    ["matches single-digit day with dot", "1.3.24", ["1.3.24"]],
    ["matches at the start of the string", "15/03/24 was the date", ["15/03/24"]],
    ["matches at the end of the string", "admitted on 15/03/24", ["15/03/24"]],
    ["matches inside parentheses", "(15/03/24)", ["15/03/24"]],
    ["matches after a colon", "DOB: 01.01.90", ["01.01.90"]],
    [
      "matches multiple short dates in a string",
      "From 01/01/24 to 31/12/24",
      ["01/01/24", "31/12/24"],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy-short", text)).toEqual(expected);
  });

  // -- Negative cases: regex-level rejection --------------------------------

  it.each([
    ["rejects day > 31", "32/01/24", []],
    ["rejects month > 12", "15/13/24", []],
    ["rejects day 0", "00/03/24", []],
    ["rejects month 0", "15/00/24", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy-short", text)).toEqual(expected);
  });

  // -- Negative cases: boundary anchoring -----------------------------------

  it.each([
    ["rejects date preceded by a digit", "215/03/24", []],
    ["rejects date followed by a digit", "15/03/245", []],
    ["rejects date embedded in a longer number", "12315/03/2456", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en-dmy-short", text)).toEqual(expected);
  });

  // -- Tier / level filtering -----------------------------------------------

  it("does NOT match at 'standard' level (paranoid-only rule)", () => {
    expect(matchAtLevel("date-en-dmy-short", "15/03/24", "standard")).toEqual(
      [],
    );
  });

  it("does NOT match at 'conservative' level (paranoid-only rule)", () => {
    expect(
      matchAtLevel("date-en-dmy-short", "15/03/24", "conservative"),
    ).toEqual([]);
  });

  it("matches at 'paranoid' level", () => {
    expect(matchAtLevel("date-en-dmy-short", "15/03/24", "paranoid")).toEqual([
      "15/03/24",
    ]);
  });

  // -- ReDoS safety ---------------------------------------------------------

  it("is ReDoS-safe on long slash-digit input", () => {
    expectFast("date-en-dmy-short", "15/03/".repeat(2000) + "24");
  });

  it("is ReDoS-safe on long digit string", () => {
    expectFast("date-en-dmy-short", "1".repeat(10000));
  });
});
