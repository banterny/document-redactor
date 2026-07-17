/**
 * UK legal category -- claim numbers, coroner's references, and
 * context-driven legal identifiers.
 *
 * Three rules only. Neutral citations, law report citations, statute
 * references, and CPR references are deliberately excluded -- they are
 * public legal knowledge, not identifying data. The question for each
 * rule is: "Does this string identify a specific case, person, or
 * place?" If not, it does not belong here.
 *
 * See:
 *   - docs/RULES_GUIDE.md SS 7 -- ReDoS checklist
 */

import type { RegexRule } from "../_framework/types.js";

export const LEGAL_UK = [
  // -- 1. Court Claim Number ------------------------------------------------------
  {
    id: "legal.uk-claim-number",
    category: "legal",
    subcategory: "uk-claim-number",
    pattern:
      /(?<![A-Za-z\d])(?:(?:QB|KB|KBD|QBD|CL|HQ|TLQ|PT|BL|HP|BR|CR|IL|IP|CH|IF|FL|FD|AP)-?(?:19|20)\d{2}-?\d{3,6}|[A-Z]\d{2}[A-Z]{2}\d{3,6}|(?:Claim|Case)\s+(?:No\.?|Number)\s*:?\s*[A-Z0-9\-]{4,15})(?![A-Za-z\d])/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK court claim number -- King's Bench (KB-2024-001234), county court " +
      "(A12YX123), legacy Queen's Bench (QB/HQ), Chancery (CH/BL), " +
      "Family (FL/FD), and labelled patterns (Claim No: xxx)",
  },

  // -- 2. Coroner's Reference (context-gated) ------------------------------------
  {
    id: "legal.uk-coroner-ref",
    category: "legal",
    subcategory: "uk-coroner-ref",
    // `(?![ \t])` is added ahead of the lookbehind. The value body
    // (`\d{2,4}[-/]\d{2,6}` or `[A-Z]{1,3}[-/]?\d{4,8}`) can never
    // legitimately start with a space or tab, so this guard cannot reject
    // any position that would otherwise have produced a match -- it only
    // lets V8 short-circuit the variable-length lookbehind's `\s*` before it
    // backtracks catastrophically over an adversarial whitespace run. See
    // docs/RULES_GUIDE.md SS 7.
    pattern:
      /(?![ \t])(?<=(?:Coroner'?s?\s+(?:Ref|Reference|Case|Inquest)|Inquest\s+(?:No|Number|Ref)|Regulation\s+28)[.:]?\s*)(?:\d{2,4}[-/]\d{2,6}|[A-Z]{1,3}[-/]?\d{4,8})/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK coroner's reference / inquest reference, context-gated. " +
      "Formats vary by coroner's area (2024-0123, ABC/12345)",
  },

  // -- 3. UK Legal Context Scanner ------------------------------------------------
  {
    id: "legal.uk-legal-context",
    category: "legal",
    subcategory: "uk-legal-context",
    // This rule's value body (`[^\n;,]{3,80}`) can legitimately start with
    // whitespace or a newline (see legal-uk.test.ts's documented "leading
    // space/colon in the match body" behaviour), so the usual `(?![ \t])`
    // guard used elsewhere in this file cannot be applied here -- it would
    // change which text gets captured. Instead, each lookbehind alternative
    // is restructured two ways, both verified byte-for-byte behaviour
    // preserving against the pre-fix pattern (see legal-uk.test.ts ReDoS
    // regression tests):
    //   1. The trailing `:?\s*` is nested as `(?::\s*)?` so the optional
    //      colon gates its own trailing run of whitespace. Previously two
    //      *independent* unbounded `\s*` runs (separated only by an
    //      optional, usually-absent colon) gave the engine O(k) equivalent
    //      ways to split a k-character whitespace run between them before
    //      concluding the literal label text isn't there -- classic
    //      adjacent-unbounded-quantifier ReDoS.
    //   2. Each `\s*` is bounded to `\s{0,100}`. 100 is far above any
    //      realistic label-to-value gap (column-aligned discharge
    //      summaries, GP printouts, and DOCX table padding top out around
    //      40 characters -- see docs/RULES_GUIDE.md SS 7 and the ReDoS
    //      regression tests) but caps the per-position backtracking cost at
    //      a constant instead of letting it grow with attacker-controlled
    //      input length. This is deliberately NOT the previously-rejected
    //      `{0,10}` bound, which was small enough to clip real padding.
    //
    // KNOWN, DELIBERATE LIMIT (unlike the guard-hoist fixes elsewhere in
    // this file, which are exact for any input, this bound is not): because
    // the lookbehind's whitespace run is capped at 100 chars but the value
    // body (`[^\n;,]{3,80}`) can itself absorb *space* padding as part of
    // its own 80-char budget, a space-padded value is still detected up to
    // `100 + 80 - value.length` consecutive spaces between label and value
    // (e.g. a 15-char value survives up to 165 spaces of padding; a 60-char
    // value survives up to 120). Beyond that the match is silently missed --
    // confirmed by binary search, not estimated. For *newline* padding the
    // cliff is a flat 100 regardless of value length, because `[^\n;,]`
    // excludes `\n` and so cannot absorb any of the overrun the way it can
    // for spaces. 100-165+ consecutive whitespace characters between a
    // label and its value is not a shape any real UK court or clinical
    // document produces, so this is accepted as a real, bounded limitation
    // rather than chased further -- see the "known limit" tests in
    // legal-uk.test.ts, which pin the exact boundary so a future change to
    // this pattern cannot silently move it without a failing test.
    // See docs/RULES_GUIDE.md SS 7.
    pattern:
      /(?:(?<=Claim No\.?\s{0,100}(?::\s{0,100})?)|(?<=Case No\.?\s{0,100}(?::\s{0,100})?)|(?<=Ref(?:erence)?\.?\s{0,100}(?::\s{0,100})?)|(?<=Inquest\s{1,100}(?:touching|into)\s{1,100}the\s{1,100}death\s{1,100}of\s{0,100}))[^\n;,]{3,80}(?=$|\n|[;,])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Value following a UK legal label (Claim No:/Case No:/Ref:/" +
      "Inquest touching the death of). Captures up to the first delimiter",
  },
] as const satisfies readonly RegexRule[];
