<!--
  Right panel — the candidates tree the user reviews before Apply.

  Three groups, rendered in this order per the D9 policy and the D7
  matrix:

    1. **Entity aliases — literal names** (auto-selected)
       The identifying strings that actually reveal who the party is.
       Checked by default, user can deselect individual items.

    2. **Defined term labels** (default OFF)
       Generic role words like "the Buyer", "매수인", "Discloser".
       Unchecked by default so the output is AI-readable; user opts in
       only for 3+ party contracts where leaving them intact would leak
       by elimination.

    3. **Auto-detected PII** (always on by default)
       Emails, phones, 주민번호, 사업자번호, EIN, cards. Each entry
       shows its regex category so the user can triage.

  Each item is a clickable row with a checkbox, the string, a count,
  and a short scope description. Click anywhere on the row → toggle.

  The Apply button at the bottom calls `appState.applyNow()`. It is
  **disabled** when `selections.size === 0` (no point running the
  pipeline with nothing to redact) and when the phase is not postParse.
-->
<script lang="ts">
  import type { PiiCandidate } from "./engine.ts";
  import { appState, type AppPhase } from "./state.svelte.ts";

  type Props = {
    phase: AppPhase;
  };

  let { phase }: Props = $props();

  /**
   * Total across the current selection, for the footer "Selected N of M"
   * row. Computed reactively so it updates when the user toggles any
   * checkbox.
   */
  let selectedCount = $derived(appState.selections.size);

  /**
   * Total candidate count across literal + defined + PII, for the
   * "Selected N of M" denominator.
   */
  let totalCount = $derived.by(() => {
    if (phase.kind !== "postParse") return 0;
    const entityTotal = phase.analysis.entityGroups.reduce(
      (sum, g) => sum + g.literals.length + g.defined.length,
      0,
    );
    return entityTotal + phase.analysis.piiCandidates.length;
  });

  /** The Apply button is disabled unless we're in postParse with ≥1 selection. */
  let canApply = $derived(
    phase.kind === "postParse" && selectedCount > 0,
  );

  /** Human-readable label for a PII regex kind. */
  function piiKindLabel(kind: PiiCandidate["kind"]): string {
    switch (kind) {
      case "rrn":
        return "주민등록번호";
      case "brn":
        return "사업자등록번호";
      case "ein":
        return "US EIN";
      case "phone-kr":
        return "phone · KR";
      case "phone-intl":
        return "phone · intl";
      case "email":
        return "email";
      case "account-kr":
        return "bank account · KR";
      case "card":
        return "credit card";
    }
  }

  /** Join the first N scope kinds into a compact badge line. */
  function formatScopes(
    scopes: ReadonlyArray<{ kind: string; path: string }>,
  ): string {
    const kinds = new Set(scopes.map((s) => s.kind));
    return [...kinds].join(" · ");
  }
</script>

<aside class="panel">
  {#if phase.kind === "postParse"}
    <div class="panel-head">
      <h2 class="panel-title">Variant candidates</h2>
      <p class="panel-sub">
        Review every string before it's redacted. Literal names are
        auto-selected. Defined term labels (the Buyer, 매수인) are kept
        by default so the output reads naturally.
      </p>
    </div>

    <div class="panel-body">
      <!-- Entity literals -->
      {#each phase.analysis.entityGroups as group, gi (gi + group.seed)}
        {#if group.literals.length > 0}
          <div class="cand-group">
            <div class="cand-group-label">
              <span>Literal names — {group.seed}</span>
              <span>{group.literals.length}</span>
            </div>
            <div class="cand-sub-hint">
              Auto-selected. These identifying strings will be replaced with
              <code>[REDACTED]</code>.
            </div>

            {#each group.literals as cand (cand.text)}
              <button
                type="button"
                class="cand-item"
                class:on={appState.isSelected(cand.text)}
                onclick={() => appState.toggleSelection(cand.text)}
              >
                <div class="cand-check"></div>
                <div class="cand-text">
                  <div class="cand-main">
                    <span class="cand-string">{cand.text}</span>
                    <span class="cand-count">{cand.count}</span>
                  </div>
                  <div class="cand-scopes">substring variant</div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      {/each}

      <!-- Defined terms, grouped under one header -->
      {#if phase.analysis.entityGroups.some((g) => g.defined.length > 0)}
        <div class="cand-group">
          <div class="cand-group-label">
            <span>Defined term labels</span>
            <span>
              {phase.analysis.entityGroups.reduce(
                (sum, g) => sum + g.defined.length,
                0,
              )}
            </span>
          </div>
          <div class="cand-sub-hint">
            Generic roles. Kept as-is by default so the output reads naturally.
            Select only for 3+ party contracts.
          </div>

          {#each phase.analysis.entityGroups as group, gi (gi + group.seed + "-def")}
            {#each group.defined as cand (cand.text)}
              <button
                type="button"
                class="cand-item"
                class:on={appState.isSelected(cand.text)}
                onclick={() => appState.toggleSelection(cand.text)}
              >
                <div class="cand-check"></div>
                <div class="cand-text">
                  <div class="cand-main">
                    <span class="cand-string">{cand.text}</span>
                    <span class="cand-count">{cand.count}</span>
                  </div>
                  <div class="cand-scopes">
                    from definition · {group.seed}
                  </div>
                </div>
              </button>
            {/each}
          {/each}
        </div>
      {/if}

      <!-- PII -->
      {#if phase.analysis.piiCandidates.length > 0}
        <div class="cand-group">
          <div class="cand-group-label">
            <span>Auto-detected PII</span>
            <span>{phase.analysis.piiCandidates.length}</span>
          </div>
          <div class="cand-sub-hint">
            Emails, phones, 주민번호, 사업자번호, EIN — detected by the
            Korean + English regex sweep (Lane A).
          </div>

          {#each phase.analysis.piiCandidates as cand (cand.text)}
            <button
              type="button"
              class="cand-item"
              class:on={appState.isSelected(cand.text)}
              onclick={() => appState.toggleSelection(cand.text)}
            >
              <div class="cand-check"></div>
              <div class="cand-text">
                <div class="cand-main">
                  <span class="cand-string">{cand.text}</span>
                  <span class="cand-count">{cand.count}</span>
                </div>
                <div class="cand-scopes">
                  {piiKindLabel(cand.kind)} · {formatScopes(cand.scopes)}
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
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
  {:else if phase.kind === "verifyFail"}
    <div class="panel-head">
      <h2 class="panel-title" style="color: var(--err)">
        Verification failed
      </h2>
      <p class="panel-sub">
        Download blocked. Review survivals in the main panel.
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
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.015em;
    margin: 0;
    color: var(--ink-strong);
  }

  .panel-sub {
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 5px;
    line-height: 1.5;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 20px;
  }

  .cand-group {
    margin-bottom: 20px;
  }

  .cand-group-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
    font-weight: 700;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
  }

  .cand-group-label span:last-child {
    color: var(--ink-muted);
    font-family: var(--mono);
  }

  .cand-sub-hint {
    font-size: 11px;
    color: var(--ink-soft);
    line-height: 1.5;
    margin: -4px 0 10px;
    padding: 0 2px;
  }

  .cand-sub-hint code {
    font-family: var(--mono);
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 0 4px;
    border-radius: 3px;
    color: var(--ink);
    font-weight: 600;
  }

  .cand-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: var(--radius);
    cursor: pointer;
    border: 1px solid transparent;
    border-left: 3px solid transparent;
    transition:
      background 0.15s,
      border-color 0.15s;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
  }

  .cand-item:hover {
    background: var(--bg);
  }

  .cand-item.on {
    background: var(--primary-bg);
    border-left-color: var(--primary);
  }

  .cand-item.on:hover {
    background: #dbeafe;
  }

  .cand-check {
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--border-strong);
    border-radius: 4px;
    margin-top: 1px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--surface);
  }

  .cand-item.on .cand-check {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
    box-shadow: 0 1px 2px rgba(37, 99, 235, 0.35);
  }

  .cand-item.on .cand-check::after {
    content: "✓";
    font-size: 11px;
    line-height: 1;
    font-weight: 700;
    font-family: var(--mono);
  }

  .cand-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .cand-main {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .cand-string {
    font-size: 13px;
    color: var(--ink-strong);
    font-weight: 600;
    word-break: break-word;
  }

  .cand-count {
    font-size: 11px;
    color: var(--ink-soft);
    font-family: var(--mono);
    font-weight: 600;
    flex-shrink: 0;
  }

  .cand-item.on .cand-count {
    color: var(--primary-ink);
  }

  .cand-scopes {
    font-size: 11px;
    color: var(--ink-soft);
  }

  .panel-foot {
    padding: 18px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--ink-soft);
    margin-bottom: 7px;
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
    background: var(--primary);
    color: #fff;
    border: 1px solid var(--primary);
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: -0.005em;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.35);
    transition:
      background 0.15s,
      transform 0.1s,
      box-shadow 0.15s;
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
    font-size: 11px;
    color: var(--ink-muted);
    text-align: center;
    margin-top: 10px;
    font-family: var(--mono);
  }
</style>
