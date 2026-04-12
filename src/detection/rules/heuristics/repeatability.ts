/**
 * Heuristic: repeatability-based entity detection.
 *
 * Counts capitalized tokens (single or multi-word) and flags those that
 * appear ≥ MIN_FREQUENCY times as probable entity names. Entities are
 * repeated in contracts; common words are filtered by the capitalization
 * requirement and role blacklist.
 *
 * Operates on both Korean and English text. Korean tokens are 2-6
 * Hangul syllable sequences; English tokens are 1-4 capitalized words.
 *
 * Confidence: 0.5 (lowest — frequency is a weak signal on its own;
 * combined with other heuristics via the heuristic phase union, it
 * adds recall without dominating precision).
 */

import type {
  Candidate,
  Heuristic,
  HeuristicContext,
} from "../../_framework/types.js";
import { ROLE_BLACKLIST_EN } from "../role-blacklist-en.js";
import { ROLE_BLACKLIST_KO } from "../role-blacklist-ko.js";

/** Minimum number of occurrences to qualify as a repeatable entity. */
const MIN_FREQUENCY = 3;

export const REPEATABILITY: Heuristic = {
  id: "heuristics.repeatability",
  category: "heuristics",
  subcategory: "repeatability",
  languages: ["ko", "en"],
  levels: ["paranoid"],
  description:
    "High-frequency capitalized or Hangul tokens (≥ 3 occurrences) as probable entity names",
  detect(text: string, ctx: HeuristicContext): readonly Candidate[] {
    const definedLabels = new Set(
      ctx.structuralDefinitions.map((d) => d.label),
    );
    const priorTexts = new Set(ctx.priorCandidates.map((c) => c.text));

    const counts = new Map<string, number>();

    const enPattern =
      /(?<![A-Za-z])[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}(?![A-Za-z])/g;
    let m: RegExpExecArray | null;
    while ((m = enPattern.exec(text)) !== null) {
      const token = m[0]!;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    const koPattern = /(?<![가-힣])[가-힣]{2,6}(?![가-힣])/g;
    while ((m = koPattern.exec(text)) !== null) {
      const token = m[0]!;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    const out: Candidate[] = [];
    for (const [token, count] of counts) {
      if (count < MIN_FREQUENCY) continue;
      if (definedLabels.has(token)) continue;
      if (priorTexts.has(token)) continue;
      if (ROLE_BLACKLIST_EN.has(token.toLowerCase())) continue;
      if (ROLE_BLACKLIST_KO.has(token)) continue;
      out.push({
        text: token,
        ruleId: "heuristics.repeatability",
        confidence: 0.5,
      });
    }
    return out;
  },
};
