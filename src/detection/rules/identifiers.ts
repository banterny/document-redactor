/**
 * Identifiers category — fixed-structure PII.
 *
 * Ported from the v1.0 Lane A `patterns.ts` registry. Each rule below matches
 * the current patterns.ts regex byte-for-byte. The structure around them is
 * new: explicit RegexRule type, category metadata, level/language declarations.
 *
 * See docs/RULES_GUIDE.md § 13.1 for the mapping table.
 */

import type { RegexRule } from "../_framework/types.js";

import { luhnCheck } from "./luhn.js";

export const IDENTIFIERS = [
  {
    id: "identifiers.korean-rrn",
    category: "identifiers",
    subcategory: "korean-rrn",
    pattern: /(?<!\d)\d{6}-[1-8]\d{6}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean resident registration number (주민등록번호), 6-7 hyphenated form with gender code 1-8",
  },
  {
    id: "identifiers.korean-brn",
    category: "identifiers",
    subcategory: "korean-brn",
    pattern: /(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean business registration number (사업자등록번호), 3-2-5 hyphenated form",
  },
  {
    id: "identifiers.us-ein",
    category: "identifiers",
    subcategory: "us-ein",
    pattern: /(?<!\d)\d{2}-\d{7}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["en"],
    description: "US Employer Identification Number, 2-7 hyphenated form",
  },
  {
    id: "identifiers.phone-kr",
    category: "identifiers",
    subcategory: "phone-kr",
    pattern: /(?<!\d)01[016-9]-?\d{3,4}-?\d{4}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description: "Korean mobile phone (010/011/016-019), dashed or dashless",
  },
  {
    id: "identifiers.phone-intl",
    category: "identifiers",
    subcategory: "phone-intl",
    pattern: /(?<![\w+])\+\d{1,3}(?:[\s-]\d{1,4}){2,4}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description: "International phone number with + country code prefix",
  },
  {
    id: "identifiers.email",
    category: "identifiers",
    subcategory: "email",
    pattern:
      /(?<![A-Za-z0-9_])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,}(?![A-Za-z0-9_])/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description: "Email address, bounded form with 2+ letter TLD",
  },
  {
    id: "identifiers.account-kr",
    category: "identifiers",
    subcategory: "account-kr",
    pattern: /(?<!\d)\d{3,6}-\d{2,3}-\d{4,7}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean bank account number, canonical 3-6 / 2-3 / 4-7 hyphenated form",
  },
  {
    id: "identifiers.credit-card",
    category: "identifiers",
    subcategory: "credit-card",
    pattern: /(?<![\d-])\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d-])/g,
    postFilter: luhnCheck,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description: "Credit card, 16 digits in 4 groups, Luhn-validated",
  },
] as const satisfies readonly RegexRule[];
