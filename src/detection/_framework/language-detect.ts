/**
 * Document language detection.
 *
 * Used by the runner in Phase 1+ to filter rules by language. Phase 0 defines
 * and tests this function but does NOT wire it into the runner yet (see
 * runner.ts comment for rationale).
 *
 * Heuristic: count Hangul codepoints vs ASCII letters. Thresholds are tuned
 * for bilingual Korean-English legal documents, which is the target use case.
 *
 * See docs/RULES_GUIDE.md § 11.1 for the definition.
 */

/**
 * Detect the primary language of a document.
 *
 * Returns:
 *   - "ko" if Hangul is > 60% of the total letter count
 *   - "en" if Hangul is < 20% of the total letter count
 *   - "mixed" otherwise (bilingual documents)
 *
 * Edge cases:
 *   - Empty / symbol-only text → "en" (default)
 *   - Hangul-only → "ko"
 *   - ASCII-only → "en"
 *   - 50/50 split → "mixed"
 */
export function detectLanguage(text: string): "ko" | "en" | "mixed" {
  const hangulCount = countHangul(text);
  const asciiLetterCount = countAsciiLetters(text);
  const total = hangulCount + asciiLetterCount;

  // No letters at all (numeric / symbol only): default to English.
  if (total === 0) return "en";

  const koRatio = hangulCount / total;
  if (koRatio > 0.6) return "ko";
  if (koRatio < 0.2) return "en";
  return "mixed";
}

function countHangul(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Hangul syllables block: U+AC00..U+D7A3
    if (c >= 0xac00 && c <= 0xd7a3) n++;
  }
  return n;
}

function countAsciiLetters(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) n++;
  }
  return n;
}
