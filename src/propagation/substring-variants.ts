/**
 * Substring variant finder — Lane C's "ABC Corporation → ABC Corp" leg.
 *
 * Given a seed entity (an entity name the user wants redacted) and the
 * document corpus, returns every shorter or abbreviated form of the seed
 * that actually appears in the corpus. The result feeds the variant
 * propagation step in propagate.ts.
 *
 * Two discovery strategies, combined:
 *
 *   1. **Progressive prefix shortening.** Drop tokens from the right one
 *      at a time. `Sunrise Ventures LLC` → `Sunrise Ventures` → `Sunrise`.
 *      Each shortened form is kept iff it appears in the corpus as a
 *      *standalone* occurrence — i.e. not as a prefix of the longer form.
 *      Math: standalone(X) = bounded(X) − bounded(X + nextToken). This
 *      prevents the algorithm from surfacing "Sunrise" as a variant when
 *      every occurrence of "Sunrise" is actually the first word of
 *      "Sunrise Ventures LLC".
 *
 *   2. **Corporate suffix swap.** Try `<firstToken> <suffix>` for a
 *      hardcoded list of common English corporate suffixes (Corp, Corp.,
 *      Inc, Inc., Ltd, LLC, Co., Company, ...). This catches the
 *      "ABC Corporation → ABC Corp" abbreviation the progressive
 *      shortening can't reach because it changes the suffix rather than
 *      dropping a word.
 *
 * **Word-boundary rule (the CJK-aware part):**
 *
 * A match is "word-bounded" iff at least one of:
 *   - The character before it is not a Latin word character, OR
 *   - The first char of the match is not a Latin word character.
 * Same rule on the right side. Put another way: the boundary check ONLY
 * rejects matches where the match character AND the adjacent character
 * are BOTH Latin word chars [A-Za-z0-9_]. This is what catches "ABC"
 * inside "ABC123" while still allowing "김철수" inside "김철수는" (Korean
 * particle attached) because the transition between Hangul and Hangul
 * is treated as a boundary — the redactor correctly handles these and
 * the user's intent is to match the name regardless of the particle.
 *
 * The boundary heuristic is deliberately simple. It is NOT a full Unicode
 * word-break algorithm. It's the minimum rule that (a) prevents the ASCII
 * substring-inside-longer-token problem and (b) doesn't break Korean
 * particle attachment. Edge cases outside (a) and (b) are acceptable
 * false negatives / positives — the user reviews candidates before
 * applying, and the round-trip verifier catches anything that actually
 * leaks.
 *
 * Public API:
 *   - `findSubstringVariants(seed, text)` — returns the deduped variant
 *     list in discovery order (progressive prefixes first, then suffix
 *     swaps). The seed itself is never in the result.
 *   - `countWordBoundedOccurrences(text, needle)` — shared helper used
 *     by propagate.ts for counting display hits in the candidates panel.
 */

/**
 * English corporate suffixes to try when swapping the last word of a
 * first-token-dominated entity name. Ordered by prevalence in cross-border
 * NDAs (most common first). Korean corporate suffixes are handled via
 * progressive prefix shortening rather than swapping, so they're not
 * listed here.
 */
const CORP_SUFFIXES: ReadonlyArray<string> = [
  "Corporation",
  "Corp",
  "Corp.",
  "Incorporated",
  "Inc",
  "Inc.",
  "Limited",
  "Ltd",
  "Ltd.",
  "Company",
  "Co",
  "Co.",
  "LLC",
  "L.L.C.",
  "LLP",
  "L.L.P.",
  "PLC",
  "AG",
  "GmbH",
  "S.A.",
];

/**
 * Find every abbreviated / shortened form of `seed` that actually appears
 * in `text`. The seed itself is excluded from the result. Returns the
 * variants in discovery order (progressive prefixes first, then corporate
 * suffix swaps), deduped.
 */
export function findSubstringVariants(seed: string, text: string): string[] {
  const tokens = seed.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 2) return [];

  const variants = new Set<string>();

  // Strategy 1: progressive prefix shortening.
  // len = tokens.length - 1 means "drop the last token", down to len = 1
  // meaning "keep only the first token". For each prefix, we check that
  // it appears as a standalone occurrence by subtracting matches that
  // are actually the prefix of the next-longer form.
  for (let len = tokens.length - 1; len >= 1; len--) {
    const candidate = tokens.slice(0, len).join(" ");
    if (candidate === seed) continue;

    const total = countWordBoundedOccurrences(text, candidate);
    if (total === 0) continue;

    // Subtract occurrences that are actually part of the longer form
    // `candidate + " " + tokens[len]`. Those are not standalone — they
    // are the prefix of a longer entity reference already covered by
    // the longer variant (or by the seed itself).
    const nextToken = tokens[len]!;
    const longerForm = `${candidate} ${nextToken}`;
    const overlap = countWordBoundedOccurrences(text, longerForm);

    if (total - overlap > 0) {
      variants.add(candidate);
    }
  }

  // Strategy 2: corporate suffix swap.
  // Only for seeds whose first token is a non-empty proper noun — which
  // is always true for multi-word seeds reaching this branch.
  const first = tokens[0]!;
  for (const sfx of CORP_SUFFIXES) {
    const candidate = `${first} ${sfx}`;
    if (candidate === seed) continue;
    if (countWordBoundedOccurrences(text, candidate) > 0) {
      variants.add(candidate);
    }
  }

  // Defensive: ensure the seed never leaks into the variant list.
  variants.delete(seed);
  return [...variants];
}

/**
 * Count non-overlapping word-bounded occurrences of `needle` in `text`.
 *
 * "Word-bounded" here means the needle is not embedded inside a longer
 * Latin word. See the module-level comment for the full rule. This is
 * shared with propagate.ts for computing the occurrence counts shown in
 * the candidates panel.
 */
export function countWordBoundedOccurrences(
  text: string,
  needle: string,
): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) return count;
    const end = idx + needle.length;
    if (isWordBounded(text, idx, end)) {
      count++;
      // Non-overlapping counting — match the redactor's behavior.
      from = end;
    } else {
      // Failed boundary — advance by one to look for the next candidate
      // start position. Cannot skip by needle.length because there might
      // be a legitimate overlapping match one character later.
      from = idx + 1;
    }
  }
}

/**
 * Return true iff the substring `text.slice(start, end)` is not embedded
 * inside a longer Latin word on either side. CJK-to-CJK transitions and
 * cross-script transitions are always treated as boundaries.
 */
function isWordBounded(text: string, start: number, end: number): boolean {
  if (start > 0) {
    const before = text[start - 1]!;
    const first = text[start]!;
    if (isLatinWordChar(before) && isLatinWordChar(first)) return false;
  }
  if (end < text.length) {
    const last = text[end - 1]!;
    const after = text[end]!;
    if (isLatinWordChar(last) && isLatinWordChar(after)) return false;
  }
  return true;
}

/**
 * The "is this a Latin-script word character" test used by the boundary
 * heuristic. Deliberately narrow: only ASCII letters, digits, and the
 * underscore. Full Unicode word-char detection would reject the CJK
 * particle attachment case, which is exactly what we don't want.
 */
function isLatinWordChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 48 && c <= 57) || // 0-9
    (c >= 65 && c <= 90) || // A-Z
    (c >= 97 && c <= 122) || // a-z
    c === 95 // _
  );
}
