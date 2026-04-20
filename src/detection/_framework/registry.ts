/**
 * Rule registry — the single point where all category files are collected
 * into a flat list of registered rules.
 *
 * Invariants are verified at module load time (bottom of this file). If any
 * rule violates an invariant, the import fails fast with a descriptive error
 * rather than silently producing wrong output at runtime.
 *
 * Adding a new category:
 *   1. Create the category file under rules/, e.g. rules/financial.ts
 *   2. Import its exported array here
 *   3. Add it to ALL_REGEX_RULES
 */

import { ALL_HEURISTICS as _HEURISTICS } from "../rules/heuristics/index.js";
import { ENTITIES } from "../rules/entities.js";
import { ENTITIES_UK } from "../rules/entities-uk.js";
import { FINANCIAL } from "../rules/financial.js";
import { IDENTIFIERS } from "../rules/identifiers.js";
import { IDENTIFIERS_UK } from "../rules/identifiers-uk.js";
import { LEGAL } from "../rules/legal.js";
import { LEGAL_UK } from "../rules/legal-uk.js";
import { ALL_STRUCTURAL_PARSERS as _STRUCTURAL } from "../rules/structural/index.js";
import { TEMPORAL } from "../rules/temporal.js";
import { TEMPORAL_UK } from "../rules/temporal-uk.js";
import type {
  Heuristic,
  RegexRule,
  StructuralParser,
} from "./types.js";

/** All registered RegexRules across every category, in a stable iteration order. */
export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  ...IDENTIFIERS_UK,
  ...FINANCIAL,
  ...TEMPORAL,
  ...TEMPORAL_UK,
  ...ENTITIES,
  ...ENTITIES_UK,
  ...LEGAL,
  ...LEGAL_UK,
] as const;

export const ALL_STRUCTURAL_PARSERS: readonly StructuralParser[] = _STRUCTURAL;

export const ALL_HEURISTICS: readonly Heuristic[] = _HEURISTICS;

/**
 * Runtime sanity checks. Fails fast at module load if any rule is malformed.
 * Thrown errors bubble up to whoever imports this module — usually a test or
 * the runtime bundle, either of which will fail in a visible way.
 */
function verifyRegistry(): void {
  const ids = new Set<string>();
  for (const rule of ALL_REGEX_RULES) {
    if (ids.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    ids.add(rule.id);

    if (!rule.pattern.flags.includes("g")) {
      throw new Error(`Rule ${rule.id}: pattern must have the 'g' flag`);
    }
    if (rule.levels.length === 0) {
      throw new Error(`Rule ${rule.id}: levels must be a non-empty array`);
    }
    if (rule.languages.length === 0) {
      throw new Error(`Rule ${rule.id}: languages must be a non-empty array`);
    }
    if (rule.description.length === 0) {
      throw new Error(`Rule ${rule.id}: description must be non-empty`);
    }
    if (!rule.id.startsWith(`${rule.category}.`)) {
      throw new Error(
        `Rule ${rule.id}: id must start with "${rule.category}." to match category`,
      );
    }
    if (!rule.id.endsWith(rule.subcategory)) {
      throw new Error(
        `Rule ${rule.id}: id must end with subcategory "${rule.subcategory}"`,
      );
    }
  }
}

verifyRegistry();
