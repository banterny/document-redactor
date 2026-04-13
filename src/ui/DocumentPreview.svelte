<!--
  Main panel — the drop zone in idle state, and the "file parsed" card
  with stats + verify banner in every later state.

  What this does NOT do (deliberate v1 scope):
  - Render the DOCX body visually with click-to-select highlighting.
    That needs a full WordprocessingML → HTML renderer, which is a
    separate module-scale effort. For v1 the candidates panel on the
    right is where the user reviews / selects; the main panel shows
    file metadata + the verify banner, and after Apply it shows the
    download affordance.
  - Drag-hover visual state. The drop zone uses `:hover` and accepts
    drop events; a distinct hover-while-dragging style is a nice-to-
    have that can come later.
-->
<script lang="ts">
  import JSZip from "jszip";

  import {
    renderDocumentBody,
    type RenderedDocument,
  } from "../docx/render-body.js";
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

  /** Mirror the D8.3 output filename rule: {stem}.redacted.{ext}. */
  function redactedFilename(original: string): string {
    const dot = original.lastIndexOf(".");
    if (dot === -1) return `${original}.redacted`;
    return `${original.slice(0, dot)}.redacted${original.slice(dot)}`;
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
      phase.kind !== "downloadWarning"
    ) {
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
    a.download = redactedFilename(phase.fileName);
    a.click();
    URL.revokeObjectURL(url);
  }

  const renderedDocCache = new WeakMap<Uint8Array, Promise<RenderedDocument>>();

  function loadRenderedDoc(bytes: Uint8Array): Promise<RenderedDocument> {
    const cached = renderedDocCache.get(bytes);
    if (cached !== undefined) return cached;

    const promise = (async () => {
      const zip = await JSZip.loadAsync(bytes.slice());
      return await renderDocumentBody(zip);
    })();
    renderedDocCache.set(bytes, promise);
    return promise;
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
          <span class="pill">{formatBytes(phase.analysis.fileStats.sizeBytes)}</span>
          <span class="pill">{phase.analysis.fileStats.scopeCount} scopes walked</span>
          <span class="pill">
            {phase.analysis.entityGroups.reduce(
              (sum, g) => sum + g.literals.length + g.defined.length,
              0,
            ) + phase.analysis.piiCandidates.length} candidates found
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

    {#await loadRenderedDoc(phase.bytes)}
      <div class="parse-progress">
        <div class="spinner" aria-hidden="true"></div>
        <p>Rendering preview…</p>
      </div>
    {:then renderedDoc}
      <RenderedBody {renderedDoc} analysis={phase.analysis} />
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
        <strong>No leaks found — review warning before download</strong>
        <p>
          Round-trip verification found zero surviving sensitive strings,
          but {phase.report.wordCount.droppedPct}% of words were removed
          (threshold {phase.report.wordCount.thresholdPct}%).
          Review broad selections, or download anyway if this is intentional.
        </p>
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
          0 surviving strings
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
  {:else if phase.kind === "verifyFail"}
    <div class="main-head">
      <div>
        <div class="file-name">{phase.fileName}</div>
        <div class="file-bar">
          <span class="pill">Parsed</span>
          <span class="pill warn">Sensitive text survived</span>
        </div>
      </div>
    </div>

    <div class="verify-banner failure">
      <span class="failmark">✗</span>
      <div class="banner-body">
        <strong>Download blocked — sensitive text survived</strong>
        <p>
          The strings below were already selected for redaction, but they
          still appear in the generated DOCX. Return to review and inspect
          them before retrying.
        </p>
        <ul class="survival-list">
          {#each phase.report.verify.survived as s (s.text + s.scope.path)}
            <li class="survival-row">
              <div class="survival-meta">
                <code>{s.text}</code> × {s.count} in
                <code>{s.scope.path}</code>
              </div>
              <button
                class="btn-inline-review"
                type="button"
                onclick={() => appState.reviewCandidate(s.text)}
              >
                Review this item
              </button>
            </li>
          {/each}
        </ul>
        {#if !phase.report.wordCount.sane}
          <p>
            The word-count sanity check also exceeded its threshold, but
            the surviving-text leak is the blocking issue.
          </p>
        {/if}
      </div>
    </div>

    <div class="verifyfail-actions">
      <button
        class="btn-primary"
        type="button"
        onclick={() => appState.reviewCandidate(phase.report.verify.survived[0]!.text)}
      >
        Review from first item
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
    <p class="verifyfail-hint">
      `Review this item` returns to the review screen without changing the
      current selections and focuses that exact string. Download stays blocked
      until the surviving leak is fixed.
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
  .verifyfail-actions .btn-secondary {
    flex: 1;
    margin-top: 0;
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
