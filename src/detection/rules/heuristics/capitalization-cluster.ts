/**
 * Heuristic: English capitalization cluster.
 *
 * Detects 2+ consecutive capitalized words as probable entity names.
 * Examples: "John Smith", "Acme Holdings Group", "New York City".
 *
 * Required behaviors (per RULES_GUIDE § 6.2):
 *   1. D9 skip — defined labels are excluded
 *   2. Prior candidate skip — already-found strings excluded
 *   3. Role blacklist — generic legal roles excluded
 *   4. Confidence 0.7 (moderate — caps clusters are common in English prose)
 *   5. Returns normalized text as candidate.text (ASCII letters are
 *      normalized losslessly, so normalized = original for this heuristic)
 *
 * See docs/phases/phase-1-rulebook.md § 14.4.1
 */

import type {
  Candidate,
  Heuristic,
  HeuristicContext,
} from "../../_framework/types.js";
import { ROLE_BLACKLIST_EN } from "../role-blacklist-en.js";

export const CAPITALIZATION_CLUSTER: Heuristic = {
  id: "heuristics.capitalization-cluster",
  category: "heuristics",
  subcategory: "capitalization-cluster",
  languages: ["en"],
  levels: ["standard", "paranoid"],
  description:
    "English 2+ consecutive capitalized words as probable entity name (D9-aware, role-blacklist-filtered)",
  detect(text: string, ctx: HeuristicContext): readonly Candidate[] {
    const definedLabels = new Set(
      ctx.structuralDefinitions.map((d) => d.label),
    );
    const priorTexts = new Set(ctx.priorCandidates.map((c) => c.text));
    const pattern =
      /(?<![A-Za-z])[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}(?![A-Za-z])/g;
    const out: Candidate[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const candidate = m[0]!;
      if (definedLabels.has(candidate)) continue;
      if (priorTexts.has(candidate)) continue;
      if (ROLE_BLACKLIST_EN.has(candidate.toLowerCase())) continue;
      const words = candidate.split(/\s+/);
      if (words.some((w) => ROLE_BLACKLIST_EN.has(w.toLowerCase()))) continue;
      out.push({
        text: candidate,
        ruleId: "heuristics.capitalization-cluster",
        confidence: 0.7,
      });
    }
    return out;
  },
};
