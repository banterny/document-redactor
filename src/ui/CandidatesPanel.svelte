<!--
  Right panel — Phase 2 category review UI.
  Session-log reference ("Finding 1.3 — user insight"):
  당사자 / 식별번호 / 금액 / 날짜·기간 / 법원·사건 / 추측,
  with per-category "+ 추가" for under-cover and uncheck for over-cover.
-->
<script lang="ts">
  import CategorySection from "./CategorySection.svelte";
  import type { Analysis } from "./engine.ts";
  import { piiKindLabel } from "./pii-kinds.js";
  import { appState, type AppPhase } from "./state.svelte.ts";
  import type { ManualCategory } from "./state.svelte.ts";

  type CategoryCandidate = {
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
      label: "당사자",
      subHint: "Auto-selected · 자동 선택됨",
      category: "literals",
      canManualAdd: true,
    },
    {
      key: "defined",
      label: "정의된 대리어",
      subHint: "Kept as-is by default (D9 정책 — 독해성 유지)",
      category: "defined",
      canManualAdd: false,
    },
    {
      key: "pii",
      label: "식별번호 (PII)",
      subHint: "주민번호 · 사업자번호 · 이메일 · 계좌 — 자동 검출",
      category: "pii",
      canManualAdd: false,
    },
    {
      key: "financial",
      label: "금액",
      subHint: "한화 · USD · 외화 · 백분율 — Phase 1 financial rules",
      category: "financial",
      canManualAdd: true,
    },
    {
      key: "temporal",
      label: "날짜 / 기간",
      subHint: "한국식 · ISO · 영문 · 기간 — Phase 1 temporal rules",
      category: "temporal",
      canManualAdd: true,
    },
    {
      key: "entities",
      label: "법인 / 인물",
      subHint: "주식회사 · 대표이사 · 서명자 — Phase 1 entities + structural",
      category: "entities",
      canManualAdd: true,
    },
    {
      key: "legal",
      label: "법원 / 사건",
      subHint: "사건번호 · 법원명 · 법령 · 판례 — Phase 1 legal rules",
      category: "legal",
      canManualAdd: true,
    },
    {
      key: "heuristics",
      label: "추측 (낮은 신뢰도)",
      subHint: "휴리스틱 감지 — 검토 후 체크하세요",
      category: "heuristics",
      canManualAdd: false,
      warnStyle: true,
    },
    {
      key: "other",
      label: "기타 (그 외)",
      subHint: "자동 감지에서 누락된 항목 — 직접 입력해서 redaction 대상에 추가",
      category: "other",
      canManualAdd: true,
      alwaysOpenInput: true,
    },
  ];

  let { phase }: Props = $props();
  let selectedCount = $derived(appState.selections.size);
  let sections = $derived.by(() =>
    phase.kind === "postParse" ? buildSections(phase.analysis) : EMPTY_SECTIONS,
  );
  let totalCount = $derived(
    sections.literals.length +
      sections.defined.length +
      sections.pii.length +
      sections.financial.length +
      sections.temporal.length +
      sections.entities.length +
      sections.legal.length +
      sections.heuristics.length +
      sections.other.length,
  );
  let canApply = $derived(phase.kind === "postParse" && selectedCount > 0);

  function formatScopes(scopes: ReadonlyArray<{ kind: string; path: string }>): string {
    return [...new Set(scopes.map((scope) => scope.kind))].join(" · ");
  }

  function ruleSubcategory(ruleId: string): string {
    const [, subcategory = ruleId] = ruleId.split(".", 2);
    return subcategory;
  }

  function buildSections(analysis: Analysis): PanelSections {
    const seen = new Set<string>();
    const push = (out: CategoryCandidate[], candidate: CategoryCandidate): void => {
      if (seen.has(candidate.text)) return;
      seen.add(candidate.text);
      out.push(candidate);
    };
    const appendManual = (out: CategoryCandidate[], category: ManualCategory): void => {
      const bucket = appState.manualAdditions.get(category);
      if (bucket === undefined) return;
      for (const text of bucket) {
        push(out, { text, meta: "manual", isManual: true, manualCategory: category });
      }
    };
    const collectNonPii = (
      categories: readonly Analysis["nonPiiCandidates"][number]["category"][],
      manualCategory?: ManualCategory,
    ): CategoryCandidate[] => {
      const out: CategoryCandidate[] = [];
      const allowed = new Set(categories);
      for (const candidate of analysis.nonPiiCandidates) {
        if (!allowed.has(candidate.category)) continue;
        push(out, {
          text: candidate.text,
          meta: `${ruleSubcategory(candidate.ruleId)} · ${formatScopes(candidate.scopes)}`,
          confidence: candidate.confidence,
          isManual: false,
        });
      }
      if (manualCategory !== undefined) appendManual(out, manualCategory);
      return out;
    };

    const literals: CategoryCandidate[] = [];
    for (const group of analysis.entityGroups) {
      for (const candidate of group.literals) {
        push(literals, {
          text: candidate.text,
          meta: `literal · ${group.seed}`,
          isManual: false,
        });
      }
    }
    appendManual(literals, "literals");

    const defined: CategoryCandidate[] = [];
    for (const group of analysis.entityGroups) {
      for (const candidate of group.defined) {
        push(defined, {
          text: candidate.text,
          meta: `from definition · ${group.seed}`,
          isManual: false,
        });
      }
    }

    const pii: CategoryCandidate[] = [];
    for (const candidate of analysis.piiCandidates) {
      push(pii, {
        text: candidate.text,
        meta: `${piiKindLabel(candidate.kind)} · ${formatScopes(candidate.scopes)}`,
        isManual: false,
      });
    }

    // "기타 (그 외)" — catch-all bucket. No engine-detected rows; only
    // user-typed entries via the section's AddCandidateInput. These still
    // count toward the redaction target set.
    const other: CategoryCandidate[] = [];
    appendManual(other, "other");

    return {
      literals,
      defined,
      pii,
      financial: collectNonPii(["financial"], "financial"),
      temporal: collectNonPii(["temporal"], "temporal"),
      entities: collectNonPii(["entities", "structural"], "entities"),
      legal: collectNonPii(["legal"], "legal"),
      heuristics: collectNonPii(["heuristics"]),
      other,
    };
  }
</script>

<aside class="panel">
  {#if phase.kind === "postParse"}
    <div class="panel-head">
      <h2 class="panel-title">Candidates</h2>
      <p class="panel-sub">Review every string before redaction. Categories below.</p>
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
  {:else if phase.kind === "downloadReady"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--ok)">Ready to download</h2>
      <p class="panel-sub">
        {phase.report.scopeMutations.length} scopes touched ·
        0 leaks
      </p>
    </div>
  {:else if phase.kind === "downloadWarning"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--warn)">Review warning</h2>
      <p class="panel-sub">
        No leaks found. Review broad selections or download from the main panel.
      </p>
    </div>
  {:else if phase.kind === "verifyFail"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--err)">
        Sensitive text survived
      </h2>
      <p class="panel-sub">
        Download is blocked until the survived strings are reviewed.
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
