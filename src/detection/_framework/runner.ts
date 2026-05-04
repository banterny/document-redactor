/**
 * Three-phase rule runner.
 *
 * Contract:
 * - normalize once, then share the PositionMap across all phases;
 * - run structural parsers, regex rules, then heuristics in that order;
 * - return original document bytes in Candidate.text, never normalized bytes;
 * - do not dedupe here; UI/export target construction owns aggregation;
 * - fail loud. Rule/parser/heuristic exceptions intentionally bubble.
 *
 * See docs/RULES_GUIDE.md for the full rule authoring contract.
 */

import { normalizeForMatching, type PositionMap } from "../normalize.js";

import { detectLanguage } from "./language-detect.js";
import {
  ALL_HEURISTICS,
  ALL_REGEX_RULES,
  ALL_STRUCTURAL_PARSERS,
} from "./registry.js";
import type {
  Candidate,
  Heuristic,
  HeuristicContext,
  Language,
  Level,
  RegexRule,
  StructuralDefinition,
  StructuralParser,
} from "./types.js";

/**
 * Options passed through every phase function. Kept minimal on purpose:
 * the runner orchestrates, it does not feature-config.
 *
 * NOT exported. Callers interact with the runner through `RunAllOptions`
 * (exported below), which is a superset of these fields.
 */
interface PhaseOptions {
  /**
   * Document language for rule filtering. When `undefined`, no filter is
   * applied (all rules run — Phase 0 backward compat). When set, rules whose
   * `languages` array does not include this value AND does not include
   * "universal" are skipped. When set to "mixed", every rule passes.
   *
   * The distinction between `Language` ("ko" | "en" | "universal") and this
   * field's type ("ko" | "en" | "mixed") is deliberate: "universal" is a
   * rule-declaration value meaning "applies to any document", while "mixed"
   * is a detection outcome meaning "document has both languages". They are
   * two different concepts in two different coordinate systems.
   */
  readonly language?: "ko" | "en" | "mixed";
}

/**
 * Returns true if a rule / parser / heuristic with the given `languages` field
 * should run under the (possibly undefined) document-language filter.
 *
 * Matches RULES_GUIDE § 11.2:
 *
 *   - filter undefined  → true (no filter active — Phase 0 backward compat)
 *   - filter "mixed"    → true (bilingual documents run every rule)
 *   - rule has "universal" in languages → true (applies everywhere)
 *   - else → rule.languages.includes(filter)
 *
 * Pure function, no state. Safe to call from any phase.
 */
function shouldRunForLanguage(
  ruleLanguages: readonly Language[],
  filter: "ko" | "en" | "mixed" | undefined,
): boolean {
  if (filter === undefined) return true;
  if (filter === "mixed") return true;
  if (ruleLanguages.includes("universal")) return true;
  return ruleLanguages.includes(filter);
}

/**
 * Run every RegexRule that matches the given level (and optional language),
 * returning candidates with original-byte recovery via `normalizeForMatching`'s
 * offset map.
 *
 * Phase 0 contract preserved: calling without `opts` — i.e., the legacy
 * `runRegexPhase(text, level, rules)` three-arg form — applies level filter
 * only, matching the exact Phase 0 semantics byte-for-byte. This is the code
 * path that `detect-pii.ts` legacy shim uses, so its output MUST NOT change
 * as a result of Phase 1 extensions. The Phase 0 characterization tests
 * (T1–T18) verify this invariant.
 *
 * Does NOT deduplicate. Callers run dedup on the combined output of all phases
 * (see `buildAllTargetsFromZip` in detect-all.ts).
 */
export function runRegexPhase(
  text: string,
  level: Level,
  rules: readonly RegexRule[],
  opts: PhaseOptions = {},
): Candidate[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];
  return runRegexPhaseOnMap(text, map, level, rules, opts);
}

/**
 * Same as `runRegexPhase` but operates on a pre-computed PositionMap. Used by
 * `runAllPhases` to avoid re-normalizing the text between phases (normalize
 * is O(n) and non-trivial on 50KB-scale contract scopes). Not exported —
 * external callers should use `runRegexPhase`.
 */
function runRegexPhaseOnMap(
  originalText: string,
  map: PositionMap,
  level: Level,
  rules: readonly RegexRule[],
  opts: PhaseOptions,
): Candidate[] {
  const active = rules.filter(
    (r) =>
      r.levels.includes(level) &&
      shouldRunForLanguage(r.languages, opts.language),
  );

  const out: Candidate[] = [];

  for (const rule of active) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(map.text)) !== null) {
      const normalized = m[0];
      if (rule.postFilter && !rule.postFilter(normalized)) continue;

      const startNorm = m.index;
      const endNorm = startNorm + normalized.length;
      const startOrig = map.origOffsets[startNorm]!;
      const endOrig = map.origOffsets[endNorm]!;
      const original = originalText.slice(startOrig, endOrig);

      out.push({
        text: original,
        ruleId: rule.id,
        confidence: 1.0,
      });
    }
  }

  return out;
}

/**
 * Run every StructuralParser in registry order, collecting their output into
 * a single flat `readonly StructuralDefinition[]`. Parser order matters for
 * downstream heuristics: later parsers can emit definitions that shadow
 * earlier ones. The runner does NOT apply shadow/merge semantics — it
 * concatenates in parser order and lets heuristics (or the UI) decide.
 *
 * Parsers receive the NORMALIZED text (same text the regex phase sees). If a
 * parser needs to recover original bytes for its `label` or `referent`, it
 * imports `normalizeForMatching` itself and re-runs it. Sharing the offset
 * map across phases would require passing a PositionMap parameter to every
 * parser signature — a bigger surface-area change than the one-line re-normal
 * each parser does once per call. (Normalize is idempotent and cheap on
 * already-normalized text.)
 *
 * STRUCTURAL PARSERS HAVE NO LEVEL FILTER. Structural parsing is either
 * useful or not; there is no "paranoid structural parsing". Only regex rules
 * and heuristics are tier-gated. See RULES_GUIDE § 10.2.
 *
 * FAIL-LOUD: a throwing parser bubbles up. The runner does NOT catch.
 */
export function runStructuralPhase(
  text: string,
  parsers: readonly StructuralParser[],
  opts: PhaseOptions = {},
): readonly StructuralDefinition[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];
  return runStructuralPhaseOnMap(map, parsers, opts);
}

/**
 * PositionMap-aware variant used by `runAllPhases` to avoid re-normalization.
 * Not exported.
 */
function runStructuralPhaseOnMap(
  map: PositionMap,
  parsers: readonly StructuralParser[],
  opts: PhaseOptions,
): readonly StructuralDefinition[] {
  const active = parsers.filter((p) =>
    shouldRunForLanguage(p.languages, opts.language),
  );

  const out: StructuralDefinition[] = [];

  for (const parser of active) {
    const produced = parser.parse(map.text);
    for (const def of produced) {
      out.push(def);
    }
  }

  return out;
}

/**
 * Run every Heuristic that matches the given level (and optional language),
 * threading the provided `HeuristicContext` (which bundles prior structural
 * definitions + prior regex candidates + document language) into each
 * `detect()` call. Returns a flat `Candidate[]` with confidence < 1.0, same
 * shape as the regex phase output.
 *
 * Heuristics are REQUIRED (per RULES_GUIDE § 6.2) to:
 *
 *   1. Consume `context.structuralDefinitions` — skip labels that are already
 *      defined as a structural "the Buyer → ABC Corporation" binding (D9
 *      invariant).
 *   2. Consume `context.priorCandidates` — avoid double-emitting candidates
 *      already found by a higher-confidence regex rule.
 *   3. Consult a role blacklist (imported as a module constant by each
 *      heuristic individually — NOT threaded through this runner).
 *   4. Apply internal confidence calibration (typically 0.5–0.9).
 *
 * The runner does NOT enforce these. Each heuristic's own tests do — see
 * § 14 of this brief for the heuristic-level test spec.
 *
 * FAIL-LOUD: a throwing heuristic bubbles up. A heuristic that wants to
 * gracefully skip on malformed input MUST return an empty array explicitly.
 *
 * Original-byte recovery is the HEURISTIC's responsibility, not the runner's.
 * Unlike the regex phase (where every candidate corresponds to a single
 * `RegExp.exec` match and byte recovery is mechanical), heuristic spans can
 * come from joins, frequency counts, or context windows — there is no
 * universal recovery rule. Each heuristic in § 14 imports a shared helper
 * `recoverOriginalSlice(originalText, map, startNorm, endNorm)` from
 * `_framework/recover-bytes.ts` (which Phase 1 adds as a 6-line utility in
 * the § 14 TDD step). The runner does not call this helper itself.
 */
export function runHeuristicPhase(
  text: string,
  level: Level,
  heuristics: readonly Heuristic[],
  context: HeuristicContext,
  opts: PhaseOptions = {},
): Candidate[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];
  const heuristicContext: HeuristicContext = {
    ...context,
    originalText: text,
    map,
  };
  return runHeuristicPhaseOnMap(
    map,
    level,
    heuristics,
    heuristicContext,
    opts,
  );
}

/**
 * PositionMap-aware variant used by `runAllPhases` to avoid re-normalization.
 * Not exported.
 */
function runHeuristicPhaseOnMap(
  map: PositionMap,
  level: Level,
  heuristics: readonly Heuristic[],
  context: HeuristicContext,
  opts: PhaseOptions,
): Candidate[] {
  const active = heuristics.filter(
    (h) =>
      h.levels.includes(level) &&
      shouldRunForLanguage(h.languages, opts.language),
  );

  const out: Candidate[] = [];

  for (const heur of active) {
    const produced = heur.detect(map.text, context);
    for (const cand of produced) {
      out.push(cand);
    }
  }

  return out;
}

/**
 * Result of a full three-phase detection run on a single text blob.
 *
 * Shape notes:
 *
 *   - `candidates` contains the UNION of phase-2 (regex) and phase-3
 *     (heuristic) outputs in phase order: regex first, then heuristics. No
 *     dedup. Dedup is the caller's responsibility (see
 *     `buildAllTargetsFromZip` in detect-all.ts).
 *
 *   - `structuralDefinitions` is the phase-1 output, exposed as a side
 *     channel for callers (such as engine.ts) that want to render the
 *     structural tree in the UI without re-running phase 1.
 *
 *   - `documentLanguage` is the detected language at the time of this call.
 *     Callers that want to override detection pass `opts.language` below.
 */
export interface RunAllResult {
  readonly candidates: readonly Candidate[];
  readonly structuralDefinitions: readonly StructuralDefinition[];
  readonly documentLanguage: "ko" | "en" | "mixed";
}

/**
 * Options for `runAllPhases`. `level` is required; everything else is
 * optional.
 *
 *   - `level` (required): which tier to run — "conservative" | "standard" |
 *     "paranoid". Passed to regex + heuristic phases. Structural parsers are
 *     not level-filtered.
 *
 *   - `language`: override the auto-detected document language. Omit to let
 *     the runner call `detectLanguage` on the input.
 *
 *   - `rules`, `parsers`, `heuristics`: override the default registry imports.
 *     Omit to use `ALL_REGEX_RULES`, `ALL_STRUCTURAL_PARSERS`, `ALL_HEURISTICS`
 *     from registry.ts. Tests that want to isolate one rule/parser/heuristic
 *     from the rest of the registry pass explicit arrays here.
 */
export interface RunAllOptions {
  readonly level: Level;
  readonly language?: "ko" | "en" | "mixed";
  readonly rules?: readonly RegexRule[];
  readonly parsers?: readonly StructuralParser[];
  readonly heuristics?: readonly Heuristic[];
}

/**
 * Run all three phases in order on a single text blob.
 *
 *   1. Normalize ONCE. All three phases share the resulting PositionMap.
 *   2. Detect document language (or use the `opts.language` override).
 *   3. Run structural parsers → StructuralDefinition[].
 *   4. Run regex rules → Candidate[] with confidence 1.0.
 *   5. Build HeuristicContext from phases 1 + 2 + document language.
 *   6. Run heuristics → Candidate[] with confidence < 1.0.
 *   7. Return { candidates: [...regex, ...heur], structuralDefinitions,
 *      documentLanguage }.
 *
 * FAIL-LOUD: if any phase throws, the whole call throws with a stack trace.
 * There is no partial-result fallback.
 *
 * Empty-input semantics: empty or whitespace-that-normalizes-to-empty text
 * returns empty arrays with `documentLanguage: "en"` (matches
 * `detectLanguage`'s empty-input default).
 */
export function runAllPhases(text: string, opts: RunAllOptions): RunAllResult {
  if (text.length === 0) {
    return {
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    };
  }
  const map = normalizeForMatching(text);
  if (map.text.length === 0) {
    return {
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    };
  }

  const rules = opts.rules ?? ALL_REGEX_RULES;
  const parsers = opts.parsers ?? ALL_STRUCTURAL_PARSERS;
  const heuristics = opts.heuristics ?? ALL_HEURISTICS;

  const documentLanguage: "ko" | "en" | "mixed" =
    opts.language ?? detectLanguage(map.text);

  const phaseOpts: PhaseOptions = { language: documentLanguage };

  const structuralDefinitions = runStructuralPhaseOnMap(
    map,
    parsers,
    phaseOpts,
  );

  const regexCandidates = runRegexPhaseOnMap(
    text,
    map,
    opts.level,
    rules,
    phaseOpts,
  );

  const context: HeuristicContext = {
    structuralDefinitions,
    priorCandidates: regexCandidates,
    documentLanguage,
    originalText: text,
    map,
  };
  const heuristicCandidates = runHeuristicPhaseOnMap(
    map,
    opts.level,
    heuristics,
    context,
    phaseOpts,
  );

  return {
    candidates: [...regexCandidates, ...heuristicCandidates],
    structuralDefinitions,
    documentLanguage,
  };
}
