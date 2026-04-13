/**
 * Top-level detection API — Phase 1 replacement for `detect-pii.ts`.
 *
 * Three public entry points mirroring the legacy `detect-pii` shape:
 *
 *   1. `detectAll(text, opts?)` — pure function, takes plain text, runs all
 *      three phases (structural → regex → heuristic) via `runAllPhases`, and
 *      returns the combined candidates + structural side-channel + detected
 *      document language.
 *
 *   2. `detectAllInZip(zip, opts?)` — async, walks every text-bearing scope
 *      via `extractTextFromZip`, runs `detectAll` on each, and returns the
 *      candidates + structural definitions with their source scope attached.
 *
 *   3. `buildAllTargetsFromZip(zip, opts?)` — async, returns a deduped,
 *      longest-first sorted array of literal strings ready to feed into
 *      `redactDocx({ targets })`. Mirrors legacy `buildTargetsFromZip` from
 *      `detect-pii.ts` so the engine.ts migration is a one-line swap.
 *
 * STRANGLER-FIG NOTE: this file runs IN PARALLEL with `detect-pii.ts`. The
 * legacy shim is untouched. The only caller that migrates to detect-all is
 * `src/ui/engine.ts`, in the final commit of Phase 1. Every other caller
 * (including all Phase 0 characterization tests) continues to use detect-pii.
 * This preserves the Phase 0 ship gate byte-for-byte.
 *
 * FAIL-LOUD: no exception-handling wrappers anywhere in this file. A
 * throwing rule, parser, or
 * heuristic bubbles up as a stack trace. See phase-1-rulebook.md § 3
 * invariant 16 for rationale.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 8 (this spec, authoritative)
 *   - src/detection/_framework/runner.ts (`runAllPhases`, the core)
 *   - docs/RULES_GUIDE.md § 9 (dedup semantics)
 *   - docs/RULES_GUIDE.md § 11 (language handling)
 */

import type JSZip from "jszip";

import { extractTextFromZip } from "./extract-text.js";
import { detectLanguage } from "./_framework/language-detect.js";
import { runAllPhases } from "./_framework/runner.js";
import type {
  Candidate,
  Level,
  StructuralDefinition,
} from "./_framework/types.js";
import type { Scope } from "../docx/types.js";

/** Result of one `detectAll` call on a single text blob. */
export interface DetectAllResult {
  readonly candidates: readonly Candidate[];
  readonly structuralDefinitions: readonly StructuralDefinition[];
  readonly documentLanguage: "ko" | "en" | "mixed";
}

/** A Candidate annotated with the scope it was found in. */
export interface ScopedCandidate {
  readonly scope: Scope;
  readonly candidate: Candidate;
}

/** A StructuralDefinition annotated with the scope it was found in. */
export interface ScopedStructuralDefinition {
  readonly scope: Scope;
  readonly definition: StructuralDefinition;
}

/** Result of one `detectAllInZip` call. Both arrays preserve walk order. */
export interface DetectAllInZipResult {
  readonly candidates: readonly ScopedCandidate[];
  readonly structuralDefinitions: readonly ScopedStructuralDefinition[];
}

/**
 * Detection options shared by all three public entry points. Every field is
 * optional; passing `{}` (or omitting opts entirely) yields default level
 * `"standard"` plus per-input language auto-detection.
 */
export interface DetectAllOptions {
  /**
   * Which tier to run. Defaults to `"standard"` to match v1.0 / Phase 0
   * legacy behavior. Tests that exercise tier filtering pass `"conservative"`
   * or `"paranoid"` explicitly. Propagated to the regex + heuristic phases;
   * structural parsers are not level-filtered.
   */
  readonly level?: Level;
  /**
   * Override auto-detected document language. When undefined, the runner
   * should run the auto-detected language for this input. Callers that KNOW the
   * language (e.g., a UI panel scoped to a single Korean document) can pass
   * `"ko"` to skip detection.
   */
  readonly language?: "ko" | "en" | "mixed";
}

/** Default level when `opts.level` is omitted. Matches Phase 0 behavior. */
const DEFAULT_LEVEL: Level = "standard";

/**
 * Run all three detection phases on a single text blob. Pure function.
 *
 * Output ordering:
 *   - `candidates`: regex-phase candidates first (phase-2 order), then
 *     heuristic-phase candidates (phase-3 order). No dedup at this stage.
 *   - `structuralDefinitions`: parser order from `ALL_STRUCTURAL_PARSERS`.
 *   - `documentLanguage`: detected or override.
 *
 * Empty input returns empty arrays and language `"en"` (matches
 * `runAllPhases` empty-input semantics).
 */
export function detectAll(
  text: string,
  opts: DetectAllOptions = {},
): DetectAllResult {
  const documentLanguage = opts.language ?? detectLanguage(text);
  const runOpts: {
    level: Level;
    language: "ko" | "en" | "mixed";
  } = {
    level: opts.level ?? DEFAULT_LEVEL,
    language: documentLanguage,
  };
  const { candidates, structuralDefinitions } = runAllPhases(text, runOpts);
  return { candidates, structuralDefinitions, documentLanguage };
}

/**
 * Walk every text-bearing scope in `zip`, run `detectAll` on each, and
 * return the candidates + structural definitions with their source scope
 * attached.
 *
 * Scope iteration order matches `extractTextFromZip` (body → footnotes →
 * endnotes → comments → headers → footers) per the canonical scope walker.
 * Within a scope, candidates and structural definitions appear in the order
 * `detectAll` returned them (phase-2 regex before phase-3 heuristic for
 * candidates; parser order for structural definitions).
 *
 * Language detection runs PER SCOPE, not per document. A bilingual contract
 * whose footnotes are English-only runs the English rule set on the footnote
 * scope even if the body scope is classified Korean. This matches the
 * RULES_GUIDE § 11.1 "detect once per input" rule, where "input" is a
 * single text blob passed to `detectAll`.
 */
export async function detectAllInZip(
  zip: JSZip,
  opts: DetectAllOptions = {},
): Promise<DetectAllInZipResult> {
  const scoped = await extractTextFromZip(zip);

  const candidates: ScopedCandidate[] = [];
  const structuralDefinitions: ScopedStructuralDefinition[] = [];

  for (const { scope, text } of scoped) {
    const result = detectAll(text, opts);
    for (const candidate of result.candidates) {
      candidates.push({ scope, candidate });
    }
    for (const definition of result.structuralDefinitions) {
      structuralDefinitions.push({ scope, definition });
    }
  }

  return { candidates, structuralDefinitions };
}

/**
 * Top-level target builder: deduped, longest-first sorted array of literal
 * strings ready to feed into `redactDocx({ targets })`.
 *
 * Mirrors the legacy `buildTargetsFromZip` semantics:
 *
 *   - Dedup via Set on candidate.text (original unnormalized bytes — Lane B
 *     scans XML for literal bytes, so normalized-form dedup would cause
 *     silent leaks).
 *
 *   - Longest-first sort so the redactor's `findRedactionMatches` contract
 *     holds: when two targets are both prefixes of the input, the longer
 *     wins.
 *
 *   - Structural definitions DO contribute to the target list via their
 *     `referent` field, NOT their `label`. The label is the generic noun
 *     ("the Buyer" / "매수인") that we deliberately DO NOT redact per D9.
 *     The referent is the real entity ("ABC Corporation" / "사과회사") that
 *     we do. A future UI may offer a per-label toggle; for now, labels are
 *     filtered out at the builder level.
 *
 *   - Heuristic candidates with confidence < 1.0 ARE included in the target
 *     list by default. The caller (engine.ts) decides whether to filter by
 *     confidence before presenting to the user. See § 8.3 for the engine
 *     contract — engine.ts partitions results into high-confidence (auto-
 *     select) and low-confidence (suggest-only) based on the 0.8 threshold.
 */
export async function buildAllTargetsFromZip(
  zip: JSZip,
  opts: DetectAllOptions = {},
): Promise<readonly string[]> {
  const { candidates, structuralDefinitions } = await detectAllInZip(zip, opts);

  const set = new Set<string>();
  for (const { candidate } of candidates) {
    set.add(candidate.text);
  }
  for (const { definition } of structuralDefinitions) {
    if (definition.referent.length > 0) {
      set.add(definition.referent);
    }
  }

  return [...set].sort((a, b) => b.length - a.length);
}
