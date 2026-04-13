<script lang="ts">
  import { tick } from "svelte";

  import type { RenderedDocument } from "../docx/render-body.js";
  import type { Scope } from "../docx/types.js";
  import type { Analysis } from "./engine.js";
  import {
    buildPreviewSegments,
    type PreviewCandidate,
    type PreviewSegment,
  } from "./preview-segments.js";
  import { appState } from "./state.svelte.ts";

  type Props = {
    renderedDoc: RenderedDocument;
    analysis: Analysis;
  };

  type ParagraphView = {
    readonly key: string;
    readonly empty: boolean;
    readonly segments: readonly PreviewSegment[];
  };

  type ScopeView = {
    readonly key: string;
    readonly label: string;
    readonly empty: boolean;
    readonly paragraphs: readonly ParagraphView[];
  };

  let { renderedDoc, analysis }: Props = $props();

  let containerRef = $state<HTMLDivElement | null>(null);

  let allCandidates = $derived.by(() => {
    const candidateTexts = new Set<string>();

    for (const group of analysis.entityGroups) {
      for (const literal of group.literals) {
        candidateTexts.add(literal.text);
      }
    }

    for (const pii of analysis.piiCandidates) {
      candidateTexts.add(pii.text);
    }

    for (const candidate of analysis.nonPiiCandidates) {
      candidateTexts.add(candidate.text);
    }

    for (const bucket of appState.manualAdditions.values()) {
      for (const text of bucket) {
        candidateTexts.add(text);
      }
    }

    return [...candidateTexts]
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .map(
        (text): PreviewCandidate => ({
          text,
          selected: appState.selections.has(text),
        }),
      );
  });

  let scopeViews = $derived.by(() =>
    renderedDoc.scopes.map((scope, scopeIndex): ScopeView => ({
      key: `${scopeIndex}-${scope.scope.path}`,
      label: scopeLabel(scope.scope),
      empty: scope.paragraphs.length === 0,
      paragraphs: scope.paragraphs.map((paragraph): ParagraphView => ({
        key: `${scopeIndex}-${paragraph.scopeIndex}`,
        empty: paragraph.text.length === 0,
        segments:
          paragraph.text.length === 0
            ? []
            : buildPreviewSegments(
                paragraph.text,
                allCandidates,
                scopeIndex,
                paragraph.scopeIndex,
              ),
      })),
    })),
  );

  $effect(() => {
    const focused = appState.focusedCandidate;
    const container = containerRef;
    if (!focused || container === null) return;

    let cancelled = false;
    let mark: HTMLElement | null = null;
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;

    void tick().then(() => {
      if (cancelled || containerRef === null) return;
      mark = containerRef.querySelector<HTMLElement>(
        `mark[data-text="${cssEscape(focused)}"]`,
      );
      if (mark === null) return;
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      mark.classList.add("pulse");
      pulseTimer = setTimeout(() => {
        mark?.classList.remove("pulse");
      }, 1200);
    });

    return () => {
      cancelled = true;
      if (pulseTimer !== null) {
        clearTimeout(pulseTimer);
      }
      mark?.classList.remove("pulse");
    };
  });

  function scopeLabel(scope: Scope): string {
    switch (scope.kind) {
      case "body":
        return "Body";
      case "header":
        return `Header ${scopeNumber(scope)}`.trim();
      case "footer":
        return `Footer ${scopeNumber(scope)}`.trim();
      case "footnotes":
        return "Footnotes";
      case "endnotes":
        return "Endnotes";
      case "comments":
        return "Comments";
    }
  }

  function scopeNumber(scope: Scope): string {
    const match = /(\d+)\.xml$/.exec(scope.path);
    return match?.[1] ?? "";
  }

  function cssEscape(text: string): string {
    return text.replace(/["\\]/g, "\\$&");
  }
</script>

<div class="doc-body" bind:this={containerRef}>
  {#each scopeViews as scope (scope.key)}
    <section class="scope-block">
      <h3 class="scope-label">{scope.label}</h3>
      {#if scope.empty}
        <p class="scope-empty">(empty)</p>
      {:else}
        {#each scope.paragraphs as paragraph (paragraph.key)}
          {#if paragraph.empty}
            <p class="para empty">&nbsp;</p>
          {:else}
            <p class="para">
              {#each paragraph.segments as segment (segment.key)}
                {#if segment.type === "text"}
                  {segment.text}
                {:else}
                  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
                  <mark
                    class="cand-mark"
                    class:checked={segment.selected}
                    class:unchecked={!segment.selected}
                    data-text={segment.candidate}
                    data-candidate={segment.candidate}
                    tabindex="0"
                    role="button"
                    aria-pressed={segment.selected}
                    aria-label={`Toggle redaction for ${segment.candidate}`}
                    onclick={() => appState.toggleSelection(segment.candidate)}
                    onkeydown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        appState.toggleSelection(segment.candidate);
                      }
                    }}
                  >
                    {segment.text}
                  </mark>
                {/if}
              {/each}
            </p>
          {/if}
        {/each}
      {/if}
    </section>
  {/each}
</div>

<style>
  .doc-body {
    max-height: 70vh;
    overflow-y: auto;
    padding: 16px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    line-height: 1.6;
    font-size: 13.5px;
    color: var(--ink);
  }

  .scope-block + .scope-block {
    margin-top: 20px;
  }

  .scope-label {
    margin: 0 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }

  .scope-empty {
    margin: 0;
    color: var(--ink-muted);
    font-style: italic;
  }

  .para {
    margin: 0 0 8px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .para.empty {
    min-height: 1em;
  }

  .cand-mark {
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 0 2px;
    cursor: pointer;
    transition:
      background 0.12s ease,
      border-color 0.12s ease,
      box-shadow 0.12s ease,
      color 0.12s ease;
    outline-offset: 2px;
  }

  .cand-mark:hover {
    background: var(--mark);
  }

  .cand-mark.checked {
    background: var(--mark-strong);
    box-shadow: 0 0 0 2px #f59e0b;
    color: var(--ink);
  }

  .cand-mark.unchecked {
    background: transparent;
    border-style: dashed;
    border-color: var(--border-strong);
    color: var(--ink-soft);
  }

  .cand-mark:focus-visible {
    outline: 2px solid var(--primary);
  }

  :global(.cand-mark.pulse) {
    animation: pulse 1.2s ease;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5);
    }

    50% {
      box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
    }

    100% {
      box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
    }
  }
</style>
