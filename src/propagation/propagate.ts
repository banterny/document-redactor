/**
 * Variant propagation — Lane C's top-level entry point.
 *
 * Given a seed entity (an entity name the user wants redacted) and the
 * document corpus, compute the full set of aliases that refer to that
 * entity, classified by D9's literal-vs-defined rule:
 *
 *   - `literal`  — the actual identifying string. Redacted by default.
 *                  Examples: `ABC Corporation`, `ABC Corp`, `ABC`,
 *                  `ABC 주식회사`, `Project Falcon`, `김철수`.
 *
 *   - `defined`  — a generic role label that only identifies *in
 *                  combination with* the definition clause. Preserved by
 *                  default (D9); downstream AI can still parse "the Buyer
 *                  shall ..." when the underlying literal is redacted.
 *                  Examples: `the Buyer`, `the Discloser`, `매수인`, `갑`.
 *
 * The classifier uses three sources of truth, in priority order:
 *
 *   1. **Definition clauses** — if the seed literal is the Y-side of a
 *      `"X" means Y` or `"X"이라 함은 Y를 말한다` clause, pull X into the
 *      variant group and tag it `defined`. This is the only way a role
 *      word like "Discloser" gets linked to a specific entity.
 *
 *   2. **Hardcoded defined-term list** — if an alias matches a generic
 *      role word from `defined-terms.ts` (Buyer, Seller, Discloser,
 *      매수인, 갑, ...), it's tagged `defined` regardless of how it was
 *      discovered. This is the fail-safe catching parenthetical clauses
 *      the parser doesn't handle (`ABC Corporation ("Discloser")`).
 *
 *   3. **Substring variants** — `substring-variants.ts` finds every
 *      shorter form of the seed that appears in the text (`ABC
 *      Corporation → ABC Corp → ABC`). Those are tagged `literal` by
 *      default. If one happens to match the generic-role list (e.g. the
 *      first token is literally "Buyer"), rule 2 re-tags it as defined
 *      — but in practice users don't seed with generic role words.
 *
 * Final targets list:
 *   `buildRedactionTargets([group1, group2, ...])` returns the string
 *   array ready to feed into `redactDocx({ targets })`. By default, only
 *   `literal`-tagged candidates are included (D9 default). The caller can
 *   opt in to specific defined candidates via the `includeDefined`
 *   option, which is how the UI's checkbox ticks propagate into the
 *   final redaction.
 *
 * Public API:
 *   - `propagateVariants(seed, text, clauses)` → `VariantGroup`
 *   - `buildRedactionTargets(groups, opts?)` → `string[]`
 *   - `VariantGroup`, `Candidate`, `AliasKind`
 */

import { isDefinedTerm } from "./defined-terms.js";
import type { DefinitionClause } from "./definition-clauses.js";
import {
  countWordBoundedOccurrences,
  findSubstringVariants,
} from "./substring-variants.js";

/** Classification for one candidate alias. */
export type AliasKind = "literal" | "defined";

/** One alias candidate, with its classification and occurrence count. */
export interface Candidate {
  /** The literal string that appears (or would appear) in the document. */
  readonly text: string;
  /** D9 classification — literal (redact by default) or defined (keep by default). */
  readonly kind: AliasKind;
  /** Word-bounded occurrence count in the corpus. Shown in the candidates panel. */
  readonly count: number;
}

/**
 * All candidates associated with one seed entity, split by D9 classification.
 * This is the shape the UI renders in the right-panel "Entity aliases"
 * two-group tree.
 */
export interface VariantGroup {
  /** The seed the user provided (or Lane A/C derived). */
  readonly seed: string;
  /** Literal candidates — auto-checked by default, fed to the redactor. */
  readonly literals: ReadonlyArray<Candidate>;
  /** Defined-term candidates — unchecked by default, kept to preserve AI readability. */
  readonly defined: ReadonlyArray<Candidate>;
}

/**
 * Compute the variant group for a single seed entity against a corpus
 * and a set of already-parsed definition clauses. Pure function — same
 * input always produces the same output, no I/O, no zip access.
 *
 * The caller runs `parseDefinitionClauses(text)` once per document and
 * reuses the result across every seed entity. Passing clauses in as an
 * argument keeps `propagateVariants` free of the text-parsing concern.
 */
export function propagateVariants(
  seed: string,
  text: string,
  clauses: ReadonlyArray<DefinitionClause>,
): VariantGroup {
  const literals = new Map<string, Candidate>();
  const defined = new Map<string, Candidate>();

  /**
   * Classify a single candidate and add it to the correct bucket. Uses
   * the hardcoded defined-term list as the overriding classifier: any
   * alias matching the list goes to `defined`, even if the caller passed
   * `forceLiteral = true`. The one exception is the seed itself — if the
   * user explicitly seeds with a generic role word, we respect that and
   * keep it in literals (fail-closed: err on the side of redacting).
   */
  const addCandidate = (
    candidate: string,
    forcedKind: AliasKind | null,
  ): void => {
    if (candidate.length === 0) return;
    const count = countWordBoundedOccurrences(text, candidate);
    if (count === 0) return;

    let kind: AliasKind;
    if (candidate === seed) {
      // The seed the user provided — always treated as literal.
      kind = "literal";
    } else if (forcedKind === "defined") {
      // Definition clause linkage → defined.
      kind = "defined";
    } else if (isDefinedTerm(candidate)) {
      // Hardcoded generic role list → defined fallback.
      kind = "defined";
    } else {
      // Everything else → literal (fail-closed).
      kind = "literal";
    }

    const bucket = kind === "literal" ? literals : defined;
    if (bucket.has(candidate)) return;
    bucket.set(candidate, { text: candidate, kind, count });
  };

  // 1. The seed itself.
  addCandidate(seed, "literal");

  // 2. Substring variants of the seed.
  for (const variant of findSubstringVariants(seed, text)) {
    addCandidate(variant, null);
  }

  // 3. Definition clauses where the seed is the literal side of the pair.
  //    Pull in the defined term as a defined candidate.
  for (const clause of clauses) {
    if (clause.literal === seed) {
      addCandidate(clause.defined, "defined");
      // Also handle the "the X" English convention: the document usually
      // refers to the defined term as "the Buyer" / "The Buyer" in prose
      // even when the clause introduces bare "Buyer". If those forms
      // actually appear in the corpus, surface them too.
      addCandidate(`the ${clause.defined}`, "defined");
      addCandidate(`The ${clause.defined}`, "defined");
    }
  }

  return {
    seed,
    literals: [...literals.values()],
    defined: [...defined.values()],
  };
}

/** Options for `buildRedactionTargets`. */
export interface BuildTargetsOptions {
  /**
   * Defined-term texts the user has explicitly opted into redacting.
   * Default: empty set → D9 default (no defined terms redacted). The
   * UI's "Defined terms" checkbox ticks propagate here.
   */
  readonly includeDefined?: ReadonlySet<string>;
}

/**
 * Assemble the final target list for the redactor from one or more
 * variant groups. By default (D9), only literal candidates are included;
 * defined candidates are preserved unless explicitly opted in via
 * `includeDefined`.
 *
 * The result is deduped across groups (so shared literals like overlapping
 * substrings appear once) and sorted longest-first, which matches the
 * redactor's greedy alternation semantics in `findRedactionMatches`.
 */
export function buildRedactionTargets(
  groups: ReadonlyArray<VariantGroup>,
  opts: BuildTargetsOptions = {},
): string[] {
  const includeDefined = opts.includeDefined ?? new Set<string>();
  const set = new Set<string>();

  for (const group of groups) {
    for (const cand of group.literals) {
      set.add(cand.text);
    }
    for (const cand of group.defined) {
      if (includeDefined.has(cand.text)) {
        set.add(cand.text);
      }
    }
  }

  // Longest-first sort matches the redactor's `findRedactionMatches`
  // greedy alternation: when two targets overlap (e.g., "ABC Corporation"
  // vs "ABC"), the longer one must win at the shared start position, and
  // the regex engine tries alternatives in pattern order.
  return [...set].sort((a, b) => b.length - a.length);
}
