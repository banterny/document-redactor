<!--
  Right panel — Phase 2 category review UI.
  Session-log reference ("Finding 1.3 — user insight"):
  parties / identifiers / amounts / dates / case refs / heuristics,
  with per-category manual add for under-cover and uncheck for over-cover.
-->
<script lang="ts">
  import {
    countSelectionTargets,
    type SelectionTarget,
  } from "../selection-targets.js";
  import CategorySection from "./CategorySection.svelte";
  import type { Analysis } from "./engine.ts";
  import {
    IDENTIFIER_SUBCATEGORY_TO_KIND,
    piiKindLabel,
    type IdentifierSubcategory,
  } from "./pii-kinds.js";
  import { appState, type AppPhase } from "./state.svelte.ts";
  import type { ManualCategory } from "./state.svelte.ts";

  type CategoryCandidate = {
    selectionTargetId: string;
    text: string;
    meta: string;
    confidence?: number | undefined;
    isManual: boolean;
    manualCategory?: ManualCategory | undefined;
  };

  type PanelSections = {
    literals: CategoryCandidate[];
    defined: CategoryCandidate[];
    pii: CategoryCandidate[];
    financial: CategoryCandidate[];
    temporal: CategoryCandidate[];
    entities: CategoryCandidate[];
    legal: CategoryCandidate[];
    heuristics: CategoryCandidate[];
    other: CategoryCandidate[];
  };

  type PanelSectionKey = keyof PanelSections;
  type SectionCategory = ManualCategory | "defined" | "pii" | "heuristics";

  type SectionSpec = {
    key: PanelSectionKey;
    label: string;
    subHint: string;
    category: SectionCategory;
    canManualAdd: boolean;
    warnStyle?: boolean;
    alwaysOpenInput?: boolean;
  };

  type Props = { phase: AppPhase };

  const EMPTY_SECTIONS: PanelSections = {
    literals: [],
    defined: [],
    pii: [],
    financial: [],
    temporal: [],
    entities: [],
    legal: [],
    heuristics: [],
    other: [],
  };

  const SECTION_SPECS: readonly SectionSpec[] = [
    {
      key: "literals",
      label: "Parties",
      subHint: "Auto-selected",
      category: "literals",
      canManualAdd: true,
    },
    {
      key: "defined",
      label: "Defined aliases",
      subHint: "Kept as-is by default (D9 readability policy)",
      category: "defined",
      canManualAdd: false,
    },
    {
      key: "pii",
      label: "Identifiers (PII)",
      subHint: "Resident IDs, business IDs, email, phones, bank accounts",
      category: "pii",
      canManualAdd: false,
    },
    {
      key: "financial",
      label: "Amounts",
      subHint: "KRW, USD, foreign currencies, percentages",
      category: "financial",
      canManualAdd: true,
    },
    {
      key: "temporal",
      label: "Dates / periods",
      subHint: "Korean, ISO, English, and duration patterns",
      category: "temporal",
      canManualAdd: true,
    },
    {
      key: "entities",
      label: "Organizations / people",
      subHint: "Company markers, officer titles, signers, structural hints",
      category: "entities",
      canManualAdd: true,
    },
    {
      key: "legal",
      label: "Case / docket refs",
      subHint: "Case numbers and docket labels",
      category: "legal",
      canManualAdd: true,
    },
    {
      key: "heuristics",
      label: "Heuristics (low confidence)",
      subHint: "Heuristic matches that need review before selection",
      category: "heuristics",
      canManualAdd: false,
      warnStyle: true,
    },
    {
      key: "other",
      label: "Other (catch-all)",
      subHint: "Add missed strings manually when detection did not catch them",
      category: "other",
      canManualAdd: true,
      alwaysOpenInput: true,
    },
  ];

  let { phase }: Props = $props();
  let policyInput: HTMLInputElement | null = $state(null);
  let selectedCount = $derived(appState.selections.size);
  let sections = $derived.by(() =>
    phase.kind === "postParse"
      ? buildSections(phase.analysisSession.analysis)
      : EMPTY_SECTIONS,
  );
  let totalCount = $derived.by(() =>
    phase.kind === "postParse"
      ? countSelectionTargets(phase.analysisSession.analysis.selectionTargets)
      : 0,
  );
  let canApply = $derived(phase.kind === "postParse" && selectedCount > 0);

  function formatScopes(scopes: ReadonlyArray<{ kind: string; path: string }>): string {
    return [...new Set(scopes.map((scope) => scope.kind))].join(" · ");
  }

  function ruleSubcategory(ruleId: string): string {
    const [, subcategory = ruleId] = ruleId.split(".", 2);
    return subcategory;
  }

  function unique(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
  }

  function sourceKindLabel(kind: SelectionTarget["sourceKinds"][number]): string {
    switch (kind) {
      case "literal":
        return "literal";
      case "pii":
        return "identifier";
      case "nonPii":
        return "detected";
      case "manual":
        return "manual";
    }
  }

  function ruleLabel(ruleId: string): string {
    if (ruleId.startsWith("identifiers.")) {
      const subcategory = ruleSubcategory(ruleId) as IdentifierSubcategory;
      const kind = IDENTIFIER_SUBCATEGORY_TO_KIND[subcategory];
      if (kind !== undefined) return piiKindLabel(kind);
    }
    return ruleSubcategory(ruleId);
  }

  function targetConfidence(target: SelectionTarget): number | undefined {
    const values = target.occurrences
      .map((occurrence) => occurrence.confidence)
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) return undefined;
    return Math.min(...values);
  }

  function targetMeta(target: SelectionTarget): string {
    const ruleLabels = unique(
      target.occurrences
        .map((occurrence) => occurrence.ruleId)
        .filter((ruleId): ruleId is string => ruleId !== null)
        .map(ruleLabel),
    );
    const sourceLabels = unique(target.sourceKinds.map(sourceKindLabel));
    const scopes = formatScopes(target.scopes);
    const count = target.count > 1 ? `${target.count} matches` : "";
    const primary = ruleLabels.length > 0 ? ruleLabels.join(", ") : sourceLabels.join(", ");
    return [primary, scopes, count].filter((part) => part.length > 0).join(" · ");
  }

  function buildSections(analysis: Analysis): PanelSections {
    const sections: PanelSections = {
      literals: [],
      defined: [],
      pii: [],
      financial: [],
      temporal: [],
      entities: [],
      legal: [],
      heuristics: [],
      other: [],
    };
    const manualCategoryForText = (text: string): ManualCategory | undefined => {
      for (const [category, bucket] of appState.manualAdditions.entries()) {
        if (bucket.has(text)) return category;
      }
      return undefined;
    };

    for (const target of analysis.selectionTargets) {
      sections[target.reviewSection].push(
        toCategoryCandidate(target, manualCategoryForText),
      );
    }

    return sections;
  }

  function toCategoryCandidate(
    target: SelectionTarget,
    manualCategoryForText: (text: string) => ManualCategory | undefined,
  ): CategoryCandidate {
    const candidate: CategoryCandidate = {
      selectionTargetId: target.id,
      text: target.displayText,
      meta: targetMeta(target),
      isManual: target.sourceKinds.includes("manual"),
    };
    const confidence = targetConfidence(target);
    const manualCategory = manualCategoryForText(target.displayText);
    if (confidence !== undefined) {
      candidate.confidence = confidence;
    }
    if (manualCategory !== undefined) {
      candidate.manualCategory = manualCategory;
    }
    return candidate;
  }

  function exportPolicy(): void {
    const json = appState.exportPolicyJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document-redactor.policy.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importPolicy(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    const text = await file.text();
    appState.importPolicyText(text);
    input.value = "";
  }
</script>

<aside class="panel">
  {#if phase.kind === "postParse"}
    <div class="panel-head">
      <h2 class="panel-title">Candidates</h2>
      <p class="panel-sub">Review every string before redaction. Categories below.</p>
      <div class="policy-actions">
        <button class="policy-btn" type="button" onclick={exportPolicy}>
          Export policy
        </button>
        <button
          class="policy-btn"
          type="button"
          onclick={() => policyInput?.click()}
        >
          Import policy
        </button>
        <input
          bind:this={policyInput}
          class="policy-input"
          type="file"
          accept="application/json,.json"
          onchange={(e) => void importPolicy(e)}
        />
      </div>
      {#if appState.policyImportError !== null}
        <p class="policy-message error">{appState.policyImportError}</p>
      {:else if appState.policyStatus !== null}
        <p class="policy-message">{appState.policyStatus}</p>
      {/if}
    </div>

    <div class="panel-body">
      {#each SECTION_SPECS as section (section.key)}
        <CategorySection
          label={section.label}
          subHint={section.subHint}
          category={section.category}
          candidates={sections[section.key]}
          canManualAdd={section.canManualAdd}
          warnStyle={section.warnStyle}
          alwaysOpenInput={section.alwaysOpenInput}
        />
      {/each}
    </div>

    <div class="panel-foot">
      <div class="summary-row">
        <span>Selected</span>
        <strong>{selectedCount} of {totalCount}</strong>
      </div>
      <button
        class="btn-apply"
        type="button"
        disabled={!canApply}
        onclick={() => void appState.applyNow()}
      >
        Apply and verify
      </button>
      <div class="shortcut-hint">⌘↵ apply · drop file to start over</div>
    </div>
  {:else if phase.kind === "idle"}
    <div class="panel-head">
      <h2 class="panel-title">Candidates</h2>
      <p class="panel-sub">
        Drop a file on the left to start. You'll see every sensitive
        string we detected here, grouped and reviewable before redaction.
      </p>
    </div>
  {:else if phase.kind === "parsing"}
    <div class="panel-head">
      <h2 class="panel-title">Candidates</h2>
      <p class="panel-sub">Analyzing…</p>
    </div>
  {:else if phase.kind === "redacting"}
    <div class="panel-head">
      <h2 class="panel-title">Redacting…</h2>
      <p class="panel-sub">
        Cross-run substitution, metadata scrub, round-trip verify.
      </p>
    </div>
  {:else if phase.kind === "repairing"}
    <div class="panel-head">
      <h2 class="panel-title">Auto-repairing…</h2>
      <p class="panel-sub">
        Pass 1 found survivors. Retrying once from the original file.
      </p>
    </div>
  {:else if phase.kind === "downloadReady"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--ok)">Ready to download</h2>
      <p class="panel-sub">
        {phase.report.scopeMutations.length} scopes touched ·
        0 leaks
      </p>
    </div>
  {:else if phase.kind === "downloadRepaired"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--ok)">Auto-repair succeeded</h2>
      <p class="panel-sub">
        {phase.report.repair.repairedSurvivorCount} surviving item(s) repaired ·
        0 leaks
      </p>
    </div>
  {:else if phase.kind === "downloadWarning"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--warn)">Review warning</h2>
      <p class="panel-sub">
        No leaks found. Review {phase.report.warningReasons.length} warning reason(s)
        or download from the main panel.
      </p>
    </div>
  {:else if phase.kind === "downloadRisk"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--err)">
        Residual risk detected
      </h2>
      <p class="panel-sub">
        {phase.report.residualRisk.survivorCount} surviving item(s) remain after
        preflight and automatic repair. Download is available only after explicit
        acknowledgement in the main panel.
      </p>
    </div>
  {:else if phase.kind === "fatalError"}
    <div class="panel-head">
      <h2 class="panel-title">Error</h2>
      <p class="panel-sub">See the main panel for details.</p>
    </div>
  {/if}
</aside>

<style>
  .panel {
    border-left: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    grid-row: 2;
  }

  .panel-head {
    padding: 20px 20px 14px;
    border-bottom: 1px solid var(--border);
  }

  .panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.015em;
    color: var(--ink-strong);
  }

  .panel-sub {
    margin-top: 5px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-soft);
  }

  .policy-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .policy-btn {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    padding: 6px 9px;
    font-size: 12px;
    line-height: 1;
  }

  .policy-btn:hover {
    border-color: var(--primary-border);
    color: var(--primary-ink);
    background: var(--primary-bg);
  }

  .policy-input {
    display: none;
  }

  .policy-message {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.35;
    color: var(--ink-soft);
  }

  .policy-message.error {
    color: var(--err);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-foot {
    padding: 18px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 7px;
    font-size: 12.5px;
    color: var(--ink-soft);
  }

  .summary-row strong {
    color: var(--ink-strong);
    font-weight: 700;
    font-family: var(--mono);
  }

  .btn-apply {
    width: 100%;
    margin-top: 14px;
    padding: 12px 16px;
    border: 1px solid var(--primary);
    border-radius: var(--radius);
    background: var(--primary);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.005em;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.35);
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  }

  .btn-apply:hover:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  }

  .btn-apply:active:not(:disabled) {
    transform: scale(0.98);
  }

  .btn-apply:disabled {
    background: var(--ink-muted);
    border-color: var(--ink-muted);
    box-shadow: none;
    cursor: not-allowed;
  }

  .shortcut-hint {
    margin-top: 10px;
    font-size: 11px;
    text-align: center;
    color: var(--ink-muted);
    font-family: var(--mono);
  }
</style>
