# Phase 3 — Inline document preview with click-to-toggle highlighting

> ✅ **READY FOR CODEX EXECUTION** ✅
>
> Authored 2026-04-13 after user QA on Phase 2 surfaced that the right-narrow
> candidates panel makes contextual legal review uncomfortable. User requested:
> "가운데 큰 화면에 실제 계약서와 함께 redact 될 부분을 보여줘야 하지 않을까?"
>
> This brief specifies the redesign that shifts the PRIMARY review surface from
> the right-narrow panel to the center document body — rendering the contract
> text inline with click-to-toggle highlights on each candidate. Phase 2's
> category-grouped list stays as a secondary scan/filter surface with a new
> "jump to" affordance (click a row → document scrolls to that position).

---

**For:** Codex 5.4 xhigh
**Project:** document-redactor
**Branch:** `main`
**Starting commit:** Phase 2 handback HEAD (`12e8e9f` or descendant)
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`
**Date written:** 2026-04-13
**Author of brief:** Claude Opus 4.6 at user's request
**Predecessor:** `docs/phases/phase-2-ui-redesign.md` + `docs/phases/phase-2-handback.md`

---

## 0. How to read this document

Self-contained execution spec. Read the whole thing before touching code. Every decision is locked. Your job is to execute, not to re-debate.

### Sections

0. How to read this document
1. Mission statement
2. Required reading
3. Invariants
4. Architecture (component responsibilities + data flow + scroll sync)
5. File layout
6. Rendering scope (plain text only; no bold/italic/tables)
7. Candidate position mapping (find candidate positions in rendered text)
8. Highlight rendering (`<mark>` wrappers + selection state reflection)
9. Click-to-toggle interaction
10. Scroll synchronization (list-click → document-scroll)
11. Performance + large documents
12. Component specifications
13. Accessibility
14. Testing strategy
15. TDD sequence (9 steps)
16. Verification commands
17. Gotchas + out-of-scope + acceptance criteria + handback + error handling

### Decisions locked

| Ref | Decision | Rationale |
|---|---|---|
| **3.1** Layout model | Model B (split center). Left: Sidebar unchanged. Center-left 2/3: DocumentPreview with inline highlights (NEW). Center-right 1/3: CandidatesPanel from Phase 2 (with 1 new feature: "jump to" per row). | Keeps Phase 2 category taxonomy + manual-add investment. Adds inline context. |
| **3.2** Rendering fidelity | Plain text only. Paragraphs rendered as `<p>`. No bold/italic/underline. No table rendering (table cells flattened to paragraphs). No images. No numbering/bullets (just text content). Headings NOT distinguished (all `<p>`). | "Module-scale effort" explicitly deferred from v1 per DocumentPreview top-of-file JSDoc. Keep scope tight; legal review needs CONTEXT, not formatting fidelity. |
| **3.3** Candidate position discovery | Simple `String.indexOf` loop on the rendered paragraph text, for each candidate text. No new offset-tracking API in the detection layer. | `candidate.text` is already original bytes (Phase 0 contract). Simple exact-match find works. |
| **3.4** Single highlight color | One color for all categories. Selection state determines visual: checked = solid `var(--mark-strong)` + shadow; unchecked = dashed border, transparent background. | Per-category colors = over-engineering. User scans the center for CONTEXT; the category list handles taxonomy. |
| **3.5** Click-to-toggle in document | Click on any `<mark>` in the document toggles selection (same as `appState.toggleSelection(text)`). Event propagation stops at the mark. | Natural UX for inline review. Keyboard focus + Enter also triggers toggle. |
| **3.6** Scroll sync direction | ONE direction: list-click → document-scroll. Document-click → list-highlight is NOT implemented (adds complexity with little benefit; clicking a mark already toggles the selection — user sees the visual response without needing the list to react). | Simpler to implement, fewer reactivity edge cases. |
| **3.7** Phase 2 CandidatesPanel preserved | No structural changes to CandidatesPanel/CategorySection/CandidateRow. Only additions: a small "↓" icon on each row for "jump to document position". | Phase 2 is recent, tested, shipped logic. Don't rewrite. |
| **3.8** DocxRenderer as new pure module | New file `src/docx/render-body.ts` exports `renderDocumentBody(zip) → RenderedDocument`. Uses existing `coalesceParagraphRuns` and `listScopes`. | Reuses the battle-tested coalesce code. Rendering logic stays out of Svelte for testability. |
| **3.9** No new npm dependencies | Zero `bun add` / `npm install`. | Same as all prior phases. |
| **3.10** Engine API unchanged | `analyzeZip` / `applyRedaction` / `Analysis` / `NonPiiCandidate` / `PiiCandidate` signatures preserved exactly. Phase 3 READS the analysis; writes nothing new to it. | Phase 2 is final. Phase 3 consumes it. |
| **3.11** No modifications to `src/detection/`, `src/propagation/`, `src/finalize/` | Same UI-only scope as Phase 2. Only new addition in `src/docx/`: the rendering module. | Isolation of concerns. |

---

## 1. Mission statement

Make the DOCUMENT BODY the primary review surface. After a user drops a DOCX, they see the contract text rendered inline in the center-left 2/3 of the screen, with every candidate string highlighted. They click a highlight to toggle its inclusion in the redaction set (same as the Phase 2 checkbox). The Phase 2 category-grouped list stays in the center-right 1/3 as a categorical scan surface, with a new "↓" jump-to affordance per row.

**Zero detection behavior change.** All Phase 0/1/2 tests must still pass. The only changes are in `src/ui/` (rewritten DocumentPreview + tiny CandidateRow addition + state extension for focused-candidate tracking) and `src/docx/` (one new pure module: `render-body.ts`).

**No formatting fidelity.** This is NOT a Word viewer. It renders paragraphs as plain text. Users compare contracts visually in Word if they need formatted review. The redactor's job is to let them verify WHAT will be redacted and WHERE.

Expected deliverables: **1 new pure module** (`src/docx/render-body.ts`) + **1 new Svelte component** for the rendered body + **1 rewritten DocumentPreview postParse branch** + **minor extensions** to CandidateRow (jump affordance) + state (focused-candidate) + **~20 new test cases**, **8–10 commits**, **zero npm dependencies**, post-phase test count **~1568 passing**.

---

## 2. Required reading (in order)

1. **`docs/phases/phase-2-handback.md`** — confirms the Phase 2 state. `nonPiiCandidates`, `ManualCategory`, `manualAdditions` map, `defaultSelections` confidence=1.0 policy.

2. **`src/ui/DocumentPreview.svelte`** (current, 680 lines) — the file you will rewrite. Preserve all 6 non-postParse phase branches byte-for-byte. Only the postParse branch changes.

3. **`src/ui/CandidatesPanel.svelte`** (420 lines after Phase 2) — stays as-is structurally. Phase 3 does NOT rewrite this.

4. **`src/ui/CandidateRow.svelte`** (209 lines after Phase 2) — gets ONE small addition: a "↓" button that fires `appState.jumpToCandidate(text)`.

5. **`src/ui/state.svelte.ts`** (228 lines after Phase 2) — extended with `focusedCandidate: string | null` + `jumpToCandidate(text)` verb.

6. **`src/ui/engine.ts`** — UNCHANGED in Phase 3. You will READ `Analysis` shape but not modify the file.

7. **`src/docx/coalesce.ts`** (full file) — `coalesceParagraphRuns(paragraphXml)` returns `{text, runs}` where `text` is the logical paragraph string. This is the foundation for Phase 3 rendering.

8. **`src/docx/scopes.ts`** — `listScopes(zip)` and `readScopeXml(zip, scope)`. Walks the DOCX in canonical order (body → footnotes → endnotes → comments → headers → footers).

9. **`src/detection/extract-text.ts`** — the template for how text is extracted per scope. Phase 3 does something similar but preserves per-paragraph structure instead of joining with `\n`.

10. **`../document-redactor-private-notes/design-v1.md` § D5** — design tokens. Specifically `--mark` (#fef3c7), `--mark-strong` (#fde68a), and the "Selected candidate also gets: box-shadow: 0 0 0 2px #f59e0b" rule.

11. **`src/ui/styles.css`** — global styles. No changes needed in Phase 3.

Commands:

```bash
cat docs/phases/phase-2-handback.md
cat src/ui/DocumentPreview.svelte
cat src/ui/CandidatesPanel.svelte
cat src/ui/CandidateRow.svelte
cat src/ui/state.svelte.ts
cat src/ui/engine.ts | head -120  # just the Analysis shape
cat src/docx/coalesce.ts
cat src/docx/scopes.ts
cat src/detection/extract-text.ts
cat ../document-redactor-private-notes/design-v1.md | sed -n '/### D5\./,/### D6\./p'
```

---

## 3. Invariants (DO NOT VIOLATE)

1. **All Phase 0/1/2 tests must still pass.** `bun run test` → ≥ 1548 passing + Phase 3 additions, 0 failing.

2. **No changes to `src/detection/**`, `src/propagation/**`, `src/finalize/**`, or existing `src/docx/*` files.** Phase 3 ADDS `src/docx/render-body.ts` and `src/docx/render-body.test.ts`. Does not modify any existing docx file.

3. **No changes to `src/ui/engine.ts`.** `Analysis` / `NonPiiCandidate` / `PiiCandidate` / `defaultSelections` / `analyzeZip` / `applyRedaction` are all locked.

4. **No changes to `src/ui/CandidatesPanel.svelte`, `src/ui/CategorySection.svelte`, `src/ui/AddCandidateInput.svelte`.** Only `CandidateRow.svelte` receives a small addition (the jump button).

5. **No changes to `src/ui/App.svelte`, `src/ui/Topbar.svelte`, `src/ui/Sidebar.svelte`, `src/ui/Footer.svelte`, `src/ui/main.ts`, `src/ui/styles.css`.**

6. **No changes to `package.json` dependencies.** Zero `bun add` / `npm install`.

7. **No changes to `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `svelte.config.js`.**

8. **`.js` extension in imports** (per tsconfig + Vite convention). **`import type`** for type-only imports (verbatimModuleSyntax).

9. **No `try/catch` in new components or in `render-body.ts`.** Fail-loud. If `coalesceParagraphRuns` throws, let it bubble (matches Phase 0/1/2 fail-loud invariant).

10. **D9 policy preserved.** Defined term labels remain UNCHECKED by default. The rendering does NOT highlight defined term labels unless they are ALSO in another category (rare edge case where the same text is both a defined label and, say, a 법인/인물 candidate).

11. **`Analysis.nonPiiCandidates` confidence filter preserved.** `defaultSelections` already excludes confidence < 1.0. The rendering shows EVERY candidate (checked or unchecked) — the visual distinguishes the two states.

12. **Selection Set contract preserved.** `appState.selections: Set<string>` continues to be the single source of truth. Highlight click → `toggleSelection(text)` → Set mutation → reactive re-render in both document and list.

13. **No network code.** ESLint bans — do not introduce.

14. **No inline `<style>` tags.** Component-scoped `<style>` blocks only.

15. **Do NOT `git push`.** Commit locally only.

16. **Do NOT modify `tests/fixtures/`.**

17. **Preserve the 6 non-postParse phase branches** of `DocumentPreview.svelte` byte-for-byte (idle drop zone, parsing, postParse metadata card — wait, postParse IS the one being rewritten — reconsider below).

**Clarification for invariant 17:** the current `DocumentPreview.svelte` has branches for idle / parsing / postParse / redacting / downloadReady / verifyFail / fatalError. Only the postParse branch changes in Phase 3 — specifically, the body portion is REPLACED with the new rendered-document view. The TOP portion of the postParse branch (file metadata card, verify banner if applicable) is PRESERVED as a compact header above the rendered body.

18. **Large documents perform acceptably.** The `buildAllTargetsFromZip` 2-second budget from Phase 1 is a ZIP-walking + detection budget. Phase 3 rendering must not exceed an additional 1 second for a 50KB text contract (roughly the worst-case fixture). Budget test added in § 14.

---

## 4. Architecture

### 4.1 Data flow

```
User drops file
   │
   ▼
appState.loadFile(file)
   │ ── calls engine.analyzeZip(bytes, seeds)
   │ ── analysis = {entityGroups, piiCandidates, nonPiiCandidates, fileStats}
   │ ── selections = defaultSelections(analysis) + manualAdditions merge
   │
   ▼
phase = {kind: "postParse", bytes, analysis, ...}
   │
   ▼
DocumentPreview.svelte (postParse branch)
   │ ── loads bytes into JSZip (already done: analyzeZip used bytes, but we need a fresh load)
   │ ── wait: bytes are in phase.bytes, so component can re-load
   │ ── calls renderDocumentBody(zip) → RenderedDocument
   │ ── passes RenderedDocument + analysis to RenderedBody.svelte
   │
   ▼
RenderedBody.svelte
   │ ── iterates scopes in order
   │ ── for each paragraph: highlights candidates inline via buildParagraphHTML
   │ ── each <mark> has data-text + data-checked attributes
   │ ── mark click → appState.toggleSelection(text)
   │
   ▼
User clicks highlight → selection toggles → RenderedBody re-renders
   (AND CandidatesPanel on the right re-renders the checkbox)
```

### 4.2 Scroll sync (list → document)

```
User clicks "↓" on a CandidateRow
   │
   ▼
appState.jumpToCandidate(text)
   │ ── sets focusedCandidate = text
   │
   ▼
RenderedBody.svelte has $effect watching focusedCandidate
   │ ── finds the first <mark data-text={text}> element
   │ ── calls element.scrollIntoView({block: "center", behavior: "smooth"})
   │ ── adds a temporary "pulse" class for 1.2s to draw visual attention
   │
   ▼
After 1.2s timeout: focusedCandidate = null (cleanup)
```

### 4.3 Component responsibilities

| Component | Responsibility |
|---|---|
| `DocumentPreview.svelte` (REWRITTEN postParse) | Phase dispatching. In postParse: render the file metadata card (compact) + `<RenderedBody>`. All other phases preserved byte-for-byte. |
| `RenderedBody.svelte` (NEW) | Receives `renderedDoc: RenderedDocument` + `analysis: Analysis`. Walks scopes + paragraphs, emits `<p>` per paragraph with `<mark>` wrappers on candidate matches. Binds click handlers. Uses `$effect` to scroll on `focusedCandidate` change. |
| `CandidatesPanel.svelte` | UNCHANGED. Still renders categories on the right. |
| `CandidateRow.svelte` | +1 new button: "↓ jump" icon. Fires `appState.jumpToCandidate(text)` on click. |
| `state.svelte.ts` | +1 new state field `focusedCandidate: string \| null` +1 new verb `jumpToCandidate(text)`. |
| `src/docx/render-body.ts` (NEW) | Pure module. `renderDocumentBody(zip): Promise<RenderedDocument>`. |

### 4.4 `RenderedDocument` shape (authoritative)

```typescript
/** One paragraph of rendered text, scoped to its source. */
export interface RenderedParagraph {
  /** Index of this paragraph within its scope (0-based). */
  readonly scopeIndex: number;
  /** The plain text of the paragraph. Empty string for empty paragraphs. */
  readonly text: string;
}

/** Rendered content of one scope (body, header, footer, etc.). */
export interface RenderedScope {
  /** Which scope this content came from (body / header1 / footnotes / etc.). */
  readonly scope: Scope;
  /** Ordered list of paragraphs within this scope. */
  readonly paragraphs: readonly RenderedParagraph[];
}

/** Full rendered document — all scopes in canonical walk order. */
export interface RenderedDocument {
  readonly scopes: readonly RenderedScope[];
}
```

### 4.5 Layout (CSS)

The existing App.svelte CSS grid is `sidebar(260) | main(fluid) | panel(320)` on desktop. Phase 3 does NOT change this. The new RenderedBody fits inside the `main` area, replacing the placeholder metadata card that was there before. The right panel (CandidatesPanel) keeps its 320px width.

If the main area becomes too narrow on smaller screens (< 1280px), the RenderedBody paragraphs reflow naturally via CSS — no new breakpoint logic. The responsive behavior from design-v1 § D6 (tablet: right panel becomes bottom sheet; mobile: tab switcher) is NOT implemented in Phase 3 — it stays as-is (whatever the current styles.css does).

---

## 5. File layout

```
src/docx/
├── render-body.ts            ← NEW (~180 lines)
├── render-body.test.ts       ← NEW (~150 lines)
├── coalesce.ts               (UNCHANGED)
├── scopes.ts                 (UNCHANGED)
└── ... (all other docx/* unchanged)

src/ui/
├── DocumentPreview.svelte    ← REWRITTEN (postParse branch only)
├── RenderedBody.svelte       ← NEW (~180 lines)
├── CandidateRow.svelte       ← MODIFIED (+~15 lines for jump button)
├── state.svelte.ts           ← MODIFIED (+~25 lines for focusedCandidate + jumpToCandidate)
├── CandidatesPanel.svelte    (UNCHANGED)
├── CategorySection.svelte    (UNCHANGED)
├── AddCandidateInput.svelte  (UNCHANGED)
├── App.svelte                (UNCHANGED)
├── Topbar.svelte             (UNCHANGED)
├── Sidebar.svelte            (UNCHANGED)
├── Footer.svelte             (UNCHANGED)
├── styles.css                (UNCHANGED)
├── main.ts                   (UNCHANGED)
├── engine.ts                 (UNCHANGED)
├── engine.test.ts            (+~5 new tests — see § 14)
└── ship-gate.test.ts         (+~2 new tests — see § 14)
```

**Counts:**
- New files: 3 (`render-body.ts`, `render-body.test.ts`, `RenderedBody.svelte`)
- Modified files: 5 (`DocumentPreview.svelte`, `CandidateRow.svelte`, `state.svelte.ts`, `engine.test.ts`, `ship-gate.test.ts`)
- Unchanged: every other file

---

## 6. Rendering scope

### 6.1 What IS rendered

- Every text-bearing scope's paragraphs, in `listScopes()` canonical walk order (body → footnotes → endnotes → comments → headers → footers)
- Paragraph text via `coalesceParagraphRuns(xml).text`
- Empty paragraphs preserved as `<p>&nbsp;</p>` (visible blank lines)
- Scope boundaries marked with a subtle `<h3>` heading: "Body", "Header 1", "Footer 1", "Footnotes", etc. — so the user can tell they're reading a footer vs the body

### 6.2 What IS NOT rendered

- Formatting: bold, italic, underline, colors, fonts — ignored (plain text only)
- Tables: flattened. Each cell's paragraph becomes a top-level `<p>` in the flow. Table structure is NOT preserved.
- Images: ignored (no `<img>` output)
- Lists/numbering: numbering prefixes are ignored. Only the text content is rendered.
- Headings (h1/h2/h3 in Word): rendered as regular `<p>` — no visual distinction from body paragraphs
- Hyperlinks: rendered as plain text (no `<a>` tags, just the text content)
- Comments/track-changes: NOT rendered as inline annotations. If the document has unresolved track-changes, the `flatten-track-changes.ts` code already flattens them at the redaction-apply step; the RENDERING at review time uses the RAW text which may still contain track-change markers as plain text. Acknowledged limitation; future phase may handle this.
- Page breaks, section breaks: ignored

### 6.3 Scope labels (user-facing)

Map `Scope` to a Korean label for the scope header:

```typescript
function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case "body": return "본문";
    case "header": return `머리글 ${scope.index ?? ""}`.trim();
    case "footer": return `바닥글 ${scope.index ?? ""}`.trim();
    case "footnotes": return "각주";
    case "endnotes": return "미주";
    case "comments": return "메모";
  }
}
```

Scope header HTML:

```html
<h3 class="scope-label">본문</h3>
<p>…paragraph 1 text…</p>
<p>…paragraph 2 text…</p>
<h3 class="scope-label">각주</h3>
<p>…footnote paragraph…</p>
```

If a scope has zero paragraphs, its header is STILL rendered with a muted "(비어 있음)" under it — so the user knows that scope was checked and found empty.

---

## 7. Candidate position mapping

### 7.1 The problem

After rendering, each paragraph is a flat string. The `analysis` object has `nonPiiCandidates`, `piiCandidates`, and `entityGroups[*].literals` + `[*].defined`. We need to find WHERE in each paragraph each candidate appears, so we can wrap those spans in `<mark>` elements.

### 7.2 The approach — simple exact-match find

For each paragraph text:
1. Build a sorted list of ALL selectable candidates (entity literals + PII + nonPII regardless of confidence + manual additions).
2. For each candidate text, use `String.indexOf` in a loop to find every occurrence in the paragraph.
3. Collect `(start, end, candidateText)` tuples for every match.
4. Sort tuples by start (ascending) then by length (descending — longer matches win when they overlap).
5. Resolve overlaps: keep the longer/earlier match; drop shorter overlapping ones. (The Phase 0 redactor uses the same "longest-first greedy" rule — mirror it here.)
6. Render the paragraph text by splicing: text before first match + `<mark>` first match + text between first and second + `<mark>` second match + ... + trailing text.

### 7.3 Sort order for candidates (performance)

Sort candidates by text length descending so longest matches are attempted first. This mirrors the Phase 0 `buildTargetsFromZip` longest-first invariant. Once a position is "claimed" by a longer match, shorter candidates that overlap are skipped.

### 7.4 Implementation sketch

```typescript
interface MarkSpan {
  readonly start: number;       // inclusive
  readonly end: number;         // exclusive
  readonly text: string;        // the matched literal (== paragraph.slice(start, end))
  readonly candidate: string;   // the candidate text that matched (same as `text` in simple case)
}

function findMarks(paragraphText: string, candidates: readonly string[]): MarkSpan[] {
  // Phase 1: find all raw occurrences
  const raw: MarkSpan[] = [];
  for (const cand of candidates) {
    if (cand.length === 0) continue;
    let from = 0;
    while (from <= paragraphText.length - cand.length) {
      const idx = paragraphText.indexOf(cand, from);
      if (idx < 0) break;
      raw.push({ start: idx, end: idx + cand.length, text: cand, candidate: cand });
      from = idx + 1;  // advance by 1 so overlaps of the same candidate are all found
    }
  }

  // Phase 2: sort by start asc, then length desc (longest wins ties)
  raw.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  // Phase 3: resolve overlaps — greedy left-to-right, longest-first
  const kept: MarkSpan[] = [];
  let cursor = 0;
  for (const span of raw) {
    if (span.start < cursor) continue;  // overlaps a kept mark
    kept.push(span);
    cursor = span.end;
  }
  return kept;
}
```

### 7.5 Normalization caveat

The `candidate.text` values in `analysis` are ORIGINAL bytes (Phase 0 invariant — candidates are sliced from the unnormalized text). So `paragraphText.indexOf(candidate.text)` works directly without re-normalization.

**Exception edge case:** if the original text had zero-width characters (e.g., `A\u200BBC`), the detection layer stripped them BEFORE matching, so `candidate.text` is `ABC`, but the rendered paragraph text still contains `A\u200BBC` (coalesce preserves zero-width chars — it coalesces runs, not codepoints). In this case `indexOf("ABC")` on `"A\u200BBC"` returns -1 and the highlight is MISSED.

**Mitigation:** do a fallback match using `normalizeForMatching` on the paragraph text, then map back. See § 7.6.

### 7.6 Fallback for zero-width and hyphen-variant cases

If `paragraphText.indexOf(candidate)` returns -1 for a candidate that we KNOW came from this paragraph (based on scope attribution), re-run the match with normalized text:

```typescript
import { normalizeForMatching } from "../detection/normalize.js";

function findMarksWithFallback(paragraphText: string, candidates: readonly string[]): MarkSpan[] {
  const primary = findMarks(paragraphText, candidates);
  const remainingCandidates = candidates.filter((c) =>
    !primary.some((m) => m.candidate === c)
  );

  if (remainingCandidates.length === 0) return primary;

  // Fallback: normalize paragraph, search, map back
  const map = normalizeForMatching(paragraphText);
  const fallback: MarkSpan[] = [];
  for (const cand of remainingCandidates) {
    const normCand = normalizeForMatching(cand).text;
    if (normCand.length === 0) continue;
    let from = 0;
    while (from <= map.text.length - normCand.length) {
      const idx = map.text.indexOf(normCand, from);
      if (idx < 0) break;
      const startOrig = map.origOffsets[idx]!;
      const endOrig = map.origOffsets[idx + normCand.length]!;
      fallback.push({
        start: startOrig,
        end: endOrig,
        text: paragraphText.slice(startOrig, endOrig),
        candidate: cand,
      });
      from = idx + 1;
    }
  }

  // Merge primary + fallback, resolve overlaps same way
  const merged = [...primary, ...fallback];
  merged.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });
  const kept: MarkSpan[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start < cursor) continue;
    kept.push(span);
    cursor = span.end;
  }
  return kept;
}
```

**Performance:** fallback only runs when primary missed a candidate. For most paragraphs primary catches everything and fallback is a no-op.

---

## 8. Highlight rendering

### 8.1 HTML structure

Each matched span is wrapped in a `<mark>` element with data attributes:

```html
<mark
  class="cand-mark"
  class:checked={isSelected(text)}
  class:unchecked={!isSelected(text)}
  data-text={text}
  data-candidate={candidate}
  tabindex="0"
  role="button"
  aria-pressed={isSelected(text)}
  aria-label="Toggle redaction for {text}"
>{text}</mark>
```

Note: in Svelte, we use `{@html}` for efficient rendering OR iterate segments manually. Prefer the segment approach for safety (no HTML escaping issues):

```svelte
{#each segments as seg (seg.key)}
  {#if seg.type === "text"}
    {seg.text}
  {:else if seg.type === "mark"}
    <mark
      class="cand-mark"
      class:checked={appState.isSelected(seg.text)}
      data-text={seg.text}
      tabindex="0"
      role="button"
      aria-pressed={appState.isSelected(seg.text)}
      onclick={() => appState.toggleSelection(seg.text)}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          appState.toggleSelection(seg.text);
        }
      }}
    >{seg.text}</mark>
  {/if}
{/each}
```

### 8.2 `segments` structure

```typescript
type Segment =
  | { readonly type: "text"; readonly key: string; readonly text: string }
  | { readonly type: "mark"; readonly key: string; readonly text: string; readonly candidate: string };
```

The `key` field is a stable identifier for Svelte's keyed `{#each}` iteration. Use `"{scopeIdx}-{paraIdx}-{segIdx}"`.

### 8.3 CSS for highlights

```css
.cand-mark {
  border-radius: 3px;
  padding: 0 2px;
  cursor: pointer;
  transition: all 0.12s ease;
  outline-offset: 2px;
}

/* Checked = solid warm yellow */
.cand-mark.checked {
  background: var(--mark-strong);       /* #fde68a */
  box-shadow: 0 0 0 2px #f59e0b;         /* amber accent (per design-v1 § D5) */
  color: var(--ink);
}

/* Unchecked = dashed outline, no background */
.cand-mark.unchecked {
  background: transparent;
  border: 1px dashed var(--border-strong);
  color: var(--ink-soft);
}

/* Hover */
.cand-mark:hover {
  background: var(--mark);
}

/* Focus (keyboard) */
.cand-mark:focus-visible {
  outline: 2px solid var(--primary);
}

/* Pulse animation for jumped-to candidate */
.cand-mark.pulse {
  animation: pulse 1.2s ease;
}

@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
  50%  { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
```

---

## 9. Click-to-toggle interaction

### 9.1 Mouse click

```svelte
<mark onclick={() => appState.toggleSelection(seg.text)}>...</mark>
```

No event propagation concern — the `<mark>` is not nested inside another clickable element.

### 9.2 Keyboard

`tabindex="0"` makes the mark focusable. Enter and Space toggle. The keyboard handler calls `preventDefault()` on Space to prevent page scroll.

### 9.3 Visual feedback

Selection state is reflected immediately via Svelte's reactive `class:checked` binding. No explicit refresh needed — `appState.selections` is `$state<Set<string>>`, so reading `appState.isSelected(text)` inside the template auto-subscribes.

### 9.4 Category-aware behavior

Click in document = same semantic as click in list row: toggle the selection state for that text. Both surfaces stay in sync via the shared `appState.selections` Set.

---

## 10. Scroll synchronization

### 10.1 One-way: list → document

User action: click the "↓" button on a CandidateRow.

Flow:
1. CandidateRow.onclick → `appState.jumpToCandidate(text)`
2. `appState` sets `focusedCandidate = text` and schedules a cleanup timeout (1.2s).
3. `RenderedBody.svelte` has `$effect` watching `focusedCandidate`.
4. When `focusedCandidate` changes and is non-null:
   - Find the first `<mark data-text={focusedCandidate}>` in the DOM
   - Call `element.scrollIntoView({ block: "center", behavior: "smooth" })`
   - Add `.pulse` class for 1.2s via `setTimeout`
5. After 1.2s, `appState.focusedCandidate = null` (cleanup, so the same candidate can be re-jumped later).

### 10.2 `state.svelte.ts` extension

```typescript
// Add to AppState class:
focusedCandidate = $state<string | null>(null);

private focusClearTimer: ReturnType<typeof setTimeout> | null = null;

jumpToCandidate(text: string): void {
  this.focusedCandidate = text;
  // Clear any pending cleanup for a prior jump
  if (this.focusClearTimer !== null) {
    clearTimeout(this.focusClearTimer);
  }
  this.focusClearTimer = setTimeout(() => {
    this.focusedCandidate = null;
    this.focusClearTimer = null;
  }, 1200);
}
```

**Note:** `focusClearTimer` is private (not `$state`) — it's a non-reactive side-channel for cleanup.

### 10.3 RenderedBody effect

```typescript
import { tick } from "svelte";

$effect(() => {
  const focused = appState.focusedCandidate;
  if (!focused) return;

  // Wait one tick so the DOM reflects any newly-rendered marks
  void tick().then(() => {
    const container = containerRef;
    if (!container) return;
    const mark = container.querySelector<HTMLElement>(
      `mark[data-text="${cssEscape(focused)}"]`
    );
    if (!mark) return;
    mark.scrollIntoView({ block: "center", behavior: "smooth" });
    mark.classList.add("pulse");
    setTimeout(() => mark.classList.remove("pulse"), 1200);
  });
});

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
```

### 10.4 Scroll-back: NOT implemented

Clicking a highlight in the document does NOT scroll the right-panel list to the corresponding row. Reason: the list is short enough that the user can scan it naturally, and keeping scroll sync one-way avoids reactive loops (mark click → selection toggle → highlight re-render → no additional scroll). See decision 3.6.

### 10.5 Multiple occurrences of the same text

If a candidate text appears multiple times in the document, `jumpToCandidate` jumps to the FIRST occurrence. The user can keep clicking the jump button; after the first jump, `focusedCandidate` is cleared in 1.2s, and a second click will jump to the first occurrence AGAIN (same target). This is a minor UX quirk acceptable for v1. A future iteration may cycle through occurrences.

---

## 11. Performance + large documents

### 11.1 Rendering budget

- `renderDocumentBody(zip)` must complete in ≤ 1000 ms on the worst-case fixture (50KB). New perf test added in § 14.
- `RenderedBody.svelte` must paint ≤ 500 ms after receiving props on the same fixture.

### 11.2 Optimizations

- Build the candidate Set ONCE at the component level, not per-paragraph
- `findMarks` runs per-paragraph — for a paragraph with N candidates × M occurrences, it's O(N×M). Acceptable because N is bounded (analysis candidates ≤ ~200) and M is small per paragraph.
- Use `{#key}` in Svelte to avoid re-rendering unchanged paragraphs when only `selections` changes. Actually, the highlight class depends on `selections`, so EVERY `<mark>` needs to re-evaluate its class. But Svelte 5's `$state` proxy tracking handles this per-mark without re-rendering the parent.

### 11.3 Huge documents (out of scope)

A 500-page contract may have 10000+ paragraphs. This phase does NOT implement virtualization. If the worst-case fixture triggers perf issues, document the limitation in the handback. A future phase can add list virtualization (via a small custom virtualizer, no new dependencies).

---

## 12. Component specifications

### 12.1 `src/docx/render-body.ts` (NEW pure module)

```typescript
/**
 * Document body renderer — converts a loaded JSZip into a flat structure
 * suitable for UI rendering.
 *
 * Iterates every text-bearing scope via `listScopes`, reads each scope's XML
 * via `readScopeXml`, splits on paragraph boundaries (same regex the
 * extract-text module uses), and runs each paragraph through
 * `coalesceParagraphRuns` to extract its logical text.
 *
 * Output is a RenderedDocument — ordered scopes, each with ordered paragraphs.
 * Formatting (bold, italic, headings, tables) is NOT preserved; every
 * paragraph is a flat string. Table cells flatten to top-level paragraphs
 * within the containing scope.
 *
 * Pure async function. No DOM, no I/O other than the zip reads (which are
 * jszip's in-memory async).
 *
 * See:
 *   - docs/phases/phase-3-inline-preview.md § 6 (rendering scope)
 *   - src/docx/coalesce.ts (run coalesce)
 *   - src/docx/scopes.ts (scope walker)
 */

import type JSZip from "jszip";

import { coalesceParagraphRuns } from "./coalesce.js";
import { listScopes, readScopeXml } from "./scopes.js";
import type { Scope } from "./types.js";

export interface RenderedParagraph {
  readonly scopeIndex: number;
  readonly text: string;
}

export interface RenderedScope {
  readonly scope: Scope;
  readonly paragraphs: readonly RenderedParagraph[];
}

export interface RenderedDocument {
  readonly scopes: readonly RenderedScope[];
}

/** Paragraph-splitter. Same regex as extract-text.ts (negative lookahead on P|r). */
const PARAGRAPH_RE =
  /<w:p(?!P|r)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:p>)/g;

export async function renderDocumentBody(
  zip: JSZip,
): Promise<RenderedDocument> {
  const out: RenderedScope[] = [];

  for (const scope of listScopes(zip)) {
    const xml = await readScopeXml(zip, scope);
    const paragraphs: RenderedParagraph[] = [];

    // Re-create regex per-scope to avoid lastIndex pollution across scopes
    const re = new RegExp(PARAGRAPH_RE.source, PARAGRAPH_RE.flags);
    let match: RegExpExecArray | null;
    let scopeIdx = 0;
    while ((match = re.exec(xml)) !== null) {
      const paragraphXml = match[0];
      const { text } = coalesceParagraphRuns(paragraphXml);
      paragraphs.push({ scopeIndex: scopeIdx, text });
      scopeIdx++;
    }

    out.push({ scope, paragraphs });
  }

  return { scopes: out };
}
```

**File length target:** ~80 lines. Test file (`render-body.test.ts`) ~150 lines with ≥ 10 tests.

### 12.2 `src/ui/RenderedBody.svelte` (NEW Svelte component)

**Props:**

```typescript
type Props = {
  renderedDoc: RenderedDocument;
  analysis: Analysis;
};
```

**Responsibilities:**
1. Build the candidate list (from analysis + manualAdditions) — one flat array sorted by length desc.
2. For each scope: render a `<h3 class="scope-label">` + iterate paragraphs.
3. For each paragraph: compute segments via `findMarksWithFallback` + render.
4. Watch `appState.focusedCandidate` for scroll sync.

**Structure (abbreviated):**

```svelte
<script lang="ts">
  import { tick } from "svelte";
  import { normalizeForMatching } from "../detection/normalize.js";
  import type { Analysis } from "./engine.js";
  import { appState } from "./state.svelte.ts";
  import type { RenderedDocument } from "../docx/render-body.js";
  import type { Scope } from "../docx/types.js";

  type Props = {
    renderedDoc: RenderedDocument;
    analysis: Analysis;
  };

  let { renderedDoc, analysis }: Props = $props();
  let containerRef: HTMLDivElement | undefined = $state(undefined);

  let allCandidates = $derived.by(() => {
    const set = new Set<string>();
    for (const group of analysis.entityGroups) {
      for (const c of group.literals) set.add(c.text);
      for (const c of group.defined) set.add(c.text);
    }
    for (const p of analysis.piiCandidates) set.add(p.text);
    for (const n of analysis.nonPiiCandidates) set.add(n.text);
    for (const bucket of appState.manualAdditions.values()) {
      for (const t of bucket) set.add(t);
    }
    // Sort by length desc so longer matches win overlap resolution
    return [...set].sort((a, b) => b.length - a.length);
  });

  function scopeLabel(scope: Scope): string {
    switch (scope.kind) {
      case "body": return "본문";
      case "header": return `머리글 ${scope.index ?? ""}`.trim();
      case "footer": return `바닥글 ${scope.index ?? ""}`.trim();
      case "footnotes": return "각주";
      case "endnotes": return "미주";
      case "comments": return "메모";
    }
  }

  /* findMarks, findMarksWithFallback, buildSegments — see § 7 */

  $effect(() => {
    const focused = appState.focusedCandidate;
    if (!focused) return;
    void tick().then(() => {
      if (!containerRef) return;
      const mark = containerRef.querySelector<HTMLElement>(
        `mark[data-text="${focused.replace(/["\\]/g, "\\$&")}"]`
      );
      if (!mark) return;
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      mark.classList.add("pulse");
      setTimeout(() => mark.classList.remove("pulse"), 1200);
    });
  });
</script>

<div class="doc-body" bind:this={containerRef}>
  {#each renderedDoc.scopes as scope, si (si)}
    <h3 class="scope-label">{scopeLabel(scope.scope)}</h3>
    {#if scope.paragraphs.length === 0}
      <p class="scope-empty">(비어 있음)</p>
    {:else}
      {#each scope.paragraphs as para, pi (si + "-" + pi)}
        {#if para.text.length === 0}
          <p class="para empty">&nbsp;</p>
        {:else}
          {@const segments = buildSegments(para.text, allCandidates, si, pi)}
          <p class="para">
            {#each segments as seg (seg.key)}
              {#if seg.type === "text"}{seg.text}{:else}
                <mark
                  class="cand-mark"
                  class:checked={appState.isSelected(seg.text)}
                  class:unchecked={!appState.isSelected(seg.text)}
                  data-text={seg.text}
                  tabindex="0"
                  role="button"
                  aria-pressed={appState.isSelected(seg.text)}
                  aria-label={`Toggle redaction for ${seg.text}`}
                  onclick={() => appState.toggleSelection(seg.text)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      appState.toggleSelection(seg.text);
                    }
                  }}
                >{seg.text}</mark>
              {/if}
            {/each}
          </p>
        {/if}
      {/each}
    {/if}
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
    line-height: 1.6;
    font-size: 13.5px;
    color: var(--ink);
  }
  .scope-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
    margin: 20px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .scope-label:first-child { margin-top: 0; }
  .scope-empty { color: var(--ink-muted); font-style: italic; }
  .para { margin: 0 0 8px; }
  .para.empty { height: 1em; }

  .cand-mark {
    border-radius: 3px;
    padding: 0 2px;
    cursor: pointer;
    transition: all 0.12s ease;
    outline-offset: 2px;
  }
  .cand-mark.checked {
    background: var(--mark-strong);
    box-shadow: 0 0 0 2px #f59e0b;
    color: var(--ink);
  }
  .cand-mark.unchecked {
    background: transparent;
    border: 1px dashed var(--border-strong);
    color: var(--ink-soft);
  }
  .cand-mark:hover { background: var(--mark); }
  .cand-mark:focus-visible {
    outline: 2px solid var(--primary);
  }
  .cand-mark.pulse { animation: pulse 1.2s ease; }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
    50%  { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
    100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  }
</style>
```

**File length target:** ~200 lines including CSS and all helper functions.

### 12.3 `src/ui/DocumentPreview.svelte` (REWRITTEN postParse branch)

**Only the postParse branch changes.** All other phase branches (idle drop zone, parsing spinner, redacting overlay, downloadReady success card, verifyFail red banner, fatalError) preserve their current content byte-for-byte.

**New postParse structure (abbreviated):**

```svelte
{:else if phase.kind === "postParse"}
  <div class="main-card main-card-compact">
    <!-- Compact file metadata header -->
    <header class="file-header">
      <h2 class="file-name">{phase.fileName}</h2>
      <div class="file-stats">
        <span>{formatBytes(phase.analysis.fileStats.sizeBytes)}</span>
        <span>·</span>
        <span>{phase.analysis.fileStats.scopeCount} scopes</span>
      </div>
    </header>

    <!-- Loading state for renderDocumentBody -->
    {#await loadRenderedDoc(phase.bytes)}
      <div class="loading">렌더링 중…</div>
    {:then renderedDoc}
      <RenderedBody {renderedDoc} analysis={phase.analysis} />
    {:catch err}
      <div class="error">렌더링 실패: {err.message}</div>
    {/await}
  </div>
{:else if phase.kind === "redacting"}
  <!-- UNCHANGED -->
{:else if phase.kind === "downloadReady"}
  <!-- UNCHANGED -->
...
```

**`loadRenderedDoc` helper (in the `<script>` block):**

```typescript
import JSZip from "jszip";
import { renderDocumentBody, type RenderedDocument } from "../docx/render-body.js";
import RenderedBody from "./RenderedBody.svelte";

async function loadRenderedDoc(bytes: Uint8Array): Promise<RenderedDocument> {
  const zip = await JSZip.loadAsync(bytes.slice());
  return await renderDocumentBody(zip);
}
```

**File length target:** DocumentPreview stays around its current size (~680 lines) because the other 6 branches are large; the postParse branch content is replaced but not shortened dramatically.

### 12.4 `src/ui/CandidateRow.svelte` (MINOR addition)

Add a "↓ jump" icon button to the right side of each row, BEFORE any existing manual "×" button:

```svelte
<button
  type="button"
  class="row-jump"
  aria-label="Jump to document position"
  title="Jump to position"
  onclick={(e) => {
    e.stopPropagation();
    appState.jumpToCandidate(text);
  }}
>↓</button>
```

CSS:

```css
.row-jump {
  background: transparent;
  border: none;
  color: var(--ink-soft);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s ease;
}
.row-jump:hover {
  background: var(--primary-bg);
  color: var(--primary);
}
.row-jump:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

The button appears on EVERY row (regardless of isManual). Place it in the row template just before the existing manual-remove "×" button (if present).

### 12.5 `src/ui/state.svelte.ts` (extension)

Add to `AppState`:

```typescript
/**
 * Candidate text currently in "focused" state — set when the user clicks the
 * jump-to button on a CandidateRow. RenderedBody uses this to scroll the
 * document viewport and flash the mark. Cleared automatically after 1.2s.
 */
focusedCandidate = $state<string | null>(null);

private focusClearTimer: ReturnType<typeof setTimeout> | null = null;

jumpToCandidate(text: string): void {
  this.focusedCandidate = text;
  if (this.focusClearTimer !== null) {
    clearTimeout(this.focusClearTimer);
  }
  this.focusClearTimer = setTimeout(() => {
    this.focusedCandidate = null;
    this.focusClearTimer = null;
  }, 1200);
}
```

Also extend `reset()` to clear the focus state:

```typescript
reset(): void {
  this.phase = { kind: "idle" };
  this.selections = new Set();
  this.manualAdditions = new Map([
    ["literals", new Set()],
    ["financial", new Set()],
    ["temporal", new Set()],
    ["entities", new Set()],
    ["legal", new Set()],
  ]);
  this.focusedCandidate = null;
  if (this.focusClearTimer !== null) {
    clearTimeout(this.focusClearTimer);
    this.focusClearTimer = null;
  }
}
```

---

## 13. Accessibility

- Each `<mark>` has `role="button"`, `tabindex="0"`, `aria-pressed={isSelected}`, and `aria-label="Toggle redaction for {text}"`. Screen readers announce the state.
- Keyboard: Tab cycles through marks in reading order. Enter/Space toggles. Esc (inside a focused mark) does nothing — not needed.
- Focus-visible outline on marks: `outline: 2px solid var(--primary)`.
- Jump button on CandidateRow has `aria-label="Jump to document position"`.
- Scope labels (`<h3>`) contribute to the document outline for screen reader navigation (e.g., user can jump between scopes via heading nav).
- Checked/unchecked states differ in BOTH color AND border style, so color-blind users can still distinguish.

---

## 14. Testing strategy

### 14.1 `render-body.test.ts` (NEW, ~10 tests)

Exercise `renderDocumentBody` against the worst-case fixture and synthetic inputs:

```typescript
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";

import { renderDocumentBody } from "./render-body.js";

describe("renderDocumentBody", () => {
  async function loadFixture(): Promise<JSZip> {
    const bytes = readFileSync("tests/fixtures/bilingual_nda_worst_case.docx");
    return await JSZip.loadAsync(bytes);
  }

  it("returns a RenderedDocument with scopes in listScopes order", async () => {
    const zip = await loadFixture();
    const doc = await renderDocumentBody(zip);
    expect(doc.scopes.length).toBeGreaterThan(0);
    expect(doc.scopes[0]!.scope.kind).toBe("body");
  });

  it("every scope has at least one paragraph OR is explicitly empty", async () => {
    const zip = await loadFixture();
    const doc = await renderDocumentBody(zip);
    for (const s of doc.scopes) {
      expect(Array.isArray(s.paragraphs)).toBe(true);
    }
  });

  it("paragraphs have scopeIndex matching their position", async () => {
    const zip = await loadFixture();
    const doc = await renderDocumentBody(zip);
    for (const s of doc.scopes) {
      s.paragraphs.forEach((p, i) => expect(p.scopeIndex).toBe(i));
    }
  });

  it("the worst-case fixture contains 'ABC Corporation' text in the body", async () => {
    const zip = await loadFixture();
    const doc = await renderDocumentBody(zip);
    const bodyScope = doc.scopes.find((s) => s.scope.kind === "body")!;
    const bodyText = bodyScope.paragraphs.map((p) => p.text).join("\n");
    expect(bodyText).toContain("ABC");
  });

  it("the worst-case fixture body contains at least one Korean paragraph", async () => {
    const zip = await loadFixture();
    const doc = await renderDocumentBody(zip);
    const bodyScope = doc.scopes.find((s) => s.scope.kind === "body")!;
    const hasKorean = bodyScope.paragraphs.some((p) => /[\uAC00-\uD7A3]/.test(p.text));
    expect(hasKorean).toBe(true);
  });

  it("empty paragraphs are preserved as empty strings (not skipped)", async () => {
    // Synthetic zip with <w:p/> empty paragraphs
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:body><w:p/><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>");
    const doc = await renderDocumentBody(zip);
    const bodyScope = doc.scopes.find((s) => s.scope.kind === "body");
    expect(bodyScope).toBeDefined();
    // Empty paragraph + "hello" = 2 paragraphs
    expect(bodyScope!.paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it("completes within 1000ms on the worst-case fixture (perf budget)", async () => {
    const zip = await loadFixture();
    const start = Date.now();
    await renderDocumentBody(zip);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("output is deterministic — same input produces same output", async () => {
    const zip = await loadFixture();
    const a = await renderDocumentBody(zip);
    const b = await renderDocumentBody(zip);
    expect(a).toEqual(b);
  });

  // + 2 more edge-case tests per author's discretion
});
```

### 14.2 `engine.test.ts` extensions (~3 new tests)

Not much to add here since `engine.ts` is unchanged in Phase 3. But include sanity tests confirming the Phase 3 rendering doesn't alter `Analysis` semantics:

```typescript
it("Analysis shape is unchanged by Phase 3 (no new fields, same types)", async () => {
  const bytes = readFileSync("tests/fixtures/bilingual_nda_worst_case.docx");
  const analysis = await analyzeZip(new Uint8Array(bytes), ["ABC Corporation"]);
  // Existing keys
  expect(Object.keys(analysis).sort()).toEqual(
    ["entityGroups", "fileStats", "nonPiiCandidates", "piiCandidates"].sort()
  );
});
```

### 14.3 `ship-gate.test.ts` extensions (~2 new tests)

```typescript
it("jumpToCandidate sets focusedCandidate and auto-clears after 1.2s", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  await appState.loadFile(new File([bytes], "test.docx"));
  appState.jumpToCandidate("ABC Corporation");
  expect(appState.focusedCandidate).toBe("ABC Corporation");
  // Wait 1.5s (> 1.2s timeout)
  await new Promise((r) => setTimeout(r, 1500));
  expect(appState.focusedCandidate).toBeNull();
});

it("reset() clears focusedCandidate", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  await appState.loadFile(new File([bytes], "test.docx"));
  appState.jumpToCandidate("ABC Corporation");
  appState.reset();
  expect(appState.focusedCandidate).toBeNull();
});
```

### 14.4 No Svelte component tests

Consistent with Phase 0/1/2 convention — no DOM testing infrastructure. Visual verification is manual per the handback checklist.

### 14.5 Total Phase 3 test count

- `render-body.test.ts`: ~10 new tests
- `engine.test.ts`: ~1 sanity test (Phase 3 doesn't change Analysis shape)
- `ship-gate.test.ts`: ~2 new tests
- **Total new: ~13 tests**, bringing suite from 1548 → ~1561.

---

## 15. TDD sequence (9 steps, execute IN ORDER)

### Step 1 — Baseline verification (no commit)

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"
bun run test 2>&1 | tail -5
# Expected: 1548 passing (after Phase 2)
bun run typecheck 2>&1 | tail -3
# Expected: 0 errors

PHASE2_HEAD=$(git rev-parse --short HEAD)
echo "Phase 2 HEAD: $PHASE2_HEAD"
```

If not 1548, STOP — Phase 2 did not merge.

### Step 2 — Create `src/docx/render-body.ts` (1 commit)

Create the module per § 12.1. Add `src/docx/render-body.test.ts` with ≥ 10 tests per § 14.1.

**Verify:**
```bash
bun run test src/docx/render-body.test.ts 2>&1 | tail -5
bun run typecheck 2>&1 | tail -3
```

**Commit message:** `feat(docx): add render-body module — zip → RenderedDocument for UI preview`

### Step 3 — Extend `state.svelte.ts` with focusedCandidate (1 commit)

Add per § 12.5 (focusedCandidate field + jumpToCandidate verb + reset extension).

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run test 2>&1 | tail -5
# Expected: all 1548 tests still pass (no new tests yet)
```

**Commit message:** `feat(ui/state): add focusedCandidate + jumpToCandidate verb for scroll sync`

### Step 4 — Extend `ship-gate.test.ts` (1 commit)

Add 2 new tests per § 14.3 + 1 sanity test for `engine.test.ts` per § 14.2.

**Verify:**
```bash
bun run test src/ui/ship-gate.test.ts 2>&1 | tail -5
bun run test src/ui/engine.test.ts 2>&1 | tail -5
```

**Commit message:** `test(ui): add focusedCandidate lifecycle tests + Analysis shape sanity`

### Step 5 — Create `RenderedBody.svelte` (1 commit)

Create per § 12.2 with full template + helpers + CSS.

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
bun run build 2>&1 | tail -5  # must build even though component isn't yet used
```

**Commit message:** `feat(ui): add RenderedBody.svelte — inline-highlighted document preview`

### Step 6 — Add jump button to `CandidateRow.svelte` (1 commit)

Add per § 12.4. Button appears before the manual "×" button (if present).

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
bun run test 2>&1 | tail -5
# All tests still pass
```

**Commit message:** `feat(ui): add jump-to-document button on CandidateRow`

### Step 7 — Rewrite `DocumentPreview.svelte` postParse branch (1 commit)

Rewrite per § 12.3. Only the postParse branch changes — all 6 other branches preserved byte-for-byte.

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
bun run test 2>&1 | tail -5
bun run build 2>&1 | tail -5
```

**Commit message:** `feat(ui): replace DocumentPreview postParse metadata card with inline RenderedBody`

### Step 8 — Build determinism + ship gate verification (no commit)

Run the full verification sequence from § 16. Fix any issue in a new commit if needed.

### Step 9 — Handback document (1 commit)

Create `docs/phases/phase-3-handback.md` using the template in § 17.5.

**Commit message:** `docs(phases): add Phase 3 handback — inline document preview complete`

### TDD step summary

| Step | Files | Tests added | Running total |
|---|---|---:|---:|
| 1 | (verify) | 0 | 1548 |
| 2 | render-body.ts, render-body.test.ts | +10 | 1558 |
| 3 | state.svelte.ts | 0 | 1558 |
| 4 | ship-gate.test.ts, engine.test.ts | +3 | 1561 |
| 5 | RenderedBody.svelte | 0 | 1561 |
| 6 | CandidateRow.svelte | 0 | 1561 |
| 7 | DocumentPreview.svelte | 0 | 1561 |
| 8 | (verify + build) | 0 | 1561 |
| 9 | phase-3-handback.md | 0 | 1561 |

### Commit conventions

Same as Phase 0/1/2. `<type>(<scope>): <summary>` + HEREDOC body + `Co-Authored-By: Codex <noreply@openai.com>`.

---

## 16. Verification commands (ship gate)

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"

# 1. Git state
git status
git log --oneline $PHASE2_HEAD..HEAD  # 7-9 new commits

# 2. Tests
bun run test 2>&1 | tail -10
# Expected: ~1561 passing, 0 failing

# 3. Phase 0 ship gate
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tail -5
# Expected: 24 passing

# 4. Phase 1 tests
bun run test src/detection/detect-all.test.ts 2>&1 | tail -5
bun run test src/detection/detect-all.integration.test.ts 2>&1 | tail -5

# 5. Phase 2 tests
bun run test src/ui/engine.test.ts 2>&1 | tail -5
bun run test src/ui/ship-gate.test.ts 2>&1 | tail -5

# 6. Phase 3 new tests
bun run test src/docx/render-body.test.ts 2>&1 | tail -5
# Expected: ≥ 10 passing

# 7. Type check
bun run typecheck 2>&1 | tail -5
# Expected: 0 errors

# 8. Lint
bun run lint 2>&1 | tail -5
# Expected: 0 errors (pre-existing warnings OK)

# 9. Build
bun run build 2>&1 | tail -10

# 10. Build determinism
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build 2>&1 > /dev/null
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
[ "$FIRST" = "$SECOND" ] && echo "DETERMINISM OK: $FIRST" || echo "FAIL"

# 11. No changes to locked directories
git diff $PHASE2_HEAD -- src/detection/ | head -5  # expect empty
git diff $PHASE2_HEAD -- src/propagation/ | head -5
git diff $PHASE2_HEAD -- src/finalize/ | head -5

# 12. Locked UI files unchanged
git diff $PHASE2_HEAD -- src/ui/engine.ts | head -5           # empty
git diff $PHASE2_HEAD -- src/ui/CandidatesPanel.svelte | head -5  # empty
git diff $PHASE2_HEAD -- src/ui/CategorySection.svelte | head -5  # empty
git diff $PHASE2_HEAD -- src/ui/AddCandidateInput.svelte | head -5  # empty
git diff $PHASE2_HEAD -- src/ui/App.svelte | head -5          # empty
git diff $PHASE2_HEAD -- src/ui/Sidebar.svelte | head -5      # empty
git diff $PHASE2_HEAD -- src/ui/Topbar.svelte | head -5       # empty
git diff $PHASE2_HEAD -- src/ui/Footer.svelte | head -5       # empty
git diff $PHASE2_HEAD -- src/ui/styles.css | head -5          # empty

# 13. Locked docx files unchanged
git diff $PHASE2_HEAD -- src/docx/coalesce.ts src/docx/scopes.ts src/docx/types.ts | head -5  # empty

# 14. No network code
grep -rn 'fetch\|XMLHttpRequest\|WebSocket\|EventSource\|sendBeacon' src/ui/*.svelte src/ui/*.ts src/docx/render-body.ts 2>&1 | grep -v '\.test\.' | grep -v 'import type\|^import' || echo "clean"

# 15. No try/catch in new/modified components
grep -rn '\btry\b' src/ui/RenderedBody.svelte src/docx/render-body.ts src/ui/CandidateRow.svelte 2>&1 | head -5 || echo "clean"
# Expected: clean

# 16. Performance — rendering + detection within budget
bun run test src/docx/render-body.test.ts --grep "perf" 2>&1 | tail -5
```

---

## 17. Gotchas + out-of-scope + acceptance + handback + error handling

### 17.1 Gotchas

**17.1.1 Svelte 5 `{@const}` inside `{#each}`.** Used in the RenderedBody template for computing `segments` per paragraph. This is a Svelte 5 feature; verify it's supported in the project's Svelte version.

**17.1.2 CSS escaping in `querySelector`.** When looking up marks by `data-text`, the candidate text may contain quotes or backslashes. Use `cssEscape()` (defined in RenderedBody) to escape those characters. Do NOT use DOM APIs that accept CSS selectors with raw candidate text — it will break on "일 인의 변호사".

**17.1.3 `$effect` cleanup.** The scroll sync `$effect` uses `setTimeout` for the pulse class removal. Svelte 5 `$effect` can return a cleanup function; if the focused candidate changes mid-animation, clear the pending timeout to prevent removing the NEW mark's pulse prematurely.

**17.1.4 Empty paragraphs.** The existing `extract-text.ts` skips self-closing `<w:p/>` empty paragraphs. Phase 3 `render-body.ts` uses the same regex but SHOULD include empty paragraphs (rendered as `&nbsp;`) so the visual layout resembles the original document. Verify the regex handles `<w:p/>` to produce an empty-string paragraph.

**17.1.5 Performance on very long paragraphs.** A single paragraph with 10000+ characters and 50 candidates would run `findMarks` with O(N) indexOf loops. The implementation is still O(N×M×K) where N=paragraph length, M=candidates, K=occurrences. Acceptable for worst-case fixture but may need optimization (trie or Aho-Corasick) for pathological inputs in a future phase.

**17.1.6 Reactive subscription to `appState.manualAdditions`.** The `allCandidates` $derived includes `manualAdditions`. When the user adds a candidate via AddCandidateInput, `manualAdditions` updates (via the Map-reassign pattern from Phase 2 § 11). The $derived re-runs and the new candidate shows up in the rendered body. Verify this flow actually works in manual testing.

**17.1.7 Scope label for body.** The label is "본문" (Korean for "body"). This is intentional — the UI is Korean-language. If the user prefers English, update all labels to English in § 6.3; but for v1 keep Korean.

**17.1.8 Zero-width characters in candidates.** If a candidate text itself contains a zero-width char (rare), `indexOf` may fail on a normalized paragraph. The § 7.6 fallback handles this.

**17.1.9 `JSZip.loadAsync(bytes.slice())`.** The rewritten DocumentPreview loads the zip a SECOND time (analyzeZip already loaded it, but the analysis output doesn't include the zip). The `.slice()` creates a fresh buffer view so the first analyzer can't interfere. Accept the small perf cost — it's ~30ms on the worst-case fixture.

### 17.2 Out of scope (DO NOT DO)

- ❌ Modify ANY detection-layer file
- ❌ Modify `src/ui/engine.ts`, `Analysis`, `NonPiiCandidate`, `PiiCandidate`, `defaultSelections`, `analyzeZip`, `applyRedaction`
- ❌ Modify `CandidatesPanel.svelte`, `CategorySection.svelte`, `AddCandidateInput.svelte`
- ❌ Modify `App.svelte`, `Sidebar.svelte`, `Topbar.svelte`, `Footer.svelte`, `main.ts`, `styles.css`
- ❌ Modify any existing `src/docx/*.ts` file (only ADD `render-body.ts` + `render-body.test.ts`)
- ❌ Modify `package.json`, `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `svelte.config.js`
- ❌ Add Svelte component test infrastructure (no `@testing-library/svelte`, no `happy-dom`)
- ❌ Add bold/italic/underline rendering
- ❌ Add table structure rendering (flatten to paragraphs)
- ❌ Add image rendering
- ❌ Add heading/list formatting
- ❌ Add virtualization for long documents
- ❌ Add bidirectional scroll sync (only list → document)
- ❌ Add highlight cycling through multiple occurrences (first-occurrence only)
- ❌ Add dark mode
- ❌ Add new npm dependencies
- ❌ `git push`

### 17.3 Acceptance criteria

1. ✅ `bun run test` passes (≥ 1561 passing, 0 failing)
2. ✅ `bun run typecheck` → 0 errors
3. ✅ `bun run lint` → 0 errors (pre-existing warnings OK)
4. ✅ `bun run build` succeeds
5. ✅ Build determinism verified
6. ✅ `src/docx/render-body.ts` exists with `renderDocumentBody` export
7. ✅ `src/docx/render-body.test.ts` has ≥ 10 tests, all passing
8. ✅ `src/ui/RenderedBody.svelte` exists
9. ✅ `src/ui/CandidateRow.svelte` has a jump button (`↓`) per row
10. ✅ `src/ui/state.svelte.ts` exports `focusedCandidate: string | null` field
11. ✅ `AppState.jumpToCandidate(text)` method exists and sets focusedCandidate
12. ✅ `focusedCandidate` auto-clears after 1200ms (tested in ship-gate)
13. ✅ `reset()` clears focusedCandidate
14. ✅ DocumentPreview postParse branch uses `RenderedBody` (not the old metadata-only card)
15. ✅ All 6 non-postParse phase branches of DocumentPreview preserved byte-for-byte
16. ✅ `Analysis` shape unchanged (`engine.ts` not modified except possibly 0 lines)
17. ✅ Locked UI files unchanged (CandidatesPanel, CategorySection, AddCandidateInput, App, Sidebar, Topbar, Footer, main, styles)
18. ✅ Locked docx files unchanged (coalesce, scopes, types, etc.)
19. ✅ Zero changes under `src/detection/`, `src/propagation/`, `src/finalize/`
20. ✅ No new npm dependencies
21. ✅ Phase 0 ship gate passes
22. ✅ Phase 1 tests pass
23. ✅ Phase 2 tests pass
24. ✅ No try/catch in `render-body.ts`, `RenderedBody.svelte`, or the new button handler in `CandidateRow.svelte`
25. ✅ No network code in any Phase 3 file
26. ✅ renderDocumentBody perf budget: ≤ 1000ms on worst-case fixture
27. ✅ 7–9 commits with conventional format + `Co-Authored-By: Codex`
28. ✅ Handback doc at `docs/phases/phase-3-handback.md`
29. ✅ On manual verification: dropping the worst-case fixture renders the body inline with at least one visible `<mark>` highlight
30. ✅ On manual verification: clicking a highlight in the document toggles its selection state (visual + internal)

### 17.4 Error handling (3-attempt rule)

Same as Phase 0/1/2. If 3 attempts fail, write BLOCKED section in handback and exit.

**If `renderDocumentBody` fails on a fixture:**
- Check scope walker is returning what you expect (`listScopes(zip)` is not empty)
- Check `coalesceParagraphRuns` on one paragraph XML manually
- Verify PARAGRAPH_RE matches the test fixture's paragraph structure

**If the `<mark>` click doesn't toggle selection:**
- Verify `onclick` is attached to the right element
- Check `appState.toggleSelection` is imported correctly
- Inspect the DOM in browser to see if `class:checked` is updating

**If scroll sync doesn't fire:**
- Verify `$effect` is inside the `<script>` block of RenderedBody (not inside a function body)
- Check `focusedCandidate` is being set (console.log in jumpToCandidate)
- Check `containerRef` is bound via `bind:this`
- Verify `tick()` is imported from "svelte"

**If the perf budget test fails:**
- Profile: is `findMarks` the hot path? If so, skip the fallback when primary is non-empty (it is — that's the existing behavior).
- Check `allCandidates` is $derived (not recomputed per paragraph)
- DO NOT add virtualization — out of scope

### 17.5 Handback document template

Create `docs/phases/phase-3-handback.md`:

```markdown
# Phase 3 handback — Inline document preview

**Completed:** YYYY-MM-DD HH:MM
**Executed by:** Codex 5.4 xhigh
**Starting commit:** {Phase 2 HEAD short hash}
**Ending commit:** {short hash of HEAD}

## Summary

One paragraph describing the inline preview, the rendering approach, components added.

## Commits created

{git log --oneline {Phase2HEAD}..HEAD}

## Files created

- src/docx/render-body.ts ({N} lines)
- src/docx/render-body.test.ts ({N} lines)
- src/ui/RenderedBody.svelte ({N} lines)
- docs/phases/phase-3-handback.md

## Files modified

- src/ui/DocumentPreview.svelte (postParse branch replaced: {old} → {new} lines)
- src/ui/CandidateRow.svelte (+jump button: +{N} lines)
- src/ui/state.svelte.ts (+focusedCandidate +jumpToCandidate: +{N} lines)
- src/ui/engine.test.ts (+1 sanity test)
- src/ui/ship-gate.test.ts (+2 tests)

## Tests

- Before: 1548 passing
- After: {N} passing
- New: +13 tests (10 render-body + 2 ship-gate + 1 engine sanity)

## Build

- Before hash (Phase 2): {old hash}
- After hash (Phase 3): {new hash}
- Determinism: yes

## Performance

- `renderDocumentBody` on worst-case fixture: {N} ms (budget: 1000ms)
- First paint of RenderedBody on worst-case fixture (manual measurement in browser): {N} ms

## Acceptance criteria

{30 criteria with ✅ / ❌ and evidence}

## Deviations from brief

{None OR explanation}

## Gotchas encountered

{Anything non-obvious}

## Manual verification recommended

- [ ] Open dist/document-redactor.html in browser
- [ ] Drop tests/fixtures/bilingual_nda_worst_case.docx
- [ ] Center area shows the contract body with inline highlights (not the old metadata card)
- [ ] Scope headers visible (본문, 각주, 머리글 1, etc.)
- [ ] Click a highlight — verify it toggles (checked ↔ unchecked visual)
- [ ] Click the "↓" button on a row in the right panel — verify the document scrolls to that position and the mark pulses
- [ ] Multi-scope fixture: scroll through body → 각주 transition
- [ ] Empty paragraphs render as visible blank lines
- [ ] Heuristics (unchecked by default) show as dashed/light highlights
- [ ] Manually added candidates (via + 추가) appear as highlights after re-render

## Suggested next steps

1. Phase 4 — Heuristic tuning (requires real-contract corpus)
2. Phase 5 — Lane C consolidation
3. Phase 6 — Korean NFD→NFC hardening
4. Virtualization for > 500-page documents (if real use surfaces the need)
5. Bidirectional scroll sync (document-click → list-scroll) — only if users request
6. Multi-occurrence cycling (jump button advances through occurrences)
7. Bold/italic preservation (if users request formatting fidelity)
```

---

## End of brief

This document is `docs/phases/phase-3-inline-preview.md`. It specifies the inline document preview that makes the contract body the primary review surface. 1 new pure module + 1 new Svelte component + minor extensions to 3 existing files. Phase 2's category-grouped list stays intact with a single small addition (the jump button). All decisions are locked. The 9 TDD steps, 16 verification commands, and 30 acceptance criteria are the execution contract.
