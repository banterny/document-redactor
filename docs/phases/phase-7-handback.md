# Phase 7 Handback

## Summary

Phase 7 hardened three cross-phase contracts that had drifted after earlier work landed. First, the UI PII seam now has a single exhaustive source of truth for identifier subcategory mapping, so Phase 6's `phone-kr-landline` no longer crashes `analyzeZip()`. Second, `detectAll()` now passes the actual detected language through to `runAllPhases()`, so the language it reports matches the rule tracks it executes. Third, inline preview mark resolution now prioritizes selected spans over overlapping unchecked spans, which keeps the preview visually truthful to the actual redaction set.

All three bugs now have targeted tests:

- landline UI seam: `src/ui/engine.test.ts`
- `detectAll()` language contract: `src/detection/detect-all.test.ts`
- preview overlap truthfulness: `src/ui/preview-segments.test.ts`

## Commits

Starting commit: `5ff2098`  
Code-complete HEAD before this handback commit: `7169c4f`

Phase 7 commits created:

```text
7169c4f test(ui,detection): align fixture expectations with language filtering
e38ce7c refactor(ui): prioritize selected spans in preview rendering
36f6649 test(ui): capture preview overlap truthfulness rules
95c6f8f fix(detection): honor detected language in detectAll
60f8172 refactor(ui): centralize pii kind mapping and add landline support
30a5124 test(ui,detection): capture landline seam and language contract bugs
```

## What Changed

- Added `src/ui/pii-kinds.ts` as the shared UI source of truth for identifier subcategory → UI kind mapping and PII labels.
- Updated `src/ui/engine.ts` to use `UiPiiKind` instead of the legacy `DetectedMatch["kind"]` bridge.
- Removed the stale local PII label switch from `src/ui/CandidatesPanel.svelte`.
- Added `src/ui/pii-kinds.test.ts` to lock the new landline mapping and label path directly.
- Fixed `src/detection/detect-all.ts` so auto-detected language is actually passed through to `runAllPhases()`.
- Strengthened `src/detection/detect-all.test.ts` to assert absence of opposite-language rule hits, not just presence of expected hits.
- Added `src/ui/preview-segments.ts` and `src/ui/preview-segments.test.ts` so preview overlap behavior is covered as a pure function.
- Refactored `src/ui/RenderedBody.svelte` to consume `buildPreviewSegments()` and use `segment.selected` directly for visual state.
- Updated fixture-facing expectations in `src/ui/engine.test.ts` and `src/detection/detect-all.integration.test.ts` so they reflect the new auto-detected language contract instead of the previous implicit mixed-default behavior.

## Verification

Final verification run on the finished code state:

- `bun run test` → `1712 passed (1712)`
- `bun run typecheck` → `0 errors`, `0 warnings`
- `bun run lint` → `0 errors`, same 3 pre-existing `coverage/*.js` warnings
- `bun run build` → success
- `dist/document-redactor.html.sha256` → `665f27c213664e40bf02ebffaf0946e40e8135ad0e797d7d79ddc9d610e0c48c`

Key targeted checks that passed:

- landline candidate reaches `analyzeZip()` and is emitted as `phone-kr-landline`
- Korean-only and English-only auto-detected inputs now suppress opposite-language identifier rules
- `language: "mixed"` override still preserves the old broad parity behavior where explicitly requested
- preview helper now hides overlapping unchecked long spans when a selected shorter span would actually redact those bytes

## Deviations

- Added one small optional direct helper test file, `src/ui/pii-kinds.test.ts`, to lock the label/mapping contract explicitly.
- Existing fixture/integration expectations that assumed the old implicit mixed-default behavior were updated to match the new locked language-filtering contract.
- This handback records the code-complete HEAD before the docs commit that adds the handback itself. The final docs commit hash is provided in the assistant closeout.

## Manual QA Not Run

CLI-only session, so these browser checks were not exercised manually here:

- Drop a document containing `02-3446-3727` and confirm the PII row appears without a crash.
- Confirm `CandidatesPanel` shows `phone · KR landline` for that row.
- Confirm a checked short candidate visually wins over an overlapping unchecked long candidate in the inline preview.
- Confirm clicking an inline mark still toggles selection correctly after the preview helper extraction.
- Confirm jump-to/focus pulse still behaves correctly in a real browser after the `RenderedBody.svelte` refactor.
