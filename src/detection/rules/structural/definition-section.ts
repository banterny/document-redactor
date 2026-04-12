/**
 * Structural parser: definition-section extraction.
 *
 * Extracts defined terms from four clause shapes:
 *   1. English "X" means Y / "X" shall mean Y
 *   2. English hereinafter referred to as "X" / hereinafter "X"
 *   3. Korean "X"이라 함은 Y / "X"란 Y
 *   4. Korean (이하 "X"라 한다) / 이하 "X"
 *
 * Output: StructuralDefinition[] with source = "definition-section".
 *
 * Scans the ENTIRE document. Per-clause referent is trimmed at the first
 * sentence terminator (. ; 。 , newline) and capped at MAX_REFERENT_LENGTH
 * characters to prevent runaway captures on unterminated clauses.
 *
 * NOTE: this parser coexists with src/propagation/definition-clauses.ts
 * (the Lane C English-only parser). They are NOT consolidated in Phase 1
 * per § 3 invariant 6 of phase-1-rulebook.md. Consolidation is deferred.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 12.3
 *   - docs/RULES_GUIDE.md § 5 — structural parser conventions
 */

import type {
  StructuralDefinition,
  StructuralParser,
} from "../../_framework/types.js";

/** Max referent length — prevents runaway captures on unterminated clauses. */
const MAX_REFERENT_LENGTH = 200;

/** Sentence-terminator character class for referent trimming. */
const TERMINATOR_RE = /[.;。、\n]/;

/** Trim a raw referent at the first terminator or MAX_REFERENT_LENGTH. */
function trimReferent(raw: string): string {
  const m = raw.match(TERMINATOR_RE);
  const end = m && m.index !== undefined ? m.index : raw.length;
  return raw.slice(0, Math.min(end, MAX_REFERENT_LENGTH)).trim();
}

export const DEFINITION_SECTION: StructuralParser = {
  id: "structural.definition-section",
  category: "structural",
  subcategory: "definition-section",
  languages: ["ko", "en"],
  description:
    "Extracts defined terms from 'X means Y' (English) and 'X이라 함은 Y' / 이하 'X' (Korean) patterns across the entire document",
  parse(text: string): readonly StructuralDefinition[] {
    if (text.length === 0) return [];

    const out: StructuralDefinition[] = [];

    // English: "X" means Y / "X" shall mean Y
    const englishMeans = /"([^"]+)"\s+(?:means|shall\s+mean)\s+([^.;]+)/g;
    let m: RegExpExecArray | null;
    while ((m = englishMeans.exec(text)) !== null) {
      out.push({
        label: m[1]!,
        referent: trimReferent(m[2]!),
        source: "definition-section",
      });
    }

    // English: hereinafter referred to as "X" / hereinafter "X"
    const englishHereinafter =
      /hereinafter(?:\s+referred\s+to)?\s+as\s+"([^"]+)"/g;
    while ((m = englishHereinafter.exec(text)) !== null) {
      out.push({
        label: m[1]!,
        referent: "",
        source: "definition-section",
      });
    }

    // Korean: "X"이라 함은 Y / "X"란 Y
    const koreanMeans = /"([^"]+)"(?:이라|란)\s*함은\s*([^.。\n]+)/g;
    while ((m = koreanMeans.exec(text)) !== null) {
      out.push({
        label: m[1]!,
        referent: trimReferent(m[2]!),
        source: "definition-section",
      });
    }

    // Korean: 이하 "X" / 이하 "X"라 한다 / 이하 "X"라 칭한다
    const koreanIha = /이하\s*"([^"]+)"(?:라\s*(?:한다|칭한다))?/g;
    while ((m = koreanIha.exec(text)) !== null) {
      out.push({
        label: m[1]!,
        referent: "",
        source: "definition-section",
      });
    }

    return out;
  },
};
