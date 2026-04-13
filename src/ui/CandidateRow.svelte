<script lang="ts">
  import { appState } from "./state.svelte.ts";
  import type { ManualCategory } from "./state.svelte.ts";

  type Props = {
    text: string;
    meta: string;
    confidence?: number | undefined;
    isManual: boolean;
    manualCategory?: ManualCategory | undefined;
  };

  let {
    text,
    meta,
    confidence,
    isManual,
    manualCategory,
  }: Props = $props();

  function handleToggle(): void {
    appState.toggleSelection(text);
  }

  function handleRemove(): void {
    if (!isManual || manualCategory === undefined) return;
    appState.removeManualCandidate(manualCategory, text);
  }

  function handleJump(event: MouseEvent): void {
    event.stopPropagation();
    appState.jumpToCandidate(text);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Delete") return;
    if (!isManual || manualCategory === undefined) return;
    event.preventDefault();
    handleRemove();
  }
</script>

<div class="row-shell">
  <button
    type="button"
    class="row"
    class:on={appState.isSelected(text)}
    aria-pressed={appState.isSelected(text)}
    onclick={handleToggle}
    onkeydown={handleKeydown}
  >
    <span class="row-check" aria-hidden="true"></span>
    <span class="row-main">
      <span class="row-text">{text}</span>
      <span class="row-meta">{meta}</span>
    </span>
    <span class="row-aside">
      {#if confidence !== undefined && confidence < 1.0}
        <span class="row-conf">{confidence.toFixed(1)}</span>
      {/if}
      {#if isManual}
        <span class="row-badge">manual</span>
      {/if}
    </span>
  </button>

  <button
    type="button"
    class="row-jump"
    aria-label="Jump to document position"
    title="Jump to position"
    onclick={handleJump}
  >
    ↓
  </button>

  {#if isManual}
    <button
      type="button"
      class="row-remove"
      aria-label="Remove manual addition"
      onclick={handleRemove}
    >
      ×
    </button>
  {/if}
</div>

<style>
  .row-shell {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .row {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: inherit;
    text-align: left;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .row:hover {
    background: var(--primary-bg);
  }

  .row:focus-visible,
  .row-jump:focus-visible,
  .row-remove:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .row.on {
    background: var(--primary-bg);
    border-color: var(--primary-border);
  }

  .row-check {
    width: 16px;
    height: 16px;
    margin-top: 1px;
    flex-shrink: 0;
    border: 1.5px solid var(--border-strong);
    border-radius: 4px;
    background: var(--surface);
    display: grid;
    place-items: center;
  }

  .row.on .row-check {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }

  .row.on .row-check::after {
    content: "✓";
    font-size: 11px;
    font-family: var(--mono);
    font-weight: 700;
    line-height: 1;
  }

  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row-text {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--ink);
    word-break: break-word;
  }

  .row-meta {
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-soft);
  }

  .row-aside {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .row-conf {
    font-size: 11px;
    line-height: 1.4;
    color: var(--warn);
    background: var(--warn-bg);
    border: 1px solid var(--warn-border);
    border-radius: 999px;
    padding: 2px 6px;
    font-family: var(--mono);
  }

  .row-badge {
    font-size: 10px;
    color: var(--primary-ink);
    background: var(--primary-bg);
    border-radius: 999px;
    padding: 2px 6px;
  }

  .row-remove {
    width: 36px;
    min-width: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink-soft);
    transition:
      background 0.15s ease,
      color 0.15s ease,
      transform 0.1s ease;
  }

  .row-remove:hover {
    background: var(--primary-bg);
    color: var(--primary-hover);
  }

  .row-jump {
    width: 36px;
    min-width: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink-soft);
    font-size: 12px;
    transition:
      background 0.12s ease,
      color 0.12s ease,
      border-color 0.12s ease,
      transform 0.1s ease;
  }

  .row-jump:hover {
    background: var(--primary-bg);
    color: var(--primary);
    border-color: var(--primary-border);
  }

  .row-jump:active,
  .row-remove:active {
    transform: scale(0.98);
  }
</style>
