/**
 * Heuristic: quoted term detection.
 *
 * Detects text enclosed in quote characters as a probable entity or
 * defined term: "X", 'X', 「X」, 『X』.
 *
 * Note: normalizeForMatching folds smart quotes to straight quotes and
 * corner brackets to straight double quotes. So by the time the heuristic
 * sees the text, all these forms are plain `"X"` or `'X'`. The regex
 * below only needs to match ASCII quotes.
 *
 * Confidence: 0.6 (lower than capitalization — many quoted terms in
 * contracts are section titles or clause references, not entities).
 */

import type {
  Candidate,
  Heuristic,
  HeuristicContext,
} from "../../_framework/types.js";
import { ROLE_BLACKLIST_EN } from "../role-blacklist-en.js";
import { ROLE_BLACKLIST_KO } from "../role-blacklist-ko.js";

export const QUOTED_TERM: Heuristic = {
  id: "heuristics.quoted-term",
  category: "heuristics",
  subcategory: "quoted-term",
  languages: ["ko", "en"],
  levels: ["standard", "paranoid"],
  description:
    "Quoted text in double or single quotes as probable entity or defined-term reference",
  detect(text: string, ctx: HeuristicContext): readonly Candidate[] {
    const definedLabels = new Set(
      ctx.structuralDefinitions.map((d) => d.label),
    );
    const priorTexts = new Set(ctx.priorCandidates.map((c) => c.text));
    const pattern = /["']([^"']{2,50})["']/g;
    const out: Candidate[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const inner = m[1]!;
      if (definedLabels.has(inner)) continue;
      if (priorTexts.has(inner)) continue;
      if (ROLE_BLACKLIST_EN.has(inner.toLowerCase())) continue;
      if (ROLE_BLACKLIST_KO.has(inner)) continue;
      out.push({
        text: inner,
        ruleId: "heuristics.quoted-term",
        confidence: 0.6,
      });
    }
    return out;
  },
};
