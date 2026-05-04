<!--
  Main panel — the drop zone in idle state, and the "file parsed" card
  with stats + verify banner in every later state.

  The post-parse view renders the read-only preview created during
  analysis. Apply/download still use fresh DOCX loads through the engine,
  so preview caching cannot bleed into mutation.

  What this does NOT do (deliberate v1 scope):
  - Drag-hover visual state. The drop zone uses `:hover` and accepts
    drop events; a distinct hover-while-dragging style is a nice-to-
    have that can come later.
-->
<script lang="ts">
  import { countSelectionTargets } from "../selection-targets.js";
  import { redactedFilename } from "./download-policy.js";
  import RenderedBody from "./RenderedBody.svelte";
  import { appState, type AppPhase } from "./state.svelte.ts";

  type Props = {
    phase: AppPhase;
  };

  let { phase }: Props = $props();

  /** Format byte count as "1.2 KB" / "1.2 MB". */
  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  /** Shorten a 64-char hex to `abcd ef01 · · · 9876 5432`. */
  function formatHash(hash: string): string {
    if (hash.length < 16) return hash;
    return `${hash.slice(0, 4)} ${hash.slice(4, 8)} · · · ${hash.slice(-8, -4)} ${hash.slice(-4)}`;
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file !== undefined) {
      void appState.loadFile(file);
    }
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  function onPick(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file !== undefined) {
      void appState.loadFile(file);
    }
  }

  function downloadReport(): void {
    if (
      phase.kind !== "downloadReady" &&
      phase.kind !== "downloadRepaired" &&
      phase.kind !== "downloadWarning" &&
      phase.kind !== "downloadRisk"
    ) {
      return;
    }
    if (phase.kind === "downloadRisk" && !appState.canDownloadCurrentReport()) {
      return;
    }
    // `.slice()` copies into a plain-ArrayBuffer-backed view so Blob
    // never sees SharedArrayBuffer under strict TS5 typing.
    const bytes = phase.report.outputBytes.slice();
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = redactedFilename(phase.fileName, {
      unverified: phase.kind === "downloadRisk",
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  function warningReasonLabel(reason: string): string {
    switch (reason) {
      case "wordCount":
        return "Broad redaction warning — the word-count drop exceeded the configured threshold.";
      case "preflightTouchedNonBodyScopes":
        return "Preflight touched headers, footers, notes, or other non-body surfaces before export.";
      case "preflightTouchedFieldOrRelsSurface":
        return "Preflight touched field or hyperlink relationship surfaces that deserve a quick spot check.";
      case "repairTouchedMultipleScopes":
        return "Automatic repair touched multiple scopes, so the output deserves a quick spot check.";
      case "repairTouchedNonBodyScopes":
        return "Automatic repair touched headers, footers, notes, or other non-body surfaces.";
      case "repairTouchedFieldOrRelsSurface":
        return "Automatic repair touched field or hyperlink relationship surfaces that can affect formatting.";
      default:
        return reason;
    }
  }

  function surfaceLabel(surface: string): string {
    switch (surface) {
      case "field":
        return "field";
      case "rels":
        return "hyperlink target";
      default:
        return "text";
    }
  }
</script>

<main class="main">
  {#if phase.kind === "idle"}
    <div class="hero">
      <h1>Offline DOCX redactor</h1>
      <p class="hero-sub">
        Drop a contract. We'll find party names, emails, phones, resident
        registration numbers, and business registration numbers. You review,
        click Apply, and download a redacted copy. Nothing leaves your browser.
      </p>
    </div>
    <div
      class="dropzone"
      role="button"
      tabindex="0"
      ondrop={onDrop}
      ondragover={onDragOver}
    >
      <div class="dropzone-icon">↧</div>
      <p class="dropzone-title">Drop a .docx file here</p>
      <p class="dropzone-hint">
        or
        <label class="filepick">
          <input type="file" accept=".docx" onchange={onPick} />
          <span>choose a file</span>
        </label>
      </p>
      <p class="dropzone-foot">
        Your file never leaves this browser. Try it with Wi-Fi off.
      </p>
    </div>
  {:else if phase.kind === "parsing"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill">Parsing…</span>
        </div>
      </div>
    </div>
    <div class="parse-progress">
      <div class="spinner" aria-hidden="true"></div>
      <p>Walking scopes · detecting PII · propagating variants…</p>
    </div>
  {:else if phase.kind === "postParse"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill ok">Parsed</span>
          <span class="pill">
            {formatBytes(phase.analysisSession.analysis.fileStats.sizeBytes)}
          </span>
          <span class="pill">
            {phase.analysisSession.analysis.fileStats.scopeCount} scopes walked
          </span>
          <span class="pill">
            {countSelectionTargets(phase.analysisSession.analysis.selectionTargets)} candidates found
          </span>
        </div>
      </div>
      <div class="file-meta">Ready · click highlights or review categories on the right</div>
    </div>

    <div class="verify-banner">
      <span>●</span>
      <span>
        Round-trip verification ready. Output will be re-parsed and checked
        before download.
      </span>
      <span class="hash">offline · file://</span>
    </div>

    {#await phase.analysisSession.renderedDoc}
      <div class="parse-progress">
        <div class="spinner" aria-hidden="true"></div>
        <p>Rendering preview…</p>
      </div>
    {:then renderedDoc}
      <RenderedBody {renderedDoc} analysis={phase.analysisSession.analysis} />
    {:catch err}
      <div class="error-card">
        <h2>Couldn't render this document</h2>
        <p class="error-msg">
          {err instanceof Error ? err.message : String(err)}
        </p>
        <p class="error-hint">
          Analysis succeeded, but the inline preview could not be built.
          You can start over and retry with a fresh copy of the file.
        </p>
      </div>
    {/await}
  {:else if phase.kind === "redacting"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill warn">Redacting…</span>
        </div>
      </div>
    </div>
    <div class="parse-progress">
      <div class="spinner" aria-hidden="true"></div>
      <p>Applying redactions · flattening track changes · verifying…</p>
    </div>
  {:else if phase.kind === "repairing"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill ok">Parsed</span>
          <span class="pill warn">Auto-repairing…</span>
        </div>
      </div>
    </div>
    <div class="parse-progress">
      <div class="spinner" aria-hidden="true"></div>
      <p>First verify found surviving text · retrying once from the original file…</p>
    </div>
  {:else if phase.kind === "downloadReady"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill ok">Parsed</span>
          <span class="pill ok">Redacted</span>
          <span class="pill ok">Verified</span>
        </div>
      </div>
      <div class="file-meta">SHA-256 · {formatHash(phase.report.sha256)}</div>
    </div>

    <div class="verify-banner success">
      <span class="check">✓</span>
      <div class="banner-body">
        <strong>Verification passed — ready to download</strong>
        <p>
          Output was re-parsed and all {phase.report.verify.scopesChecked}
          scopes were walked. Zero sensitive strings survived.
          {phase.report.wordCount.droppedPct}% of words dropped
          (threshold {phase.report.wordCount.thresholdPct}%).
        </p>
      </div>
      <div class="sha-badge">
        <div class="sha-label">SHA-256</div>
        <div class="sha-value">{formatHash(phase.report.sha256)}</div>
      </div>
    </div>

    <div class="download-card">
      <div class="download-meta">
        <div class="download-name">{redactedFilename(phase.fileName)}</div>
        <div class="download-sub">
          {formatBytes(phase.report.outputBytes.length)} ·
          {phase.report.scopeMutations.length} scopes touched ·
          0 surviving strings
        </div>
      </div>
      <button class="btn-download" type="button" onclick={downloadReport}>
        Download {redactedFilename(phase.fileName)}
      </button>
      <button class="btn-secondary" type="button" onclick={() => appState.reset()}>
        Start over
      </button>
    </div>
  {:else if phase.kind === "downloadRepaired"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill ok">Parsed</span>
          <span class="pill ok">Auto-repaired</span>
          <span class="pill ok">Verified</span>
        </div>
      </div>
      <div class="file-meta">SHA-256 · {formatHash(phase.report.sha256)}</div>
    </div>

    <div class="verify-banner success">
      <span class="check">✓</span>
      <div class="banner-body">
        <strong>Automatic repair succeeded — ready to download</strong>
        <p>
          The first verification pass found
          {phase.report.repair.initialSurvivorCount}
          surviving item(s). The app retried once from the original file,
          and the second verification pass found zero surviving sensitive strings.
        </p>
      </div>
      <div class="sha-badge">
        <div class="sha-label">SHA-256</div>
        <div class="sha-value">{formatHash(phase.report.sha256)}</div>
      </div>
    </div>

    <div class="download-card">
      <div class="download-meta">
        <div class="download-name">{redactedFilename(phase.fileName)}</div>
        <div class="download-sub">
          {formatBytes(phase.report.outputBytes.length)} ·
          {phase.report.scopeMutations.length} scopes touched ·
          repaired {phase.report.repair.repairedSurvivorCount} surviving string(s)
        </div>
      </div>
      <button class="btn-download" type="button" onclick={downloadReport}>
        Download {redactedFilename(phase.fileName)}
      </button>
      <button
        class="btn-secondary"
        type="button"
        onclick={() => appState.backToReview()}
      >
        Back to review
      </button>
      <button class="btn-secondary" type="button" onclick={() => appState.reset()}>
        Start over
      </button>
    </div>
  {:else if phase.kind === "downloadWarning"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill ok">Parsed</span>
          <span class="pill ok">Verified</span>
          <span class="pill warn">Review warning</span>
        </div>
      </div>
      <div class="file-meta">SHA-256 · {formatHash(phase.report.sha256)}</div>
    </div>

    <div class="verify-banner warning">
      <span class="warnmark">!</span>
      <div class="banner-body">
        <strong>
          {phase.report.repair.attempted
            ? "Automatic repair succeeded — review warnings before download"
            : "No leaks found — review warnings before download"}
        </strong>
        <p>
          Round-trip verification found zero surviving sensitive strings.
          {#if phase.report.repair.attempted}
            The app already retried once from the original file before showing
            this warning state.
          {/if}
        </p>
        <ul class="survival-list">
          {#each phase.report.warningReasons as reason (reason)}
            <li class="survival-row">
              <div class="survival-meta">{warningReasonLabel(reason)}</div>
            </li>
          {/each}
        </ul>
      </div>
      <div class="sha-badge">
        <div class="sha-label">SHA-256</div>
        <div class="sha-value">{formatHash(phase.report.sha256)}</div>
      </div>
    </div>

    <div class="download-card warning">
      <div class="download-meta">
        <div class="download-name">{redactedFilename(phase.fileName)}</div>
        <div class="download-sub">
          {formatBytes(phase.report.outputBytes.length)} ·
          {phase.report.scopeMutations.length} scopes touched ·
          0 surviving strings ·
          {phase.report.warningReasons.length} warning reason(s)
        </div>
      </div>
      <button
        class="btn-download warn"
        type="button"
        onclick={downloadReport}
      >
        Download anyway
      </button>
      <button
        class="btn-secondary"
        type="button"
        onclick={() => appState.backToReview()}
      >
        Back to review
      </button>
      <button class="btn-secondary" type="button" onclick={() => appState.reset()}>
        Start over
      </button>
    </div>
  {:else if phase.kind === "downloadRisk"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill">Parsed</span>
          <span class="pill warn">Residual risk</span>
        </div>
      </div>
    </div>

    <div class="verify-banner failure">
      <span class="failmark">✗</span>
      <div class="banner-body">
        <strong>Sensitive text may still remain</strong>
        <p>
          Verification found {phase.report.residualRisk.survivorCount}
          surviving string(s) after preflight and automatic repair. This
          output is not verified clean.
        </p>
        <div class="risk-toast">
          Verification found surviving strings. Review them, or acknowledge the
          residual risk to download
          <code>{redactedFilename(phase.fileName, { unverified: true })}</code>.
        </div>
        <ul class="survival-list">
          {#each phase.report.verify.survived as s (s.targetId + s.scope.path + s.surface)}
            <li class="survival-row">
              <div class="survival-meta">
                <code>{s.text}</code> × {s.count} in
                <code>{s.scope.path}</code>
                <span class="survival-surface">({surfaceLabel(s.surface)})</span>
              </div>
              <button
                class="btn-inline-review"
                type="button"
                onclick={() => appState.reviewCandidate(s.targetId)}
              >
                Review this item
              </button>
            </li>
          {/each}
        </ul>
        {#if !phase.report.wordCount.sane}
          <p>
            The word-count sanity check also exceeded its threshold, so this
            file deserves an extra spot check even if you choose to download it.
          </p>
        {/if}
        <label class="risk-ack">
          <input
            type="checkbox"
            checked={appState.residualRiskAcknowledged}
            onchange={(e) =>
              appState.setResidualRiskAcknowledged(
                (e.currentTarget as HTMLInputElement).checked,
              )}
          />
          <span>
            I understand that sensitive text may still remain in this output file.
          </span>
        </label>
      </div>
    </div>

    <div class="verifyfail-actions">
      <button
        class="btn-primary"
        type="button"
        onclick={() => appState.reviewCandidate(phase.report.verify.survived[0]!.targetId)}
      >
        Review first survivor
      </button>
      <button
        class="btn-secondary"
        type="button"
        onclick={() => appState.backToReview()}
      >
        Back to review
      </button>
      <button
        class="btn-download warn"
        type="button"
        disabled={!appState.canDownloadCurrentReport()}
        onclick={downloadReport}
      >
        Download anyway
      </button>
      <button class="btn-secondary" type="button" onclick={() => appState.reset()}>
        Start over
      </button>
    </div>
    <p class="verifyfail-hint">
      `Review this item` returns to the review screen without changing the
      current selections and focuses that exact string. Dirty output can only
      be downloaded after explicit acknowledgement.
    </p>
  {:else if phase.kind === "fatalError"}
    <div class="error-card">
      <h2>Couldn't process this file</h2>
      <p class="error-msg">{phase.message}</p>
      <p class="error-hint">
        Nothing was saved. Nothing left your browser. Try another file, or
        open this one in Word, save as a new copy, and re-drop.
      </p>
      <button class="btn-secondary" type="button" onclick={() => appState.reset()}>
        Try another file
      </button>
    </div>
  {/if}
</main>

<style>
  .main {
    overflow-y: auto;
    padding: 24px 28px;
    grid-row: 2;
  }

  .hero {
    margin-bottom: 28px;
  }

  .hero h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.02em;
    color: var(--ink-strong);
  }

  .hero-sub {
    margin: 10px 0 0;
    color: var(--ink-soft);
    max-width: 620px;
    line-height: 1.65;
  }

  .dropzone {
    background: var(--surface);
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    padding: 64px 24px;
    text-align: center;
    transition:
      border-color 0.15s,
      background 0.15s;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }

  .dropzone:hover,
  .dropzone:focus-visible {
    border-color: var(--primary);
    background: var(--primary-bg);
    outline: none;
  }

  .dropzone-icon {
    font-size: 32px;
    color: var(--primary);
    line-height: 1;
    margin-bottom: 8px;
  }

  .dropzone-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--ink-strong);
    letter-spacing: -0.015em;
  }

  .dropzone-hint {
    margin: 8px 0 0;
    color: var(--ink-soft);
  }

  .dropzone-foot {
    margin: 20px 0 0;
    font-size: 12px;
    color: var(--ink-muted);
    font-family: var(--mono);
  }

  .filepick input {
    display: none;
  }

  .filepick span {
    color: var(--primary);
    text-decoration: underline;
    cursor: pointer;
  }

  .main-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .file-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--ink-strong);
  }

  .file-meta {
    font-size: 12px;
    color: var(--ink-muted);
    font-family: var(--mono);
  }

  .file-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 10px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #f1f5f9;
    color: var(--ink-soft);
    font-size: 11px;
    font-weight: 600;
    font-family: var(--mono);
    border: 1px solid var(--border);
  }

  .pill.ok {
    background: var(--ok-bg);
    color: #15803d;
    border-color: var(--ok-border);
  }

  .pill.warn {
    background: var(--warn-bg);
    color: var(--warn);
    border-color: var(--warn-border);
  }

  .verify-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    background: var(--primary-bg);
    border: 1px solid var(--primary-border);
    border-left: 4px solid var(--primary);
    border-radius: var(--radius);
    color: var(--primary-ink);
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 18px;
    box-shadow: var(--shadow-sm);
  }

  .verify-banner.success {
    background: var(--ok-bg);
    border-color: var(--ok-border);
    border-left-color: var(--ok);
    color: #15803d;
  }

  .verify-banner.warning {
    background: var(--warn-bg);
    border-color: var(--warn-border);
    border-left-color: var(--warn);
    color: #a16207;
  }

  .verify-banner.failure {
    background: var(--err-bg);
    border-color: var(--err-border);
    border-left-color: var(--err);
    color: var(--err);
  }

  .verify-banner .check {
    font-size: 16px;
    color: var(--ok);
    line-height: 1;
  }

  .verify-banner .failmark {
    font-size: 16px;
    color: var(--err);
    line-height: 1;
  }

  .verify-banner .warnmark {
    font-size: 16px;
    color: var(--warn);
    line-height: 1;
    font-weight: 700;
  }

  .verify-banner .banner-body {
    flex: 1;
  }

  .verify-banner .banner-body strong {
    display: block;
    margin-bottom: 4px;
  }

  .verify-banner .banner-body p {
    margin: 0;
    font-size: 12.5px;
    font-weight: 400;
    line-height: 1.55;
  }

  .verify-banner .hash {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-soft);
    font-weight: 400;
    margin-left: auto;
  }

  .sha-badge {
    text-align: right;
    font-family: var(--mono);
  }

  .sha-label {
    font-size: 10px;
    text-transform: uppercase;
    color: var(--ink-soft);
    letter-spacing: 0.08em;
  }

  .sha-value {
    font-size: 11px;
    color: var(--ink);
  }

  .survival-list {
    margin: 8px 0 0;
    padding-left: 0;
    list-style: none;
    font-size: 12px;
    font-weight: 400;
  }

  .survival-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid rgba(185, 28, 28, 0.12);
  }

  .survival-row:first-child {
    border-top: none;
    padding-top: 2px;
  }

  .survival-meta {
    min-width: 0;
    line-height: 1.55;
  }

  .survival-surface {
    margin-left: 6px;
    color: var(--ink-muted);
    font-size: 11px;
    font-family: var(--mono);
  }

  .survival-list code {
    font-family: var(--mono);
    background: var(--surface);
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid var(--err-border);
    color: var(--err);
  }

  .btn-inline-review {
    flex: 0 0 auto;
    padding: 6px 10px;
    background: var(--surface);
    color: var(--err);
    border: 1px solid var(--err-border);
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .btn-inline-review:hover {
    background: rgba(254, 242, 242, 0.9);
  }

  .parse-progress {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--ink-soft);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2.5px solid var(--border-strong);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .download-card {
    background: var(--surface);
    border: 1px solid var(--ok-border);
    border-radius: var(--radius-lg);
    padding: 24px;
    box-shadow: var(--shadow-sm);
  }

  .download-card.warning {
    border-color: var(--warn-border);
  }

  .download-meta {
    margin-bottom: 16px;
  }

  .download-name {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-strong);
  }

  .download-sub {
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 4px;
  }

  .btn-download {
    display: block;
    width: 100%;
    padding: 12px 16px;
    background: var(--ok);
    color: #fff;
    border: 1px solid var(--ok);
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 14px;
    box-shadow: 0 1px 3px rgba(22, 163, 74, 0.3);
    transition:
      background 0.15s,
      transform 0.1s;
  }

  .btn-download:hover {
    background: #15803d;
  }

  .btn-download:active {
    transform: scale(0.99);
  }

  .btn-download.warn {
    background: var(--warn);
    border-color: var(--warn);
    box-shadow: 0 1px 3px rgba(217, 119, 6, 0.28);
  }

  .btn-download.warn:hover {
    background: #b45309;
  }

  .btn-secondary {
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 10px 16px;
    background: var(--surface);
    color: var(--ink-soft);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    font-size: 13px;
  }

  .btn-secondary:hover {
    background: var(--bg);
    color: var(--ink);
  }

  .verifyfail-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .verifyfail-actions .btn-primary,
  .verifyfail-actions .btn-secondary,
  .verifyfail-actions .btn-download {
    flex: 1;
    margin-top: 0;
  }

  .risk-toast {
    margin: 12px 0 14px;
    padding: 10px 12px;
    background: #fff7ed;
    border: 1px solid #fdba74;
    border-radius: var(--radius);
    color: #9a3412;
    font-size: 12px;
    line-height: 1.5;
  }

  .risk-ack {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 14px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid var(--err-border);
    border-radius: var(--radius);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-strong);
  }

  .risk-ack input {
    margin-top: 2px;
  }

  .btn-primary {
    display: block;
    padding: 10px 16px;
    background: var(--primary);
    color: #fff;
    border: 1px solid var(--primary);
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.35);
    transition:
      background 0.12s ease,
      box-shadow 0.15s ease,
      transform 0.1s ease;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  }

  .btn-primary:active {
    transform: scale(0.98);
  }

  .verifyfail-hint {
    margin: 10px 0 0;
    padding: 10px 12px;
    background: var(--bg);
    border-left: 3px solid var(--warn);
    border-radius: var(--radius);
    font-size: 12px;
    line-height: 1.55;
    color: var(--ink-soft);
  }

  .error-card {
    background: var(--surface);
    border: 1px solid var(--err-border);
    border-radius: var(--radius-lg);
    padding: 32px;
    box-shadow: var(--shadow-sm);
  }

  .error-card h2 {
    margin: 0 0 12px;
    color: var(--err);
    font-size: 18px;
    font-weight: 700;
  }

  .error-msg {
    margin: 0 0 12px;
    padding: 10px 12px;
    background: var(--err-bg);
    border: 1px solid var(--err-border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 12px;
    color: var(--err);
  }

  .error-hint {
    margin: 0 0 20px;
    font-size: 13px;
    color: var(--ink-soft);
    line-height: 1.6;
  }
</style>
