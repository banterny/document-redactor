/**
 * Legal category — case numbers, court names, statute references.
 *
 * Six regex rules covering:
 *
 *   1. Korean case number (2024가합12345)
 *   2. Korean court name (서울중앙지방법원, 대법원, ...)
 *   3. Korean statute reference (제15조, 법률 제1234호)
 *   4. English case citation (123 F.3d 456)
 *   5. English statute reference (Section 230, 17 U.S.C. § 101)
 *   6. Legal context scanner (사건번호: ..., Case No.: ...)
 *
 * No post-filters. Legal patterns are structurally unambiguous; out-of-range
 * values (e.g., a year "9999" in a case number) are rejected by the regex
 * year bounds.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 13 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.7 — legal category boundary
 *   - docs/RULES_GUIDE.md § 7 — ReDoS checklist
 */

import type { RegexRule } from "../_framework/types.js";

export const LEGAL = [
  {
    id: "legal.ko-case-number",
    category: "legal",
    subcategory: "ko-case-number",
    pattern: /(?<!\d)(?:19|20)\d{2}[가-힣]{1,3}\d{1,6}(?!\d)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean court case number: 4-digit year + case-type syllables + docket digits (e.g., '2024가합12345')",
  },
  {
    id: "legal.ko-court-name",
    category: "legal",
    subcategory: "ko-court-name",
    pattern:
      /(?<![가-힣])(?:(?:서울중앙|서울남부|서울북부|서울동부|서울서부|서울|수원|인천|대전|대구|부산|광주|울산|춘천|전주|청주|제주|창원|의정부|고양)(?:지방법원|고등법원|가정법원|행정법원)|대법원|특허법원|헌법재판소)(?![가-힣])/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean court name with optional region prefix (서울중앙지방법원, 대법원, 특허법원, 헌법재판소, ...)",
  },
  {
    id: "legal.ko-statute-ref",
    category: "legal",
    subcategory: "ko-statute-ref",
    pattern:
      /(?:(?:민법|상법|형법|헌법|민사소송법|형사소송법|행정소송법|특허법|저작권법|개인정보\s*보호법|정보통신망법|근로기준법|상표법|부정경쟁방지법|독점규제법|공정거래법|법률)\s+)?제\d+(?:조(?:\s*(?:의\d+)?(?:\s*제\d+항)?(?:\s*제\d+호)?)?|호)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean statute reference: optional law name + 제N조 (with optional 항/호) or 법률 제N호",
  },
  {
    id: "legal.en-case-citation",
    category: "legal",
    subcategory: "en-case-citation",
    pattern:
      /\d{1,4}\s+(?:F\.(?:2d|3d|4th)|F\.\s*Supp\.?\s*(?:2d|3d)?|U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.?\s*2d?|So\.\s*(?:2d|3d)?|N\.(?:E|W|Y|J)\.\s*(?:2d|3d)?|A\.\s*(?:2d|3d)?|P\.\s*(?:2d|3d)?|Cal\.\s*(?:App\.?\s*)?(?:2d|3d|4th|5th)?)\s+\d{1,5}/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English case citation with reporter abbreviation (F.3d, U.S., S. Ct., etc.)",
  },
  {
    id: "legal.en-statute-ref",
    category: "legal",
    subcategory: "en-statute-ref",
    pattern:
      /(?:(?:\d{1,3}\s+)?U\.S\.C\.?\s*§\s*\d+(?:\.\d+)?|Section\s+\d+(?:\.\d+)?(?:\s*\([a-z]\))?)/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English statute reference: 'Section N' or 'N U.S.C. § M' forms",
  },
  {
    id: "legal.legal-context",
    category: "legal",
    subcategory: "legal-context",
    pattern:
      /(?:(?<=사건번호:)|(?<=사건번호: )|(?<=사건번호：)|(?<=사건번호： )|(?<=사건:)|(?<=사건: )|(?<=사건：)|(?<=사건： )|(?<=법원:)|(?<=법원: )|(?<=법원：)|(?<=법원： )|(?<=Court:)|(?<=Court: )|(?<=Court：)|(?<=Court： )|(?<=Case No\.)|(?<=Case No\. )|(?<=Case No\.:)|(?<=Case No\.: )|(?<=Case No\.：)|(?<=Case No\.： )|(?<=Case No:)|(?<=Case No: )|(?<=Case No：)|(?<=Case No： )|(?<=Docket No\.)|(?<=Docket No\. )|(?<=Docket No\.:)|(?<=Docket No\.: )|(?<=Docket No\.：)|(?<=Docket No\.： )|(?<=Docket No:)|(?<=Docket No: )|(?<=Docket No：)|(?<=Docket No： ))[^\n;,]{3,60}(?=$|\n|[;,])/g,
    levels: ["standard", "paranoid"],
    languages: ["ko", "en"],
    description:
      "Value following a legal label (사건번호:/Case No.:/Court:/Docket No.:), captures up to first delimiter",
  },
] as const satisfies readonly RegexRule[];
