# Phase 5 — Verification recovery UX (survived-item review + sanity-only override)

> ✅ **READY FOR CODEX EXECUTION** ✅
>
> Authored 2026-04-13 after repeated recovery failures in the red-banner flow:
> users see messages like `Pearl Abyss × 6 in word/document.xml`, but the
> current UI makes it hard to act on them. The existing `verifyFail` card
> conflates two different conditions:
>
> - `verify.isClean === false`: a true leak survived. Download must stay blocked.
> - `verify.isClean === true && wordCount.sane === false`: a broad-selection
>   warning. Download should be allowed with an explicit override.
>
> This brief redesigns the recovery UX around that split. It explicitly does
> **NOT** add an "accept all" action for `survived` strings, because those
> strings were already selected for redaction; re-accepting them would not
> change the generated output. Instead, the failure card gets direct
> "review this item" affordances and a new sanity-only warning path that can
> still download.

---

**For:** Codex 5.4 xhigh (or any capable autonomous coding agent with filesystem + bash access)  
**Project:** document-redactor  
**Branch:** `main`  
**Starting commit:** `a96bb2d` (Phase 4 handback HEAD) or descendant  
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`  
**Date written:** 2026-04-13  
**Author of brief:** Codex, capturing the user's requested UX direction  
**Predecessor:** `docs/phases/phase-4-field-leaks.md` + `docs/phases/phase-4-handback.md`

---

## 0. How to read this document

This is a **self-contained task specification** for the verification recovery UX. Read the whole thing before touching code. The high-level product decisions are already made. Your job is to execute them cleanly, not to re-debate them.

### Sections in this document

0. How to read this document  
1. Mission statement  
2. Required reading  
3. Invariants (DO NOT VIOLATE)  
4. Problem statement and terminology  
5. Architecture (state split + review verbs)  
6. UX specification  
7. Copy specification  
8. File layout  
9. Testing strategy  
10. TDD sequence  
11. Verification commands  
12. Gotchas + out-of-scope + acceptance criteria + handback

### Decisions locked

| Ref | Decision | Rationale |
|---|---|---|
| **5.1** No `accept all` action for `verify.survived` | A survived string was already selected and still leaked. Re-selecting it changes nothing. |
| **5.2** Split blocking leaks from warning-only sanity failures | `verify.isClean` and `wordCount.sane` mean different things and require different UX. |
| **5.3** Real leaks still block download | If `verify.isClean === false`, download remains blocked with no override path. |
| **5.4** Sanity-only failures may be overridden | If `verify.isClean === true` and `wordCount.sane === false`, the user may download anyway after seeing a warning. |
| **5.5** Add direct review actions from the failure list | The failure card must help the user get back to the relevant text immediately. |
| **5.6** Keep implementation UI/state-only | No changes to detection, verifier semantics, docx pipeline, or `FinalizedReport` shape. |
| **5.7** Add one new phase kind: `downloadWarning` | Cleanest way to distinguish "safe to download with warning" from success and from blocked failure. |
| **5.8** No modal, no review queue, no exact-XML occurrence navigator in v1 | Keep the fix small, shippable, and consistent with existing preview capabilities. |
| **5.9** Existing `jumpToCandidate()` behavior stays intact | The Phase 3 1.2s focus pulse remains the preview-sync primitive; this phase builds on it. |
| **5.10** No new npm dependencies | Same invariant as prior phases. |

### What this document is NOT

- Not a verifier redesign. The verification engine already does the right thing.
- Not a parser or redaction phase. The issue here is recovery UX.
- Not a place to add "exact occurrence 4 of 6" navigation. That is a follow-up phase if still needed after this UX ships.
- Not a rationale for letting true leaks download. This brief explicitly does **not** allow that.

---

## 1. Mission statement

Make verification outcomes actionable and understandable.

When the output still contains sensitive text, the UI must keep download blocked and help the user review the flagged item quickly. When the output contains **no** surviving sensitive text but fails the word-count sanity check, the UI must stop treating that as a hard block and instead present it as an explicit warning with a deliberate "download anyway" path.

**Zero engine behavior change.** `applyRedaction()` still returns the same `FinalizedReport`. `verify.ts`, `finalize.ts`, and the DOCX pipeline stay untouched. This is a UI/state phase only.

Expected deliverables: **1 new phase kind**, **1 new state verb**, **2 modified Svelte components**, **1 extended ship-gate test file**, **zero npm dependencies**, and a post-phase test count of **1600 + Phase 5 additions** passing.

---

## 2. Required reading

Read these before implementation. Earlier entries win on conflict.

1. **`src/ui/DocumentPreview.svelte`** — current `downloadReady` and `verifyFail` branches. This is the primary UI surface for the phase.
2. **`src/ui/state.svelte.ts`** — current phase machine, `applyNow()`, `backToReview()`, and `jumpToCandidate()`.
3. **`src/ui/CandidatesPanel.svelte`** — side-panel copy for `downloadReady` / `verifyFail`.
4. **`src/ui/CandidateRow.svelte`** — reference for how the preview jump affordance already works.
5. **`src/ui/ship-gate.test.ts`** — current state-flow tests and Phase 3 focused-candidate tests.
6. **`src/finalize/finalize.ts`** — `FinalizedReport` shape. Confirm there is already enough information for the split.
7. **`docs/phases/phase-3-inline-preview.md`** — source of the current `jumpToCandidate()` contract.
8. **`docs/phases/phase-4-field-leaks.md`** — confirms that rels / field leaks were fixed at the pipeline layer; remaining friction is now in the UI.

Commands:

```bash
cat src/ui/DocumentPreview.svelte
cat src/ui/state.svelte.ts
cat src/ui/CandidatesPanel.svelte
cat src/ui/CandidateRow.svelte
cat src/ui/ship-gate.test.ts
cat src/finalize/finalize.ts
cat docs/phases/phase-3-inline-preview.md
cat docs/phases/phase-4-field-leaks.md
```

---

## 3. Invariants (DO NOT VIOLATE)

These are binding.

1. **All existing tests must still pass.** Post-phase `bun run test` must show all prior passing tests plus Phase 5 additions, with zero failures.
2. **No changes to `src/detection/**`, `src/propagation/**`, `src/docx/**`, or `src/finalize/**`.** This phase is UI/state only.
3. **No changes to the `FinalizedReport` shape.** Consume `report.verify.isClean`, `report.verify.survived`, and `report.wordCount` as they already exist.
4. **No new npm dependencies.** No `bun add`, no lockfile edits.
5. **No config churn.** Do not touch `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, or `svelte.config.js`.
6. **Real leaks remain fail-closed.** Any `!report.verify.isClean` result must still block download.
7. **Word-count sanity alone is not a hard block anymore.** Clean verify + failed sanity becomes a warning path, not `verifyFail`.
8. **`verifyFail` copy must not instruct the user to add survived items to `기타 (그 외)`.** That advice is semantically wrong for this state.
9. **`jumpToCandidate()` timing remains unchanged.** Keep the 1.2s auto-clear behavior and focused-candidate semantics from Phase 3.
10. **No modal UI.** Stay within the current panel/card architecture.
11. **No new component-test infrastructure.** Extend the existing state-centric test approach.
12. **Do NOT `git push`.** Commit locally only when implementing the phase.

---

## 4. Problem statement and terminology

### 4.1 The current UX bug

Today, both of these cases land in the same `verifyFail` state:

1. **True leak**
   Example: `Pearl Abyss × 6 in word/document.xml`
   Meaning: the string was selected, redaction ran, and the string still exists in the generated DOCX.

2. **Sanity warning**
   Example: verify found zero surviving strings, but the redaction removed too many words because a selected term was overly broad.

Those are not the same problem, but the current UI treats both as "Download blocked — verification failed."

### 4.2 What `survived` actually means

`report.verify.survived` does **not** mean "items the user forgot to check."

It means:

- the string was already part of the redaction target set
- the pipeline generated an output file
- the verifier found that same string still present in the output

So a generic "accept all" button is the wrong mental model here. There is nothing left to accept. The user needs either:

- a fast path back to review the flagged string, or
- a word-count-only warning path that still allows download

### 4.3 Correct mental model for the user

- **Red state (`verifyFail`)**: "Sensitive text is still in the output. Stop and review."
- **Amber state (`downloadWarning`)**: "No sensitive text survived, but the output may be broader than intended. Review if you want, or download anyway."
- **Green state (`downloadReady`)**: "No sensitive text survived and the sanity check stayed within bounds."

---

## 5. Architecture

### 5.1 Phase machine after Phase 5

Current:

```text
postParse
  -> redacting
     -> downloadReady    when verify.isClean && wordCount.sane
     -> verifyFail       otherwise
```

After Phase 5:

```text
postParse
  -> redacting
     -> downloadReady    when verify.isClean && wordCount.sane
     -> downloadWarning  when verify.isClean && !wordCount.sane
     -> verifyFail       when !verify.isClean
```

### 5.2 New phase kind

Add this `AppPhase` variant in `state.svelte.ts`:

```ts
{
  readonly kind: "downloadWarning";
  readonly fileName: string;
  readonly report: FinalizedReport;
  readonly bytes: Uint8Array;
  readonly analysis: Analysis;
}
```

This mirrors `downloadReady` intentionally so `DocumentPreview.svelte` can reuse the same download helper and the user can still go back to review without re-analysis.

### 5.3 New state verb

Add one new verb in `state.svelte.ts`:

```ts
reviewCandidate(text: string): void
```

Behavior:

1. Allowed from `verifyFail`, `downloadWarning`, and `downloadReady`.
2. Transitions back to `postParse` using the carried `fileName`, `bytes`, and `analysis`.
3. Immediately calls `jumpToCandidate(text)` so the inline preview focuses that string.

This is the one-click recovery path the current red banner lacks.

### 5.4 Existing verbs

- `backToReview()` stays and keeps its current meaning: return to `postParse` without focusing anything.
- `jumpToCandidate()` stays unchanged. Do not merge its responsibilities with phase switching.
- `reset()` stays unchanged.

### 5.5 No report-layer changes

Do **not** add new booleans or fields to `FinalizedReport`. The state split is derived entirely from the existing report:

```ts
if (!report.verify.isClean) return "verifyFail";
if (!report.wordCount.sane) return "downloadWarning";
return "downloadReady";
```

---

## 6. UX specification

### 6.1 `verifyFail` (red, blocked)

Trigger:

- `report.verify.isClean === false`

Rules:

- Download button is absent.
- Primary CTA returns to review.
- Survived rows each get a direct review action.
- If `wordCount.sane === false` too, show that warning as secondary information only. The leak block still dominates.

Required elements:

1. Red banner headline.
2. Explanation that the listed strings were already selected but still survived in the output.
3. Survived list showing:
   - `text`
   - `count`
   - `scope.path`
   - button: `이 항목 검토`
4. Primary CTA:
   - If the list is non-empty: `첫 항목부터 검토`
   - Action: `appState.reviewCandidate(phase.report.verify.survived[0]!.text)`
5. Secondary CTA:
   - `검토로 돌아가기`
   - Action: `appState.backToReview()`
6. Tertiary CTA:
   - `Start over`
   - Action: `appState.reset()`

### 6.2 `downloadWarning` (amber, allowed)

Trigger:

- `report.verify.isClean === true`
- `report.wordCount.sane === false`

Rules:

- Download is allowed.
- The warning copy is explicit about the risk: broad removal, not surviving leaks.
- The user may either review or proceed.

Required elements:

1. Amber banner headline.
2. Statement that verification found zero surviving strings.
3. Statement that the word-count sanity threshold was exceeded.
4. Primary CTA:
   - `경고를 이해하고 다운로드`
   - Action: existing download flow
5. Secondary CTA:
   - `검토로 돌아가기`
6. Tertiary CTA:
   - `Start over`

### 6.3 `downloadReady` (green, unchanged in meaning)

Trigger:

- `report.verify.isClean === true`
- `report.wordCount.sane === true`

Behavior:

- Same success semantics as today.
- No new warnings or review affordances are required.

### 6.4 Side-panel copy (`CandidatesPanel.svelte`)

This phase does **not** redesign the panel. It only keeps the right-hand status copy consistent:

- `downloadReady`: unchanged
- `downloadWarning`: new amber heading, e.g. `Review warning`
- `verifyFail`: red heading remains, but subcopy changes from generic "Review survivals in the main panel" to wording that matches the new mental model

### 6.5 Guidance text rules

- Never tell the user to add a `survived` item to `기타 (그 외)`.
- Only mention `기타 (그 외)` in contexts where the problem is "we never detected this string."
- In verification states, distinguish:
  - "survived in output" from
  - "too many words removed"

---

## 7. Copy specification

These strings are binding unless minor punctuation changes are needed during implementation.

### 7.1 `verifyFail` headline and body

Headline:

```text
Download blocked — sensitive text survived
```

Lead body:

```text
The strings below were already selected for redaction, but they still appear in the generated DOCX. Return to review and inspect them before retrying.
```

Optional secondary body when sanity also failed:

```text
The word-count sanity check also exceeded its threshold, but the surviving-text leak is the blocking issue.
```

### 7.2 `downloadWarning` headline and body

Headline:

```text
No leaks found — review warning before download
```

Body:

```text
Round-trip verification found zero surviving sensitive strings, but {droppedPct}% of words were removed (threshold {thresholdPct}%). Review broad selections, or download anyway if this is intentional.
```

### 7.3 Button labels

- `이 항목 검토`
- `첫 항목부터 검토`
- `검토로 돌아가기`
- `경고를 이해하고 다운로드`
- `Start over`

### 7.4 Copy explicitly removed

Delete or replace any guidance equivalent to:

```text
survived 목록을 참고해서 누락된 항목을 기타 (그 외) 섹션에 직접 추가하거나...
```

That sentence is wrong for `survived`.

---

## 8. File layout

No new directories. No new dependencies.

Modified files:

```text
src/ui/state.svelte.ts
src/ui/DocumentPreview.svelte
src/ui/CandidatesPanel.svelte
src/ui/ship-gate.test.ts
docs/phases/phase-5-verification-recovery.md
```

### Exact code ownership

| File | Change |
|---|---|
| `src/ui/state.svelte.ts` | Add `downloadWarning` phase kind, update `applyNow()` branching, add `reviewCandidate(text)` |
| `src/ui/DocumentPreview.svelte` | Add `downloadWarning` branch, rewrite `verifyFail` card, wire per-item review buttons |
| `src/ui/CandidatesPanel.svelte` | Add status copy for `downloadWarning`, update `verifyFail` subcopy |
| `src/ui/ship-gate.test.ts` | Add state-flow tests for new phase classification and reviewCandidate behavior |

---

## 9. Testing strategy

### 9.1 Automated tests

No Svelte component-test framework is added. Stay with the existing state-centric test style in `ship-gate.test.ts`.

Add at least these tests:

1. `reviewCandidate` from `verifyFail` returns to `postParse` and sets `focusedCandidate`
2. `reviewCandidate` from `downloadWarning` returns to `postParse` and sets `focusedCandidate`
3. phase classification maps:
   - clean + sane -> `downloadReady`
   - clean + insane -> `downloadWarning`
   - dirty + sane -> `verifyFail`
   - dirty + insane -> `verifyFail`
4. `backToReview()` still works from `downloadWarning`

Implementation note:

- If needed, extract a tiny pure helper in `state.svelte.ts` for phase classification so this can be tested without mocking the entire redaction pipeline.
- Keep that helper local to the UI state layer. Do not move report logic into `engine.ts` or `finalize.ts`.

### 9.2 Manual QA

Required browser checks:

1. Trigger a true `verifyFail` case and confirm:
   - no download button appears
   - `이 항목 검토` returns to review and focuses the candidate
   - the red card no longer tells the user to add survived items to `기타 (그 외)`
2. Trigger a `downloadWarning` case and confirm:
   - the warning is amber, not red
   - download is available
   - `검토로 돌아가기` preserves selections
3. Confirm `downloadReady` still looks and behaves exactly like a clean success

---

## 10. TDD sequence

Execute in order. Commit at each meaningful checkpoint when implementing the phase.

### Step 1 — Baseline

Run:

```bash
bun run test
bun run typecheck
bun run lint
```

Do not proceed until the baseline is green.

### Step 2 — Add failing state tests

Extend `src/ui/ship-gate.test.ts` with the new phase-classification and `reviewCandidate()` tests from § 9.1.

Expected result: tests fail because `downloadWarning` and `reviewCandidate()` do not exist yet.

### Step 3 — Add state support

Modify `src/ui/state.svelte.ts`:

- add `downloadWarning`
- update `applyNow()` branching
- add `reviewCandidate(text)`
- extend `backToReview()` to allow `downloadWarning`

Run targeted tests until the new state-flow tests pass.

### Step 4 — Implement `DocumentPreview.svelte`

Add the new `downloadWarning` branch and rewrite the `verifyFail` branch per § 6 and § 7.

Focus on:

- correct CTA wiring
- corrected mental-model copy
- no download button in red state
- download button present in amber state

### Step 5 — Update `CandidatesPanel.svelte`

Keep the panel simple. Only adjust the state-copy branches to match the new meanings.

### Step 6 — Manual QA pass

Trigger:

- one true leak case
- one sanity-only warning case
- one clean success case

Record any copy or state-transition mismatches and fix them.

### Step 7 — Full verification

Run the full ship gate:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

### Step 8 — Handback

Create `docs/phases/phase-5-handback.md` when the phase is implemented. Record:

- final commit hash
- test counts
- manual QA results
- any intentional deviations from this brief

---

## 11. Verification commands

```bash
bun run test src/ui/ship-gate.test.ts
bun run test
bun run typecheck
bun run lint
bun run build
git status --short
git rev-parse --short HEAD
```

---

## 12. Gotchas + out-of-scope + acceptance criteria + handback

### 12.1 Gotchas

1. `reviewCandidate(text)` must transition phase **before** pulsing focus, otherwise the focus may clear before the preview re-renders.
2. A survived string can appear multiple times. This phase still jumps to the first visible match only; do not invent occurrence-cycling logic here.
3. If both verify and sanity fail, do not accidentally expose a warning-download button. Red state wins.
4. Keep the existing download filename and Blob logic unchanged.

### 12.2 Out of scope

- Exact XML-scope navigation (`word/header1.xml`, occurrence 4 of 6, etc.)
- A modal "review all" wizard
- Any verifier, finalizer, or DOCX-layer changes
- New analytics, telemetry, or persistence
- Any accept-all action for `survived`

### 12.3 Acceptance criteria

The phase is complete only if all of these are true:

1. A true survived-string case still blocks download.
2. A sanity-only case no longer lands in `verifyFail`.
3. The UI exposes a deliberate download path for sanity-only warnings.
4. `verifyFail` copy no longer tells the user to add survived items to `기타 (그 외)`.
5. Each survived row has a direct review action.
6. Review actions preserve selections and return to the existing inline preview.
7. `downloadReady` remains semantically unchanged.
8. No detection, docx, finalize, or engine behavior changed.
9. `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run build` all pass.

### 12.4 Handback requirements

The future Phase 5 handback must include:

- commit hash
- updated test counts
- exact wording of any copy deviation
- manual QA notes for:
  - blocked leak flow
  - sanity-only warning flow
  - clean success flow

