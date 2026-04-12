/**
 * Structural parser: signature-block extraction.
 *
 * Extracts signatory information from the signature region at the document
 * tail. Typical patterns:
 *
 *   English:
 *     By: _______________
 *     Name: John Smith
 *     Title: CEO
 *
 *   Korean:
 *     대표이사  김철수  (서명)
 *     이름: 김철수
 *
 * Output: StructuralDefinition[] with source = "party-declaration".
 * The "signature-block" value is NOT in the StructuralDefinition source
 * union (see § 6 of phase-1-rulebook.md), so signatures map to
 * "party-declaration" — semantically correct since signatories are the
 * agreement parties. See § 12.9 for mapping rationale.
 *
 * Position-dependent — scans only the last SIGNATURE_TAIL_RATIO of the
 * text. A full-document scan would produce noise on title-case prose in
 * body paragraphs.
 */

import type {
  StructuralDefinition,
  StructuralParser,
} from "../../_framework/types.js";

/** Signature region = last SIGNATURE_TAIL_RATIO of the text. */
const SIGNATURE_TAIL_RATIO = 0.2;

/** Minimum text length before the signature scan runs (avoid tiny fixtures). */
const MIN_TEXT_LENGTH = 200;

export const SIGNATURE_BLOCK: StructuralParser = {
  id: "structural.signature-block",
  category: "structural",
  subcategory: "signature-block",
  languages: ["ko", "en"],
  description:
    "Extracts signatory name/title pairs from the last 20% of the document (signature region)",
  parse(text: string): readonly StructuralDefinition[] {
    if (text.length < MIN_TEXT_LENGTH) return [];

    const tailStart = Math.floor(text.length * (1 - SIGNATURE_TAIL_RATIO));
    const tail = text.slice(tailStart);

    const out: StructuralDefinition[] = [];

    const englishName =
      /Name\s*:\s*([A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+){0,2})/g;
    let m: RegExpExecArray | null;
    while ((m = englishName.exec(tail)) !== null) {
      out.push({
        label: "Signatory",
        referent: m[1]!.trim(),
        source: "party-declaration",
      });
    }

    const englishTitle = /Title\s*:\s*([A-Z][A-Za-z\s.\-]{2,40})/g;
    while ((m = englishTitle.exec(tail)) !== null) {
      out.push({
        label: "Title",
        referent: m[1]!.trim(),
        source: "party-declaration",
      });
    }

    const koreanTitleName =
      /(?<![가-힣A-Za-z])(대표이사|대표|부사장|사장|이사|본부장|팀장)\s+([가-힣]{2,4})(?![가-힣])/g;
    while ((m = koreanTitleName.exec(tail)) !== null) {
      out.push({
        label: m[1]!,
        referent: m[2]!,
        source: "party-declaration",
      });
    }

    const koreanName = /이름\s*:\s*([가-힣]{2,4})(?![가-힣])/g;
    while ((m = koreanName.exec(tail)) !== null) {
      out.push({
        label: "이름",
        referent: m[1]!,
        source: "party-declaration",
      });
    }

    return out;
  },
};
