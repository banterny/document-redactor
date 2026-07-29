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
    // change which text gets captured. Four other techniques are used
    // instead, every one of them exact (the match set is unchanged for ANY
    // input, not merely for the tested corpus). Points 3 and 4 are what
    // finally brought this rule under budget on JavaScriptCore; points 1 and
    // 2 came first and were not enough on their own.
    //
    //   3. LEADING NECESSARY-CONDITION GUARD `(?![^\n;,]{81})`. The body
    //      needs 3-80 chars of `[^\n;,]` followed by end-of-input or one of
    //      `\n;,`. So if 81 such chars DO follow, then for every body length
    //      k in [3,80] the character at offset k exists and is itself in
    //      `[^\n;,]` -- it is neither end-of-input nor a delimiter -- and no
    //      body length can succeed. The guard therefore only ever rejects
    //      positions that could not have matched, which makes it exact by the
    //      same commutativity argument as the `(?![ \t])` hoist elsewhere in
    //      this file: two zero-width assertions at one position, evaluated
    //      left to right. `{81}` is an EXACT count, so it costs one bounded
    //      scan with no backtracking, whereas the lookbehind it now
    //      short-circuits costs ~200 backtracking steps per position.
    //   4. THE THREE `No`/`Ref` ALTERNATIVES ARE FACTORED INTO ONE
    //      LOOKBEHIND. `(?<=aX)|(?<=bX)|(?<=cX)` is exactly `(?<=(?:a|b|c)X)`
    //      when X is shared: a lookbehind succeeds iff SOME suffix of the
    //      preceding text matches it, and the union of three such languages
    //      is the language of the alternation. All the groups involved are
    //      non-capturing, so there is no capture-visibility difference
    //      either. This matters for cost because X here is the expensive
    //      part -- `\.?\s{0,100}(?::\s{0,100})?` -- and it was being walked
    //      three times per position over an adversarial whitespace run.
    //      The `Inquest` alternative has a different connector and stays
    //      separate.
    //   5. THE NESTED `(?<=[.oef])`. A lookbehind is matched right to left, so
    //      the engine walks the whitespace run first and only then tests the
    //      label. At every one of the ~100 split points it was retrying the
    //      optional dot and all four literals -- roughly five character
    //      comparisons to reject one split. This nested assertion sits between
    //      `\.?` and `\s{0,100}`, which is exactly where the engine arrives
    //      after consuming the run, and rejects a bad split in ONE comparison.
    //      It is implied rather than restrictive: whatever precedes that point
    //      has to have matched `(?:Claim No|Case No|Ref(?:erence)?)\.?`, whose
    //      final character is always `.`, `o` (both `No` labels), `f` (`Ref`)
    //      or `e` (`Reference`) -- the pattern is case-sensitive, so there are
    //      no other cases to admit. It therefore cannot reject a position the
    //      surrounding lookbehind would have accepted. Worth 68.4ms -> 34.8ms
    //      on the interleaved input described in legal-uk.test.ts, which is
    //      the worst shape found for this rule and the one that decides
    //      whether the fix is real or merely tuned to the gate's corpus. Point
    //      3 alone left that input ABOVE budget while every gate input was
    //      already an order of magnitude clear -- which is the whole argument
    //      for measuring a shape the gate does not contain.
    //
    // On `" ".repeat(10_000)`, the gate input this rule was quarantined on:
    // the deep gate's own assertion measured 78.0ms before (that is the number
    // that failed once the exception was removed), and the same harness
    // measures 3.5-5.8ms after, across repeated runs. On V8, 22.8-24.3ms
    // before and 1.5-3.2ms after. The spread is machine load, not variance in
    // the rule -- CPU time still inflates under contention -- so the honest
    // claim is an order of magnitude, comfortably inside a 50ms budget, rather
    // than a single decimal figure. JavaScriptCore is the engine that decides
    // this: Safari and every browser on iOS.
    //
    // KNOWN_ENGINE_EXCEPTIONS is now empty. Behaviour verified identical to
    // the pre-change pattern over 144,835 cases -- see the ReDoS and
    // known-limit tests below, and `harnesses/differential-quarantine.mjs` in
    // the handoff notes, which takes its baseline from `git show HEAD` so it
    // cannot silently compare a pattern against itself.
    //
    // The two earlier restructurings, kept because they are still load-
    // bearing for the `{0,100}` bound documented below:
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
      /(?![^\n;,]{81})(?:(?<=(?:Claim No|Case No|Ref(?:erence)?)\.?(?<=[.oef])\s{0,100}(?::\s{0,100})?)|(?<=Inquest\s{1,100}(?:touching|into)\s{1,100}the\s{1,100}death\s{1,100}of\s{0,100}))[^\n;,]{3,80}(?=$|\n|[;,])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Value following a UK legal label (Claim No:/Case No:/Ref:/" +
      "Inquest touching the death of). Captures up to the first delimiter",
  },
] as const satisfies readonly RegexRule[];
