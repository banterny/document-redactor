/**
 * UI engine wrapper — the single module every Svelte component touches
 * for data.
 *
 * The raw Lane A/C/D modules are pure functions with narrow contracts:
 * `buildTargetsFromZip`, `propagateVariants`, `finalizeRedaction`, etc.
 * The UI needs a coarser API that matches how a user interacts with
 * the app:
 *
 *   1. **analyzeZip(bytes, seeds)** — drop a file, get back the full
 *      candidates tree (literals, defined terms, PII) plus file stats
 *      for the header pill row. Does NOT mutate the bytes.
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

import JSZip from "jszip";

import {
  detectAllInZip,
  type ScopedCandidate,
  type ScopedStructuralDefinition,
} from "../detection/detect-all.js";
import { extractTextFromZip } from "../detection/extract-text.js";
import { ROLE_BLACKLIST_EN } from "../detection/rules/role-blacklist-en.js";
import { ROLE_BLACKLIST_KO } from "../detection/rules/role-blacklist-ko.js";
import { listScopes } from "../docx/scopes.js";
import type { Scope } from "../docx/types.js";
import {
  finalizeRedaction,
  type FinalizedReport,
} from "../finalize/finalize.js";
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

/** Aggregated PII candidate — one per unique text, with scope + count info. */
export interface PiiCandidate {
  /** The literal substring to redact. */
  readonly text: string;
  /** Which regex category detected it (email, phone-kr, rrn, ...). */
  readonly kind: UiPiiKind;
  /** Total occurrences across every scope. */
  readonly count: number;
  /** Distinct scopes this candidate appeared in. */
  readonly scopes: ReadonlyArray<Scope>;
}

/** High-level file stats shown in the main header pill row. */
export interface FileStats {
  readonly sizeBytes: number;
  readonly scopeCount: number;
}

export interface NonPiiCandidate {
  readonly text: string;
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
  /** Deduped PII candidates across every scope. */
  readonly piiCandidates: ReadonlyArray<PiiCandidate>;
  /** Deduped Phase 1 non-PII candidates across every scope. */
  readonly nonPiiCandidates: ReadonlyArray<NonPiiCandidate>;
  readonly fileStats: FileStats;
}

type NonPiiCategory = NonPiiCandidate["category"];
const ENGLISH_ARTICLES = new Set(["the", "a", "an"]);

/** Extra knobs for `applyRedaction`. Mirrors `FinalizeOptions`. */
export interface ApplyOptions {
  readonly placeholder?: string;
  readonly wordCountThresholdPct?: number;
}

/**
 * Drop a .docx into this and get back the full candidates tree plus
 * file stats. Does NOT mutate `bytes` — the caller holds the original
 * and can re-run analysis any number of times (e.g. when the user
 * changes the seed list).
 */
export async function analyzeZip(
  bytes: Uint8Array,
  seeds: ReadonlyArray<string>,
): Promise<Analysis> {
  // Copy into a fresh ArrayBuffer so JSZip can't retain a reference into
  // whatever the caller handed us. Avoids subtle bugs where a second
  // call to analyzeZip sees mutations JSZip made to the underlying
  // buffer during its own processing.
  const zip = await JSZip.loadAsync(bytes.slice());

  // File stats — size of the input + number of text-bearing scopes.
  // sizeBytes comes from the caller's view (the bytes they actually
  // dropped); scopeCount comes from the walker that Lane B uses.
  const fileStats: FileStats = {
    sizeBytes: bytes.length,
    scopeCount: listScopes(zip).length,
  };

  // PII sweep (Lane A). Aggregate matches by literal text so the UI
  // can show one candidate per unique string with a total count and
  // the list of scopes it appeared in.
  const { piiCandidates, nonPiiCandidates } = await aggregateAll(zip);

  // Variant propagation (Lane C). Join every scope's text once, parse
  // definition clauses, then propagate per seed.
  const scopedText = await extractTextFromZip(zip);
  const corpus = scopedText.map((s) => s.text).join("\n");
  const clauses = parseDefinitionClauses(corpus);
  const entityGroups = seeds.map((seed) =>
    propagateVariants(seed, corpus, clauses),
  );

  const definedTerms = new Set(
    entityGroups.flatMap((group) => group.defined.map((candidate) => candidate.text)),
  );
  const filteredNonPiiCandidates = nonPiiCandidates.filter(
    (candidate) =>
      !definedTerms.has(candidate.text) &&
      !isRoleLikePlaceholder(candidate.text),
  );

  return {
    entityGroups,
    piiCandidates,
    nonPiiCandidates: filteredNonPiiCandidates,
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
export function defaultSelections(analysis: Analysis): Set<string> {
  const out = new Set<string>();
  for (const group of analysis.entityGroups) {
    for (const cand of group.literals) {
      out.add(cand.text);
    }
  }
  for (const pii of analysis.piiCandidates) {
    out.add(pii.text);
  }
  for (const candidate of analysis.nonPiiCandidates) {
    if (candidate.confidence === 1.0) {
      out.add(candidate.text);
    }
  }
  return out;
}

/**
 * Actually perform the redaction. Reloads the zip from the ORIGINAL
 * bytes — so the caller's copy stays pristine and a second Apply with
 * different selections is always a clean run, not a re-mutation of an
 * already-redacted zip.
 */
export async function applyRedaction(
  bytes: Uint8Array,
  selections: ReadonlySet<string>,
  opts: ApplyOptions = {},
): Promise<FinalizedReport> {
  // Fresh reload every time — see docstring.
  const zip = await JSZip.loadAsync(bytes.slice());
  const targets = [...selections];
  const finalizeOpts: {
    targets: ReadonlyArray<string>;
    placeholder?: string;
    wordCountThresholdPct?: number;
  } = { targets };
  if (opts.placeholder !== undefined) {
    finalizeOpts.placeholder = opts.placeholder;
  }
  if (opts.wordCountThresholdPct !== undefined) {
    finalizeOpts.wordCountThresholdPct = opts.wordCountThresholdPct;
  }
  return finalizeRedaction(zip, finalizeOpts);
}

/**
 * Walk every Phase 1 detection result in the zip and partition it into the
 * legacy `piiCandidates` shape plus the new `nonPiiCandidates` shape.
 */
async function aggregateAll(zip: JSZip): Promise<{
  piiCandidates: PiiCandidate[];
  nonPiiCandidates: NonPiiCandidate[];
}> {
  const { candidates, structuralDefinitions } = await detectAllInZip(zip);

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
    kind: info.kind,
    count: info.count,
    scopes: info.scopes,
  }));

  const nonPiiCandidates = [...nonPiiByText.entries()]
    .map(([text, info]) => ({
      text,
      ruleId: info.ruleId,
      category: info.category,
      confidence: info.confidence,
      count: info.count,
      scopes: info.scopes,
    }))
    .sort((a, b) => b.text.length - a.text.length);

  return { piiCandidates, nonPiiCandidates };
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
