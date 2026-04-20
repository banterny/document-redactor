/**
 * UK temporal -- DD/MM/YYYY dates, the standard UK numeric date format.
 *
 * This fills the critical gap where the existing temporal rules only
 * handle YYYY-first formats and textual English dates. DD/MM/YYYY is
 * the default date format in UK medical records, court documents,
 * witness statements, and correspondence.
 *
 * See:
 *   - docs/RULES_GUIDE.md SS 7 -- ReDoS checklist
 */

import type { PostFilter, RegexRule } from "../_framework/types.js";

/**
 * Validates DD/MM/YYYY as a real calendar date. Uses the Date constructor's
 * roll-over behaviour to detect invalid days (e.g., 30/02/2024 rolls to
 * 01/03/2024, so `d.getDate() !== 30`).
 *
 * Year is bounded to 1900-2100 to reject obvious typos.
 */
const validDmyDate: PostFilter = (normalizedMatch) => {
  const m = normalizedMatch.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
};

export const TEMPORAL_UK = [
  // -- 1. DD/MM/YYYY Date ---------------------------------------------------------
  {
    id: "temporal.date-en-dmy",
    category: "temporal",
    subcategory: "date-en-dmy",
    pattern:
      /(?<!\d)(?:3[01]|[12]\d|0?[1-9])[/.\-](?:1[0-2]|0?[1-9])[/.\-](?:19|20)\d{2}(?!\d)/g,
    postFilter: validDmyDate,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK numeric date DD/MM/YYYY (also DD.MM.YYYY, DD-MM-YYYY), " +
      "validated as a real calendar date",
  },

  // -- 2. Short UK Date (DD/MM/YY) ------------------------------------------------
  {
    id: "temporal.date-en-dmy-short",
    category: "temporal",
    subcategory: "date-en-dmy-short",
    pattern:
      /(?<!\d)(?:3[01]|[12]\d|0?[1-9])[/.](?:1[0-2]|0?[1-9])[/.]\d{2}(?!\d)/g,
    levels: ["paranoid"],
    languages: ["en"],
    description:
      "UK short date DD/MM/YY (paranoid tier -- higher false-positive risk). " +
      "Common in handwritten medical notes and older records",
  },
] as const satisfies readonly RegexRule[];
