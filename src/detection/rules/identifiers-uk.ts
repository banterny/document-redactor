/**
 * UK identifiers -- fixed-structure PII specific to the United Kingdom.
 *
 * Nine regex rules covering:
 *
 *   1.  UK National Insurance number (NINO)
 *   2.  NHS number (10-digit, Modulus 11 check digit)
 *   3.  UK domestic phone (mobile 07xxx, landline 01/02/03)
 *   4.  UK postcode
 *   5.  GMC registration number (7-digit, for doctors)
 *   6.  NMC PIN (nurses and midwives registration)
 *   7.  UK driving licence number
 *   8.  Hospital / MRN number (context-driven)
 *   9.  UK sort code (bank, context-driven)
 *
 * These rules target documents commonly seen in UK clinical negligence
 * litigation: medical records, witness statements, expert reports,
 * pleadings, and inquest bundles.
 *
 * See:
 *   - GOV.UK Design System -- National Insurance numbers
 *   - NHS Data Dictionary -- NHS NUMBER (Modulus 11)
 *   - Ofcom National Telephone Numbering Plan
 *   - docs/RULES_GUIDE.md SS 7 -- ReDoS checklist
 */

import type { PostFilter, RegexRule } from "../_framework/types.js";

/**
 * NHS number Modulus 11 check digit validation.
 *
 * The NHS Data Dictionary mandates:
 *   1. Multiply digits 1-9 by weights 10 down to 2
 *   2. Sum the products
 *   3. Remainder = 11 - (sum % 11)
 *   4. If remainder is 11, check digit is 0
 *   5. If remainder is 10, the number is invalid
 *   6. Otherwise, remainder must equal digit 10
 *
 * @see https://www.datadictionary.nhs.uk/attributes/nhs_number.html
 */
const nhsModulus11: PostFilter = (normalizedMatch) => {
  const digits = normalizedMatch.replace(/\D/g, "");
  if (digits.length !== 10) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? 0 : remainder;
  if (checkDigit === 10) return false;
  return checkDigit === Number(digits[9]);
};

/**
 * UK domestic phone numbers have 10 or 11 digits total (including the
 * leading 0). 11 is the norm; 10 occurs only for a handful of rural
 * 5+4 format numbers (e.g., Brampton 016977 xxxx).
 *
 * @see https://en.wikipedia.org/wiki/Telephone_numbers_in_the_United_Kingdom
 */
const ukPhoneDigitCount: PostFilter = (normalizedMatch) => {
  const digits = normalizedMatch.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11;
};

/**
 * UK postcode validation. Rejects matches shorter than 5 characters
 * or longer than 7 characters when whitespace is removed (the valid
 * range for UK postcodes is 5-7 alphanumeric characters).
 */
const validUkPostcode: PostFilter = (normalizedMatch) => {
  const cleaned = normalizedMatch.replace(/\s+/g, "").toUpperCase();
  return cleaned.length >= 5 && cleaned.length <= 7;
};

export const IDENTIFIERS_UK = [
  // -- 1. National Insurance Number -----------------------------------------------
  {
    id: "identifiers.uk-nino",
    category: "identifiers",
    subcategory: "uk-nino",
    pattern:
      /(?<![A-Za-z])[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-D](?![A-Za-z])/gi,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["en"],
    description:
      "UK National Insurance number (AB 12 34 56 C), with or without spaces. " +
      "Excludes invalid prefixes (BG, GB, NK, KN, TN, NT, ZZ and those " +
      "starting D/F/I/Q/U/V)",
  },

  // -- 2. NHS Number --------------------------------------------------------------
  {
    id: "identifiers.uk-nhs-number",
    category: "identifiers",
    subcategory: "uk-nhs-number",
    pattern: /(?<!\d)\d{3}\s?\d{3}\s?\d{4}(?!\d)/g,
    postFilter: nhsModulus11,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["en"],
    description:
      "UK NHS number (10 digits in 3-3-4 format), validated with Modulus 11 " +
      "check digit. Appears in medical record headers, referral letters, " +
      "discharge summaries, and expert reports",
  },

  // -- 3. UK Domestic Phone (all formats) -----------------------------------------
  {
    id: "identifiers.uk-phone-domestic",
    category: "identifiers",
    subcategory: "uk-phone-domestic",
    pattern:
      /(?<!\d)0(?:7[1-57-9]\d{2}|[1-3]\d{2,4})[\s\-]?\d{3,4}[\s\-]?\d{3,4}(?!\d)/g,
    postFilter: ukPhoneDigitCount,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["en"],
    description:
      "UK domestic phone number -- mobiles (07xxx), geographic landlines " +
      "(01xxx/011x/01x1/02x), and non-geographic (03xx). Validated by " +
      "total digit count (10-11 digits). Covers all Ofcom area code formats",
  },

  // -- 4. UK Postcode -------------------------------------------------------------
  {
    id: "identifiers.uk-postcode",
    category: "identifiers",
    subcategory: "uk-postcode",
    pattern:
      /(?<![A-Za-z\d])[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}(?![A-Za-z])/gi,
    postFilter: validUkPostcode,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK postcode (A9 9AA / A99 9AA / A9A 9AA / AA9 9AA / AA99 9AA / AA9A 9AA)",
  },

  // -- 5. GMC Number (context-gated) ----------------------------------------------
  {
    id: "identifiers.uk-gmc",
    category: "identifiers",
    subcategory: "uk-gmc",
    pattern:
      /(?<=(?:GMC|General Medical Council|GMC No|GMC Number|GMC Reg|Registration No)[.:]?\s*)\d{7}(?!\d)/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK GMC registration number (7 digits after a GMC label). " +
      "Context-gated to avoid matching arbitrary 7-digit numbers",
  },

  // -- 6. NMC PIN (context-gated) -------------------------------------------------
  {
    id: "identifiers.uk-nmc",
    category: "identifiers",
    subcategory: "uk-nmc",
    pattern:
      /(?<=(?:NMC|NMC PIN|NMC No|Nursing and Midwifery Council)[.:]?\s*)\d{2}[A-Z]\d{4}[A-Z](?![A-Za-z\d])/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK NMC PIN (Nursing and Midwifery Council), format 12A3456B, " +
      "context-gated to avoid false positives",
  },

  // -- 7. UK Driving Licence ------------------------------------------------------
  {
    id: "identifiers.uk-driving-licence",
    category: "identifiers",
    subcategory: "uk-driving-licence",
    pattern:
      /(?<![A-Za-z\d])[A-Z]{1,5}\d{6}[A-Z\d]{2}\d[A-Z]{2}\d{2}(?![A-Za-z\d])/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK driving licence number (DVLA format: surname hash + DOB + " +
      "gender + check digits)",
  },

  // -- 8. Hospital Number / MRN (context-gated) -----------------------------------
  {
    id: "identifiers.uk-hospital-mrn",
    category: "identifiers",
    subcategory: "uk-hospital-mrn",
    pattern:
      /(?<=(?:Hospital (?:No|Number|Ref)|MRN|Patient (?:ID|No|Number)|Unit (?:No|Number)|Hosp\.? No)[.:]?\s*)[A-Z]{0,4}\s?\d{4,8}(?!\d)/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK hospital number / MRN, context-gated (requires preceding label). " +
      "Formats vary by Trust -- captures common patterns",
  },

  // -- 9. UK Bank Sort Code (context-gated) ---------------------------------------
  {
    id: "identifiers.uk-sort-code",
    category: "identifiers",
    subcategory: "uk-sort-code",
    pattern:
      /(?<=(?:Sort Code|Sort|S\/C|SC)[.:]?\s*)\d{2}[\s\-]?\d{2}[\s\-]?\d{2}(?!\d)/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK bank sort code (12-34-56), context-gated. Appears in schedules " +
      "of loss and financial remedy documents",
  },
] as const satisfies readonly RegexRule[];
