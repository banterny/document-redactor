/**
 * Structural parser: document header block extraction.
 *
 * Extracts the document title from the first few lines. Typical patterns:
 *
 *   English:
 *     "NON-DISCLOSURE AGREEMENT"
 *     "MASTER SERVICES AGREEMENT"
 *
 *   Korean:
 *     "비밀유지계약서"
 *     "주식매매계약서"
 *
 * Output: StructuralDefinition[] with source = "definition-section".
 * label = "document-title" (fixed), referent = the extracted title string.
 *
 * Source mapping: "header-block" is NOT in the StructuralDefinition source
 * union, so headers map to "definition-section" — the title functions as a
 * document-level definition of the agreement type. See § 12.9 for rationale.
 *
 * Position-dependent — scans only the first HEADER_SCAN_LIMIT characters.
 */

import type {
  StructuralDefinition,
  StructuralParser,
} from "../../_framework/types.js";

const HEADER_SCAN_LIMIT = 500;

export const HEADER_BLOCK: StructuralParser = {
  id: "structural.header-block",
  category: "structural",
  subcategory: "header-block",
  languages: ["ko", "en"],
  description:
    "Extracts document title (agreement type) from the first 500 characters",
  parse(text: string): readonly StructuralDefinition[] {
    if (text.length === 0) return [];

    const head = text.slice(0, HEADER_SCAN_LIMIT);

    const out: StructuralDefinition[] = [];

    const english =
      /(?<![A-Za-z])([A-Z][A-Z\s\-]{3,60}?(?:AGREEMENT|CONTRACT|MOU))(?![A-Za-z])/;
    const engMatch = head.match(english);
    if (engMatch) {
      out.push({
        label: "document-title",
        referent: engMatch[1]!.trim(),
        source: "definition-section",
      });
    }

    const korean =
      /(?<![가-힣])([가-힣][가-힣A-Za-z0-9]{1,30}?(?:계약서|합의서|각서|협정서))(?![가-힣])/;
    const koMatch = head.match(korean);
    if (koMatch) {
      out.push({
        label: "document-title",
        referent: koMatch[1]!.trim(),
        source: "definition-section",
      });
    }

    return out;
  },
};
