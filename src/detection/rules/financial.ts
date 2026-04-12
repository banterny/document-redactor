/**
 * Financial category — money amounts, percentages, fractions.
 *
 * Ten regex rules covering:
 *
 *   1. Korean won with 원 suffix (digit form)
 *   2. Korean won with unit word (억/만/천/조)
 *   3. Formal KRW marker (₩ / KRW)
 *   4. US dollar symbol ($)
 *   5. US dollar code (USD / US$)
 *   6. Foreign currency symbol (€ £ ¥)
 *   7. Foreign currency code (EUR GBP JPY CNY ...)
 *   8. Percentage (% 퍼센트 프로)
 *   9. Korean fraction (N분의 M)
 *  10. Label-driven amount context (금액:, 보증금, ...)
 *
 * All rules return `confidence: 1.0` via the standard runner (see
 * `runRegexPhase`). Two post-filters reject out-of-range values: KRW amounts
 * above ~999조원 (likely typos or account numbers) and percentages above
 * 10,000% (almost certainly not a valid financial claim).
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 9 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.2 — category boundary resolution
 *   - docs/RULES_GUIDE.md § 7 — ReDoS checklist (every pattern in this file
 *     was audited against the 50ms budget)
 *
 * NORMALIZATION: this file assumes `normalizeForMatching` has already folded
 * fullwidth digits and punctuation to ASCII. Do NOT match `０`, `，`, `．` —
 * they are already `0`, `,`, `.` by the time the regex sees them. See
 * src/detection/normalize.ts and § 9.2 of the phase-1 brief.
 */

import type { PostFilter, RegexRule } from "../_framework/types.js";

/**
 * Post-filter for `financial.won-amount`. Rejects values above 999조원
 * (999,999,999,999,999) as they are overwhelmingly typos, account numbers,
 * or transcription noise rather than real money amounts. Values below 1원
 * cannot match the regex (which requires at least one digit).
 *
 * Pure function: extracts digits, converts to Number, bounds-checks.
 */
const wonAmountInRange: PostFilter = (normalizedMatch) => {
  const digits = normalizedMatch.replace(/[^\d]/g, "");
  if (digits.length === 0) return false;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 && n <= 999_999_999_999_999;
};

/**
 * Post-filter for `financial.percentage`. Rejects values above 10,000% as
 * almost certainly not a valid financial claim (growth rates, ROIs, and
 * other extreme percentages used in real contracts top out well below this).
 * Values at or below 0 are also rejected — negative percentages appear in
 * contracts but with a leading minus sign, which this regex does not match
 * to begin with.
 */
const percentageInRange: PostFilter = (normalizedMatch) => {
  const m = normalizedMatch.match(/\d+(?:\.\d+)?/);
  if (!m) return false;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 10_000;
};

export const FINANCIAL = [
  {
    id: "financial.won-amount",
    category: "financial",
    subcategory: "won-amount",
    pattern: /(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*원/g,
    postFilter: wonAmountInRange,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean won with 원 suffix, comma-separated or bare digit form",
  },
  {
    id: "financial.won-unit",
    category: "financial",
    subcategory: "won-unit",
    pattern:
      /(?<!\d)\d+(?:,\d{3})*(?:\.\d+)?\s*(?:천만|천억|천|만|억|조)\s*원/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean won with unit word (천/만/억/조 + 원), e.g., '3천만원', '1억원'",
  },
  {
    id: "financial.won-formal",
    category: "financial",
    subcategory: "won-formal",
    pattern:
      /(?<![A-Za-z])(?:₩\s*|KRW\s+)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "Formal Korean won marker (₩ or KRW) followed by digit amount",
  },
  {
    id: "financial.usd-symbol",
    category: "financial",
    subcategory: "usd-symbol",
    pattern:
      /(?<![A-Za-z\d])\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "US dollar with $ prefix, e.g., '$50,000', '$1.99', '$100.00'",
  },
  {
    id: "financial.usd-code",
    category: "financial",
    subcategory: "usd-code",
    pattern:
      /(?<![A-Za-z])(?:USD\s+|US\$\s*)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "US dollar with ISO code (USD) or US$ prefix, e.g., 'USD 50,000', 'US$ 100'",
  },
  {
    id: "financial.foreign-symbol",
    category: "financial",
    subcategory: "foreign-symbol",
    pattern:
      /(?<![A-Za-z\d])[€£¥]\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["standard", "paranoid"],
    languages: ["universal"],
    description:
      "Foreign currency symbol (€, £, ¥) followed by digit amount",
  },
  {
    id: "financial.foreign-code",
    category: "financial",
    subcategory: "foreign-code",
    pattern:
      /(?<![A-Za-z])(?:EUR|GBP|JPY|CNY|CHF|AUD|CAD|HKD|SGD)\s+(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["standard", "paranoid"],
    languages: ["universal"],
    description:
      "Foreign currency ISO code (EUR/GBP/JPY/CNY/CHF/AUD/CAD/HKD/SGD) followed by amount",
  },
  {
    id: "financial.percentage",
    category: "financial",
    subcategory: "percentage",
    pattern: /(?<!\d)\d+(?:\.\d+)?\s*(?:%|퍼센트|프로)/g,
    postFilter: percentageInRange,
    levels: ["standard", "paranoid"],
    languages: ["universal"],
    description:
      "Percentage, numeric form with %, 퍼센트, or 프로 suffix",
  },
  {
    id: "financial.fraction-ko",
    category: "financial",
    subcategory: "fraction-ko",
    pattern: /(?<!\d)\d+\s*분의\s*\d+(?!\d)/g,
    levels: ["paranoid"],
    languages: ["ko"],
    description: "Korean fraction notation 'N분의 M', e.g., '3분의 1'",
  },
  {
    id: "financial.amount-context-ko",
    category: "financial",
    subcategory: "amount-context-ko",
    pattern:
      /(?<=(?:금액|총액|보증금|매매대금|계약금|잔금|지급액|수수료|단가|대금)\s*[:：]?\s*)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:원|만원|억원|천원))?/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Digit amount preceded by a Korean financial label (금액/총액/보증금/...)",
  },
] as const satisfies readonly RegexRule[];
