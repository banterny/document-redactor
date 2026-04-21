import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { LEGAL_UK } from "./legal-uk.js";

function findRule(subcategory: string): RegexRule {
  const rule = LEGAL_UK.find((r) => r.subcategory === subcategory);
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

/* ------------------------------------------------------------------ */
/*  Registry-level checks                                             */
/* ------------------------------------------------------------------ */

describe("LEGAL_UK registry", () => {
  it("exports exactly 3 rules", () => {
    expect(LEGAL_UK).toHaveLength(3);
  });

  it("every rule id starts with 'legal.'", () => {
    for (const rule of LEGAL_UK) {
      expect(rule.id.startsWith("legal.")).toBe(true);
    }
  });

  it("every rule has category 'legal'", () => {
    for (const rule of LEGAL_UK) {
      expect(rule.category).toBe("legal");
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of LEGAL_UK) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of LEGAL_UK) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  1. uk-claim-number                                                */
/*                                                                    */
/*  Three alternations:                                               */
/*    A) PREFIX-?YEAR-?DIGITS  (KB-2024-001234, HQ2024001234, etc.)   */
/*    B) [A-Z]\d{2}[A-Z]{2}\d{3,6}  (county court: A12YX123)        */
/*    C) (Claim|Case)\s+(No.?|Number)\s*:?\s*VALUE  (labelled)        */
/* ------------------------------------------------------------------ */

describe("legal.uk-claim-number", () => {
  it.each([
    // -- positive: alt A (division prefix + year + docket) ----------------
    [
      "matches King's Bench format (KB-2024-001234)",
      "KB-2024-001234",
      ["KB-2024-001234"],
    ],
    [
      "matches legacy Queen's Bench format (QB-2023-005678)",
      "QB-2023-005678",
      ["QB-2023-005678"],
    ],
    [
      "matches Chancery Division format (CH-2024-000123)",
      "CH-2024-000123",
      ["CH-2024-000123"],
    ],
    [
      "matches Family Division format (FL-2024-000456)",
      "FL-2024-000456",
      ["FL-2024-000456"],
    ],
    [
      "matches QBD prefix",
      "QBD-2024-001234",
      ["QBD-2024-001234"],
    ],
    [
      "matches KBD prefix",
      "KBD-2024-001234",
      ["KBD-2024-001234"],
    ],
    [
      "matches CL prefix (Commercial Court)",
      "CL-2024-000789",
      ["CL-2024-000789"],
    ],
    [
      "matches BL prefix (Business List)",
      "BL-2023-001234",
      ["BL-2023-001234"],
    ],
    [
      "matches BR prefix (Bankruptcy)",
      "BR-2024-000100",
      ["BR-2024-000100"],
    ],
    [
      "matches IP prefix (Intellectual Property)",
      "IP-2024-000200",
      ["IP-2024-000200"],
    ],
    [
      "matches FD prefix (Family Division alternative)",
      "FD-2024-000300",
      ["FD-2024-000300"],
    ],
    [
      "matches AP prefix (Appeal)",
      "AP-2024-000400",
      ["AP-2024-000400"],
    ],
    [
      "matches HQ prefix with 20xx year (HQ2024001234)",
      "HQ2024001234",
      ["HQ2024001234"],
    ],
    [
      "matches HQ prefix with 19xx year (HQ19001234)",
      "HQ19001234",
      ["HQ19001234"],
    ],
    [
      "matches without hyphens (KB2024001234, 6-digit docket)",
      "KB2024001234",
      ["KB2024001234"],
    ],

    // -- positive: alt B (county court: letter + 2 digits + 2 letters + digits)
    [
      "matches county court format (A12YX123)",
      "A12YX123",
      ["A12YX123"],
    ],

    // -- positive: alt C (labelled: Claim/Case No/Number + value) ---------
    [
      "matches labelled Claim No format",
      "Claim No: ABC123456",
      ["Claim No: ABC123456"],
    ],
    [
      "matches labelled Case Number format",
      "Case Number: KB2024001234",
      ["Case Number: KB2024001234"],
    ],
    [
      "matches Claim No. (with dot)",
      "Claim No. XYZ-1234-567",
      ["Claim No. XYZ-1234-567"],
    ],

    // -- positive: boundary handling --------------------------------------
    [
      "matches at the start of the string",
      "KB-2024-001234 was filed",
      ["KB-2024-001234"],
    ],
    [
      "matches at the end of the string",
      "the claim is KB-2024-001234",
      ["KB-2024-001234"],
    ],
    [
      "matches inside parentheses",
      "(KB-2024-001234)",
      ["KB-2024-001234"],
    ],

    // -- negative cases --------------------------------------------------
    [
      "rejects bare numbers without prefix or label",
      "2024001234",
      [],
    ],
    [
      "rejects random letter sequences",
      "XYZABCDEF",
      [],
    ],
    [
      "rejects claim number embedded in a larger alphanumeric token",
      "PREFIXKB-2024-001234SUFFIX",
      [],
    ],
    [
      "rejects old-style HQ with non-year digit pattern (HQ19X01234)",
      "HQ19X01234",
      [],
    ],
    [
      "rejects docket exceeding 6 digits (KB20240001234)",
      "KB20240001234",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-claim-number", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological claim-number input", () => {
    expectFast("uk-claim-number", "KB-2024-" + "1".repeat(10000));
  });
});

/* ------------------------------------------------------------------ */
/*  2. uk-coroner-ref (context-gated lookbehind)                      */
/*                                                                    */
/*  Lookbehind requires a coroner/inquest/Regulation 28 label.        */
/*  Captures the reference value only, not the label.                 */
/* ------------------------------------------------------------------ */

describe("legal.uk-coroner-ref", () => {
  it.each([
    // -- positive cases (label present) -----------------------------------
    [
      "matches Coroner's Ref: with date-style reference",
      "Coroner's Ref: 2024-0123",
      ["2024-0123"],
    ],
    [
      "matches Inquest Ref: with slash-style reference",
      "Inquest Ref: ABC/12345",
      ["ABC/12345"],
    ],
    [
      "matches Inquest No: with slash-style reference",
      "Inquest No: 2024/5678",
      ["2024/5678"],
    ],
    [
      "matches Regulation 28: with date-style reference",
      "Regulation 28: 2024-0042",
      ["2024-0042"],
    ],
    [
      "matches Coroners Ref (no apostrophe)",
      "Coroners Ref: 2024-0567",
      ["2024-0567"],
    ],
    [
      "matches Coroner Ref (singular, no possessive)",
      "Coroner Ref: 2024-0890",
      ["2024-0890"],
    ],
    [
      "matches Coroner's Case label",
      "Coroner's Case: 2023-1234",
      ["2023-1234"],
    ],
    [
      "matches Coroner's Inquest label",
      "Coroner's Inquest: 2024-5678",
      ["2024-5678"],
    ],
    [
      "matches Inquest Number label",
      "Inquest Number: ABC12345",
      ["ABC12345"],
    ],
    [
      "matches Regulation 28 with a dot separator",
      "Regulation 28. 2024-0099",
      ["2024-0099"],
    ],
    [
      "matches reference with no space after colon",
      "Coroner's Reference:2024-0042",
      ["2024-0042"],
    ],

    // -- negative cases (bare values, no label) ---------------------------
    [
      "rejects bare date-style reference without label",
      "2024-0123",
      [],
    ],
    [
      "rejects bare slash-style reference without label",
      "ABC/12345",
      [],
    ],
    [
      "rejects plain number sequence without label",
      "20240123",
      [],
    ],
    [
      "rejects unrelated labelled text",
      "Invoice Ref: 2024-0123",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-coroner-ref", text)).toEqual(expected);
  });

  it("is ReDoS-safe on pathological coroner-ref input", () => {
    expectFast("uk-coroner-ref", "Coroner's Ref: " + "2024-".repeat(5000));
  });
});

/* ------------------------------------------------------------------ */
/*  3. uk-legal-context (context-gated lookbehind scanner)            */
/*                                                                    */
/*  Four lookbehind alternations — each consumes only the fixed label */
/*  text. The optional punctuation/whitespace in the lookbehind       */
/*  (\.?\s*:?\s*) stays minimal, so colons and spaces adjacent to     */
/*  the label appear in the captured match body.                      */
/*                                                                    */
/*  The Inquest lookbehind ends with \s*, so a leading space appears  */
/*  in the match for "Inquest touching the death of John Smith".      */
/* ------------------------------------------------------------------ */

describe("legal.uk-legal-context", () => {
  it.each([
    // -- positive cases (captures value after label) ----------------------
    //
    // The lookbehind (?<=Claim No\.?\s*:?\s*) matches leftmost, consuming
    // only "Claim No". The colon and space remain in the match body.
    [
      "matches value after Claim No: label",
      "Claim No: KB-2024-001234",
      [": KB-2024-001234"],
    ],
    [
      "matches value after Case No: label",
      "Case No: something here",
      [": something here"],
    ],
    [
      "matches value after Ref: label",
      "Ref: ABC/12345",
      [": ABC/12345"],
    ],
    [
      "matches value after Inquest touching the death of (leading space in body)",
      "Inquest touching the death of John Smith",
      [" John Smith"],
    ],
    [
      "matches value after Inquest into the death of (leading space in body)",
      "Inquest into the death of Jane Doe",
      [" Jane Doe"],
    ],
    [
      "matches value after Claim No. (dot in body)",
      "Claim No. FL-2024-000456",
      [". FL-2024-000456"],
    ],
    [
      "matches value after Case No without colon (space in body)",
      "Case No QB-2023-005678",
      [" QB-2023-005678"],
    ],
    [
      "matches Reference: (lookbehind consumes 'Ref', 'erence:' in body)",
      "Reference: ABC-DEF-123",
      ["erence: ABC-DEF-123"],
    ],
    [
      "captures up to a comma delimiter",
      "Claim No: KB-2024-001234, filed today",
      [": KB-2024-001234"],
    ],
    [
      "captures up to a semicolon delimiter",
      "Case No: XYZ-789; next matter",
      [": XYZ-789"],
    ],
    [
      "captures up to a newline",
      "Ref: ABC/12345\nMore text",
      [": ABC/12345"],
    ],

    // -- negative cases (no label prefix) ---------------------------------
    [
      "rejects bare claim number without label",
      "KB-2024-001234",
      [],
    ],
    [
      "rejects bare text without label",
      "something here",
      [],
    ],
    [
      "rejects bare reference number without label",
      "ABC/12345",
      [],
    ],
    [
      "rejects a name without the Inquest label",
      "John Smith",
      [],
    ],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("uk-legal-context", text)).toEqual(expected);
  });

  it("does not capture the label itself", () => {
    const results = matchOne(
      "uk-legal-context",
      "Claim No: KB-2024-001234",
    );
    expect(results).toHaveLength(1);
    // The label "Claim No" is consumed by the lookbehind and never appears
    // in the match. The colon/space is in the body but "Claim No" is not.
    expect(results[0]).not.toMatch(/^Claim No/);
    expect(results[0]).not.toMatch(/^Case No/);
    expect(results[0]).not.toMatch(/^Inquest/);
  });

  it("is ReDoS-safe on long value after label", () => {
    expectFast("uk-legal-context", "Claim No: " + "A".repeat(10000), 100);
  });
});
