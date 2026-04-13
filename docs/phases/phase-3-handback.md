# Phase 3 handback — Inline document preview

**Completed:** 2026-04-13 11:51 KST
**Executed by:** Codex 5.4 xhigh
**Starting commit:** `12e8e9f`
**Ending commit:** `dfac8eb` (code-complete HEAD before this handback commit)

## Summary

Phase 3 is complete on top of the Phase 2 handback baseline. The center review surface now renders the DOCX body inline as plain-text paragraphs grouped by scope, wraps detected candidate text in clickable highlights, keeps selection state synchronized with the right-hand Phase 2 panel, and adds a per-row jump affordance that scrolls the document to the first matching occurrence. The phase added one pure `docx/` renderer, one new Svelte document-body component, extended state with focused-candidate tracking, and preserved the detection/propagation/finalize layers untouched.

## Commits created

```text
dfac8eb feat(ui): replace DocumentPreview postParse metadata card with inline RenderedBody
3d1652d feat(ui): add jump-to-document button on CandidateRow
b0be056 feat(ui): add RenderedBody.svelte — inline-highlighted document preview
8fe64e1 test(ui): add focusedCandidate lifecycle tests + Analysis shape sanity
f7a0a93 feat(ui/state): add focusedCandidate + jumpToCandidate verb for scroll sync
4cc9f8f feat(docx): add render-body module — zip → RenderedDocument for UI preview
f8fba69 docs(phases): add Phase 3 brief — inline document preview with click-to-toggle
```

## Files created

- `src/docx/render-body.ts` (61 lines)
- `src/docx/render-body.test.ts` (165 lines)
- `src/ui/RenderedBody.svelte` (433 lines)
- `docs/phases/phase-3-handback.md`

## Files modified

- `src/ui/DocumentPreview.svelte` (postParse branch replaced; file 680 → 675 lines)
- `src/ui/CandidateRow.svelte` (+jump button, 247 lines total)
- `src/ui/state.svelte.ts` (+focusedCandidate + jumpToCandidate, 253 lines total)
- `src/ui/engine.test.ts` (+1 Phase 3 Analysis-shape sanity test, 439 lines total)
- `src/ui/ship-gate.test.ts` (+2 focusedCandidate lifecycle tests, 219 lines total)

## Tests

- Before: 1548 passing
- After: 1562 passing
- New: +14 tests (11 render-body + 2 ship-gate + 1 engine sanity)

## Build

- Before hash (Phase 2): `983ef68580ecf6762cdbb57efdac1cd08bf24816e194b04e6c1d9d39c7a75363`
- After hash (Phase 3): `626db003a5b2e946176d7966e5e22107a960359b17790e4105c76bd90cac41d2`
- Determinism: yes (two sequential builds produced the same sha256)

## Performance

- `renderDocumentBody` on worst-case fixture: 5 ms (budget: 1000 ms)
- First paint of RenderedBody on worst-case fixture (manual browser measurement): not measured in this CLI-only session

## Acceptance criteria

1. ✅ `bun run test` passed with `1562 passed (1562)` and 0 failures.
2. ✅ `bun run typecheck` passed with `svelte-check found 0 errors and 0 warnings`.
3. ✅ `bun run lint` reported 0 errors; only the same 3 pre-existing `coverage/*.js` warnings remain.
4. ✅ `bun run build` succeeded and produced `dist/document-redactor.html` plus `dist/document-redactor.html.sha256`.
5. ✅ Build determinism verified: two sequential builds produced the same sha256 `626db003a5b2e946176d7966e5e22107a960359b17790e4105c76bd90cac41d2`.
6. ✅ `src/docx/render-body.ts` exists and exports `renderDocumentBody`.
7. ✅ `src/docx/render-body.test.ts` has 11 tests and all pass.
8. ✅ `src/ui/RenderedBody.svelte` exists.
9. ✅ `src/ui/CandidateRow.svelte` has a `↓` jump button per row.
10. ✅ `src/ui/state.svelte.ts` exports `focusedCandidate: string | null`.
11. ✅ `AppState.jumpToCandidate(text)` exists and sets `focusedCandidate`.
12. ✅ `focusedCandidate` auto-clears after 1200ms; covered by `ship gate — focused candidate lifecycle > jumpToCandidate sets focusedCandidate and auto-clears after 1.2s`.
13. ✅ `reset()` clears `focusedCandidate`; covered by `ship gate — focused candidate lifecycle > reset clears focusedCandidate`.
14. ✅ `DocumentPreview` postParse uses `RenderedBody` via `#await loadRenderedDoc(phase.bytes)`.
15. ✅ The 6 non-postParse phase branches of `DocumentPreview.svelte` were preserved; diff is limited to imports/helpers, the postParse branch replacement, and removal of dead placeholder CSS.
16. ✅ `Analysis` shape is unchanged; `engine.test.ts` locks the top-level keys and `src/ui/engine.ts` is unchanged from the Phase 2 handback.
17. ✅ Locked UI files are unchanged: `CandidatesPanel.svelte`, `CategorySection.svelte`, `AddCandidateInput.svelte`, `App.svelte`, `Sidebar.svelte`, `Topbar.svelte`, `Footer.svelte`, `styles.css`, and `engine.ts` all diff clean against `12e8e9f`.
18. ✅ Locked docx files are unchanged: `coalesce.ts`, `scopes.ts`, and `types.ts` diff clean against `12e8e9f`.
19. ✅ There are zero changes under `src/detection/`, `src/propagation/`, and `src/finalize/`.
20. ✅ No new npm dependencies were added; `package.json` is unchanged.
21. ✅ Phase 0 ship gate passed: `src/detection/detect-pii.characterization.test.ts` → `24 passed`.
22. ✅ Phase 1 tests passed: `src/detection/detect-all.test.ts` → `50 passed`, `src/detection/detect-all.integration.test.ts` → `10 passed`.
23. ✅ Phase 2 tests passed: `src/ui/engine.test.ts` → `24 passed`, `src/ui/ship-gate.test.ts` → `17 passed`.
24. ✅ No `try` appears in `src/docx/render-body.ts`, `src/ui/RenderedBody.svelte`, or `src/ui/CandidateRow.svelte`.
25. ✅ No network code was added in Phase 3 source files; grep over non-test `src/ui/` files and `src/docx/render-body.ts` is clean.
26. ✅ `renderDocumentBody` perf budget passed; the perf-only test was verified with `bun x vitest run src/docx/render-body.test.ts -t perf`.
27. ✅ Phase 3 produced 7 local commits from `12e8e9f..dfac8eb`, all conventional and all with `Co-Authored-By: Codex <noreply@openai.com>`.
28. ✅ This handback document exists at `docs/phases/phase-3-handback.md`.
29. ⚠️ Browser-only manual check not executed in this CLI session: dropping the worst-case fixture should show inline `<mark>` highlights in the center pane.
30. ⚠️ Browser-only manual check not executed in this CLI session: clicking a document highlight should toggle its checked/unchecked state visually and in the shared selection Set.

## Deviations from brief

- The phase landed at `1562` passing tests instead of the brief's approximate `1561` because `render-body.test.ts` ended with 11 tests instead of ~10.
- `RenderedBody.svelte` is 433 lines, above the brief's rough ~180–200 target, because the overlap resolution, fallback normalization, scope labeling, and scroll-sync helpers stayed local to the component to preserve the locked file budget.
- The brief's `bun run test src/docx/render-body.test.ts --grep "perf"` command does not work with this repo's `bun run test` wrapper; the equivalent gate was verified with `bun x vitest run src/docx/render-body.test.ts -t perf`.
- Manual browser verification and first-paint timing were not executed from this CLI-only environment because the repo does not include browser automation tooling and no new dependencies were added.

## Gotchas encountered

- Svelte warns on interactive `<mark>` usage by default, so `RenderedBody.svelte` uses a narrow `svelte-ignore` for the role-based accessibility pattern the brief explicitly required.
- The pulse class is added imperatively via `classList`, so its CSS selector had to be marked `:global(.cand-mark.pulse)` to avoid false unused-selector warnings.
- Running multiple builds concurrently can make the sha sidecar appear to change transiently because `dist/` is shared. The final determinism check was rerun sequentially and passed.
- Enabling fake timers before `appState.loadFile()` caused the new focused-candidate ship-gate tests to hang, so the final tests use the brief's real-time wait approach instead.

## Manual verification recommended

- [ ] Open `dist/document-redactor.html` in a browser.
- [ ] Drop `tests/fixtures/bilingual_nda_worst_case.docx`.
- [ ] Center area shows the contract body with inline highlights instead of the old metadata placeholder card.
- [ ] Scope headers are visible (`본문`, `각주`, `머리글 1`, etc.).
- [ ] Click a highlight and verify it toggles between checked and unchecked visuals.
- [ ] Click the `↓` button on a row in the right panel and verify the document scrolls to that candidate and the mark pulses.
- [ ] Scroll through a multi-scope transition such as body → footer/footnotes.
- [ ] Empty paragraphs render as visible blank lines.
- [ ] Heuristic candidates remain unchecked by default and render as dashed/light highlights.
- [ ] Manually added candidates appear as highlights after re-render.

## Suggested next steps

1. Phase 4 — virtualize very large documents if real contracts surface paragraph-count perf issues.
2. Phase 5 — add browser automation for the inline preview interactions so the current manual checks become executable in CI.
3. Phase 6 — consider cycling through multiple occurrences when the same candidate text appears many times.
4. If users request it, add document-click → list-scroll synchronization as a separate phase.
5. If users request higher fidelity, add table and rich-text rendering behind a separate renderer budget.
