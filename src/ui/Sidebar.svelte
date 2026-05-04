<!--
  Sidebar — Redaction level + "What Standard covers" checklist.

  The level dropdown is disabled in v1 (Standard only). Paranoid /
  Conservative branches will come with their own dedicated Lane A/D work.

  The entity seed workflow was removed in Phase 3.2 because Phase 1's
  structural.party-declaration parser + entities regex rules catch the
  main parties automatically, and Phase 2's per-category "+ 추가"
  affordance covers the missed-variant case. Propagation remains an
  internal, test-covered engine path rather than a public UI control.
-->
<script lang="ts">
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
</style>
