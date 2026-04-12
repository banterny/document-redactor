/**
 * Temporal category — calendar dates, durations, date-range phrases.
 *
 * Eight regex rules covering:
 *
 *   1. Korean full date (2024년 3월 15일)
 *   2. Korean short date (2024.3.15 / 2024-3-15 / 2024/3/15)
 *   3. Korean date range (2024년 3월 15일부터 2024년 6월 30일까지)
 *   4. ISO 8601 date with optional time (2024-03-15, 2024-03-15T14:30:00Z)
 *   5. English date (March 15, 2024 / 15 March 2024)
 *   6. Korean duration (3년간 / 6개월 / 90일간)
 *   7. English duration (3 years / 6 months / 90 days)
 *   8. Label-driven Korean date context (계약일: 2024.3.15)
 *
 * Two post-filters validate calendar dates: `validNumericDate` checks
 * month/day ranges and month-specific day counts (Feb 30 is rejected) for
 * the numeric and Korean date forms; `validEnglishDate` does the same for
 * the English month-name form. Duration and range rules are not post-
 * filtered — duration has no calendar semantics, and range over-matching
 * is accepted as an acknowledged edge case.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 10 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.3 — temporal category boundary
 *   - docs/RULES_GUIDE.md § 7 — ReDoS checklist
 *
 * NORMALIZATION: this file assumes `normalizeForMatching` has already folded
 * fullwidth digits, hyphen variants, and CJK space. See § 10.2 of the
 * phase-1 brief and src/detection/normalize.ts for the authoritative list.
 */

import type { PostFilter, RegexRule } from "../_framework/types.js";

/** Month name → numeric mapping for English date validation. */
const MONTH_NAME_TO_NUM: Readonly<Record<string, number>> = {
  January: 1,
  Jan: 1,
  February: 2,
  Feb: 2,
  March: 3,
  Mar: 3,
  April: 4,
  Apr: 4,
  May: 5,
  June: 6,
  Jun: 6,
  July: 7,
  Jul: 7,
  August: 8,
  Aug: 8,
  September: 9,
  Sep: 9,
  Sept: 9,
  October: 10,
  Oct: 10,
  November: 11,
  Nov: 11,
  December: 12,
  Dec: 12,
};

/**
 * Return true if the given (year, month, day) is a real calendar date.
 * Uses the Date constructor's roll-over behavior to detect invalid days
 * (e.g., Feb 30 rolls to Mar 2, so `d.getDate() !== 30`).
 *
 * Year is bounded to 1900-2100 to reject obvious typos (year 0024, year
 * 20240) while still allowing historical contract references.
 */
function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return false;
  }
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

/**
 * Post-filter for numeric and Korean-full date rules. Extracts (year, month,
 * day) from either `YYYY.MM.DD` / `YYYY-MM-DD` / `YYYY/MM/DD` format or
 * `YYYY년 MM월 DD일` format, then validates via `isValidCalendarDate`.
 *
 * If neither format matches (shouldn't happen given the rule's own regex),
 * returns false to reject the candidate defensively.
 */
const validNumericDate: PostFilter = (normalizedMatch) => {
  const numeric = normalizedMatch.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
  );
  if (numeric) {
    return isValidCalendarDate(
      Number(numeric[1]),
      Number(numeric[2]),
      Number(numeric[3]),
    );
  }
  const korean = normalizedMatch.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (korean) {
    return isValidCalendarDate(
      Number(korean[1]),
      Number(korean[2]),
      Number(korean[3]),
    );
  }
  return false;
};

/**
 * Post-filter for the English date rule. Handles both `Month Day, Year`
 * and `Day Month Year` forms. Falls back to false for unrecognized shapes.
 */
const validEnglishDate: PostFilter = (normalizedMatch) => {
  const mdy = normalizedMatch.match(
    /([A-Z][a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/,
  );
  if (mdy) {
    const month = MONTH_NAME_TO_NUM[mdy[1]!];
    if (month === undefined) return false;
    return isValidCalendarDate(Number(mdy[3]), month, Number(mdy[2]));
  }
  const dmy = normalizedMatch.match(/(\d{1,2})\s+([A-Z][a-z]+)\.?\s+(\d{4})/);
  if (dmy) {
    const month = MONTH_NAME_TO_NUM[dmy[2]!];
    if (month === undefined) return false;
    return isValidCalendarDate(Number(dmy[3]), month, Number(dmy[1]));
  }
  return false;
};

export const TEMPORAL = [
  {
    id: "temporal.date-ko-full",
    category: "temporal",
    subcategory: "date-ko-full",
    pattern:
      /(?<!\d)(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일/g,
    postFilter: validNumericDate,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description: "Korean full date with 년/월/일 suffixes (e.g., '2024년 3월 15일')",
  },
  {
    id: "temporal.date-ko-short",
    category: "temporal",
    subcategory: "date-ko-short",
    pattern:
      /(?<!\d)(?:19|20)\d{2}[.\-/](?:1[0-2]|0?[1-9])[.\-/](?:3[01]|[12]\d|0?[1-9])(?!\d)/g,
    postFilter: validNumericDate,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean short date with dot/hyphen/slash separators (e.g., '2024.3.15', '2024-03-15')",
  },
  {
    id: "temporal.date-ko-range",
    category: "temporal",
    subcategory: "date-ko-range",
    pattern:
      /(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일\s*(?:부터|~|-)\s*(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일(?:\s*까지)?/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean date range with 부터/~/- separator and optional 까지 suffix",
  },
  {
    id: "temporal.date-iso",
    category: "temporal",
    subcategory: "date-iso",
    pattern:
      /(?<!\d)(?:19|20)\d{2}-(?:1[0-2]|0[1-9])-(?:3[01]|[12]\d|0[1-9])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?(?!\d)/g,
    postFilter: validNumericDate,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "ISO 8601 date with zero-padded month/day and optional time component",
  },
  {
    id: "temporal.date-en",
    category: "temporal",
    subcategory: "date-en",
    pattern:
      /(?<![A-Za-z\d])(?:(?:3[01]|[12]\d|0?[1-9])\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)\s+(?:3[01]|[12]\d|0?[1-9])(?:st|nd|rd|th)?,?)\s+(?:19|20)\d{2}(?!\d)/g,
    postFilter: validEnglishDate,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English date in 'Month Day, Year' or 'Day Month Year' form with month names and abbreviations",
  },
  {
    id: "temporal.duration-ko",
    category: "temporal",
    subcategory: "duration-ko",
    pattern: /(?<!\d)\d+\s*(?:년간|개월|달|주간|주|일간|시간)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean duration with unambiguous unit suffix (년간/개월/달/주간/주/일간/시간)",
  },
  {
    id: "temporal.duration-en",
    category: "temporal",
    subcategory: "duration-en",
    pattern: /(?<!\d)\d+\s+(?:years?|months?|weeks?|days?|hours?)\b/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description: "English duration (N years/months/weeks/days/hours)",
  },
  {
    id: "temporal.date-context-ko",
    category: "temporal",
    subcategory: "date-context-ko",
    pattern:
      /(?<=(?:계약일|체결일|시행일|효력발생일|만료일|종료일|발행일|작성일|기준일)\s*[:：]?\s*)(?:(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일|(?:19|20)\d{2}[.\-/](?:1[0-2]|0?[1-9])[.\-/](?:3[01]|[12]\d|0?[1-9]))/g,
    postFilter: validNumericDate,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description: "Korean date preceded by a label (계약일/체결일/시행일/...)",
  },
] as const satisfies readonly RegexRule[];
