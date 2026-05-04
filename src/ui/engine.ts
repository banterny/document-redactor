/**
 * UI engine wrapper — the single module every Svelte component touches
 * for data.
 *
 * The raw Lane A/C/D modules are pure functions with narrow contracts:
 * `buildTargetsFromZip`, `propagateVariants`, `finalizeRedaction`, etc.
 * The UI needs a coarser API that matches how a user interacts with
 * the app:
 *
 *   1. **analyzeDocumentSession(bytes, seeds?)** — drop a file, get back
 *      the full candidates tree (literals, defined terms, PII), file stats,
 *      rendered preview data, and verify surfaces. The optional seed list is
 *      an internal propagation hook, not a public UI control. Does NOT mutate
 *      bytes.
 *
 *   2. **defaultSelections(analysis)** — the D9 default state for the
 *      checkbox tree: all literals checked, all PII checked, all defined
 *      terms unchecked. Returns a mutable `Set<string>` the UI can
 *      hand to `applyRedaction` once the user clicks Apply.
 *
 *   3. **applyRedaction(bytes, selections, opts?)** — actually perform
 *      the redaction. Reloads the zip from the original bytes so the
 *      caller's copy stays pristine, runs the full Lane D pipeline with
 *      whatever selections the user confirmed, and returns a
 *      FinalizedReport ready for the download banner.
 *
 * This file is the ONLY place the UI imports from `../detection`,
 * `../propagation`, or `../finalize`. If a Svelte component needs to
 * reach into the engine, it goes through this wrapper. That keeps the
 * component layer framework-adjacent and the engine layer framework-free,
 * which is what makes both halves independently testable.
 */

import {
  detectAll,
  type ScopedCandidate,
  type ScopedStructuralDefinition,
} from "../detection/detect-all.js";
import type { ExtractedScopeText } from "../detection/extract-text.js";
import { normalizeForMatching } from "../detection/normalize.js";
import { ROLE_BLACKLIST_EN } from "../detection/rules/role-blacklist-en.js";
import { ROLE_BLACKLIST_KO } from "../detection/rules/role-blacklist-ko.js";
import { loadDocxZip } from "../docx/load.js";
import type { Scope } from "../docx/types.js";
import type { VerifySurfaces } from "../docx/verify-surfaces.js";
import {
  finalizeRedaction,
} from "../finalize/finalize.js";
import {
  runGuidedRecovery,
  toGuidedReport,
  type GuidedFinalizeReport,
} from "../finalize/guided-recovery.js";
import {
  applyRelsRepairsToZip,
  buildPreflightExpansionPlan,
  buildPreflightExpansionPlanFromSurfaces,
} from "../finalize/preflight-expansion.js";
import { parseDefinitionClauses } from "../propagation/definition-clauses.js";
import {
  propagateVariants,
  type VariantGroup,
} from "../propagation/propagate.js";
import {
  IDENTIFIER_SUBCATEGORY_TO_KIND,
  type IdentifierSubcategory,
  type UiPiiKind,
} from "./pii-kinds.js";
import {
  buildSelectionTargetId,
  buildSelectionTargets,
  indexSelectionTargets,
  resolveSelectedTargets,
  type ResolvedRedactionTarget,
  type SelectionOccurrenceInput,
  type SelectionReviewSection,
  type SelectionTarget,
  type SelectionTargetId,
} from "../selection-targets.js";
import {
  attachAnalysisToSession,
  createDocumentAnalysisSnapshot,
  type DocumentAnalysisSession,
  type DocumentAnalysisSnapshot,
} from "./analysis-session.js";

/** Aggregated PII candidate — one per unique text, with scope + count info. */
export interface PiiCandidate {
  /** The literal substring to redact. */
  readonly text: string;
  /** Stable selection id backing the UI row. */
  readonly selectionTargetId: SelectionTargetId;
  /** Which regex category detected it (email, phone-kr, rrn, ...). */
  readonly kind: UiPiiKind;
  /** Total occurrences across every scope. */
  readonly count: number;
  /** Distinct scopes this candidate appeared in. */
  readonly scopes: ReadonlyArray<Scope>;
}

export interface LiteralCandidate {
  readonly text: string;
  readonly seed: string;
  readonly count: number;
  readonly selectionTargetId: SelectionTargetId;
}

export interface DefinedCandidate {
  readonly text: string;
  readonly seed: string;
  readonly count: number;
  readonly selectionTargetId: SelectionTargetId;
}

/** High-level file stats shown in the main header pill row. */
export interface FileStats {
  readonly sizeBytes: number;
  readonly scopeCount: number;
}

export interface NonPiiCandidate {
  readonly text: string;
  readonly selectionTargetId: SelectionTargetId;
  readonly ruleId: string;
  readonly category:
    | "financial"
    | "temporal"
    | "entities"
    | "structural"
    | "legal"
    | "heuristics";
  readonly confidence: number;
  readonly count: number;
  readonly scopes: ReadonlyArray<Scope>;
}

/** Everything `analyzeZip` returns — the full candidates tree + stats. */
export interface Analysis {
  /** One variant group per seed entity, in input order. */
  readonly entityGroups: ReadonlyArray<VariantGroup>;
  /** Deduped literal candidates used by the Parties section. */
  readonly literalCandidates: ReadonlyArray<LiteralCandidate>;
  /** Deduped defined-term candidates used by the Defined aliases section. */
  readonly definedCandidates: ReadonlyArray<DefinedCandidate>;
  /** Deduped PII candidates across every scope. */
  readonly piiCandidates: ReadonlyArray<PiiCandidate>;
  /** Deduped Phase 1 non-PII candidates across every scope. */
  readonly nonPiiCandidates: ReadonlyArray<NonPiiCandidate>;
  /** Explicit review/export target contract. */
  readonly selectionTargets: ReadonlyArray<SelectionTarget>;
  /** By-id lookup used by review and selection-resolution seams. */
  readonly selectionTargetById: ReadonlyMap<SelectionTargetId, SelectionTarget>;
  /** Visible document text used to recover exact literals for manual additions. */
  readonly manualMatchCorpus?: string;
  readonly fileStats: FileStats;
}

type NonPiiCategory = NonPiiCandidate["category"];
const ENGLISH_ARTICLES = new Set(["the", "a", "an"]);
const NON_PII_SECTION: Readonly<Record<NonPiiCategory, SelectionReviewSection>> = {
  financial: "financial",
  temporal: "temporal",
  entities: "entities",
  structural: "entities",
  legal: "legal",
  heuristics: "heuristics",
};

function defaultSelectedNonPii(candidate: NonPiiCandidate): boolean {
  return candidate.category !== "legal" && candidate.confidence === 1.0;
}

/** Extra knobs for `applyRedaction`. Mutation still fresh-loads original bytes. */
export interface ApplyOptions {
  readonly placeholder?: string;
  readonly wordCountThresholdPct?: number;
  readonly preflightSurfaces?: VerifySurfaces;
  readonly onRepairing?: () => void;
}

/**
 * Drop a .docx into this and get back the full candidates tree plus
 * file stats. Does NOT mutate `bytes` — the caller holds the original
 * and can re-run analysis any number of times. Internal tests and
 * future engine callers can pass seeds to exercise Lane C propagation;
 * the shipping UI calls this without seeds.
 */
export async function analyzeDocumentSession(
  bytes: Uint8Array,
  seeds: ReadonlyArray<string> = [],
): Promise<DocumentAnalysisSession> {
  const snapshot = await createDocumentAnalysisSnapshot(bytes);
  const analysis = analyzeSnapshot(snapshot, seeds);
  return attachAnalysisToSession(snapshot, analysis);
}

export async function analyzeZip(
  bytes: Uint8Array,
  seeds: ReadonlyArray<string> = [],
): Promise<Analysis> {
  return (await analyzeDocumentSession(bytes, seeds)).analysis;
}

function analyzeSnapshot(
  snapshot: DocumentAnalysisSnapshot,
  seeds: ReadonlyArray<string>,
): Analysis {
  const { fileStats, scopedText } = snapshot;
  const { piiCandidates, nonPiiCandidates } = aggregateAll(scopedText);
  // Variant propagation (Lane C). Join every scope's text once, parse
  // definition clauses, then propagate per seed.
  const corpus = scopedText.map((s) => s.text).join("\n");
  const clauses = parseDefinitionClauses(corpus);
  const entityGroups = seeds.map((seed) =>
    propagateVariants(seed, corpus, clauses),
  );
  const literalCandidates = collectLiteralCandidates(entityGroups);
  const definedCandidates = collectDefinedCandidates(entityGroups);

  const definedTerms = new Set(
    entityGroups.flatMap((group) => group.defined.map((candidate) => candidate.text)),
  );
  const filteredNonPiiCandidates = nonPiiCandidates.filter(
    (candidate) =>
      !definedTerms.has(candidate.text) &&
      !isRoleLikePlaceholder(candidate.text),
  );
  const selectionTargets = buildSelectionTargets([
    ...literalCandidates.map((candidate) =>
      toSelectionOccurrence(candidate.text, {
        sourceKind: "literal",
        reviewSection: "literals",
        defaultSelected: true,
      }),
    ),
    ...definedCandidates.map((candidate) =>
      toSelectionOccurrence(candidate.text, {
        sourceKind: "literal",
        reviewSection: "defined",
        defaultSelected: false,
      }),
    ),
    ...piiCandidates.map((candidate) =>
      toSelectionOccurrence(candidate.text, {
        scope: candidate.scopes[0] ?? null,
        sourceKind: "pii",
        ruleId: `identifiers.${candidate.kind}`,
        reviewSection: "pii",
        defaultSelected: true,
      }),
    ),
    ...filteredNonPiiCandidates.map((candidate) =>
      toSelectionOccurrence(candidate.text, {
        scope: candidate.scopes[0] ?? null,
        sourceKind: "nonPii",
        ruleId: candidate.ruleId,
        reviewSection: NON_PII_SECTION[candidate.category],
        defaultSelected: defaultSelectedNonPii(candidate),
        confidence: candidate.confidence,
      }),
    ),
  ]);
  const selectionTargetById = indexSelectionTargets(selectionTargets);
  const piiCandidatesWithIds = piiCandidates.map((candidate) => ({
    ...candidate,
    selectionTargetId: buildSelectionTargetId("auto", candidate.text),
  }));
  const nonPiiCandidatesWithIds = filteredNonPiiCandidates.map((candidate) => ({
    ...candidate,
    selectionTargetId: buildSelectionTargetId("auto", candidate.text),
  }));

  return {
    entityGroups,
    literalCandidates,
    definedCandidates,
    piiCandidates: piiCandidatesWithIds,
    nonPiiCandidates: nonPiiCandidatesWithIds,
    selectionTargets,
    selectionTargetById,
    manualMatchCorpus: corpus,
    fileStats,
  };
}

/**
 * Return the D9 default selection state: all literals checked, all
 * PII checked, no defined terms checked. This is the initial state of
 * the candidates panel — the user can toggle individual items before
 * clicking Apply.
 *
 * Returns a mutable `Set<string>` so the caller (the state module)
 * can `.add()` and `.delete()` in response to checkbox events without
 * rebuilding the whole set.
 */
export function defaultSelections(analysis: Analysis): Set<SelectionTargetId> {
  return new Set(
    analysis.selectionTargets
      .filter((target) => target.defaultSelected)
      .map((target) => target.id),
  );
}

/**
 * Actually perform the redaction. Reloads the zip from the ORIGINAL
 * bytes — so the caller's copy stays pristine and a second Apply with
 * different selections is always a clean run, not a re-mutation of an
 * already-redacted zip.
 */
export async function applyRedaction(
  bytes: Uint8Array,
  analysis: Analysis,
  selections: ReadonlySet<SelectionTargetId>,
  opts: ApplyOptions = {},
): Promise<GuidedFinalizeReport> {
  const selectedTargets: ReadonlyArray<ResolvedRedactionTarget> =
    resolveSelectedTargets(analysis.selectionTargets, selections);
  const preflightPlan =
    opts.preflightSurfaces === undefined
      ? await buildPreflightExpansionPlan(bytes, selectedTargets)
      : buildPreflightExpansionPlanFromSurfaces(
          opts.preflightSurfaces,
          selectedTargets,
        );
  // Fresh reload every time — see docstring.
  const zip = await loadDocxZip(bytes);
  await applyRelsRepairsToZip(
    zip,
    preflightPlan.relsRepairs,
    opts.placeholder,
  );
  const finalizeOpts: {
    targets: ReadonlyArray<ResolvedRedactionTarget>;
    placeholder?: string;
    wordCountThresholdPct?: number;
  } = {
    targets: preflightPlan.targets,
  };
  if (opts.placeholder !== undefined) {
    finalizeOpts.placeholder = opts.placeholder;
  }
  if (opts.wordCountThresholdPct !== undefined) {
    finalizeOpts.wordCountThresholdPct = opts.wordCountThresholdPct;
  }
  const pass1 = await finalizeRedaction(zip, finalizeOpts);
  if (pass1.verify.isClean) {
    return toGuidedReport(pass1, undefined, undefined, preflightPlan.summary);
  }

  opts.onRepairing?.();
  const guidedParams = {
    originalBytes: bytes,
    selectedTargets: preflightPlan.targets,
    pass1Report: pass1,
    preflightSummary: preflightPlan.summary,
    ...(opts.placeholder !== undefined ? { placeholder: opts.placeholder } : {}),
    ...(opts.wordCountThresholdPct !== undefined
      ? { wordCountThresholdPct: opts.wordCountThresholdPct }
      : {}),
  };
  return runGuidedRecovery(guidedParams);
}

/**
 * Walk every Phase 1 detection result in the extracted scopes and partition it into the
 * legacy `piiCandidates` shape plus the new `nonPiiCandidates` shape.
 */
function aggregateAll(scopedText: readonly ExtractedScopeText[]): {
  piiCandidates: PiiCandidate[];
  nonPiiCandidates: NonPiiCandidate[];
} {
  const { candidates, structuralDefinitions } = detectAllInScopedText(scopedText);

  const piiByText = new Map<
    string,
    { kind: UiPiiKind; count: number; scopes: Scope[] }
  >();
  const nonPiiByText = new Map<
    string,
    {
      ruleId: string;
      category: NonPiiCategory;
      confidence: number;
      count: number;
      scopes: Scope[];
    }
  >();

  for (const entry of candidates) {
    if (entry.candidate.ruleId.startsWith("identifiers.")) {
      foldPiiCandidate(piiByText, entry);
    } else {
      foldNonPiiCandidate(nonPiiByText, entry);
    }
  }

  for (const entry of structuralDefinitions) {
    foldStructuralDefinition(nonPiiByText, entry);
  }

  const piiCandidates = [...piiByText.entries()].map(([text, info]) => ({
    text,
    selectionTargetId: buildSelectionTargetId("auto", text),
    kind: info.kind,
    count: info.count,
    scopes: info.scopes,
  }));

  const nonPiiCandidates = [...nonPiiByText.entries()]
    .map(([text, info]) => ({
      text,
      selectionTargetId: buildSelectionTargetId("auto", text),
      ruleId: info.ruleId,
      category: info.category,
      confidence: info.confidence,
      count: info.count,
      scopes: info.scopes,
    }))
    .sort((a, b) => b.text.length - a.text.length);

  return { piiCandidates, nonPiiCandidates };
}

function detectAllInScopedText(scopedText: readonly ExtractedScopeText[]): {
  candidates: ScopedCandidate[];
  structuralDefinitions: ScopedStructuralDefinition[];
} {
  const candidates: ScopedCandidate[] = [];
  const structuralDefinitions: ScopedStructuralDefinition[] = [];

  for (const { scope, text } of scopedText) {
    const result = detectAll(text);
    for (const candidate of result.candidates) {
      candidates.push({ scope, candidate });
    }
    for (const definition of result.structuralDefinitions) {
      structuralDefinitions.push({ scope, definition });
    }
  }

  return { candidates, structuralDefinitions };
}

function foldPiiCandidate(
  byText: Map<string, { kind: UiPiiKind; count: number; scopes: Scope[] }>,
  entry: ScopedCandidate,
): void {
  const subcategory = entry.candidate.ruleId.slice(
    "identifiers.".length,
  ) as IdentifierSubcategory;
  const kind = IDENTIFIER_SUBCATEGORY_TO_KIND[subcategory];
  if (kind === undefined) {
    throw new Error(`Unknown identifier subcategory: ${subcategory}`);
  }

  const existing = byText.get(entry.candidate.text);
  if (existing === undefined) {
    byText.set(entry.candidate.text, {
      kind,
      count: 1,
      scopes: [entry.scope],
    });
    return;
  }

  existing.count++;
  if (!existing.scopes.some((scope) => scope.path === entry.scope.path)) {
    existing.scopes.push(entry.scope);
  }
}

function foldNonPiiCandidate(
  byText: Map<
    string,
    {
      ruleId: string;
      category: NonPiiCategory;
      confidence: number;
      count: number;
      scopes: Scope[];
    }
  >,
  entry: ScopedCandidate,
): void {
  const category = entry.candidate.ruleId.split(".", 1)[0] as NonPiiCategory;
  const existing = byText.get(entry.candidate.text);
  if (existing === undefined) {
    byText.set(entry.candidate.text, {
      ruleId: entry.candidate.ruleId,
      category,
      confidence: entry.candidate.confidence,
      count: 1,
      scopes: [entry.scope],
    });
    return;
  }

  existing.count++;
  if (!existing.scopes.some((scope) => scope.path === entry.scope.path)) {
    existing.scopes.push(entry.scope);
  }
}

function foldStructuralDefinition(
  byText: Map<
    string,
    {
      ruleId: string;
      category: NonPiiCategory;
      confidence: number;
      count: number;
      scopes: Scope[];
    }
  >,
  entry: ScopedStructuralDefinition,
): void {
  if (entry.definition.referent.length === 0) return;

  const existing = byText.get(entry.definition.referent);
  if (existing === undefined) {
    byText.set(entry.definition.referent, {
      ruleId: `structural.${entry.definition.source}`,
      category: "structural",
      confidence: 1.0,
      count: 1,
      scopes: [entry.scope],
    });
    return;
  }

  existing.count++;
  if (!existing.scopes.some((scope) => scope.path === entry.scope.path)) {
    existing.scopes.push(entry.scope);
  }
}

function isRoleLikePlaceholder(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (ROLE_BLACKLIST_KO.has(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  if (ROLE_BLACKLIST_EN.has(lower)) return true;

  const tokens = lower
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !ENGLISH_ARTICLES.has(token));
  return tokens.length > 0 && tokens.every((token) => ROLE_BLACKLIST_EN.has(token));
}

function collectLiteralCandidates(
  groups: readonly VariantGroup[],
): LiteralCandidate[] {
  const byText = new Map<string, LiteralCandidate>();
  for (const group of groups) {
    for (const candidate of group.literals) {
      if (byText.has(candidate.text)) continue;
      byText.set(candidate.text, {
        text: candidate.text,
        seed: group.seed,
        count: candidate.count,
        selectionTargetId: buildSelectionTargetId("auto", candidate.text),
      });
    }
  }
  return [...byText.values()];
}

function collectDefinedCandidates(
  groups: readonly VariantGroup[],
): DefinedCandidate[] {
  const byText = new Map<string, DefinedCandidate>();
  for (const group of groups) {
    for (const candidate of group.defined) {
      if (byText.has(candidate.text)) continue;
      byText.set(candidate.text, {
        text: candidate.text,
        seed: group.seed,
        count: candidate.count,
        selectionTargetId: buildSelectionTargetId("auto", candidate.text),
      });
    }
  }
  return [...byText.values()];
}

function toSelectionOccurrence(
  text: string,
  options: {
    scope?: Scope | null;
    ruleId?: string | null;
    confidence?: number;
    sourceKind: SelectionOccurrenceInput["sourceKind"];
    reviewSection: SelectionReviewSection;
    defaultSelected: boolean;
  },
): SelectionOccurrenceInput {
  const occurrence: SelectionOccurrenceInput = {
    scope: options.scope ?? null,
    text,
    normalizedText: normalizeForMatching(text).text,
    ruleId: options.ruleId ?? null,
    sourceKind: options.sourceKind,
    reviewSection: options.reviewSection,
    defaultSelected: options.defaultSelected,
  };
  if (options.confidence !== undefined) {
    return { ...occurrence, confidence: options.confidence };
  }
  return occurrence;
}
