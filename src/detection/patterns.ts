/**
 * PII regex patterns — Korean + English (Lane A core).
 *
 * Each pattern is bounded (no nested quantifiers, no catastrophic backtracking)
 * and runs against the **normalized** text — i.e. callers should
 * `normalizeForMatching()` first so that fullwidth digits, smart quotes, en
 * dashes, and zero-width chars don't cause silent misses.
 *
 * Patterns are intentionally conservative: false positives are recoverable
 * (the user reviews candidates before applying redactions in Lane C; the
 * worst case is one extra item in the candidate list). False negatives are
 * NOT recoverable (silent leak), so when in doubt we prefer broader matches.
 *
 * The redactor (Lane B) treats every match as a literal substring to scrub
 * via the cross-run coalescer, so patterns do not need to participate in any
 * higher-level alias resolution. They produce raw target strings.
 *
 * The full set of supported kinds is exported as `PII_KINDS` for callers
 * (and tests) that want to iterate.
 */

export type PiiKind =
  | "rrn"        // 주민등록번호 / Korean RRN
  | "brn"        // 사업자등록번호 / Korean business registration number
  | "ein"        // US Employer Identification Number (2-7)
  | "phone-kr"   // 010|011|016-019 mobile phone
  | "phone-intl" // +CC ... international form
  | "email"
  | "account-kr" // Korean bank account
  | "card";      // credit card (Luhn check happens in detect-pii)

/** Stable, iterable list of all kinds — used by detect-pii and tests. */
export const PII_KINDS = [
  "rrn",
  "brn",
  "ein",
  "phone-kr",
  "phone-intl",
  "email",
  "account-kr",
  "card",
] as const satisfies ReadonlyArray<PiiKind>;

/**
 * The regex registry. All patterns:
 *  - have the `g` flag (so detect-pii can iterate via `exec` in a loop)
 *  - use lookbehind / lookahead boundaries instead of `\b` where digits
 *    or underscores would otherwise glue onto a longer run
 *  - never use nested quantifiers
 */
export const PII_PATTERNS: Record<PiiKind, RegExp> = {
  // 주민등록번호: YYMMDD-Sxxxxxx where S is the gender code (1..4 for citizens
  // born in the 19xx/20xx era; 5..8 are foreigner codes — included as well to
  // avoid silent misses on long-resident foreigners). Reject digits on either
  // side so we don't grab a substring out of a longer numeric run.
  rrn: /(?<!\d)\d{6}-[1-8]\d{6}(?!\d)/g,

  // 사업자등록번호: 3-2-5. The Korean Tax Service issues these in this
  // canonical hyphenated form; non-hyphenated 10-digit blobs are intentionally
  // not matched (they collide with phone numbers and account ids).
  brn: /(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)/g,

  // US EIN: 2-7. Used in cross-border NDAs (the worst-case fixture has one).
  ein: /(?<!\d)\d{2}-\d{7}(?!\d)/g,

  // Korean mobile phone. Allows 7- or 8-digit subscriber numbers (older lines
  // are still 7) and accepts both dashed and dash-less forms. The optional
  // dashes are independent so `010-12345678` and `0101234-5678` both work
  // even though they're rare.
  "phone-kr": /(?<!\d)01[016-9]-?\d{3,4}-?\d{4}(?!\d)/g,

  // International phone. Anchored on a `+` that is not part of a word like
  // `version+1`. The body is up to four 1-4 digit groups separated by single
  // spaces or hyphens — covers `+1 415 555 0199`, `+82-10-1234-5678`, and
  // `+44 20 7946 0958` without runaway backtracking.
  "phone-intl": /(?<![\w+])\+\d{1,3}(?:[\s-]\d{1,4}){2,4}(?!\d)/g,

  // Email. Uses ASCII-word boundaries instead of `\b`, caps the local part to
  // 64 chars, and requires dot-delimited domain labels capped to 63 chars so
  // adversarial inputs do not trigger runaway backtracking.
  email:
    /(?<![A-Za-z0-9_])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,}(?![A-Za-z0-9_])/g,

  // Korean bank account: vendor-specific lengths but the canonical separator
  // pattern is `3-6 / 2-3 / 4-7`. This intentionally overlaps with `brn` (3-2-5)
  // and older short-form `phone-kr` (3-3-4); overlap is resolved at the
  // buildTargetsFromZip dedupe stage where identical original strings collapse.
  // Detection order ensures brn and phone-kr are emitted BEFORE account-kr for
  // the same literal, preserving legacy provenance.
  "account-kr": /(?<!\d)\d{3,6}-\d{2,3}-\d{4,7}(?!\d)/g,

  // Credit card. 4 groups of 4 digits separated by space, hyphen, or nothing.
  // detect-pii.ts post-filters with a Luhn check before adding to the targets
  // list, so this pattern can be loose about the issuer without producing
  // false positives in the final output.
  card: /(?<![\d-])\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d-])/g,
};
