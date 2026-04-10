/**
 * Definition clause parser — Lane C's structured alias discovery.
 *
 * Finds the canonical "X means Y" / "X"이라 함은 Y 형식 that contracts use
 * to introduce defined terms, and returns each clause as a pair
 * `{ literal, defined }` plus a source tag so downstream can tell English
 * from Korean provenance.
 *
 * Recognized forms:
 *
 *   1. **English `"X" means Y`** and its `shall mean` variant.
 *      Example: `"Discloser" means ABC Corporation, including its affiliates.`
 *      Captures `X = Discloser` (defined) and `Y = ABC Corporation` (literal).
 *      The literal is the text between `means` and the first boundary
 *      (`.` `,` `;` or end-of-input) — trailing qualifiers like ", including
 *      its affiliates" do not contaminate the entity name.
 *
 *   2. **Korean `"X"이라 함은 Y를 말한다`** and the shorter `"X"이란 Y`.
 *      Example: `"매수인"이라 함은 ABC 주식회사를 말한다.`
 *      Captures `X = 매수인` (defined) and `Y = ABC 주식회사` (literal).
 *      The literal is the text after the connector and before the first
 *      Korean terminator (`을`, `를`, or a Korean sentence-ending marker).
 *
 * Not recognized (yet):
 *   - Parenthetical forms like `ABC Corporation ("Discloser")` or
 *     `(hereinafter "Buyer")`. These are handled by the defined-term
 *     fallback classifier in `defined-terms.ts` — Discloser, Buyer, and
 *     Recipient all appear in the hardcoded generic-role list so they
 *     get tagged as `defined` regardless of how they were discovered.
 *
 * Why no full XML / parser: the parser runs on plain text extracted by
 * `extract-text.ts`, which has already coalesced runs and decoded entities.
 * The input is prose, not markup.
 *
 * Smart quote handling: the regexes accept both straight `"` and the curly
 * forms `\u201C"` / `\u201D"`. The caller does not need to normalize first.
 */

/** Where a definition clause came from — for audit log attribution. */
export type DefinitionSource =
  | "english-means"
  | "korean-이라-함은";

/** One discovered `literal ⟷ defined` pair. */
export interface DefinitionClause {
  /** The literal entity name this clause introduces (e.g., "ABC Corporation"). */
  readonly literal: string;
  /** The defined term (e.g., "Discloser", "매수인"). */
  readonly defined: string;
  /** Which pattern matched — audit + debugging. */
  readonly source: DefinitionSource;
}

/**
 * English `"X" means Y` / `"X" shall mean Y` form. The captured groups are:
 *   1. The defined term (between quotes, straight or smart)
 *   2. The literal entity (up to the first `.`, `,`, `;`, or end of string)
 *
 * `\s+` between `shall` and `mean` allows either the plain `means` or the
 * two-word `shall mean` form. The outer `(?:shall\s+)?mean(?:s)?` handles:
 *   - `means`  (most common)
 *   - `mean`   (rare but valid, e.g., when the subject is a plural clause)
 *   - `shall mean`  (legalese variant)
 */
const ENGLISH_MEANS_RE =
  /["\u201C\u201D]([^"\u201C\u201D]+?)["\u201C\u201D]\s+(?:shall\s+)?mean(?:s)?\s+([^.,;]+)/g;

/**
 * Korean `"X"이라 함은 Y를 말한다` / `"X"이란 Y를 말한다` form.
 *
 * The connector group matches any of:
 *   - `이라\s*함은`  — the canonical form, with optional space between 이라 and 함은
 *   - `이란`         — the shorter colloquial variant
 *   - `란`           — even shorter (rare but valid)
 *
 * The literal capture stops at the Korean object particles `을` or `를`,
 * which reliably terminate the entity phrase in the `Y를 말한다` construction.
 * If neither particle is present we fall back to the next `.` or `,`.
 */
const KOREAN_IRA_HAMEUN_RE =
  /["\u201C\u201D]([^"\u201C\u201D]+?)["\u201C\u201D]\s*(?:이라\s*함은|이란|란)\s+([^.,;을를]+?)(?:을|를|[.,;])/g;

/**
 * Parse `text` for every recognized definition clause and return them in
 * document order. The result is deterministic and safe to memoize by the
 * caller: identical input always produces identical output.
 */
export function parseDefinitionClauses(text: string): DefinitionClause[] {
  if (text.length === 0) return [];

  const found: Array<DefinitionClause & { readonly index: number }> = [];

  // Clone each regex per call so stale lastIndex state can't bleed across
  // invocations. Negligible cost; safer.
  const en = new RegExp(ENGLISH_MEANS_RE.source, ENGLISH_MEANS_RE.flags);
  for (let m = en.exec(text); m !== null; m = en.exec(text)) {
    const defined = m[1]?.trim();
    const literal = m[2]?.trim();
    if (defined && literal) {
      found.push({
        defined,
        literal,
        source: "english-means",
        index: m.index,
      });
    }
  }

  const kr = new RegExp(
    KOREAN_IRA_HAMEUN_RE.source,
    KOREAN_IRA_HAMEUN_RE.flags,
  );
  for (let m = kr.exec(text); m !== null; m = kr.exec(text)) {
    const defined = m[1]?.trim();
    const literal = m[2]?.trim();
    if (defined && literal) {
      found.push({
        defined,
        literal,
        source: "korean-이라-함은",
        index: m.index,
      });
    }
  }

  // Sort by document order so the caller gets a stable, predictable list.
  found.sort((a, b) => a.index - b.index);
  // Drop the transient `index` field — it's an implementation detail.
  return found.map(({ defined, literal, source }) => ({
    defined,
    literal,
    source,
  }));
}
