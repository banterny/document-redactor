<script lang="ts">
  import { appState } from "./state.svelte.ts";
  import type { ManualCategory } from "./state.svelte.ts";

  type Props = {
    category: ManualCategory;
    alreadyDetected: ReadonlySet<string>;
  };

  let { category, alreadyDetected }: Props = $props();

  let expanded = $state(false);
  let value = $state("");
  let error = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!expanded) return;
    queueMicrotask(() => inputEl?.focus());
  });

  function canSubmit(): boolean {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 200;
  }

  function handleAdd(): void {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length > 200) {
      error = "200자 이하로 입력하세요";
      return;
    }
    if (
      alreadyDetected.has(trimmed) ||
      appState.manualAdditions.get(category)?.has(trimmed)
    ) {
      error = "이미 감지됨";
      return;
    }
    appState.addManualCandidate(category, trimmed);
    value = "";
    error = null;
    expanded = false;
  }

  function handleCancel(): void {
    value = "";
    error = null;
    expanded = false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  }
</script>

{#if !expanded}
  <button
    type="button"
    class="add-btn"
    onclick={() => {
      expanded = true;
    }}
  >
    + 추가
  </button>
{:else}
  <div class="add-form">
    <input
      bind:this={inputEl}
      bind:value
      type="text"
      class="add-input"
      placeholder="직접 입력…"
      maxlength="200"
      aria-invalid={error !== null}
      oninput={() => {
        error = null;
      }}
      onkeydown={handleKeydown}
    />
    <div class="add-actions">
      <button
        type="button"
        class="add-submit"
        disabled={!canSubmit()}
        onclick={handleAdd}
      >
        Add
      </button>
      <button
        type="button"
        class="add-cancel"
        onclick={handleCancel}
      >
        Cancel
      </button>
    </div>
    {#if error}
      <div class="add-error">{error}</div>
    {/if}
  </div>
{/if}

<style>
  .add-btn,
  .add-submit,
  .add-cancel {
    border-radius: var(--radius);
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      transform 0.1s ease,
      box-shadow 0.15s ease;
  }

  .add-btn {
    width: 100%;
    padding: 10px 12px;
    border: 1px dashed var(--primary-border);
    background: transparent;
    color: var(--primary-ink);
    font-weight: 600;
  }

  .add-btn:hover {
    background: var(--primary-bg);
    color: var(--primary-hover);
  }

  .add-btn:active,
  .add-submit:active,
  .add-cancel:active {
    transform: scale(0.98);
  }

  .add-btn:focus-visible,
  .add-input:focus-visible,
  .add-submit:focus-visible,
  .add-cancel:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .add-form {
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition:
      opacity 0.12s ease,
      transform 0.15s ease;
  }

  .add-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    font: inherit;
    color: var(--ink);
  }

  .add-input::placeholder {
    color: var(--ink-muted);
  }

  .add-input:focus {
    border-color: var(--primary-border);
    box-shadow: 0 0 0 3px var(--primary-bg);
  }

  .add-actions {
    display: flex;
    gap: 8px;
  }

  .add-submit,
  .add-cancel {
    padding: 8px 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
  }

  .add-submit {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }

  .add-submit:hover:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .add-submit:disabled {
    background: var(--ink-muted);
    border-color: var(--ink-muted);
    cursor: not-allowed;
  }

  .add-cancel:hover {
    background: var(--primary-bg);
    color: var(--primary-hover);
  }

  .add-error {
    font-size: 11px;
    line-height: 1.4;
    color: var(--err);
  }
</style>
