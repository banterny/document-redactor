/**
 * App state — Svelte 5 runes-backed singleton.
 *
 * The UI is a small state machine: one of a handful of discrete phases,
 * each with its own allowed transitions and data. Rather than scatter
 * `$state` declarations across components, we centralize everything in
 * this module and export a single `appState` object components import.
 *
 * Why a module, not a store: Svelte 5's `$state` works in any file
 * ending in `.svelte.ts` (or `.svelte.js`). Exporting a single
 * rune-backed object is the idiomatic replacement for the legacy
 * `writable` store pattern — simpler, better-typed, and it still
 * triggers reactivity in every component that reads it.
 *
 * State phases:
 *
 *   - idle          — nothing loaded. Drop zone is the main affordance.
 *   - parsing       — bytes received, analysis running. Pipeline view.
 *   - postParse     — analysis done, candidates ready for review.
 *   - redacting     — user clicked Apply, pass 1 running. Locked.
 *   - repairing     — pass 1 found survivors; one guided retry is running.
 *   - downloadReady — verify clean, no warning, no repair needed.
 *   - downloadRepaired — guided retry succeeded with no warning left.
 *   - downloadWarning — verify clean, but format/over-redaction warning remains.
 *   - downloadRisk  — sensitive text may still remain; explicit override required.
 *   - fatalError    — something threw before we could render a report.
 *
 * All transitions run through the exported verb functions (`loadFile`,
 * `applyNow`, `reset`, ...) so there's exactly one place to audit the
 * state machine's allowed moves.
 */

import {
  classifyGuidedReport,
  type GuidedFinalizeReport,
} from "../finalize/guided-recovery.js";
import {
  analyzeDocumentSession,
  applyRedaction,
  defaultSelections,
  type Analysis,
} from "./engine.js";
import {
  replaceSessionAnalysis,
  type DocumentAnalysisSession,
} from "./analysis-session.js";
import {
  createPolicyFile,
  parsePolicyFileJson,
  policyEntryKey,
  serializePolicyFile,
  type PolicyCategory,
  type PolicyEntry,
  type PolicyFile,
} from "./policy-file.js";
import {
  buildManualSelectionTarget,
  buildSelectionTargetId,
  type SelectionReviewSection,
  type SelectionTarget,
  type SelectionTargetId,
} from "../selection-targets.js";
import { canDownloadReport, type DownloadPolicyKind } from "./download-policy.js";

/** Discriminated union of every state the app can be in. */
export type AppPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "parsing"; readonly fileName: string }
  | {
      readonly kind: "postParse";
      readonly fileName: string;
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "redacting";
      readonly fileName: string;
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "repairing";
      readonly fileName: string;
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "downloadReady";
      readonly fileName: string;
      readonly report: GuidedFinalizeReport;
      /** Preserved so the user can return to review after a clean pass. */
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "downloadRepaired";
      readonly fileName: string;
      readonly report: GuidedFinalizeReport;
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "downloadWarning";
      readonly fileName: string;
      readonly report: GuidedFinalizeReport;
      /** Preserved so the user can return to review after a warning. */
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "downloadRisk";
      readonly fileName: string;
      readonly report: GuidedFinalizeReport;
      /** Preserved so the user can return to review and fix selections. */
      readonly analysisSession: DocumentAnalysisSession;
    }
  | {
      readonly kind: "fatalError";
      readonly fileName: string | null;
      readonly message: string;
    };

/**
 * Category key for manual candidate additions. Matches the Phase 1
 * `NonPiiCandidate.category` union plus:
 *   - "literals" for entity literal manual additions
 *   - "other" for the catch-all "missed items" bucket (Phase 3.3)
 *
 * Defined term labels have no manual-add affordance.
 */
export type ManualCategory = PolicyCategory;

function createManualAdditions(): Map<ManualCategory, Set<string>> {
  return new Map([
    ["literals", new Set()],
    ["financial", new Set()],
    ["temporal", new Set()],
    ["entities", new Set()],
    ["legal", new Set()],
    ["other", new Set()],
  ]);
}

function createManualSelectionDefaults(): Map<string, boolean> {
  return new Map();
}

export function classifyFinalizedReportPhase(
  report: GuidedFinalizeReport,
): "downloadReady" | "downloadRepaired" | "downloadWarning" | "downloadRisk" {
  return classifyGuidedReport(report);
}

function manualCategoryToSection(
  category: ManualCategory,
): SelectionReviewSection {
  switch (category) {
    case "literals":
      return "literals";
    case "financial":
      return "financial";
    case "temporal":
      return "temporal";
    case "entities":
      return "entities";
    case "legal":
      return "legal";
    case "other":
      return "other";
  }
}

function mergePersistedManualTargets(
  analysis: Analysis,
  manualAdditions: ReadonlyMap<ManualCategory, ReadonlySet<string>>,
  manualSelectionDefaults: ReadonlyMap<string, boolean>,
): { analysis: Analysis; manualSelectionDecisions: Map<SelectionTargetId, boolean> } {
  let selectionTargets = [...analysis.selectionTargets];
  let selectionTargetById = new Map(analysis.selectionTargetById);
  const manualSelectionDecisions = new Map<SelectionTargetId, boolean>();

  for (const [category, values] of manualAdditions.entries()) {
    for (const text of values) {
      const defaultSelected =
        manualSelectionDefaults.get(policyEntryKey({ category, text })) ?? true;
      const autoId = buildSelectionTargetId("auto", text);
      const autoTarget = selectionTargetById.get(autoId);
      if (autoTarget !== undefined) {
        manualSelectionDecisions.set(autoId, defaultSelected);
        if (!autoTarget.sourceKinds.includes("manual")) {
          const merged = {
            ...autoTarget,
            sourceKinds: [...autoTarget.sourceKinds, "manual"] as const,
          };
          ({ selectionTargets, selectionTargetById } = replaceSelectionTarget(
            selectionTargets,
            selectionTargetById,
            merged,
          ));
        }
        continue;
      }

      const manualTarget = buildManualSelectionTarget(
        text,
        manualCategoryToSection(category),
        analysis.manualMatchCorpus,
      );
      if (!selectionTargetById.has(manualTarget.id)) {
        selectionTargets = [...selectionTargets, manualTarget];
        selectionTargetById = new Map(selectionTargetById).set(
          manualTarget.id,
          manualTarget,
        );
      }
      manualSelectionDecisions.set(manualTarget.id, defaultSelected);
    }
  }

  return {
    analysis: {
      ...analysis,
      selectionTargets,
      selectionTargetById,
    },
    manualSelectionDecisions,
  };
}

function ensureManualTarget(
  analysis: Analysis,
  category: ManualCategory,
  text: string,
): { analysis: Analysis; targetId: SelectionTargetId } {
  const autoId = buildSelectionTargetId("auto", text);
  const autoTarget = analysis.selectionTargetById.get(autoId);
  if (autoTarget !== undefined) {
    if (autoTarget.sourceKinds.includes("manual")) {
      return { analysis, targetId: autoId };
    }
    const merged = {
      ...autoTarget,
      sourceKinds: [...autoTarget.sourceKinds, "manual"] as const,
    };
    const next = replaceSelectionTarget(
      analysis.selectionTargets,
      analysis.selectionTargetById,
      merged,
    );
    return {
      analysis: {
        ...analysis,
        selectionTargets: next.selectionTargets,
        selectionTargetById: next.selectionTargetById,
      },
      targetId: autoId,
    };
  }

  const manualTarget = buildManualSelectionTarget(
    text,
    manualCategoryToSection(category),
    analysis.manualMatchCorpus,
  );
  if (analysis.selectionTargetById.has(manualTarget.id)) {
    return { analysis, targetId: manualTarget.id };
  }

  const selectionTargets = [...analysis.selectionTargets, manualTarget];
  const selectionTargetById = new Map(analysis.selectionTargetById).set(
    manualTarget.id,
    manualTarget,
  );
  return {
    analysis: { ...analysis, selectionTargets, selectionTargetById },
    targetId: manualTarget.id,
  };
}

function removeManualTarget(
  analysis: Analysis,
  text: string,
): { analysis: Analysis; targetId: SelectionTargetId; keepSelected: boolean } {
  const autoId = buildSelectionTargetId("auto", text);
  const autoTarget = analysis.selectionTargetById.get(autoId);
  if (autoTarget !== undefined && autoTarget.sourceKinds.includes("manual")) {
    const sourceKinds = autoTarget.sourceKinds.filter((kind) => kind !== "manual");
    const nextTarget = {
      ...autoTarget,
      sourceKinds,
    };
    const next = replaceSelectionTarget(
      analysis.selectionTargets,
      analysis.selectionTargetById,
      nextTarget,
    );
    return {
      analysis: {
        ...analysis,
        selectionTargets: next.selectionTargets,
        selectionTargetById: next.selectionTargetById,
      },
      targetId: autoId,
      keepSelected: autoTarget.defaultSelected,
    };
  }

  const manualId = buildSelectionTargetId("manual", text);
  if (!analysis.selectionTargetById.has(manualId)) {
    return { analysis, targetId: manualId, keepSelected: false };
  }

  const selectionTargets = analysis.selectionTargets.filter(
    (target) => target.id !== manualId,
  );
  const selectionTargetById = new Map(analysis.selectionTargetById);
  selectionTargetById.delete(manualId);
  return {
    analysis: { ...analysis, selectionTargets, selectionTargetById },
    targetId: manualId,
    keepSelected: false,
  };
}

function replaceSelectionTarget(
  selectionTargets: readonly SelectionTarget[],
  selectionTargetById: ReadonlyMap<SelectionTargetId, SelectionTarget>,
  nextTarget: SelectionTarget,
): {
  selectionTargets: SelectionTarget[];
  selectionTargetById: Map<SelectionTargetId, SelectionTarget>;
} {
  return {
    selectionTargets: selectionTargets.map((target) =>
      target.id === nextTarget.id ? nextTarget : target,
    ),
    selectionTargetById: new Map(selectionTargetById).set(nextTarget.id, nextTarget),
  };
}

/** The singleton state object. Mutate via the verb functions below. */
class AppState {
  phase = $state<AppPhase>({ kind: "idle" });

  /**
   * Current checkbox selections — the set of selection target ids the
   * redactor will resolve when Apply is clicked. Mutable on purpose:
   * toggle-in/toggle-out operations hit `.add`/`.delete` directly and
   * Svelte's proxy tracking picks up the change.
   *
   * Empty when phase !== 'postParse'.
   */
  selections = $state<Set<SelectionTargetId>>(new Set());

  /**
   * Manual candidate additions — user-typed strings grouped by category.
   * Persists across re-analyses so a user who adds a missed string once
   * sees it pre-checked when they drop another document.
   */
  manualAdditions = $state<Map<ManualCategory, Set<string>>>(
    createManualAdditions(),
  );

  /**
   * Selection defaults for manual additions, keyed by category + text.
   * UI-created additions default to selected; imported policy entries can
   * intentionally restore an unchecked manual candidate.
   */
  manualSelectionDefaults = $state<Map<string, boolean>>(
    createManualSelectionDefaults(),
  );

  /** Last local policy import/export status shown in the review panel. */
  policyStatus = $state<string | null>(null);
  policyImportError = $state<string | null>(null);

  /**
   * Focused selection target id — set when the user clicks the jump-to
   * affordance in the candidates list or review banner. The rendered
   * document body watches this and scrolls the first matching mark into view.
   */
  focusedCandidate = $state<SelectionTargetId | null>(null);

  /** Dirty-output override acknowledgement. Only meaningful in downloadRisk. */
  residualRiskAcknowledged = $state(false);

  private focusClearTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Verbs ────────────────────────────────────────────────────────

  async loadFile(file: File): Promise<void> {
    this.phase = { kind: "parsing", fileName: file.name };
    this.residualRiskAcknowledged = false;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const analyzedSession = await analyzeDocumentSession(bytes);
      const { analysis, manualSelectionDecisions } = mergePersistedManualTargets(
        analyzedSession.analysis,
        this.manualAdditions,
        this.manualSelectionDefaults,
      );
      const analysisSession = replaceSessionAnalysis(analyzedSession, analysis);
      const baseSelections = defaultSelections(analysis);
      for (const [id, selected] of manualSelectionDecisions) {
        if (selected) {
          baseSelections.add(id);
        } else {
          baseSelections.delete(id);
        }
      }
      this.selections = baseSelections;
      this.phase = {
        kind: "postParse",
        fileName: file.name,
        analysisSession,
      };
    } catch (err) {
      this.phase = {
        kind: "fatalError",
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  toggleSelection(targetId: SelectionTargetId): void {
    if (this.phase.kind !== "postParse") return;
    const target = this.phase.analysisSession.analysis.selectionTargetById.get(targetId);
    let selected: boolean;
    if (this.selections.has(targetId)) {
      this.selections.delete(targetId);
      selected = false;
    } else {
      this.selections.add(targetId);
      selected = true;
    }
    if (target?.sourceKinds.includes("manual") === true) {
      this.rememberManualSelectionDefault(target.displayText, selected);
    }
    // Defensive reactivity: plain Set mutations do not reliably trigger
    // Svelte 5 re-renders across runtime versions. Reassign the reference
    // so proxied subscribers (row class:on, aria-pressed, <mark> state,
    // footer count) update. Matches the pattern already used by
    // addManualCandidate / removeManualCandidate below.
    this.selections = new Set(this.selections);
  }

  isSelected(targetId: SelectionTargetId): boolean {
    return this.selections.has(targetId);
  }

  addManualCandidate(category: ManualCategory, text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > 200) return;
    const bucket = this.manualAdditions.get(category);
    if (bucket === undefined) return;
    if (bucket.has(trimmed)) return;
    bucket.add(trimmed);
    this.manualSelectionDefaults.set(policyEntryKey({ category, text: trimmed }), true);
    if (this.phase.kind === "postParse") {
      const ensured = ensureManualTarget(
        this.phase.analysisSession.analysis,
        category,
        trimmed,
      );
      this.phase = {
        ...this.phase,
        analysisSession: replaceSessionAnalysis(
          this.phase.analysisSession,
          ensured.analysis,
        ),
      };
      this.selections.add(ensured.targetId);
    }
    this.manualAdditions = new Map(this.manualAdditions);
    this.manualSelectionDefaults = new Map(this.manualSelectionDefaults);
    this.selections = new Set(this.selections);
  }

  removeManualCandidate(category: ManualCategory, text: string): void {
    const bucket = this.manualAdditions.get(category);
    if (bucket === undefined) return;
    if (!bucket.has(text)) return;
    bucket.delete(text);
    this.manualSelectionDefaults.delete(policyEntryKey({ category, text }));
    if (this.phase.kind === "postParse") {
      const removed = removeManualTarget(
        this.phase.analysisSession.analysis,
        text,
      );
      this.phase = {
        ...this.phase,
        analysisSession: replaceSessionAnalysis(
          this.phase.analysisSession,
          removed.analysis,
        ),
      };
      if (!removed.keepSelected) {
        this.selections.delete(removed.targetId);
      }
    } else {
      this.selections.delete(buildSelectionTargetId("manual", text));
      this.selections.delete(buildSelectionTargetId("auto", text));
    }
    this.manualAdditions = new Map(this.manualAdditions);
    this.manualSelectionDefaults = new Map(this.manualSelectionDefaults);
    this.selections = new Set(this.selections);
  }

  exportPolicyJson(name = "Document redaction policy"): string {
    const entries: PolicyEntry[] = [];
    for (const [category, values] of this.manualAdditions.entries()) {
      for (const text of values) {
        entries.push({
          text,
          category,
          defaultSelected: this.manualSelectionDefaultFor(category, text),
        });
      }
    }
    const policy = createPolicyFile(entries, { name });
    this.policyStatus = `Exported ${policy.entries.length} policy item(s).`;
    this.policyImportError = null;
    return serializePolicyFile(policy);
  }

  importPolicyText(json: string): PolicyFile | null {
    let policy: PolicyFile;
    try {
      policy = parsePolicyFileJson(json);
    } catch (err) {
      this.policyImportError = err instanceof Error ? err.message : String(err);
      this.policyStatus = null;
      return null;
    }

    this.applyPolicy(policy);
    this.policyImportError = null;
    this.policyStatus = `Imported ${policy.entries.length} policy item(s).`;
    return policy;
  }

  private applyPolicy(policy: PolicyFile): void {
    let nextAnalysis =
      this.phase.kind === "postParse" ? this.phase.analysisSession.analysis : null;

    for (const entry of policy.entries) {
      const bucket = this.manualAdditions.get(entry.category);
      if (bucket === undefined) continue;
      bucket.add(entry.text);
      this.manualSelectionDefaults.set(policyEntryKey(entry), entry.defaultSelected);

      if (nextAnalysis !== null && this.phase.kind === "postParse") {
        const ensured = ensureManualTarget(nextAnalysis, entry.category, entry.text);
        nextAnalysis = ensured.analysis;
        if (entry.defaultSelected) {
          this.selections.add(ensured.targetId);
        } else {
          this.selections.delete(ensured.targetId);
        }
      }
    }

    if (nextAnalysis !== null && this.phase.kind === "postParse") {
      this.phase = {
        ...this.phase,
        analysisSession: replaceSessionAnalysis(
          this.phase.analysisSession,
          nextAnalysis,
        ),
      };
    }
    this.manualAdditions = new Map(this.manualAdditions);
    this.manualSelectionDefaults = new Map(this.manualSelectionDefaults);
    this.selections = new Set(this.selections);
  }

  private manualSelectionDefaultFor(
    category: ManualCategory,
    text: string,
  ): boolean {
    if (this.phase.kind === "postParse") {
      const analysis = this.phase.analysisSession.analysis;
      const autoId = buildSelectionTargetId("auto", text);
      if (analysis.selectionTargetById.has(autoId)) {
        return this.selections.has(autoId);
      }
      const manualId = buildSelectionTargetId("manual", text);
      if (analysis.selectionTargetById.has(manualId)) {
        return this.selections.has(manualId);
      }
    }
    return this.manualSelectionDefaults.get(policyEntryKey({ category, text })) ?? true;
  }

  private rememberManualSelectionDefault(text: string, selected: boolean): void {
    for (const [category, bucket] of this.manualAdditions.entries()) {
      if (!bucket.has(text)) continue;
      this.manualSelectionDefaults.set(policyEntryKey({ category, text }), selected);
      this.manualSelectionDefaults = new Map(this.manualSelectionDefaults);
      return;
    }
  }

  jumpToCandidate(targetId: SelectionTargetId): void {
    this.focusedCandidate = targetId;
    if (this.focusClearTimer !== null) {
      clearTimeout(this.focusClearTimer);
    }
    this.focusClearTimer = setTimeout(() => {
      this.focusedCandidate = null;
      this.focusClearTimer = null;
    }, 1200);
  }

  async applyNow(): Promise<void> {
    if (this.phase.kind !== "postParse") return;
    const { fileName, analysisSession } = this.phase;
    const { bytes, analysis } = analysisSession;
    this.residualRiskAcknowledged = false;
    this.phase = { kind: "redacting", fileName, analysisSession };

    try {
      const report = await applyRedaction(bytes, analysis, this.selections, {
        preflightSurfaces: analysisSession.verifySurfaces,
        onRepairing: () => {
          this.phase = { kind: "repairing", fileName, analysisSession };
        },
      });
      const nextPhase = classifyFinalizedReportPhase(report);
      if (nextPhase === "downloadRisk") {
        this.phase = { kind: "downloadRisk", fileName, report, analysisSession };
      } else if (nextPhase === "downloadWarning") {
        this.phase = { kind: "downloadWarning", fileName, report, analysisSession };
      } else if (nextPhase === "downloadRepaired") {
        this.phase = { kind: "downloadRepaired", fileName, report, analysisSession };
      } else {
        this.phase = { kind: "downloadReady", fileName, report, analysisSession };
      }
    } catch (err) {
      this.phase = {
        kind: "fatalError",
        fileName,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Return to the review panel from any post-redaction outcome state.
   * Preserves the user's selections + manualAdditions so they can adjust
   * and retry without re-analyzing the file. The analysis session is
   * carried in the phase object (see AppPhase) specifically to make this
   * round-trip possible.
   */
  backToReview(): void {
    if (
      this.phase.kind !== "downloadRisk" &&
      this.phase.kind !== "downloadWarning" &&
      this.phase.kind !== "downloadReady" &&
      this.phase.kind !== "downloadRepaired"
    ) {
      return;
    }
    const { fileName, analysisSession } = this.phase;
    this.residualRiskAcknowledged = false;
    this.phase = { kind: "postParse", fileName, analysisSession };
  }

  reviewCandidate(targetId: SelectionTargetId): void {
    if (
      this.phase.kind !== "downloadRisk" &&
      this.phase.kind !== "downloadWarning" &&
      this.phase.kind !== "downloadReady" &&
      this.phase.kind !== "downloadRepaired"
    ) {
      return;
    }
    const { fileName, analysisSession } = this.phase;
    this.residualRiskAcknowledged = false;
    this.phase = { kind: "postParse", fileName, analysisSession };
    if (analysisSession.analysis.selectionTargetById.has(targetId)) {
      this.jumpToCandidate(targetId);
    }
  }

  setResidualRiskAcknowledged(next: boolean): void {
    this.residualRiskAcknowledged = this.phase.kind === "downloadRisk" ? next : false;
  }

  canDownloadCurrentReport(): boolean {
    let policyKind: DownloadPolicyKind;
    switch (this.phase.kind) {
      case "downloadReady":
      case "downloadRepaired":
        policyKind = "strictClean";
        break;
      case "downloadWarning":
        policyKind = "warning";
        break;
      case "downloadRisk":
        policyKind = "risk";
        break;
      default:
        return false;
    }
    return canDownloadReport(policyKind, this.residualRiskAcknowledged);
  }

  reset(): void {
    this.phase = { kind: "idle" };
    this.selections = new Set();
    this.manualAdditions = createManualAdditions();
    this.manualSelectionDefaults = createManualSelectionDefaults();
    this.focusedCandidate = null;
    this.residualRiskAcknowledged = false;
    this.policyStatus = null;
    this.policyImportError = null;
    if (this.focusClearTimer !== null) {
      clearTimeout(this.focusClearTimer);
      this.focusClearTimer = null;
    }
  }

}

/** The one global state instance — import this from every component. */
export const appState = new AppState();
