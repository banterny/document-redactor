import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { TEMPORAL } from "./temporal.js";

function findRule(subcategory: string): RegexRule {
  const rule = TEMPORAL.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  const start = performance.now();
  void matchOne(subcategory, input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("TEMPORAL registry", () => {
  it("exports exactly 8 rules", () => {
    expect(TEMPORAL).toHaveLength(8);
  });

  it("every rule id starts with 'temporal.'", () => {
    for (const rule of TEMPORAL) {
      expect(rule.id.startsWith("temporal.")).toBe(true);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of TEMPORAL) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of TEMPORAL) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe("temporal.date-ko-full", () => {
  it.each([
    ["matches a spaced Korean full date", "2024년 3월 15일", ["2024년 3월 15일"]],
    ["matches an unspaced Korean full date", "2024년3월15일", ["2024년3월15일"]],
    ["matches a zero-padded month", "2024년 03월 15일", ["2024년 03월 15일"]],
    ["matches multiple spaces", "2024년  3월  15일", ["2024년  3월  15일"]],
    ["matches end-of-year dates", "2024년 12월 31일", ["2024년 12월 31일"]],
    ["matches historical dates", "1988년 9월 17일", ["1988년 9월 17일"]],
    ["matches at the start of the string", "2024년 3월 15일 체결", ["2024년 3월 15일"]],
    ["matches inside punctuation", "(2024년 3월 15일)", ["2024년 3월 15일"]],
    ["matches before a Korean particle", "2024년 3월 15일에", ["2024년 3월 15일"]],
    ["rejects month 13", "2024년 13월 15일", []],
    ["rejects invalid years outside the range", "9999년 3월 15일", []],
    ["rejects year 1899", "1899년 3월 15일", []],
    ["rejects Feb 30 via post-filter", "2024년 2월 30일", []],
    ["accepts Feb 29 on a leap year", "2024년 2월 29일", ["2024년 2월 29일"]],
    ["rejects Feb 29 on a non-leap year", "2023년 2월 29일", []],
    ["rejects April 31", "2024년 4월 31일", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-ko-full", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long Korean date-like input", () => {
    expectFast("date-ko-full", "2024년 ".repeat(2000) + "3월 15일");
  });
});

describe("temporal.date-ko-short", () => {
  it.each([
    ["matches dotted short dates", "2024.3.15", ["2024.3.15"]],
    ["matches hyphenated short dates", "2024-3-15", ["2024-3-15"]],
    ["matches slash-separated short dates", "2024/3/15", ["2024/3/15"]],
    ["matches zero-padded dotted dates", "2024.03.15", ["2024.03.15"]],
    ["matches at the start of the string", "2024.3.15 체결", ["2024.3.15"]],
    ["matches at the end of the string", "계약일은 2024-3-15", ["2024-3-15"]],
    ["matches inside punctuation", "(2024/3/15)", ["2024/3/15"]],
    ["matches ISO-shaped dates too", "2024-03-15", ["2024-03-15"]],
    ["rejects month 13", "2024.13.15", []],
    ["rejects day over 31", "2024.3.32", []],
    ["rejects dates followed by more digits", "2024.3.155", []],
    ["rejects Feb 30 via post-filter", "2024.2.30", []],
    ["accepts Feb 29 on a leap year", "2024.2.29", ["2024.2.29"]],
    ["rejects Feb 29 on a non-leap year", "2023.2.29", []],
    ["rejects April 31", "2024.4.31", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-ko-short", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long short-date input", () => {
    expectFast("date-ko-short", "2024-03-".repeat(1500) + "15");
  });
});

describe("temporal.date-ko-range", () => {
  it.each([
    [
      "matches a 부터...까지 range",
      "2024년 3월 15일부터 2024년 6월 30일까지",
      ["2024년 3월 15일부터 2024년 6월 30일까지"],
    ],
    [
      "matches a range with tilde separator",
      "2024년 3월 15일 ~ 2024년 6월 30일",
      ["2024년 3월 15일 ~ 2024년 6월 30일"],
    ],
    [
      "matches a range with hyphen separator",
      "2024년 3월 15일 - 2024년 6월 30일",
      ["2024년 3월 15일 - 2024년 6월 30일"],
    ],
    [
      "matches a range without 까지",
      "2024년 3월 15일부터 2024년 6월 30일",
      ["2024년 3월 15일부터 2024년 6월 30일"],
    ],
    [
      "matches inside punctuation",
      "(2024년 3월 15일부터 2024년 6월 30일까지)",
      ["2024년 3월 15일부터 2024년 6월 30일까지"],
    ],
    [
      "matches with extra whitespace",
      "2024년 3월 15일  ~  2024년 6월 30일",
      ["2024년 3월 15일  ~  2024년 6월 30일"],
    ],
    [
      "matches at the start of the string",
      "2024년 3월 15일부터 2024년 6월 30일까지 유효",
      ["2024년 3월 15일부터 2024년 6월 30일까지"],
    ],
    ["rejects a single date", "2024년 3월 15일", []],
    ["rejects missing end dates", "2024년 3월 15일부터", []],
    ["rejects missing start dates", "부터 2024년 6월 30일까지", []],
    ["rejects short-form ranges", "2024.3.15 ~ 2024.6.30", []],
    ["rejects plain prose without dates", "계약 기간은 추후 협의", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-ko-range", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long range-like input", () => {
    expectFast(
      "date-ko-range",
      "2024년 3월 15일부터 ".repeat(500) + "2024년 6월 30일까지",
      100,
    );
  });
});

describe("temporal.date-iso", () => {
  it.each([
    ["matches an ISO date", "2024-03-15", ["2024-03-15"]],
    ["matches a UTC datetime", "2024-03-15T14:30:00Z", ["2024-03-15T14:30:00Z"]],
    [
      "matches an offset datetime",
      "2024-03-15T14:30:00+09:00",
      ["2024-03-15T14:30:00+09:00"],
    ],
    ["matches a datetime without seconds", "2024-03-15T14:30", ["2024-03-15T14:30"]],
    ["matches at the start of the string", "2024-03-15 체결", ["2024-03-15"]],
    ["matches at the end of the string", "체결일 2024-03-15", ["2024-03-15"]],
    ["matches inside punctuation", "(2024-03-15)", ["2024-03-15"]],
    ["rejects non-zero-padded dates", "2024-3-15", []],
    [
      "falls back to the bare date when the hour is invalid",
      "2024-03-15T25:00:00Z",
      ["2024-03-15"],
    ],
    [
      "falls back to the bare date when the minute is invalid",
      "2024-03-15T14:99:00Z",
      ["2024-03-15"],
    ],
    ["rejects Feb 30 via post-filter", "2024-02-30", []],
    ["accepts Feb 29 on a leap year", "2024-02-29", ["2024-02-29"]],
    ["rejects Feb 29 on a non-leap year", "2023-02-29", []],
    ["rejects April 31", "2024-04-31", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-iso", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long ISO-like input", () => {
    expectFast("date-iso", "2024-03-".repeat(1500) + "15");
  });
});

describe("temporal.date-en", () => {
  it.each([
    ["matches Month Day, Year", "March 15, 2024", ["March 15, 2024"]],
    ["matches Month Day Year without comma", "March 15 2024", ["March 15 2024"]],
    ["matches abbreviated Month Day, Year", "Mar. 15, 2024", ["Mar. 15, 2024"]],
    ["matches Day Month Year", "15 March 2024", ["15 March 2024"]],
    ["matches abbreviated Day Month Year", "15 Mar 2024", ["15 Mar 2024"]],
    ["matches ordinal suffixes", "March 15th, 2024", ["March 15th, 2024"]],
    ["matches at the start of the string", "March 15, 2024 effective", ["March 15, 2024"]],
    ["matches inside punctuation", "(15 March 2024)", ["15 March 2024"]],
    ["rejects dates without a day", "March 2024", []],
    ["rejects dates without a year", "March 15", []],
    ["rejects day 32 in regex", "March 32, 2024", []],
    ["rejects Feb 30 via post-filter", "February 30, 2024", []],
    ["accepts Feb 29 on a leap year", "February 29, 2024", ["February 29, 2024"]],
    ["rejects Feb 29 on a non-leap year", "February 29, 2023", []],
    ["rejects April 31", "April 31, 2024", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-en", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long English date-like input", () => {
    expectFast("date-en", "March ".repeat(2000) + "15, 2024");
  });
});

describe("temporal.duration-ko", () => {
  it.each([
    ["matches years with 간", "3년간", ["3년간"]],
    ["matches months", "6개월", ["6개월"]],
    ["matches day durations", "90일간", ["90일간"]],
    ["matches weeks", "2주", ["2주"]],
    ["matches hours", "24시간", ["24시간"]],
    ["matches spaces before the unit", "3 년간", ["3 년간"]],
    ["matches 달", "2달", ["2달"]],
    ["matches 주간", "2주간", ["2주간"]],
    ["matches at the start of the string", "3년간 유효", ["3년간"]],
    ["rejects year suffixes without 간", "2024년", []],
    ["rejects plain day counts without 간", "3일", []],
    ["rejects the unit alone", "년간", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("duration-ko", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long Korean duration input", () => {
    expectFast("duration-ko", "1".repeat(10000) + "개월");
  });
});

describe("temporal.duration-en", () => {
  it.each([
    ["matches plural years", "3 years", ["3 years"]],
    ["matches singular years", "1 year", ["1 year"]],
    ["matches months", "6 months", ["6 months"]],
    ["matches days", "90 days", ["90 days"]],
    ["matches weeks", "2 weeks", ["2 weeks"]],
    ["matches hours", "24 hours", ["24 hours"]],
    ["matches capitalized units via /i flag", "3 Years", ["3 Years"]],
    ["matches at the start of the string", "3 years remain", ["3 years"]],
    ["matches inside punctuation", "(6 months)", ["6 months"]],
    ["rejects concatenated forms without spaces", "3years", []],
    ["rejects bare units", "years", []],
    ["matches the duration portion of '3 year old'", "3 year old", ["3 year"]],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("duration-en", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long English duration input", () => {
    expectFast("duration-en", "1 ".repeat(5000) + "years");
  });
});

describe("temporal.date-context-ko", () => {
  it.each([
    ["matches dotted dates after 계약일", "계약일: 2024.3.15", ["2024.3.15"]],
    [
      "matches Korean full dates after 체결일",
      "체결일 2024년 3월 15일",
      ["2024년 3월 15일"],
    ],
    ["matches ISO dates after 시행일", "시행일: 2024-03-15", ["2024-03-15"]],
    ["matches dotted dates after 만료일", "만료일: 2024.12.31", ["2024.12.31"]],
    ["matches fullwidth colons", "기준일： 2024.3.15", ["2024.3.15"]],
    ["matches labels without colons", "발행일 2024-03-15", ["2024-03-15"]],
    ["matches at the end of the string", "작성일 2024년 3월 15일", ["2024년 3월 15일"]],
    ["matches inside punctuation", "(계약일: 2024.3.15)", ["2024.3.15"]],
    ["rejects labels without dates", "계약일", []],
    ["rejects unlabeled dates", "2024.3.15", []],
    ["rejects unsupported labels", "시간 2024.3.15", []],
    ["rejects Feb 30 via post-filter", "계약일: 2024.2.30", []],
    ["accepts Feb 29 on a leap year", "계약일: 2024.2.29", ["2024.2.29"]],
    ["rejects Feb 29 on a non-leap year", "계약일: 2023.2.29", []],
    ["rejects April 31", "체결일 2024년 4월 31일", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("date-context-ko", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long labeled date input", () => {
    expectFast("date-context-ko", "계약일: ".repeat(1500) + "2024.3.15");
  });
});
