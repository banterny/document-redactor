import { normalizeForMatching } from "./detection/normalize.js";
import type { Scope } from "./docx/types.js";

export type SelectionTargetId = string;
export type SelectionTargetNamespace = "auto" | "manual";
export type SelectionSourceKind = "pii" | "nonPii" | "literal" | "manual";
export type SelectionReviewSection =
  | "literals"
  | "defined"
  | "pii"
  | "financial"
  | "temporal"
  | "entities"
  | "legal"
  | "heuristics"
  | "other";

export interface SelectionOccurrence {
  readonly scope: Scope | null;
  readonly text: string;
  readonly normalizedText: string;
  readonly ruleId: string | null;
  readonly confidence?: number;
  readonly sourceKind: SelectionSourceKind;
  readonly reviewSection: SelectionReviewSection;
  readonly defaultSelected: boolean;
}

export interface SelectionTarget {
  readonly id: SelectionTargetId;
  readonly displayText: string;
  readonly normalizedText: string;
  readonly literalVariants: readonly string[];
  readonly occurrences: readonly SelectionOccurrence[];
  readonly scopes: readonly Scope[];
  readonly count: number;
  readonly sourceKinds: readonly SelectionSourceKind[];
  readonly reviewSection: SelectionReviewSection;
  readonly defaultSelected: boolean;
}

export interface ResolvedRedactionTarget {
  readonly id: SelectionTargetId;
  readonly displayText: string;
  readonly redactionLiterals: readonly string[];
  readonly verificationLiterals: readonly string[];
  readonly scopes: readonly Scope[];
}

export type SelectionOccurrenceInput =
  Omit<SelectionOccurrence, "reviewSection" | "defaultSelected"> &
    Partial<Pick<SelectionOccurrence, "reviewSection" | "defaultSelected">>;

const REVIEW_SECTION_PRIORITY: Readonly<Record<SelectionReviewSection, number>> = {
  literals: 0,
  defined: 1,
  pii: 2,
  financial: 3,
  temporal: 4,
  entities: 5,
  legal: 6,
  heuristics: 7,
  other: 8,
};

export function buildSelectionTargetId(
  namespace: SelectionTargetNamespace,
  displayText: string,
): SelectionTargetId {
  return `${namespace}:${stableHash(displayText)}`;
}

export function buildSelectionTargets(
  inputs: readonly SelectionOccurrenceInput[],
): SelectionTarget[] {
  const buckets = new Map<
    string,
    {
      namespace: SelectionTargetNamespace;
      displayText: string;
      occurrences: SelectionOccurrence[];
      literalVariants: string[];
      scopes: Scope[];
      sourceKinds: SelectionSourceKind[];
      reviewSection: SelectionReviewSection;
      defaultSelected: boolean;
    }
  >();

  for (const input of inputs) {
    const occurrence = normalizeOccurrence(input);
    const namespace = occurrence.sourceKind === "manual" ? "manual" : "auto";
    const key = `${namespace}\0${occurrence.text}`;
    const existing = buckets.get(key);

    if (existing === undefined) {
      buckets.set(key, {
        namespace,
        displayText: occurrence.text,
        occurrences: [occurrence],
        literalVariants: occurrence.text.length === 0 ? [] : [occurrence.text],
        scopes: occurrence.scope === null ? [] : [occurrence.scope],
        sourceKinds: [occurrence.sourceKind],
        reviewSection: occurrence.reviewSection,
        defaultSelected: occurrence.defaultSelected,
      });
      continue;
    }

    existing.occurrences.push(occurrence);
    if (
      occurrence.text.length > 0 &&
      !existing.literalVariants.includes(occurrence.text)
    ) {
      existing.literalVariants.push(occurrence.text);
    }
    if (
      occurrence.scope !== null &&
      !existing.scopes.some((scope) => scope.path === occurrence.scope!.path)
    ) {
      existing.scopes.push(occurrence.scope);
    }
    if (!existing.sourceKinds.includes(occurrence.sourceKind)) {
      existing.sourceKinds.push(occurrence.sourceKind);
    }
    if (
      REVIEW_SECTION_PRIORITY[occurrence.reviewSection] <
      REVIEW_SECTION_PRIORITY[existing.reviewSection]
    ) {
      existing.reviewSection = occurrence.reviewSection;
    }
    if (occurrence.defaultSelected) {
      existing.defaultSelected = true;
    }
  }

  const targets = [...buckets.values()].map((bucket) => ({
    id: buildSelectionTargetId(bucket.namespace, bucket.displayText),
    displayText: bucket.displayText,
    normalizedText: normalizeForMatching(bucket.displayText).text,
    literalVariants: bucket.literalVariants,
    occurrences: bucket.occurrences,
    scopes: bucket.scopes,
    count: bucket.occurrences.length,
    sourceKinds: bucket.sourceKinds,
    reviewSection: bucket.reviewSection,
    defaultSelected: bucket.defaultSelected,
  }));
  assertNoSelectionTargetIdCollisions(targets);
  return targets;
}

export function indexSelectionTargets(
  targets: readonly SelectionTarget[],
): ReadonlyMap<SelectionTargetId, SelectionTarget> {
  return new Map(targets.map((target) => [target.id, target] as const));
}

export function countSelectionTargets(
  targets: readonly SelectionTarget[],
): number {
  return targets.length;
}

export function assertNoSelectionTargetIdCollisions(
  targets: readonly Pick<SelectionTarget, "id" | "displayText">[],
): void {
  const seen = new Map<SelectionTargetId, string>();
  for (const target of targets) {
    const previous = seen.get(target.id);
    if (previous === undefined) {
      seen.set(target.id, target.displayText);
      continue;
    }
    if (previous !== target.displayText) {
      throw new Error(
        `Selection target id collision for ${target.id}: "${previous}" vs "${target.displayText}"`,
      );
    }
  }
}

export function resolveSelectedTargets(
  targets: readonly SelectionTarget[],
  selections: ReadonlySet<SelectionTargetId>,
): ResolvedRedactionTarget[] {
  const index = indexSelectionTargets(targets);
  const resolved: ResolvedRedactionTarget[] = [];

  for (const id of selections) {
    const target = index.get(id);
    if (target === undefined) {
      throw new Error(`resolveSelectedTargets: unknown selection target id: ${id}`);
    }
    const literals = sortLongestFirstUnique(target.literalVariants);
    resolved.push({
      id: target.id,
      displayText: target.displayText,
      redactionLiterals: literals,
      verificationLiterals: literals,
      scopes: target.scopes,
    });
  }

  return resolved;
}

export function buildResolvedTargetsFromStrings(
  texts: readonly string[],
): ResolvedRedactionTarget[] {
  return sortLongestFirstUnique(texts)
    .filter((text) => text.length > 0)
    .map((text) => ({
      id: buildSelectionTargetId("auto", text),
      displayText: text,
      redactionLiterals: [text],
      verificationLiterals: [text],
      scopes: [],
    }));
}

export function buildManualSelectionTarget(
  text: string,
  reviewSection: SelectionReviewSection = "other",
  matchCorpus?: string,
): SelectionTarget {
  const target = buildSelectionTargets([
    {
      scope: null,
      text,
      normalizedText: normalizeForMatching(text).text,
      ruleId: null,
      sourceKind: "manual",
      reviewSection,
      defaultSelected: true,
    },
  ])[0]!;

  const corpusLiterals = findOriginalLiteralVariants(text, matchCorpus);
  if (corpusLiterals.length === 0) return target;

  return {
    ...target,
    literalVariants: sortLongestFirstUnique([
      ...target.literalVariants,
      ...corpusLiterals,
    ]),
  };
}

export function findOriginalLiteralVariants(
  text: string,
  matchCorpus?: string,
): string[] {
  if (matchCorpus === undefined || matchCorpus.length === 0) return [];

  const normalizedNeedle = normalizeForMatching(text).text;
  if (normalizedNeedle.length === 0) return [];

  const normalizedCorpus = normalizeForMatching(matchCorpus);
  const variants = new Set<string>();
  let from = 0;

  while (from <= normalizedCorpus.text.length - normalizedNeedle.length) {
    const idx = normalizedCorpus.text.indexOf(normalizedNeedle, from);
    if (idx < 0) break;

    const start = normalizedCorpus.origOffsets[idx];
    const end = normalizedCorpus.origOffsets[idx + normalizedNeedle.length];
    if (start === undefined || end === undefined) break;

    const original = matchCorpus.slice(start, end);
    if (original.length > 0) {
      variants.add(original);
    }
    from = idx + 1;
  }

  return [...variants];
}

function normalizeOccurrence(input: SelectionOccurrenceInput): SelectionOccurrence {
  const occurrence: SelectionOccurrence = {
    scope: input.scope,
    text: input.text,
    normalizedText: input.normalizedText,
    ruleId: input.ruleId,
    sourceKind: input.sourceKind,
    reviewSection: input.reviewSection ?? defaultReviewSection(input.sourceKind),
    defaultSelected: input.defaultSelected ?? defaultSelected(input.sourceKind),
  };
  if (input.confidence !== undefined) {
    return { ...occurrence, confidence: input.confidence };
  }
  return occurrence;
}

function defaultReviewSection(
  sourceKind: SelectionSourceKind,
): SelectionReviewSection {
  switch (sourceKind) {
    case "pii":
      return "pii";
    case "manual":
      return "other";
    case "literal":
      return "literals";
    case "nonPii":
      return "entities";
  }
}

function defaultSelected(sourceKind: SelectionSourceKind): boolean {
  return sourceKind !== "manual";
}

function sortLongestFirstUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
}

function stableHash(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
