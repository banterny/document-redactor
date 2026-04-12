<script lang="ts">
  import AddCandidateInput from "./AddCandidateInput.svelte";
  import CandidateRow from "./CandidateRow.svelte";
  import type { ManualCategory } from "./state.svelte.ts";

  type SectionCategory = ManualCategory | "defined" | "pii" | "heuristics";

  type CategoryCandidate = {
    text: string;
    meta: string;
    confidence?: number | undefined;
    isManual: boolean;
    manualCategory?: ManualCategory | undefined;
  };

  type Props = {
    label: string;
    subHint: string;
    category: SectionCategory;
    candidates: ReadonlyArray<CategoryCandidate>;
    canManualAdd: boolean;
    warnStyle?: boolean | undefined;
  };

  let {
    label,
    subHint,
    category,
    candidates,
    canManualAdd,
    warnStyle = false,
  }: Props = $props();

  let headerId = $derived(`category-${category}-label`);
  let alreadyDetected = $derived(new Set(candidates.map((candidate) => candidate.text)));

  function isManualCategory(
    value: SectionCategory,
  ): value is ManualCategory {
    return (
      value === "literals" ||
      value === "financial" ||
      value === "temporal" ||
      value === "entities" ||
      value === "legal"
    );
  }
</script>

{#if candidates.length > 0 || canManualAdd}
  <section
    class="cat-section"
    class:warn={warnStyle}
    aria-labelledby={headerId}
  >
    <header class="cat-header">
      <span id={headerId} class="cat-label">{label}</span>
      <span class="cat-count">{candidates.length}</span>
    </header>
    <p class="cat-sub">{subHint}</p>

    <div class="cat-body">
      {#each candidates as candidate (candidate.text)}
        <CandidateRow
          text={candidate.text}
          meta={candidate.meta}
          confidence={candidate.confidence}
          isManual={candidate.isManual}
          manualCategory={candidate.manualCategory}
        />
      {/each}

      {#if canManualAdd && isManualCategory(category)}
        <AddCandidateInput
          category={category}
          {alreadyDetected}
        />
      {/if}
    </div>
  </section>
{/if}

<style>
  .cat-section {
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  .cat-section.warn {
    background: var(--warn-bg);
    border-left: 4px solid var(--warn);
  }

  .cat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .cat-label {
    font-size: 14px;
    line-height: 1.4;
    font-weight: 600;
    color: var(--ink-strong);
  }

  .cat-count {
    font-size: 11px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink-soft);
    font-family: var(--mono);
  }

  .cat-sub {
    margin: 4px 0 12px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-soft);
  }

  .cat-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
