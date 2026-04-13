# Phase 5 handback — Verification recovery UX

**Completed:** 2026-04-13 15:06 KST
**Executed by:** Codex 5.4 xhigh
**Starting commit:** `a96bb2d`
**Ending commit:** `f818e90` (code-complete HEAD before this handback commit)

## Summary

Phase 5 split the post-redaction outcome UX into three clear states: clean success (`downloadReady`), sanity-only warning (`downloadWarning`), and true leak failure (`verifyFail`). The app state machine now classifies finalized reports by existing `verify.isClean` and `wordCount.sane` values instead of treating every non-green result as a hard failure. On the UI side, the main preview card now distinguishes "sensitive text survived" from "too many words were removed", exposes per-item recovery actions for survived strings, and allows deliberate download only for the clean-but-broad-removal warning case.

This phase stayed entirely inside the locked UI/state layer. Detection, verifier logic, DOCX mutation, finalization, and the `FinalizedReport` shape were left unchanged. The test suite grew from 1600 to 1607 passing tests (+7), all in `src/ui/ship-gate.test.ts`.

## Commits created

```text
f818e90 feat(ui): split verification leaks from warning-only downloads
```

## Files created

- `docs/phases/phase-5-verification-recovery.md`
- `docs/phases/phase-5-handback.md`

## Files modified

- `src/ui/state.svelte.ts` (+`downloadWarning`, `classifyFinalizedReportPhase`, `reviewCandidate`; 299 lines total)
- `src/ui/DocumentPreview.svelte` (+amber warning branch, survived-item review actions, corrected verify-fail copy; 875 lines total)
- `src/ui/CandidatesPanel.svelte` (+`downloadWarning` state copy, corrected verify-fail heading/subcopy; 408 lines total)
- `src/ui/ship-gate.test.ts` (+7 state-flow tests, 353 lines total)

## Tests

- Before: 1600 passing
- After: 1607 passing
- New: +7 tests

Breakdown:
- `src/ui/ship-gate.test.ts`: +7

## Build

- Before hash (last recorded Phase 4 handback hash): `9a04a14f2be2f94b9ffb8d564ceba16d181b513145221f9e1c4827b438b7c66c`
- After hash (Phase 5): `a0f706b6adff62604e766d690c418704e0745af23fac9be80cfb8523790f421d`
- Determinism: yes; two sequential `bun run build` executions produced the same sha256

## Acceptance criteria

1. ✅ A true survived-string case still blocks download.
2. ✅ A sanity-only case no longer maps to `verifyFail`; it now maps to `downloadWarning`.
3. ✅ The UI exposes a deliberate download path for sanity-only warnings via `경고를 이해하고 다운로드`.
4. ✅ `verifyFail` copy no longer tells the user to add survived items to `기타 (그 외)`.
5. ✅ Each survived row in `DocumentPreview.svelte` has a direct `이 항목 검토` action.
6. ✅ `reviewCandidate(text)` preserves selections, returns to `postParse`, and reuses the existing Phase 3 focus pulse.
7. ✅ `downloadReady` semantics remain unchanged.
8. ✅ No detection, docx, finalize, or engine behavior changed.
9. ✅ `bun run test` passed `1607 passed (1607)` with 0 failures.
10. ✅ `bun run typecheck` passed with `0 errors` and `0 warnings`.
11. ✅ `bun run lint` reported 0 errors; only the same 3 pre-existing `coverage/*.js` warnings remain.
12. ✅ `bun run build` succeeded, and two sequential builds produced the same sha256 `a0f706b6adff62604e766d690c418704e0745af23fac9be80cfb8523790f421d`.
13. ✅ Locked layers remained untouched: `git diff --stat a96bb2d -- src/detection src/propagation src/docx src/finalize src/ui/engine.ts src/ui/App.svelte src/ui/Sidebar.svelte src/ui/Topbar.svelte src/ui/Footer.svelte src/ui/main.ts` is empty.
14. ✅ The brief exists at `docs/phases/phase-5-verification-recovery.md`.
15. ⚠️ Browser-only manual QA was not executed in this CLI-only session; see "Manual verification recommended" below.

## Deviations from brief

- No intentional product or copy deviations were introduced. The implementation follows the brief's state split, CTA set, and blocking rules.
- The side-panel warning heading shipped as `Review warning`, matching the brief's example wording.
- Manual browser QA could not be completed inside this CLI-only session, so the handback records that as an explicit outstanding check rather than pretending it was exercised.

## Gotchas encountered

- The new test helper in `ship-gate.test.ts` initially modeled `FinalizedReport` with stale field names. Aligning it with the real `VerifyResult.stringsTested` and `WordCountSanity` shape fixed typecheck without touching runtime code.
- `DocumentPreview.svelte`'s previous `downloadReport()` guard only allowed `downloadReady`, so the new warning state needed to be admitted explicitly or the warning CTA would render but do nothing.
- Removing the old verify-fail hint text left an unused `.verifyfail-hint strong` selector; dropping that selector was required to restore a 0-warning Svelte check.

## Manual verification recommended

- [ ] Open `dist/document-redactor.html`.
- [ ] Trigger a true leak case and confirm no download button appears in the red state.
- [ ] Click `이 항목 검토` and confirm the app returns to review with the relevant string focused in the inline preview.
- [ ] Trigger a sanity-only warning case and confirm the banner is amber, not red.
- [ ] Confirm `경고를 이해하고 다운로드` downloads successfully from the warning state.
- [ ] Confirm `검토로 돌아가기` from the warning state preserves selections.
- [ ] Confirm a clean success case still renders the original green download-ready state.
