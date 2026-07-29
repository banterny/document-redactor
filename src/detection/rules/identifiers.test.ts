import { describe, expect, it } from "vitest";

import type { RegexRule } from "../_framework/types.js";

import { PII_PATTERNS, type PiiKind } from "../patterns.js";
import { IDENTIFIERS } from "./identifiers.js";

import { expectWithinBudget } from "../../../tests/helpers/redos-budget.js";

const SUBCATEGORY_TO_KIND: Record<string, PiiKind> = {
  "korean-rrn": "rrn",
  "korean-brn": "brn",
  "us-ein": "ein",
  "phone-kr": "phone-kr",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  "credit-card": "card",
};

/** Find a rule in IDENTIFIERS by its subcategory. Throws if not found. */
function rule(subcategory: string): RegexRule {
  const found = IDENTIFIERS.find((r) => r.subcategory === subcategory);
  if (!found) throw new Error(`rule not registered: ${subcategory}`);
  return found;
}

/** Run a rule's pattern (with postFilter) against a sample, return matched strings. */
function matches(subcategory: string, sample: string): string[] {
  const r = rule(subcategory);
  const re = new RegExp(r.pattern.source, r.pattern.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sample)) !== null) {
    if (r.postFilter && !r.postFilter(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  expectWithinBudget(() => void matches(subcategory, input), budgetMs);
}

describe("IDENTIFIERS registry", () => {
  it("exports exactly 9 rules", () => {
    expect(IDENTIFIERS.length).toBe(9);
  });

  it("every rule has category = 'identifiers'", () => {
    for (const r of IDENTIFIERS) {
      expect(r.category).toBe("identifiers");
    }
  });

  it("every rule has a unique id", () => {
    const ids = new Set(IDENTIFIERS.map((r) => r.id));
    expect(ids.size).toBe(IDENTIFIERS.length);
  });

  it("every rule id starts with 'identifiers.'", () => {
    for (const r of IDENTIFIERS) {
      expect(r.id).toMatch(/^identifiers\./);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const r of IDENTIFIERS) {
      expect(r.pattern.flags).toContain("g");
    }
  });

  it("every rule levels array is non-empty", () => {
    for (const r of IDENTIFIERS) {
      expect(r.levels.length).toBeGreaterThan(0);
    }
  });

  it("every rule languages array is non-empty", () => {
    for (const r of IDENTIFIERS) {
      expect(r.languages.length).toBeGreaterThan(0);
    }
  });

  it("every legacy-mapped rule pattern.source matches the legacy PII_PATTERNS entry", () => {
    for (const r of IDENTIFIERS) {
      const kind =
        SUBCATEGORY_TO_KIND[r.subcategory as keyof typeof SUBCATEGORY_TO_KIND];
      if (kind === undefined) continue;
      expect(r.pattern.source).toBe(PII_PATTERNS[kind].source);
    }
  });

  it("every legacy-mapped rule pattern.flags matches the legacy PII_PATTERNS entry", () => {
    for (const r of IDENTIFIERS) {
      const kind =
        SUBCATEGORY_TO_KIND[r.subcategory as keyof typeof SUBCATEGORY_TO_KIND];
      if (kind === undefined) continue;
      expect(r.pattern.flags).toBe(PII_PATTERNS[kind].flags);
    }
  });
});

describe("korean-rrn", () => {
  it("matches the canonical 6-7 form", () => {
    expect(matches("korean-rrn", "주민번호: 900101-1234567 입니다.")).toEqual([
      "900101-1234567",
    ]);
  });

  it("rejects gender code outside 1-8", () => {
    expect(matches("korean-rrn", "900101-9234567")).toEqual([]);
    expect(matches("korean-rrn", "900101-0234567")).toEqual([]);
  });

  it("does not match inside a longer digit run", () => {
    expect(matches("korean-rrn", "1234900101-12345678")).toEqual([]);
    expect(matches("korean-rrn", "900101-12345678")).toEqual([]);
  });

  it("matches multiple RRNs in one paragraph", () => {
    expect(
      matches("korean-rrn", "A: 900101-1234567, B: 850515-2345678"),
    ).toEqual(["900101-1234567", "850515-2345678"]);
  });
});

describe("korean-brn", () => {
  it("matches the canonical 3-2-5 form", () => {
    expect(matches("korean-brn", "사업자번호 123-45-67890 입니다.")).toEqual([
      "123-45-67890",
    ]);
  });

  it("does not match inside a longer digit run", () => {
    expect(matches("korean-brn", "9123-45-67890")).toEqual([]);
    expect(matches("korean-brn", "123-45-678901")).toEqual([]);
  });
});

describe("us-ein", () => {
  it("matches the canonical 2-7 form", () => {
    expect(matches("us-ein", "EIN: 12-3456789")).toEqual(["12-3456789"]);
  });

  it("does not match inside a longer digit run", () => {
    expect(matches("us-ein", "112-3456789")).toEqual([]);
    expect(matches("us-ein", "12-34567890")).toEqual([]);
  });
});

describe("phone-kr", () => {
  it("matches dashed 010 form", () => {
    expect(matches("phone-kr", "010-1234-5678")).toEqual(["010-1234-5678"]);
  });

  it("matches dashless form", () => {
    expect(matches("phone-kr", "01012345678")).toEqual(["01012345678"]);
  });

  it("matches 011, 016-019 carriers", () => {
    expect(matches("phone-kr", "011-234-5678")).toEqual(["011-234-5678"]);
    expect(matches("phone-kr", "016-234-5678")).toEqual(["016-234-5678"]);
    expect(matches("phone-kr", "019-234-5678")).toEqual(["019-234-5678"]);
  });

  it("rejects 015 (not a mobile carrier)", () => {
    expect(matches("phone-kr", "015-234-5678")).toEqual([]);
  });
});

describe("phone-intl", () => {
  it("matches US number with + prefix", () => {
    expect(matches("phone-intl", "Call +1 415 555 0199 soon")).toEqual([
      "+1 415 555 0199",
    ]);
  });

  it("matches Korean international form", () => {
    expect(matches("phone-intl", "+82-10-1234-5678")).toEqual([
      "+82-10-1234-5678",
    ]);
  });

  it("does not match a bare + character", () => {
    expect(matches("phone-intl", "version+1 is fine")).toEqual([]);
  });
});

describe("phone-kr-landline", () => {
  it.each([
    ["matches Seoul 02 with 4-digit subscriber", "02-1234-5678", ["02-1234-5678"]],
    ["matches region 031 with 3-digit prefix", "031-123-4567", ["031-123-4567"]],
    ["matches 070 VoIP", "070-1234-5678", ["070-1234-5678"]],
    ["matches without hyphens", "0234463727", ["0234463727"]],
    ["matches 080 toll-free", "080-123-4567", ["080-123-4567"]],
    ["matches 050 alternate", "050-1234-5678", ["050-1234-5678"]],
    ["matches at the start of the string", "02-1234-5678 is the Seoul office", ["02-1234-5678"]],
    ["matches at the end of the string", "Call 02-1234-5678", ["02-1234-5678"]],
    ["matches after a colon", "Tel: 02-1234-5678", ["02-1234-5678"]],
    ["rejects mobile numbers handled by phone-kr", "010-1234-5678", []],
    ["rejects too-short numbers", "02-123", []],
    ["rejects invalid area codes", "099-1234-5678", []],
  ])("%s", (_name, text, expected) => {
    expect(matches("phone-kr-landline", text)).toEqual(expected);
  });

  it("is ReDoS-safe on 10KB adversarial input", () => {
    expectFast("phone-kr-landline", "0-".repeat(5000));
  });
});

describe("email", () => {
  it("matches bounded form", () => {
    expect(matches("email", "Contact kim@abc-corp.kr please")).toEqual([
      "kim@abc-corp.kr",
    ]);
  });

  it("matches with subdomains and plus tags", () => {
    expect(matches("email", "legal+filter@mail.sunrise.com")).toEqual([
      "legal+filter@mail.sunrise.com",
    ]);
  });

  it("requires a 2+ letter TLD", () => {
    expect(matches("email", "alice@example.c")).toEqual([]);
  });
});

describe("account-kr", () => {
  it("matches canonical 3-2-5 form (same shape as brn)", () => {
    expect(matches("account-kr", "계좌 123-45-67890")).toContain("123-45-67890");
  });

  it("matches 6-3-7 form", () => {
    expect(matches("account-kr", "123456-123-1234567")).toContain(
      "123456-123-1234567",
    );
  });
});

describe("credit-card (Luhn-validated)", () => {
  it("matches a Visa test number", () => {
    expect(matches("credit-card", "Card: 4111 1111 1111 1111")).toEqual([
      "4111 1111 1111 1111",
    ]);
  });

  it("rejects a 16-digit blob that fails Luhn", () => {
    expect(matches("credit-card", "1234 5678 9012 3456")).toEqual([]);
  });

  it("matches hyphenated form", () => {
    expect(matches("credit-card", "4111-1111-1111-1111")).toEqual([
      "4111-1111-1111-1111",
    ]);
  });

  it("matches unspaced form", () => {
    expect(matches("credit-card", "4111111111111111")).toEqual([
      "4111111111111111",
    ]);
  });
});
