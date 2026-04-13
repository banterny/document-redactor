# Phase 7 — Contract hardening (landline UI seam + real language filtering + truthful inline preview)

> ✅ **READY FOR CODEX EXECUTION** ✅
>
> Authored 2026-04-13 after a full-code review surfaced 3 concrete correctness
> bugs that cross phase boundaries:
>
> - **Phase 6 landline rule can crash the UI path.** `identifiers.phone-kr-landline`
>   exists in detection, but the Phase 2 UI engine still bridges identifier
>   subcategories through the legacy Phase 0 `DetectedMatch["kind"]` union.
>   A real Korean landline can therefore trigger `Unknown identifier subcategory`.
> - **`detectAll()` computes document language but does not actually honor it.**
>   When no override is passed, it still calls `runAllPhases(..., { language:
>   "mixed" })`, which means "run every language track." The returned
>   `documentLanguage` and the actual rule execution set can disagree.
> - **Inline preview can visually contradict the export result.** A longer
>   unchecked candidate can hide a shorter checked candidate in the preview,
>   even though the shorter checked candidate will still redact the output.
>
> This phase fixes those three bugs together. Scope is intentionally narrow:
> one shared UI PII helper, one detection contract fix, one preview-mark
> algorithm fix, and the tests needed to lock them down.

---

**For:** Codex 5.4 xhigh  
**Project:** document-redactor  
**Branch:** `main`  
**Starting commit:** `5ff2098` (Phase 6 handback HEAD) or descendant  
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`  
**Date written:** 2026-04-13  
**Author of brief:** Codex, at user request after full-repo review  
**Predecessor:** `docs/phases/phase-6-label-driven-pii.md` + `docs/phases/phase-6-handback.md`

---

## 0. How to read this document

This is a **self-contained execution spec** for fixing the 3 review findings below:

1. landline UI seam crash
2. `detectAll()` language contract violation
3. preview/export truthfulness mismatch

Read the whole document before touching code. The engineering decisions are already made. Your job is to execute them cleanly, not to re-debate them.

### Sections

0. How to read this document  
1. Mission statement  
2. Required reading  
3. Invariants (DO NOT VIOLATE)  
4. Problem statement  
5. Architecture and locked decisions  
6. Detailed implementation spec  
7. File layout  
8. Testing strategy  
9. TDD sequence  
10. Verification commands  
11. Gotchas  
12. Out of scope  
13. Acceptance criteria  
14. Handback requirements

### Decisions locked

| Ref | Decision | Rationale |
|---|---|---|
| **7.1** Fix the landline issue at the UI seam, not by changing detection rules | The rule is correct; the bridge from Phase 1/6 detection into the Phase 2 UI is stale. |
| **7.2** `phone-kr-landline` remains a distinct UI PII kind | Do not collapse it into `phone-kr`; preserve rule fidelity and future-proofing. |
| **7.3** Add one shared pure helper for UI PII kind mapping + labels | Prevent mapping drift between `engine.ts` and `CandidatesPanel.svelte`. |
| **7.4** `detectAll()` must pass the actual detected language to `runAllPhases()` when no override is supplied | The current `"mixed"` fallback violates the API contract and inflates false positives. |
| **7.5** Strengthen tests to assert **absence** of opposite-language matches, not just presence of expected matches | Current tests are too weak to catch the language bug. |
| **7.6** Inline preview must prefer **selected** spans over **unchecked** overlapping spans | Preview truthfulness matters more than showing every unchecked affordance inline. |
| **7.7** Keep longest-first overlap resolution **within each priority tier** | Preserves current matching intuition and aligns with actual redaction behavior for selected targets. |
| **7.8** Hidden overlapping unchecked candidates remain accessible via the side panel | Do not invent a new inline overlap picker in this phase. |
| **7.9** No changes to actual redaction, verifier, or DOCX mutation semantics | This phase hardens contracts and preview truthfulness only. |
| **7.10** No new npm dependencies and no config churn | Same invariant as prior phases. |

### What this document is NOT

- Not a rulebook expansion phase.
- Not a language-detector heuristic redesign.
- Not a verifier redesign.
- Not an inline occurrence navigator.
- Not a full UI rewrite.

---

## 1. Mission statement

Make the detection-to-UI contract truthful and extension-safe.

After this phase:

- a Korean landline candidate must flow cleanly from Phase 6 detection into the UI without throwing
- `detectAll()` must actually execute the language track it reports
- the inline preview must never visually imply "this text will survive" when the current selection set will in fact redact it

Expected deliverables:

- **1 new pure UI helper module**
- **1 detection contract fix**
- **1 preview-mark extraction/refactor**
- **targeted tests for all 3 bugs**
- **zero new dependencies**

---

## 2. Required reading

Read these before implementation. Earlier entries win on conflict.

1. **`src/ui/engine.ts`** — current `PiiCandidate`, identifier subcategory bridge, `aggregateAll()`.
2. **`src/ui/CandidatesPanel.svelte`** — current `piiKindLabel()` switch and PII section rendering.
3. **`src/detection/detect-all.ts`** — current `detectAll()` implementation.
4. **`src/detection/_framework/runner.ts`** — authoritative meaning of `language: "mixed"` and auto-detection behavior.
5. **`src/ui/RenderedBody.svelte`** — current mark-building algorithm and overlap resolution.
6. **`src/ui/engine.test.ts`** — current engine seam tests.
7. **`src/detection/detect-all.test.ts`** — current `detectAll` and `detectAllInZip` contract tests.
8. **`docs/phases/phase-3-inline-preview.md`** — original preview contract and constraints.
9. **`docs/phases/phase-6-label-driven-pii.md`** — confirms `phone-kr-landline` is a locked additive rule.

Commands:

```bash
cat src/ui/engine.ts
cat src/ui/CandidatesPanel.svelte
cat src/detection/detect-all.ts
cat src/detection/_framework/runner.ts
cat src/ui/RenderedBody.svelte
cat src/ui/engine.test.ts
cat src/detection/detect-all.test.ts
cat docs/phases/phase-3-inline-preview.md
cat docs/phases/phase-6-label-driven-pii.md
```

---

## 3. Invariants (DO NOT VIOLATE)

These are binding.

1. **All existing tests must still pass.** Post-phase `bun run test` must show all prior passing tests plus Phase 7 additions, with zero failures.
2. **No changes to `src/docx/**`, `src/finalize/**`, or `src/propagation/**`.**
3. **Do not change Phase 6 rule definitions.** `src/detection/rules/identifiers.ts` and `src/detection/rules/entities.ts` stay functionally unchanged in this phase.
4. **Do not change `detect-pii.ts` legacy behavior.** Phase 0 characterization remains untouched.
5. **`detectAll()` public return shape stays the same.** Only its execution correctness changes.
6. **`applyRedaction()` semantics stay unchanged.** This phase must not alter actual export output.
7. **Preview truthfulness wins over unchecked overlap visibility.** If a selected candidate and an unchecked candidate overlap, the selected one must win visually.
8. **No new Svelte component-test infrastructure.** If preview logic becomes hard to test inside `.svelte`, extract pure helpers and test them directly.
9. **No new npm dependencies.** No `bun add`, no lockfile edits.
10. **No config churn.** Do not touch `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, or `svelte.config.js`.
11. **Do not modify `tests/fixtures/`.**
12. **Do NOT `git push`.** Commit locally only when implementing the phase.

---

## 4. Problem statement

### 4.1 Bug 1: landline candidates can crash `analyzeZip()`

Current state:

- Phase 6 added `identifiers.phone-kr-landline`
- `engine.ts` still types `PiiCandidate.kind` as `DetectedMatch["kind"]`
- the UI bridge map is `Record<string, DetectedMatch["kind"]>`
- `foldPiiCandidate()` throws on unknown subcategory

That means a real document containing `02-3446-3727` can blow up the UI path even though the rule itself is valid and tested.

### 4.2 Bug 2: `detectAll()` lies about language filtering

Current state:

- `detectAll()` computes `documentLanguage = opts.language ?? detectLanguage(text)`
- but then calls `runAllPhases(..., { language: opts.language ?? "mixed" })`

`"mixed"` in the runner explicitly means "run all language tracks." So the function can return `documentLanguage: "ko"` while still executing English-only rules. This is a contract bug, not just an implementation detail.

### 4.3 Bug 3: preview can contradict actual export

Current state:

- preview marks are built from **all** candidates, not from the selected set first
- overlap resolution is length-first only
- mark styling asks `appState.isSelected(candidate)` afterward

Example:

- checked: `ABC`
- unchecked: `ABC Corp`

The preview can show one unchecked `ABC Corp` span, implying the phrase will survive. But export uses the checked selection set and will still redact `ABC` inside that phrase. The preview is visually misleading.

### 4.4 Correct end-state

- engine/UI seam accepts every current identifier rule, including landline
- `detectAll()` runs the same language track it reports
- preview shows actual redaction priority first, with unchecked marks only where they do not visually contradict selected redactions

---

## 5. Architecture and locked decisions

### 5.1 Shared UI PII helper

Create one new pure helper module:

```text
src/ui/pii-kinds.ts
```

It becomes the **single source of truth** for:

- UI PII kind union
- identifier-subcategory → UI-kind mapping
- UI label text for PII kinds

This removes the current split-brain where `engine.ts` owns one mapping and `CandidatesPanel.svelte` owns a separate label switch.

### 5.2 Exhaustive bridge, not `Record<string, ...>`

The identifier bridge must become compile-time exhaustive.

Required shape:

```ts
type IdentifierSubcategory =
  (typeof import("../detection/rules/identifiers.js").IDENTIFIERS)[number]["subcategory"];

export const IDENTIFIER_SUBCATEGORY_TO_KIND = {
  ...
  "phone-kr-landline": "phone-kr-landline",
} as const satisfies Record<IdentifierSubcategory, UiPiiKind>;

export type UiPiiKind =
  (typeof IDENTIFIER_SUBCATEGORY_TO_KIND)[IdentifierSubcategory];
```

Do **not** keep `Record<string, ...>`. The point is to fail at compile time when the rule registry grows and the UI bridge does not.

### 5.3 `detectAll()` language contract

`detectAll()` must do exactly one of these:

- if `opts.language` is provided, pass it through
- otherwise, detect language once and pass that detected value through

Required behavior:

```ts
const documentLanguage = opts.language ?? detectLanguage(text);
const { candidates, structuralDefinitions } = runAllPhases(text, {
  level: opts.level ?? DEFAULT_LEVEL,
  language: documentLanguage,
});
return { candidates, structuralDefinitions, documentLanguage };
```

No `"mixed"` fallback in `detectAll()`.

The runner already owns the meaning of `"mixed"`. `detectAll()` must not force it unless the detected language or explicit override is actually `"mixed"`.

### 5.4 Preview mark resolution: selected-first

The preview algorithm must become a **two-tier** resolver:

1. Build and resolve marks for **selected** candidates first.
2. Build and resolve marks for **unchecked** candidates second.
3. Drop any unchecked mark that overlaps a kept selected mark.
4. Merge the kept marks back into document order.

Within each tier, keep the existing longest-first overlap behavior.

This gives the correct priority model:

- selected marks reflect actual export behavior
- unchecked marks remain visible only where they do not lie about the current output

### 5.5 Pure helper extraction for preview logic

Extract the mark-building algorithm out of `RenderedBody.svelte` into a pure helper module so it can be tested without component infra.

Required new helper file:

```text
src/ui/preview-segments.ts
```

This module should own:

- preview-candidate partitioning
- raw + normalized fallback mark finding
- selected-first overlap resolution
- segment construction for one paragraph

`RenderedBody.svelte` becomes a thin consumer of that pure helper.

### 5.6 Hidden unchecked overlaps are acceptable in v1

If an unchecked longer candidate is hidden because a selected shorter candidate overlaps it, that is acceptable in this phase. The candidate is still reachable through the right-side review panel. Do not add an inline overlap chooser or stacked mark UI.

---

## 6. Detailed implementation spec

### 6.1 `src/ui/pii-kinds.ts` (new)

Create a new pure module with:

1. `IdentifierSubcategory` type derived from `IDENTIFIERS`
2. `IDENTIFIER_SUBCATEGORY_TO_KIND`
3. `UiPiiKind` derived from the mapping values
4. `PII_KIND_LABELS` as an exhaustive `Record<UiPiiKind, string>`
5. `piiKindLabel(kind)` helper

Required values:

- `korean-rrn` → `rrn`
- `korean-brn` → `brn`
- `us-ein` → `ein`
- `phone-kr` → `phone-kr`
- `phone-kr-landline` → `phone-kr-landline`
- `phone-intl` → `phone-intl`
- `email` → `email`
- `account-kr` → `account-kr`
- `credit-card` → `card`

Required label addition:

- `phone-kr-landline` → `phone · KR landline`

The label copy may match the current mixed Korean/English style. Do not broaden this phase into a full copy rewrite.

### 6.2 `src/ui/engine.ts`

Changes:

1. Remove the local `IDENTIFIER_SUBCATEGORY_TO_KIND`.
2. Stop importing `DetectedMatch` just to borrow its `kind` type.
3. Import `UiPiiKind` and the shared mapping from `pii-kinds.ts`.
4. Change `PiiCandidate.kind` to `UiPiiKind`.
5. Update `foldPiiCandidate()` to use the shared mapping.

The fail-loud behavior stays:

- if the subcategory somehow still does not map, throw

But the new exhaustive mapping should make that unreachable in normal development.

### 6.3 `src/ui/CandidatesPanel.svelte`

Changes:

1. Remove the local `piiKindLabel()` switch.
2. Import `piiKindLabel` from `./pii-kinds.ts`.
3. Keep the PII section layout unchanged.

No panel redesign. This is a contract-hardening change only.

### 6.4 `src/detection/detect-all.ts`

Change only the `detectAll()` implementation so the language passed to `runAllPhases()` matches `documentLanguage`.

Do **not** change:

- `DetectAllResult`
- `DetectAllInZipResult`
- `buildAllTargetsFromZip()`
- `detectAllInZip()` loop structure

### 6.5 `src/ui/preview-segments.ts` (new)

Extract the current pure preview helpers out of `RenderedBody.svelte` into a dedicated module.

Recommended public surface:

```ts
export interface PreviewCandidate {
  readonly text: string;
  readonly selected: boolean;
}

export type PreviewSegment =
  | { readonly type: "text"; readonly key: string; readonly text: string }
  | {
      readonly type: "mark";
      readonly key: string;
      readonly text: string;
      readonly candidate: string;
      readonly selected: boolean;
    };

export function buildPreviewSegments(
  paragraphText: string,
  candidates: readonly PreviewCandidate[],
  scopeIndex: number,
  paragraphIndex: number,
): PreviewSegment[];
```

Internal algorithm:

1. Partition candidates into `selected` and `unchecked`.
2. For each partition:
   - find raw matches
   - add normalized fallback matches for candidates not raw-matched
   - resolve intra-tier overlaps longest-first
3. Filter unchecked marks that overlap selected marks.
4. Merge kept marks and construct text/mark segments.

### 6.6 `src/ui/RenderedBody.svelte`

Refactor to consume `buildPreviewSegments()` from the new helper.

Required behavior changes:

1. Derived candidate list must include a `selected` boolean at build time.
2. Mark segments should use `segment.selected` for checked/unchecked class and aria state.
3. Toggling a mark still calls `appState.toggleSelection(segment.candidate)`.
4. Because `appState.selections` is reactive, toggling rebuilds the candidate list and segments.

Do not change:

- scroll-to-focused behavior
- pulse timing
- scope labels
- paragraph rendering structure

---

## 7. File layout

### Files modified

- `src/ui/engine.ts`
- `src/ui/CandidatesPanel.svelte`
- `src/detection/detect-all.ts`
- `src/detection/detect-all.test.ts`
- `src/ui/engine.test.ts`
- `src/ui/RenderedBody.svelte`

### Files added

- `src/ui/pii-kinds.ts`
- `src/ui/preview-segments.ts`
- `src/ui/preview-segments.test.ts`

Optional additional test file:

- `src/ui/pii-kinds.test.ts`

Only add `pii-kinds.test.ts` if the helper logic is non-trivial enough to justify it. It is acceptable to cover the helper transitively via `engine.test.ts` + typecheck if the mapping stays very small.

### Files explicitly out of scope

- anything under `src/docx/**`
- anything under `src/finalize/**`
- anything under `src/propagation/**`
- `src/detection/rules/**`
- config files
- fixtures

---

## 8. Testing strategy

### 8.1 Landline seam tests

Add an engine-level test that proves the UI seam now accepts landline candidates.

Minimum assertions:

1. Create a synthetic zip with `word/document.xml` containing `02-3446-3727`.
2. `analyzeZip()` does **not** throw.
3. `analysis.piiCandidates` contains exactly one candidate with:
   - `text === "02-3446-3727"`
   - `kind === "phone-kr-landline"`

Also add one assertion that the shared label helper returns the expected label for `phone-kr-landline`, either directly or through rendered PII meta text.

### 8.2 `detectAll()` language contract tests

Strengthen `src/detection/detect-all.test.ts` with both direct and zip-level coverage.

Minimum direct tests:

1. **Korean-only scope suppresses English-only rules**
   - input contains Hangul plus both an RRN-looking token and a US EIN-looking token
   - expect Korean rule to fire
   - expect `identifiers.us-ein` **not** to fire
   - expect `documentLanguage === "ko"`

2. **English-only scope suppresses Korean-only rules**
   - inverse of the above

3. **Explicit override still wins**
   - pass `{ language: "mixed" }`
   - verify both language tracks can fire

Strengthen the existing per-scope zip test so it asserts:

- the body scope contains the Korean rule and not the English-only one
- the header scope contains the English-only rule and not the Korean-only one

### 8.3 Preview truthfulness tests

Add pure helper tests for `buildPreviewSegments()`.

Minimum cases:

1. **Selected short beats unchecked long overlap**
   - candidates: checked `ABC`, unchecked `ABC Corp`
   - text: `ABC Corp signed the agreement`
   - expect visible mark `ABC` as selected
   - expect no visible unchecked `ABC Corp` mark

2. **Selected long beats unchecked short**
   - candidates: checked `ABC Corp`, unchecked `ABC`
   - expect visible mark `ABC Corp` as selected

3. **Unchecked marks still appear in non-overlapping gaps**
   - text contains one selected match and one separate unchecked candidate elsewhere
   - expect both to render, with correct selected state

4. **Selected-vs-selected still uses longest-first**
   - checked `ABC`, checked `ABC Corp`
   - expect only `ABC Corp` visible at the overlap site

5. **Normalized fallback still works in selected tier**
   - candidate text and paragraph differ only by normalization artifacts
   - selected fallback mark still appears

No Svelte component harness is required. Test the extracted pure helper.

---

## 9. TDD sequence

Execute in order.

### Step 1 — Baseline and required reading

Run:

```bash
bun run test
bun run typecheck
bun run lint
```

Then read the files in § 2 completely.

Expected result:

- baseline is green except for the known `coverage/*.js` lint warnings
- you understand the 3 buggy contracts before editing

No code changes yet.

### Step 2 — Add failing tests for bugs 1 and 2

Edit only:

- `src/ui/engine.test.ts`
- `src/detection/detect-all.test.ts`

Add:

- the synthetic landline seam test
- strengthened direct language tests
- strengthened per-scope absence assertions

Run:

```bash
bun run test src/ui/engine.test.ts src/detection/detect-all.test.ts
```

Expected result:

- tests fail on current HEAD for the right reasons

**Commit message:** `test(ui,detection): capture landline seam and language contract bugs`

### Step 3 — Implement bug 1 with shared PII helper

Add/modify:

- `src/ui/pii-kinds.ts` (new)
- `src/ui/engine.ts`
- `src/ui/CandidatesPanel.svelte`

Run:

```bash
bun run test src/ui/engine.test.ts
bun run typecheck
```

Expected result:

- landline seam test passes
- no type errors

**Commit message:** `refactor(ui): centralize pii kind mapping and add landline support`

### Step 4 — Implement bug 2 in `detectAll()`

Modify:

- `src/detection/detect-all.ts`

Run:

```bash
bun run test src/detection/detect-all.test.ts
```

Expected result:

- direct language tests pass
- strengthened per-scope absence assertions pass

**Commit message:** `fix(detection): honor detected language in detectAll`

### Step 5 — Add failing preview-truthfulness tests

Add:

- `src/ui/preview-segments.ts` (stub or partial)
- `src/ui/preview-segments.test.ts`

Or, if you prefer to add the test file before the helper, create the helper first with placeholder exports and then add tests.

Run:

```bash
bun run test src/ui/preview-segments.test.ts
```

Expected result:

- tests fail because selected-first overlap semantics do not exist yet

**Commit message:** `test(ui): capture preview overlap truthfulness rules`

### Step 6 — Implement selected-first preview resolution

Modify:

- `src/ui/preview-segments.ts`
- `src/ui/RenderedBody.svelte`

Run:

```bash
bun run test src/ui/preview-segments.test.ts
bun run typecheck
```

Expected result:

- helper tests pass
- `RenderedBody.svelte` compiles cleanly

**Commit message:** `refactor(ui): prioritize selected spans in preview rendering`

### Step 7 — Full verification and handback

Run all commands in § 10.

Then write:

```text
docs/phases/phase-7-handback.md
```

Include:

- what changed
- test counts
- exact HEAD
- any deviations from the brief
- whether lint still shows only the known coverage warnings

**Commit message:** `docs: add phase-7 handback`

---

## 10. Verification commands

Run these at the end:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
git status --short
git rev-parse --short HEAD
```

Recommended targeted reruns during development:

```bash
bun run test src/ui/engine.test.ts
bun run test src/detection/detect-all.test.ts
bun run test src/ui/preview-segments.test.ts
```

Expected final state:

- full tests green
- typecheck green
- lint has 0 errors and only the known `coverage/*.js` warnings
- build succeeds
- working tree clean after local commits

---

## 11. Gotchas

1. **Do not "fix" Bug 1 by weakening the throw into a silent fallback.** The right fix is exhaustive mapping, not masking unknown subcategories.
2. **Do not map `phone-kr-landline` back to `phone-kr`.** That would remove useful rule identity and hide future coverage regressions.
3. **Do not leave `detectAll()` returning one language while executing another.** This phase exists specifically to remove that split-brain.
4. **Do not solve Bug 3 by hiding all unchecked candidates globally.** Only overlapping unchecked candidates that would mislead the user should be suppressed.
5. **Do not add component-test tooling.** Extract pure preview logic instead.
6. **Keep `appState.jumpToCandidate()` behavior intact.** Preview rendering changes must not break Phase 3 focused scrolling.
7. **Remember normalized fallback in preview logic.** The selected-first resolver must preserve current normalization-aware marking behavior.

---

## 12. Out of scope

Explicitly out of scope for Phase 7:

- changing the language-detection heuristic thresholds
- adding new detection rules
- changing DOCX redaction behavior
- redesigning CandidatesPanel copy
- making hidden overlapping unchecked candidates clickable inline
- adding exact-occurrence navigation in the preview
- removing the known `coverage/*.js` lint warnings via config changes

---

## 13. Acceptance criteria

All must be true.

1. `analyzeZip()` no longer throws on a document containing `02-3446-3727`.
2. That landline candidate appears as PII with kind `phone-kr-landline`.
3. `CandidatesPanel` has a stable label path for `phone-kr-landline`; no local stale switch remains.
4. `engine.ts` no longer types UI PII kinds through `DetectedMatch["kind"]`.
5. `detectAll()` passes the actual detected language through to `runAllPhases()` when no override is supplied.
6. Direct tests prove Korean-only inputs suppress English-only rules.
7. Direct tests prove English-only inputs suppress Korean-only rules.
8. Explicit language overrides still work.
9. The per-scope zip test now proves absence of opposite-language rules in each scope.
10. Inline preview no longer shows an unchecked overlapping span where a selected overlapping span will actually redact the same bytes.
11. Selected-vs-selected overlaps still prefer the longest candidate.
12. Unchecked non-overlapping candidates still render.
13. Normalized fallback matching still works after the preview refactor.
14. `bun run test` passes.
15. `bun run typecheck` passes.
16. `bun run lint` has no new warnings beyond the existing coverage warnings.
17. `bun run build` succeeds.

---

## 14. Handback requirements

Create `docs/phases/phase-7-handback.md` with:

1. Final HEAD commit hash
2. Whether each of the 3 bugs is now covered by a targeted test
3. Final test counts
4. Final typecheck result
5. Final lint result
6. Final build result
7. Any deviations from the brief
8. Any manual QA not performed in CLI

Suggested handback structure:

```md
# Phase 7 Handback

## Summary

## Commits

## What Changed

## Verification

## Deviations

## Manual QA Not Run
```

This phase is complete only when the handback exists, all local commits are made, and the working tree is clean.
