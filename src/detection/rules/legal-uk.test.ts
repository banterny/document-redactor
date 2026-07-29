import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { LEGAL_UK } from "./legal-uk.js";

import { expectWithinBudget } from "../../../tests/helpers/redos-budget.js";

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
  expectWithinBudget(() => void matchOne(subcategory, input), budgetMs);
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

  // Regression: the pre-fix pattern had no `(?![ \t])` guard at all, so a
  // long run of whitespace with no reachable label made the engine try the
  // expensive variable-length lookbehind at every offset before failing.
  // Measured ~190ms on 10,000 whitespace characters (over the 50ms budget)
  // before the guard was added. Safe to add here (unlike uk-legal-context)
  // because the value body (`\d{2,4}[-/]\d{2,6}` / `[A-Z]{1,3}[-/]?\d{4,8}`)
  // can never legitimately start with a space or tab.
  it("is ReDoS-safe on a long run of bare whitespace (no label present)", () => {
    expectFast("uk-coroner-ref", " ".repeat(20000));
  });

  it("is ReDoS-safe on a label followed by a long run of whitespace", () => {
    expectFast("uk-coroner-ref", "Coroner's Ref:" + " ".repeat(20000));
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

  // These four sat at relaxed 100ms/200ms budgets while the rule itself
  // measured 190.2-206.1ms -- ON the line -- and were intermittently red
  // because of it. They are now on the RULES_GUIDE § 7 standard 50ms, which
  // took two separate changes and is worth recording in order:
  //
  //   1. The rule got cheap. It measures 2.6-4.3ms here post-fix.
  //   2. The measurement stopped being wall-clock. `expectFast` now bills
  //      thread CPU via `tests/helpers/redos-budget.ts`. That mattered: with
  //      the rule already fixed, a 50ms budget still flaked at 51.4ms under
  //      ordinary background load, so an intermediate revision of this file
  //      carried a named 100ms constant to absorb it. Thread CPU removed the
  //      need -- verified by running the suite under 32 CPU hogs on 8 cores
  //      (load average 186), where seven of these assertions across five files
  //      failed before the instrument change and none failed after.
  //
  // So 50ms is now roughly 12x the real cost rather than a number chosen to
  // survive the scheduler, and it still fails outright if the pattern
  // regresses to its pre-fix shape.
  it("is ReDoS-safe on long value after label", () => {
    expectFast("uk-legal-context", "Claim No: " + "A".repeat(10000));
  });

  // Regression: the pre-fix pattern had two independent unbounded `\s*`
  // runs (separated only by an optional, usually-absent colon) inside each
  // of the four lookbehind alternatives. Against a long run of whitespace
  // with no reachable label, this gave the engine O(k) equivalent ways to
  // split the run before concluding the label text wasn't there -- and with
  // four such alternatives, the cost compounded further. Measured as
  // non-terminating (killed after 60s) on 10,000 whitespace characters
  // before the fix; this is the worst of the four rules fixed in the commit
  // that added this test. A bare fill character (no whitespace at all, as
  // used by the "long value after label" test above) never reached this
  // path -- only a long run of whitespace does.
  it("is ReDoS-safe on a long run of bare whitespace (no label present)", () => {
    expectFast("uk-legal-context", " ".repeat(20000));
  });

  it("is ReDoS-safe on a label followed by a long run of whitespace with no reachable value", () => {
    expectFast("uk-legal-context", "Claim No:" + " ".repeat(20000));
  });

  it("is ReDoS-safe on each lookbehind alternative independently", () => {
    expectFast("uk-legal-context", "Case No:" + " ".repeat(20000));
    expectFast("uk-legal-context", "Reference:" + " ".repeat(20000));
    expectFast("uk-legal-context", "Inquest touching the death of" + " ".repeat(20000));
  });

  // NOT one of the gate's six adversarial inputs, and deliberately so. The
  // `(?![^\n;,]{81})` guard rejects a position when no delimiter is reachable
  // within the body's 80-character budget, which is why a bare whitespace run
  // collapses to nothing. This input defeats that specific short-circuit: a
  // `;` every 100 characters keeps the guard satisfied at most positions while
  // still leaving a 100-character whitespace run behind each one for the
  // lookbehind to walk. It is the shape that distinguishes a real fix from one
  // tuned to the gate's own corpus, and it is the worst shape found for this
  // rule -- the six inputs the gate does use are all an order of magnitude
  // cheaper afterwards. It is what the nested `(?<=[.oef])` assertion in the
  // pattern exists for; without that assertion this input stays above budget.
  //
  // THIS ASSERTION RUNS UNDER V8 AND SO PROVES NOTHING ABOUT SAFARI. The
  // JavaScriptCore numbers, measured with the deep gate's own harness, are
  // 55-90ms before the fix and 23-37ms after, against the same 50ms budget --
  // the smallest margin either of the two fixes has, which is why it is pinned
  // here at all. An earlier revision of the fix left this input at 68.4ms,
  // i.e. still over budget, while every gate input was already comfortably
  // clear: that is the whole reason this test exists.
  it("is ReDoS-safe on interleaved whitespace runs and delimiters", () => {
    expectFast("uk-legal-context", (" ".repeat(100) + ";").repeat(100));
    expectFast("uk-legal-context", ("Claim No" + " ".repeat(100) + ";").repeat(100));
  });

  // Behaviour-preservation matrix (see docs/RULES_GUIDE.md SS 7 and the
  // fix commit's differential test). The fix restructures each lookbehind
  // alternative's internal whitespace handling for performance but must not
  // change which text is captured. This locks in the exact (including the
  // documented quirks noted above, e.g. leading colon/space in the match
  // body) byte-for-byte output across label/padding combinations from 0 to
  // 40 spaces, tabs, CRLF, and newline+indent continuations -- the same
  // matrix used to verify zero differences against the pre-fix pattern.
  it.each([
    [0, "Claim No:", "KB-2024-001234", [":KB-2024-001234"]],
    [1, "Claim No:", "KB-2024-001234", [": KB-2024-001234"]],
    [3, "Claim No:", "KB-2024-001234", [":   KB-2024-001234"]],
    [5, "Claim No:", "KB-2024-001234", [":     KB-2024-001234"]],
    [10, "Claim No:", "KB-2024-001234", [":          KB-2024-001234"]],
    [11, "Claim No:", "KB-2024-001234", [":           KB-2024-001234"]],
    [20, "Claim No:", "KB-2024-001234", [":                    KB-2024-001234"]],
    [
      40,
      "Claim No:",
      "KB-2024-001234",
      [":                                        KB-2024-001234"],
    ],
  ])(
    "captures identically to the pre-fix pattern with %i spaces of padding",
    (n: number, label: string, value: string, expected: string[]) => {
      expect(matchOne("uk-legal-context", `${label}${" ".repeat(n)}${value}`)).toEqual(
        expected,
      );
    },
  );

  it("preserves the pre-fix tab-padding behaviour", () => {
    expect(matchOne("uk-legal-context", "Claim No:\tKB-2024-001234")).toEqual([
      ":\tKB-2024-001234",
    ]);
  });

  it("preserves the pre-fix CRLF-padding behaviour (label and value on the same effective line)", () => {
    expect(matchOne("uk-legal-context", "Claim No:\r\nKB-2024-001234")).toEqual([
      "KB-2024-001234",
    ]);
  });

  it("preserves the pre-fix newline+indent continuation behaviour (label at EOL, value indented on the next line)", () => {
    expect(matchOne("uk-legal-context", "Claim No\n  KB-2024-001234")).toEqual([
      "  KB-2024-001234",
    ]);
  });

  it("preserves the pre-fix behaviour for the Ref, Case No, and Inquest alternatives under padding", () => {
    expect(matchOne("uk-legal-context", "Ref:" + " ".repeat(15) + "2024-0123")).toEqual([
      ":               2024-0123",
    ]);
    expect(matchOne("uk-legal-context", "Case No" + " ".repeat(9) + "A12YX123")).toEqual([
      "         A12YX123",
    ]);
    expect(
      matchOne(
        "uk-legal-context",
        "Inquest touching the death of" + " ".repeat(15) + "JOHN SMITH",
      ),
    ).toEqual(["               JOHN SMITH"]);
  });

  // ------------------------------------------------------------------
  // Known, deliberate limit of the `\s{0,100}` bound (see legal-uk.ts).
  //
  // The behaviour-preservation matrix above only tests 0-40 spaces of
  // padding, which is well inside the supported range and proves nothing
  // about padding beyond it. The bound genuinely diverges from the
  // pre-fix (unbounded) pattern once padding exceeds
  // `100 + 80 - value.length` consecutive spaces (or exactly 100
  // consecutive newlines, regardless of value length, because the value
  // body excludes `\n`). These tests pin that exact boundary -- both the
  // supported side (must still detect) and the missed side (must not
  // silently regress to "detects" without deliberately widening the
  // bound and updating this comment) -- so a future reader discovers the
  // limit here, not by finding a redacted document that leaked a name.
  //
  // The Inquest alternative is the one with no independent safety net:
  // its value is the deceased's name, caught by no other rule. (The
  // Claim No/Case No/Ref alternatives' values are also independently
  // caught by legal.uk-claim-number and legal.uk-coroner-ref regardless
  // of this rule's padding cliff.)
  // ------------------------------------------------------------------
  describe("known limit: extreme whitespace padding beyond the \\s{0,100} bound", () => {
    it("still detects a name at the maximum supported space padding (165 = 100 + 80 - 15)", () => {
      // The match itself is bounded by the value body's own {3,80} budget,
      // so only the last (80 - value.length) spaces are captured alongside
      // the value, not the full 165 -- the leftmost successful start
      // position is wherever the remaining padding+value first fits within
      // 80 characters. What matters here is that a match exists at all.
      expect(
        matchOne(
          "uk-legal-context",
          "Inquest touching the death of" + " ".repeat(165) + "Margaret Hollis",
        ),
      ).toEqual([" ".repeat(80 - "Margaret Hollis".length) + "Margaret Hollis"]);
    });

    it("KNOWN MISS: does not detect a name one space beyond the supported padding (166)", () => {
      expect(
        matchOne(
          "uk-legal-context",
          "Inquest touching the death of" + " ".repeat(166) + "Margaret Hollis",
        ),
      ).toEqual([]);
    });

    it("the supported padding shrinks as the value gets longer (100 + 80 - value.length)", () => {
      const longName = "A very long deceased person's full legal name for the record";
      expect(longName).toHaveLength(60);
      const cliff = 100 + 80 - longName.length; // 120
      expect(
        matchOne(
          "uk-legal-context",
          "Inquest touching the death of" + " ".repeat(cliff) + longName,
        ),
      ).toEqual([" ".repeat(80 - longName.length) + longName]);
      expect(
        matchOne(
          "uk-legal-context",
          "Inquest touching the death of" + " ".repeat(cliff + 1) + longName,
        ),
      ).toEqual([]);
    });

    it("still detects a name at the maximum supported newline padding (100, the lookbehind bound itself)", () => {
      expect(
        matchOne(
          "uk-legal-context",
          "Inquest touching the death of" + "\n".repeat(100) + "Margaret Hollis",
        ),
      ).toEqual(["Margaret Hollis"]);
    });

    it("KNOWN MISS: does not detect a name one newline beyond the supported padding (101) -- the value body excludes \\n so it cannot compensate the way it can for spaces", () => {
      expect(
        matchOne(
          "uk-legal-context",
          "Inquest touching the death of" + "\n".repeat(101) + "Margaret Hollis",
        ),
      ).toEqual([]);
    });
  });
});
