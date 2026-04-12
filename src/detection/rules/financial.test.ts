import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { FINANCIAL } from "./financial.js";

function findRule(subcategory: string): RegexRule {
  const rule = FINANCIAL.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function expectFast(subcategory: string, input: string): void {
  const start = performance.now();
  void matchOne(subcategory, input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(50);
}

describe("FINANCIAL registry", () => {
  it("exports exactly 10 rules", () => {
    expect(FINANCIAL).toHaveLength(10);
  });

  it("every rule id starts with 'financial.'", () => {
    for (const rule of FINANCIAL) {
      expect(rule.id.startsWith("financial.")).toBe(true);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of FINANCIAL) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of FINANCIAL) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe("financial.won-amount", () => {
  it.each([
    ["matches a comma-separated amount", "50,000원", ["50,000원"]],
    ["matches a bare-digit amount without commas", "1000원", ["1000원"]],
    ["matches an amount with decimal", "1,500.50원", ["1,500.50원"]],
    ["matches a long bare amount without commas", "50000원", ["50000원"]],
    ["matches extra spaces before the suffix", "50,000  원", ["50,000  원"]],
    ["matches an amount followed by Korean text", "50,000원입니다", ["50,000원"]],
    ["matches at the start of the string", "50,000원 is the total", ["50,000원"]],
    ["matches at the end of the string", "Total: 50,000원", ["50,000원"]],
    ["matches inside punctuation", "(50,000원)", ["50,000원"]],
    ["rejects a year suffix", "2024년", []],
    ["rejects values above the post-filter cap", "1500000000000000000원", []],
    ["rejects the suffix without digits", "원", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("won-amount", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological comma input", () => {
    expectFast("won-amount", "1" + ",000".repeat(2500) + "원");
  });
});

describe("financial.won-unit", () => {
  it.each([
    ["matches 억 form", "1억원", ["1억원"]],
    ["matches 만 form", "500만원", ["500만원"]],
    ["matches 천만 form", "3천만원", ["3천만원"]],
    ["matches 조 form", "1조원", ["1조원"]],
    ["matches comma-separated digits before the unit", "1,000만원", ["1,000만원"]],
    ["matches space between the digits and unit", "500 만원", ["500 만원"]],
    ["matches at the start of the string", "500만원 지급", ["500만원"]],
    ["matches at the end of the string", "보증금은 500만원", ["500만원"]],
    ["matches inside punctuation", "(500만원)", ["500만원"]],
    ["rejects forms without the 원 suffix", "500만", []],
    ["rejects forms without a leading digit", "천만원", []],
    ["rejects the unit alone", "만원", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("won-unit", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long unit input", () => {
    expectFast("won-unit", "1".repeat(5000) + "억원");
  });
});

describe("financial.won-formal", () => {
  it.each([
    ["matches a won symbol amount", "₩50,000", ["₩50,000"]],
    ["matches a won symbol amount with space", "₩ 50,000", ["₩ 50,000"]],
    ["matches a KRW code amount", "KRW 50,000,000", ["KRW 50,000,000"]],
    ["matches KRW without commas", "KRW 1000", ["KRW 1000"]],
    ["matches at the start of the string", "KRW 50,000 due", ["KRW 50,000"]],
    ["matches at the end of the string", "Total ₩50,000", ["₩50,000"]],
    ["matches inside punctuation", "(₩50,000)", ["₩50,000"]],
    ["matches after whitespace", " 지급 KRW 1000", ["KRW 1000"]],
    ["matches adjacent to Korean text", "대금은 KRW 1000입니다", ["KRW 1000"]],
    ["rejects KRW inside a larger ASCII token", "FOOKRW 50,000", []],
    ["rejects KRW without digits", "KRW", []],
    ["rejects lowercase krw", "krw 50,000", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("won-formal", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long KRW input", () => {
    expectFast("won-formal", "KRW " + "1".repeat(10000));
  });
});

describe("financial.usd-symbol", () => {
  it.each([
    ["matches a comma-separated dollar amount", "$50,000", ["$50,000"]],
    ["matches a two-decimal amount", "$1.99", ["$1.99"]],
    ["matches a trailing-zero amount", "$100.00", ["$100.00"]],
    ["matches a zero-leading decimal amount", "$0.50", ["$0.50"]],
    ["matches a bare amount without commas", "$50000", ["$50000"]],
    ["matches a space after the dollar sign", "$ 50,000", ["$ 50,000"]],
    ["matches commas plus decimals", "$50,000.00", ["$50,000.00"]],
    ["matches at the start of the string", "$50,000 due", ["$50,000"]],
    ["matches inside punctuation", "($50,000)", ["$50,000"]],
    ["rejects US$ form handled by usd-code", "US$100", []],
    ["rejects a bare dollar sign", "$", []],
    ["rejects letters immediately before the dollar sign", "A$50", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("usd-symbol", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long dollar input", () => {
    expectFast("usd-symbol", "$" + "1".repeat(10000));
  });
});

describe("financial.usd-code", () => {
  it.each([
    ["matches a USD code amount", "USD 50,000", ["USD 50,000"]],
    ["matches a large USD code amount with decimals", "USD 1,000,000.00", ["USD 1,000,000.00"]],
    ["matches US$ with a space", "US$ 100", ["US$ 100"]],
    ["matches US$ without a space", "US$100", ["US$100"]],
    ["matches extra spaces after USD", "USD   50,000", ["USD   50,000"]],
    ["matches at the start of the string", "USD 50,000 payable", ["USD 50,000"]],
    ["matches at the end of the string", "Total USD 50,000", ["USD 50,000"]],
    ["matches inside punctuation", "(US$100)", ["US$100"]],
    ["matches a valid amount inside longer prose", "AUDIT USD 100 trail", ["USD 100"]],
    ["rejects USD without digits", "USD", []],
    ["rejects US$ without digits", "US$", []],
    ["rejects lowercase usd", "usd 50,000", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("usd-code", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long USD input", () => {
    expectFast("usd-code", "USD " + "1".repeat(10000));
  });
});

describe("financial.foreign-symbol", () => {
  it.each([
    ["matches euro amounts", "€50,000", ["€50,000"]],
    ["matches pound amounts", "£1,000", ["£1,000"]],
    ["matches yen amounts", "¥10,000", ["¥10,000"]],
    ["matches a space after the symbol", "€ 50.00", ["€ 50.00"]],
    ["matches at the start of the string", "€50,000 due", ["€50,000"]],
    ["matches at the end of the string", "Total £1,000", ["£1,000"]],
    ["matches inside punctuation", "(¥10,000)", ["¥10,000"]],
    ["matches decimals with two places", "£ 10.50", ["£ 10.50"]],
    ["matches adjacent Korean text", "합계는 €50,000입니다", ["€50,000"]],
    ["rejects the Chinese yuan character", "元50,000", []],
    ["rejects a bare symbol", "¥", []],
    ["rejects letters immediately before the symbol", "A€50", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("foreign-symbol", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long symbol input", () => {
    expectFast("foreign-symbol", "€" + "1".repeat(10000));
  });
});

describe("financial.foreign-code", () => {
  it.each([
    ["matches EUR amounts", "EUR 50,000", ["EUR 50,000"]],
    ["matches GBP amounts", "GBP 1,000", ["GBP 1,000"]],
    ["matches JPY amounts", "JPY 10,000", ["JPY 10,000"]],
    ["matches CNY amounts", "CNY 50,000", ["CNY 50,000"]],
    ["matches CHF decimals", "CHF 10.50", ["CHF 10.50"]],
    ["matches AUD amounts", "AUD 500", ["AUD 500"]],
    ["matches CAD at the start of the string", "CAD 100 due", ["CAD 100"]],
    ["matches HKD at the end of the string", "Total HKD 100", ["HKD 100"]],
    ["matches SGD inside punctuation", "(SGD 100)", ["SGD 100"]],
    ["rejects concatenated EUR amounts without a space", "EUR50", []],
    ["rejects words that only start with a code", "EUROPE 50", []],
    ["rejects a bare code", "EUR", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("foreign-code", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long code input", () => {
    expectFast("foreign-code", "EUR " + "1".repeat(10000));
  });
});

describe("financial.percentage", () => {
  it.each([
    ["matches a whole-number percent", "15%", ["15%"]],
    ["matches a decimal percent", "15.5%", ["15.5%"]],
    ["matches a percent with a space before the symbol", "15 %", ["15 %"]],
    ["matches 퍼센트 form", "15퍼센트", ["15퍼센트"]],
    ["matches spaced 퍼센트 form", "15 퍼센트", ["15 퍼센트"]],
    ["matches 프로 form", "15 프로", ["15 프로"]],
    ["matches at the start of the string", "15% 증가", ["15%"]],
    ["matches at the end of the string", "할인율은 15%", ["15%"]],
    ["matches inside punctuation", "(15%)", ["15%"]],
    ["rejects non-percentage counters", "15개", []],
    ["rejects a bare percent symbol", "%", []],
    ["rejects values above the post-filter cap", "15000%", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("percentage", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long percent input", () => {
    expectFast("percentage", "1".repeat(10000) + "%");
  });
});

describe("financial.fraction-ko", () => {
  it.each([
    ["matches the spaced Korean fraction form", "3분의 1", ["3분의 1"]],
    ["matches the unspaced Korean fraction form", "3분의1", ["3분의1"]],
    ["matches larger numerators and denominators", "100분의 20", ["100분의 20"]],
    ["matches at the start of the string", "3분의 1 지분", ["3분의 1"]],
    ["matches at the end of the string", "비율은 3분의 1", ["3분의 1"]],
    ["matches inside punctuation", "(3분의 1)", ["3분의 1"]],
    ["matches the full trailing number", "비율은 3분의 12", ["3분의 12"]],
    ["matches with extra spaces", "3 분의  1", ["3 분의  1"]],
    ["matches adjacent Korean text", "지분3분의 1이전", ["3분의 1"]],
    ["rejects minute expressions", "3분간", []],
    ["rejects the fraction keyword alone", "분의", []],
    ["rejects slash fractions", "1/3", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("fraction-ko", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long fraction input", () => {
    expectFast("fraction-ko", "1".repeat(5000) + "분의" + "2".repeat(5000));
  });
});

describe("financial.amount-context-ko", () => {
  it.each([
    ["matches a colon-labeled amount", "금액: 1,000,000", ["1,000,000"]],
    ["matches a labeled amount with an 억원 suffix", "금액 5억원", ["5억원"]],
    ["matches a labeled amount with 원 suffix", "보증금: 50,000,000원", ["50,000,000원"]],
    ["matches a labeled bare amount", "매매대금 100,000,000", ["100,000,000"]],
    ["matches a fullwidth colon after the label", "총액： 1,000,000원", ["1,000,000원"]],
    ["matches labels without a colon", "계약금 500,000원", ["500,000원"]],
    ["matches at the end of the string", "지급액 1,000,000", ["1,000,000"]],
    ["matches after punctuation", "(대금: 100,000원)", ["100,000원"]],
    ["matches 천원 suffix", "수수료: 5천원", ["5천원"]],
    ["rejects the label without a following digit", "금액", []],
    ["rejects unlabeled amounts", "1,000,000", []],
    ["rejects unsupported labels", "시간 30", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("amount-context-ko", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long labeled input", () => {
    expectFast("amount-context-ko", "금액: " + "1".repeat(10000));
  });
});
