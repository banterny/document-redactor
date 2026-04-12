/**
 * Structural parser: recitals section extraction.
 *
 * Extracts entity mentions from the recitals block of a contract:
 *
 *   English:
 *     "WHEREAS, ABC Corporation is engaged in ...;
 *      WHEREAS, the Parties wish to ..."
 *
 *   Korean:
 *     "전문
 *      본 계약은 A 주식회사와 B 주식회사 사이의 협력에 관한 ..."
 *
 * Output: StructuralDefinition[] with source = "recitals".
 * label is empty (recitals introduce entities, not labels).
 * referent is the captured entity name.
 *
 * Position-dependent — scans only the first RECITAL_SCAN_LIMIT characters.
 */

import type {
  StructuralDefinition,
  StructuralParser,
} from "../../_framework/types.js";

/** Recitals should not span the entire document — cap the scan. */
const RECITAL_SCAN_LIMIT = 5000;

export const RECITALS: StructuralParser = {
  id: "structural.recitals",
  category: "structural",
  subcategory: "recitals",
  languages: ["ko", "en"],
  description:
    "Extracts entity mentions from WHEREAS clauses (English) and 전문/배경 sections (Korean) in the first 5000 characters",
  parse(text: string): readonly StructuralDefinition[] {
    if (text.length === 0) return [];

    const head = text.slice(0, RECITAL_SCAN_LIMIT);

    const out: StructuralDefinition[] = [];

    const english =
      /WHEREAS\s*,\s*([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4})/g;
    let m: RegExpExecArray | null;
    while ((m = english.exec(head)) !== null) {
      out.push({
        label: "",
        referent: m[1]!.trim(),
        source: "recitals",
      });
    }

    const koreanPreamble =
      /(?:전문|배경)[\s\S]{0,500}?([가-힣][가-힣A-Za-z0-9]*\s*주식회사)/g;
    while ((m = koreanPreamble.exec(head)) !== null) {
      out.push({
        label: "",
        referent: m[1]!.trim(),
        source: "recitals",
      });
    }

    return out;
  },
};
