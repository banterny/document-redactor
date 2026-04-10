<!--
  Sidebar — Redaction level + "What Standard covers" checklist + seed
  editor.

  This component is **read-only for the level dropdown and the checklist
  in v1.** Level-switching machinery exists in the design (D7), but the
  three-tier level model (Conservative/Standard/Paranoid) affects which
  detection regexes run and which sanity thresholds apply — and right
  now every test that matters runs against Standard. Paranoid and
  Conservative branches will come with their own dedicated Lane A/D
  work. Shipping a dropdown that silently does nothing would be a
  usability trap, so the dropdown is disabled with a tooltip.

  The seed editor IS live. It replaces the old App.svelte textarea and
  writes through `appState.setSeeds()` so the next `loadFile` picks up
  the user's edits. The seed list only re-runs analysis when a new
  file is dropped — editing the seeds doesn't re-analyze the current
  file (that would be confusing: the user would expect the candidates
  panel to refresh but there's no clear "apply seed changes" button).
  The right pattern is "edit seeds → re-drop file", which the seed
  editor's helper text explains.
-->
<script lang="ts">
  import { appState } from "./state.svelte.ts";

  let seedText = $state(appState.seeds.join("\n"));

  // Sync back to the shared state whenever the textarea changes.
  // We debounce-light via the change event rather than an `$effect`
  // so the write happens on blur/typing-settle instead of on every
  // keystroke — fewer state flushes, same end result.
  function onSeedChange(): void {
    const next = seedText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    appState.setSeeds(next);
  }
</script>

<aside class="sidebar">
  <div class="side-section">
    <div class="side-label">Redaction level</div>
    <select
      class="level-select"
      disabled
      title="Conservative / Paranoid coming in a later commit — Standard is the default and covers 95% of real contracts."
    >
      <option>Standard (default)</option>
    </select>
    <p class="level-hint">
      <strong>Standard</strong> handles the full Korean + English PII sweep,
      flattens track changes, strips comments, scrubs DOCX metadata, and
      runs round-trip verification.
    </p>
  </div>

  <div class="side-section">
    <div class="side-label">What Standard covers</div>
    <ul class="checklist">
      <li><span class="check-on">✓</span> Track changes flattened</li>
      <li><span class="check-on">✓</span> Comments stripped</li>
      <li><span class="check-on">✓</span> Metadata scrubbed</li>
      <li><span class="check-on">✓</span> Cross-run text coalesced</li>
      <li><span class="check-on">✓</span> Round-trip verified</li>
      <li><span class="check-on">✓</span> Headers · footers · footnotes</li>
      <li><span class="check-off">○</span> Embedded objects (Paranoid)</li>
      <li><span class="check-off">○</span> Dates · amounts (Paranoid)</li>
    </ul>
  </div>

  <div class="side-section">
    <div class="side-label">Entity seeds</div>
    <textarea
      class="seed-editor"
      rows="8"
      bind:value={seedText}
      onchange={onSeedChange}
      onblur={onSeedChange}
      placeholder="ABC Corporation&#10;Sunrise Ventures LLC&#10;김철수"
    ></textarea>
    <p class="level-hint">
      Company / person / product names, one per line. PII (emails, phones,
      주민번호, 사업자번호) is detected automatically. Edit this list then
      re-drop the file to re-analyze.
    </p>
  </div>
</aside>

<style>
  .sidebar {
    border-right: 1px solid var(--border);
    background: var(--surface);
    padding: 20px 16px;
    overflow-y: auto;
    grid-row: 2;
  }

  .side-section {
    margin-bottom: 24px;
  }

  .side-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
    font-weight: 700;
    margin-bottom: 10px;
  }

  .level-select {
    width: 100%;
    appearance: none;
    padding: 10px 12px;
    padding-right: 32px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    font: inherit;
    font-weight: 500;
    color: var(--ink);
    box-shadow: var(--shadow-sm);
  }

  .level-select:disabled {
    cursor: not-allowed;
    opacity: 0.9;
  }

  .level-hint {
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 10px;
    line-height: 1.55;
  }

  .level-hint strong {
    color: var(--ink);
    font-weight: 600;
  }

  .checklist {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .checklist li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    color: var(--ink);
  }

  .check-on {
    color: var(--ok);
    font-family: var(--mono);
    font-weight: 700;
    font-size: 13px;
  }

  .check-off {
    color: var(--ink-muted);
    font-family: var(--mono);
    font-size: 13px;
  }

  .seed-editor {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    font: inherit;
    font-family: var(--mono);
    font-size: 12px;
    box-shadow: var(--shadow-sm);
    resize: vertical;
  }

  .seed-editor:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-color: var(--primary);
  }
</style>
