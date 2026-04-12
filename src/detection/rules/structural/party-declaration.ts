/**
 * Structural parser: party-declaration extraction.
 *
 * Extracts contracting parties from the opening clause of a contract:
 *
 *   English:
 *     "This Agreement is made by and between ABC Corporation,
 *      a Delaware corporation (hereinafter 'Buyer'), and XYZ Inc.,
 *      a California corporation (hereinafter 'Seller')."
 *
 *   Korean:
 *     "본 계약은 A 주식회사(이하 '갑')와 B 주식회사(이하 '을') 사이에..."
 *
 * Output: StructuralDefinition[] with source = "party-declaration".
 * label = role (Buyer / Seller / 갑 / 을 / 매수인 / 매도인)
 * referent = full entity name (ABC Corporation / A 주식회사)
 *
 * Position-dependent — scans only the first HEADER_SCAN_LIMIT characters.
 */

import type {
  StructuralDefinition,
  StructuralParser,
} from "../../_framework/types.js";

/** Scan only the first HEADER_SCAN_LIMIT chars. */
const HEADER_SCAN_LIMIT = 2000;

export const PARTY_DECLARATION: StructuralParser = {
  id: "structural.party-declaration",
  category: "structural",
  subcategory: "party-declaration",
  languages: ["ko", "en"],
  description:
    "Extracts contracting parties from the opening 'by and between' / '사이에' clause in the first 2000 characters",
  parse(text: string): readonly StructuralDefinition[] {
    if (text.length === 0) return [];

    const head = text.slice(0, HEADER_SCAN_LIMIT);

    const out: StructuralDefinition[] = [];

    const english =
      /([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4})[^.()]{0,200}?\(\s*hereinafter(?:\s+referred\s+to)?\s+as\s+['"]([^'"]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = english.exec(head)) !== null) {
      out.push({
        label: m[2]!,
        referent: m[1]!.trim(),
        source: "party-declaration",
      });
    }

    const korean =
      /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s]{0,30}?주식회사)\s*\(\s*이하\s*['"]?([가-힣A-Za-z0-9]+)['"]?(?:(?:라|이)\s*함)?\s*\)/g;
    while ((m = korean.exec(head)) !== null) {
      out.push({
        label: m[2]!.trim(),
        referent: m[1]!.trim(),
        source: "party-declaration",
      });
    }

    return out;
  },
};
