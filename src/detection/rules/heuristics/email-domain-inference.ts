/**
 * Heuristic: email domain → company name inference.
 *
 * When identifiers.email has already flagged "legal@acme-corp.com" as a
 * prior candidate, this heuristic extracts the domain "acme-corp.com",
 * strips the TLD, converts hyphens to spaces, and title-cases the result
 * to suggest "Acme Corp" as a candidate entity name.
 *
 * This is the ONLY heuristic that primarily operates on priorCandidates
 * rather than the raw text. It reads emails from priorCandidates and
 * derives new candidates from them.
 *
 * Confidence: 0.8 (high — email domains are a strong signal for company
 * names, especially corporate emails like legal@, ceo@, info@).
 */

import type {
  Candidate,
  Heuristic,
  HeuristicContext,
} from "../../_framework/types.js";
import { ROLE_BLACKLIST_EN } from "../role-blacklist-en.js";

/** Common TLDs to strip. */
const TLDS = new Set([
  "com", "org", "net", "co", "io", "kr", "jp", "cn", "uk", "de",
  "fr", "au", "ca", "in", "biz", "info", "us", "eu",
]);

/** Common email prefixes that signal corporate (not personal) emails. */
const CORPORATE_PREFIXES = new Set([
  "legal", "ceo", "cfo", "coo", "cto", "info", "hr", "admin",
  "office", "support", "contact", "sales", "billing", "accounts",
]);

/** Title-case a word. */
function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s[0]!.toUpperCase() + s.slice(1).toLowerCase();
}

export const EMAIL_DOMAIN_INFERENCE: Heuristic = {
  id: "heuristics.email-domain-inference",
  category: "heuristics",
  subcategory: "email-domain-inference",
  languages: ["universal"],
  levels: ["paranoid"],
  description:
    "Infer company name from email domain (legal@acme-corp.com → 'Acme Corp')",
  detect(_text: string, ctx: HeuristicContext): readonly Candidate[] {
    const definedLabels = new Set(
      ctx.structuralDefinitions.map((d) => d.label),
    );
    const priorTexts = new Set(ctx.priorCandidates.map((c) => c.text));

    const out: Candidate[] = [];
    const seen = new Set<string>();

    for (const prior of ctx.priorCandidates) {
      if (!prior.ruleId.startsWith("identifiers.email")) continue;
      const email = prior.text;
      const atIdx = email.indexOf("@");
      if (atIdx < 0) continue;

      const localPart = email.slice(0, atIdx).toLowerCase();
      const domain = email.slice(atIdx + 1);
      const parts = domain.split(".");
      if (parts.length < 2) continue;

      let meaningful = parts.slice(0);
      while (
        meaningful.length > 1 &&
        TLDS.has(meaningful[meaningful.length - 1]!)
      ) {
        meaningful.pop();
      }
      if (meaningful.length === 0) continue;

      const inferred = meaningful
        .join(" ")
        .split(/[-.]/)
        .map(titleCase)
        .join(" ")
        .trim();

      if (inferred.length < 2) continue;
      if (definedLabels.has(inferred)) continue;
      if (priorTexts.has(inferred)) continue;
      if (ROLE_BLACKLIST_EN.has(inferred.toLowerCase())) continue;
      if (seen.has(inferred)) continue;
      seen.add(inferred);

      const confidence = CORPORATE_PREFIXES.has(localPart) ? 0.8 : 0.6;

      out.push({
        text: inferred,
        ruleId: "heuristics.email-domain-inference",
        confidence,
      });
    }
    return out;
  },
};
