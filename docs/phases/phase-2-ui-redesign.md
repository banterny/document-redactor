# Phase 2 — UI redesign (category-grouped candidates with add/remove UX)

> ✅ **READY FOR CODEX EXECUTION** ✅
>
> Authored 2026-04-13. Decisions locked via session-log-2026-04-11-v2 § "Finding 1.3
> user insight" (UI add/remove UX) + design-v1 § D1–D5 (information architecture,
> design tokens). This brief specifies the complete redesign of `CandidatesPanel.svelte`
> to surface Phase 1's `nonPiiCandidates` with category-grouped review UX.
>
> Hand this to Codex for execution. Start at § 0 and execute the TDD sequence in § 15.

---

**For:** Codex 5.4 xhigh (or any capable autonomous coding agent with filesystem + bash access)
**Project:** document-redactor
**Branch:** `main`
**Starting commit:** Phase 1 handback HEAD (after Phase 1 execution merges)
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`
**Date written:** 2026-04-13
**Author of brief:** Claude Opus 4.6 at user's request
**Predecessor:** `docs/phases/phase-1-rulebook.md` + `docs/phases/phase-1-handback.md`

---

## 0. How to read this document

This is a **self-contained task specification** for the complete Phase 2 UI redesign. Read the whole thing before touching any code. Every decision has been made during the Phase 1 plan-eng-review (see [session-log-2026-04-11-v2.md](../../document-redactor-private-notes/session-log-2026-04-11-v2.md) § "Finding 1.3 user insight" for the captured-and-parked review record). Your job is to execute, not to re-debate.

### Sections in this document

0. How to read this document
1. Mission statement
2. Required reading
3. Invariants (DO NOT VIOLATE)
4. Architecture (component tree + state additions + selection flow)
5. File layout (exact tree you will create/modify)
6. Design system (token reference + component-specific styles)
7. Category taxonomy (7 top-level groups in render order)
8. Default selection policy per category
9. Add affordance (per-category inline input with validation)
10. Remove affordance (uncheck — no new UI, backward-compat preserved)
11. `state.svelte.ts` additions (manualAdditions map + 2 verbs)
12. Component specifications (CandidatesPanel + 3 sub-components)
13. Accessibility requirements
14. Testing strategy (engine.test.ts + ship-gate.test.ts extensions — no Svelte component tests)
15. TDD sequence (10 steps)
16. Verification commands
17. Gotchas + out-of-scope + acceptance criteria + handback + error handling

### Decisions locked

These decisions are not up for debate. If you feel tempted to change them, re-read the session log.

| Ref | Decision | Rationale |
|---|---|---|
| **2.1** Component extraction | Extract `CategorySection.svelte`, `CandidateRow.svelte`, `AddCandidateInput.svelte` from `CandidatesPanel.svelte`. | Keeps `CandidatesPanel.svelte` under 250 lines; makes each section independently testable and the render order explicit at the top level. |
| **2.2** Category count | Seven top-level groups in this order: 당사자 literals → 정의된 대리어 (D9) → 식별번호 (PII) → 금액 → 날짜 → 법인/인물 → 법원/사건 → 구조 → 추측 (heuristics). Heuristics go LAST because they are low-confidence. | Matches user insight ASCII mockup (session-log-2026-04-11-v2 line 131) with structural/heuristics added to cover Phase 1 coverage. |
| **2.3** Default selection policy | 당사자 checked · 정의된 대리어 UNCHECKED (D9) · 식별번호 checked · 금액/날짜/법인/법원/구조 checked · 추측 UNCHECKED. | Matches `defaultSelections` Phase 1 contract with the heuristics carve-out that confidence<1.0 is unchecked. |
| **2.4** Add affordance UI | Inline input per category — a "+ 추가" button expands to an inline text field + "Add" button. Not a modal. | Simpler, keeps panel single-surface, matches the mockup. |
| **2.5** Manual-add persistence | `appState.manualAdditions: Map<Category, Set<string>>` lives in `state.svelte.ts`. Survives re-analysis (if the user re-drops a file, their manual additions persist). | User can add a missed item once and have it remembered. |
| **2.6** No modal, no collapsible sections | All sections always expanded in v1. Modal is over-engineering. | v1.0 scope-out principle (design-v1 Lock-in #8: fail-closed UX, no surprises). |
| **2.7** engine.ts UNTOUCHED | Phase 2 does NOT modify `engine.ts` or its `Analysis` shape. Phase 1 already exposed `nonPiiCandidates`. Category derivation happens at render time in the new `CategorySection.svelte`. | Phase 1's engine migration is final. Phase 2 consumes it. |
| **2.8** `defaultSelections` REDEFINITION | The current implementation unconditionally includes every nonPii text. Phase 2 changes the policy: include high-confidence (confidence === 1.0) automatically, EXCLUDE low-confidence (confidence < 1.0). This is a behavior change, locked. | Per user insight: "추측" section must be unchecked by default — the user opts in. |
| **2.9** Test strategy | Extend `engine.test.ts` (new default-selection tests) and `ship-gate.test.ts` (new integration tests). No Svelte component test infrastructure added. | Matches Phase 0/1 convention. UI visual verification is manual per the handback template. |
| **2.10** No new npm dependencies | Zero `bun add` / `npm install`. | Same as Phase 0/1 invariants. |

### What this document is NOT

- Not a rationale document. The decision record is in the session log.
- Not a visual design mockup. The ASCII mockup in § 7 and the token reference in § 6 are authoritative; if pixel perfection is needed later, do it in a follow-up phase.
- Not a responsive-redesign phase. The 3-column → bottom-sheet → tab layout transitions in design-v1 § D6 are OUT OF SCOPE. Phase 2 stays on desktop (≥ 1024px) and preserves whatever responsive behavior the current panel already has.
- Not a scope for changing `applyRedaction` semantics. The target `Set<string>` passed in stays the same shape.

---

## 1. Mission statement

Redesign the right-hand candidates panel to surface Phase 1's 46 new detection items in **seven category-grouped sections** with inline add/remove affordances per category. Preserve the D9 defined-term-hidden-by-default policy. Preserve the Phase 1 `Analysis` shape. Preserve `applyRedaction` semantics. Redefine `defaultSelections` to exclude heuristic candidates (confidence < 1.0) by default so the user opts in.

**Zero detection behavior change.** All 1539 Phase 1 tests must still pass. The only test files modified are `engine.test.ts` (new default-selection tests) and `ship-gate.test.ts` (new integration tests).

**Production, not prototype.** Every new component ships in v1.1. Design tokens are binding per design-v1 § D5. Accessibility per design-v1 § D6.

Expected deliverables: **3 new Svelte components**, **1 modified Svelte component** (CandidatesPanel rewrite), **1 extended state module** (`state.svelte.ts`), **~45 new test cases**, **8–10 commits**, **zero npm dependencies**, **zero detection-layer changes**, and a post-phase test count of **~1584 passing**.

---

## 2. Required reading (in order)

Read in this order. Earlier entries win on conflict.

1. **`docs/phases/phase-1-handback.md`** — Phase 1 execution record. Confirms `nonPiiCandidates` is populated, confidence values range 0.5–1.0, category field is a 6-way union.

2. **`src/ui/engine.ts`** — the `Analysis` shape (entityGroups, piiCandidates, nonPiiCandidates, fileStats), `NonPiiCandidate` interface with `category` and `confidence` fields, current `defaultSelections` implementation.

3. **`src/ui/state.svelte.ts`** — current `AppState` class with phase machine, selections Set, seed list. You will extend this with `manualAdditions` and 2 new verbs.

4. **`src/ui/CandidatesPanel.svelte`** — the CURRENT implementation (509 lines). This is what you will REWRITE — but preserve the phase-handling branches (idle/parsing/redacting/downloadReady/verifyFail/fatalError) byte-for-byte, only the `postParse` branch is redesigned.

5. **`src/ui/App.svelte`** — the parent component. Confirms `phase` is passed to `CandidatesPanel` as a prop. No changes needed to App.svelte.

6. **`src/ui/Sidebar.svelte`** — shows the seed editor pattern (text input + add/remove). Your `AddCandidateInput.svelte` follows a similar pattern.

7. **`src/ui/styles.css`** — global styles. Uses the tokens from design-v1 § D5. You will add component-specific styles but must not modify the existing tokens.

8. **`docs/phases/phase-1-rulebook.md` § 8.3** — the `Analysis` shape + `NonPiiCandidate` contract. Category union, confidence range semantics.

9. **`../document-redactor-private-notes/design-v1.md` § D1–D5** — information architecture, interaction states, AI-slop risk control, and design tokens. § D5 token list is binding.

10. **`../document-redactor-private-notes/session-log-2026-04-11-v2.md` lines 115–168** — the user insight that drives this phase. Quote the ASCII mockup at the top of your new `CandidatesPanel.svelte` JSDoc as authoritative reference.

11. **`src/ui/engine.test.ts`** — existing test patterns. You extend this with 5 new tests (§ 14.2).

12. **`src/ui/ship-gate.test.ts`** — existing integration-test patterns. You extend this with 4 new tests (§ 14.3).

Commands to read these files:

```bash
cat docs/phases/phase-1-handback.md
cat src/ui/engine.ts
cat src/ui/state.svelte.ts
cat src/ui/CandidatesPanel.svelte
cat src/ui/App.svelte
cat src/ui/Sidebar.svelte
cat src/ui/styles.css | head -150
cat docs/phases/phase-1-rulebook.md | sed -n '/## 8\./,/## 9\./p' | head -200
cat ../document-redactor-private-notes/design-v1.md | sed -n '/## Architecture/,/## Design/p' | head -80
cat ../document-redactor-private-notes/design-v1.md | sed -n '/### D5\./,/### D6\./p'
cat ../document-redactor-private-notes/session-log-2026-04-11-v2.md | sed -n '115,170p'
cat src/ui/engine.test.ts
cat src/ui/ship-gate.test.ts
```

---

## 3. Invariants (DO NOT VIOLATE)

These are non-negotiable. Each violation fails the phase.

1. **All 1539 Phase 1 tests + all Phase 0 characterization tests must still pass.** `bun run test` after Phase 2 must show `Tests N passed` where N ≥ 1539 + Phase 2 additions. Zero failing tests. If any Phase 0/1 test breaks, Phase 2 has regressed — fix the regression, NOT the old test.

2. **No changes to `src/detection/**`.** Phase 2 is UI-only. Do not modify any detection rule, framework file, parser, heuristic, or blacklist. Exception: none.

3. **No changes to `src/propagation/**`.** Lane C is not touched.

4. **No changes to `src/docx/**` or `src/finalize/**`.** Lane B/D are not touched.

5. **No changes to `src/ui/engine.ts`** other than the `defaultSelections` function body per § 8 (the policy redefinition). The `Analysis` shape, `NonPiiCandidate` interface, `analyzeZip` signature, and `applyRedaction` signature are LOCKED.

6. **No changes to `src/ui/App.svelte`, `src/ui/DocumentPreview.svelte`, `src/ui/Topbar.svelte`, `src/ui/Sidebar.svelte`, `src/ui/Footer.svelte`, `src/ui/main.ts`.**

7. **No changes to `package.json` dependencies.** No `bun add`, no `npm install`, no lockfile edits.

8. **No changes to `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `svelte.config.js`.**

9. **Use `.js` extension in imports.** Per tsconfig `allowImportingTsExtensions` + Vite convention.

10. **Use `import type` for type-only imports** per `verbatimModuleSyntax: true`.

11. **No `try/catch` in the new components.** Fail-loud invariant — if `appState.addManualCandidate` throws, let it bubble. Exceptions: existing try/catch in `state.svelte.ts` verbs (loadFile, applyNow) is unchanged.

12. **D9 policy preserved.** Defined term labels ("the Buyer", "매수인") remain UNCHECKED by default. The new `defaultSelections` implementation must not accidentally check them.

13. **Selections Set contract preserved.** `selections` remains a `Set<string>` of literal strings. `applyRedaction` reads `[...selections]` and passes to `finalizeRedaction({targets})`. The UI cannot change this.

14. **Normalization not done at UI layer.** `CandidateRow` renders the raw `candidate.text` as-is (original bytes). The detection layer already normalized for matching; the redactor needs the literal bytes. Do not normalize again in the component.

15. **Manual-add text is raw string.** When the user types "ACME Holdings" into `AddCandidateInput`, that exact string goes into `selections`. Do not lowercase, trim excessively, or normalize. Trim only leading/trailing whitespace.

16. **No network code.** ESLint bans fetch, XMLHttpRequest, WebSocket, EventSource, dynamic import, navigator.sendBeacon. Do not introduce any.

17. **No inline `<style>` tags in components.** Use the component-scoped `<style>` block at the bottom of each `.svelte` file. Do not use inline styles on elements except for dynamic values that must be computed at render time.

18. **Do NOT `git push`.** Commit locally only. The user reviews and pushes.

19. **Do NOT modify `tests/fixtures/`** — fixture generation is out of scope.

20. **Preserve the 6 non-postParse phase branches** in `CandidatesPanel.svelte` byte-for-byte. Only the `postParse` branch is rewritten.

---

## 4. Architecture

### 4.1 Component tree (after Phase 2)

```
App.svelte
├── Topbar.svelte
├── Sidebar.svelte
├── DocumentPreview.svelte
└── CandidatesPanel.svelte  ← REWRITTEN (only the postParse branch)
    ├── CategorySection.svelte  ← NEW × 7 (one instance per category)
    │   ├── CandidateRow.svelte  ← NEW × N (repeated per candidate)
    │   └── AddCandidateInput.svelte  ← NEW (inline input, shown on "+ 추가" click)
    └── (existing panel-head / panel-foot — unchanged)
```

### 4.2 State additions in `state.svelte.ts`

```
Before (Phase 1):
  AppState {
    phase: AppPhase
    seeds: string[]
    selections: Set<string>
    +  loadFile(file)
    +  toggleSelection(text)
    +  isSelected(text)
    +  applyNow()
    +  reset()
    +  setSeeds(next)
  }

After (Phase 2):
  AppState {
    phase: AppPhase
    seeds: string[]
    selections: Set<string>
    + manualAdditions: Map<Category, Set<string>>  ← NEW
    +  loadFile(file)                                      (unchanged)
    +  toggleSelection(text)                              (unchanged)
    +  isSelected(text)                                    (unchanged)
    +  applyNow()                                          (unchanged)
    +  reset()                                             (extended: clears manualAdditions)
    +  setSeeds(next)                                      (unchanged)
    + addManualCandidate(category, text)  ← NEW
    + removeManualCandidate(category, text)  ← NEW
  }
```

### 4.3 Selection flow

When the user drops a file:
1. `loadFile()` calls `analyzeZip` → `Analysis` with 4 fields (entityGroups, piiCandidates, nonPiiCandidates, fileStats)
2. `defaultSelections(analysis)` returns a `Set<string>` with:
   - All entity literals
   - All piiCandidates
   - **All nonPiiCandidates WHERE confidence === 1.0** (NEW: heuristics excluded)
   - (Defined term labels NOT included — D9)
   - (Manual additions NOT yet populated — empty at analysis time)
3. `appState.selections` is set to that `Set<string>`.
4. The UI renders every candidate, with checkbox state = `selections.has(candidate.text)`.
5. User can toggle any checkbox (including previously-unchecked heuristics and defined terms) — `toggleSelection` mutates `selections`.
6. User clicks "+ 추가" on a category → `AddCandidateInput` expands → user types → `addManualCandidate(category, text)` adds to both `manualAdditions` AND `selections`.
7. User clicks "Apply" → `applyNow()` passes `[...selections]` to `applyRedaction` → finalized.

### 4.4 Manual-add flow (details)

```
1. User clicks "+ 추가" button in "금액" section.
2. AddCandidateInput component expands (show input field + "Add" button + "Cancel" button).
3. User types "USD 1,000,000" and clicks "Add".
4. AddCandidateInput calls appState.addManualCandidate("financial", "USD 1,000,000").
5. appState:
   - Validates text: non-empty after trim, not already in the engine's nonPiiCandidates
   - Adds to manualAdditions.get("financial")
   - Adds to selections
6. CategorySection re-renders with the new row at the bottom of the financial section, marked "manual" via a small badge.
7. If user unchecks the manual row, toggleSelection("USD 1,000,000") removes from selections (but NOT from manualAdditions).
8. If user clicks "×" on the manual row, removeManualCandidate("financial", "USD 1,000,000") removes from BOTH manualAdditions AND selections.
```

**Persistence across re-analysis:** if the user drops a NEW file (calls `loadFile` again), the new `defaultSelections` computation includes `manualAdditions` values (merged in). This way a user who manually adds "USD 1,000,000" to one document will see it pre-checked when they drop another document. Same semantic as the seed list today.

### 4.5 Category derivation at render time

The engine returns `NonPiiCandidate.category: "financial" | "temporal" | "entities" | "structural" | "legal" | "heuristics"`. `CandidatesPanel.svelte` groups by category using a single `$derived` computation that buckets candidates. No engine changes needed.

The 7 top-level sections map from existing data:

| Section (Korean label) | Source field | Filter |
|---|---|---|
| 당사자 — 리터럴 | `entityGroups[*].literals` | all |
| 정의된 대리어 | `entityGroups[*].defined` | all |
| 식별번호 | `piiCandidates` | all |
| 금액 | `nonPiiCandidates` | `category === "financial"` |
| 날짜 / 기간 | `nonPiiCandidates` | `category === "temporal"` |
| 법인 / 인물 | `nonPiiCandidates` | `category === "entities" OR category === "structural"` (merged) |
| 법원 / 사건 | `nonPiiCandidates` | `category === "legal"` |
| 추측 (낮은 신뢰도) | `nonPiiCandidates` | `category === "heuristics"` (confidence < 1.0) |

The structural category merges into the 법인/인물 section because structural parsers produce entity-like definitions (party declarations, signature signatories) that semantically belong with named entities.

---

## 5. File layout (exact tree)

Create/modify exactly these files. Do not create additional files. Do not rename existing files.

```
src/ui/
├── CandidatesPanel.svelte    ← REWRITTEN (only postParse branch; other phase branches preserved)
├── CategorySection.svelte    ← NEW (~150 lines)
├── CandidateRow.svelte       ← NEW (~80 lines)
├── AddCandidateInput.svelte  ← NEW (~90 lines)
├── state.svelte.ts           ← MODIFIED (+~50 lines — manualAdditions + 2 verbs)
├── engine.ts                 ← MODIFIED (defaultSelections body only — see § 8.3)
├── engine.test.ts            ← MODIFIED (+5 new tests — default-selection policy)
├── ship-gate.test.ts         ← MODIFIED (+4 new tests — integration)
├── App.svelte                (UNCHANGED)
├── DocumentPreview.svelte    (UNCHANGED)
├── Sidebar.svelte            (UNCHANGED)
├── Topbar.svelte             (UNCHANGED)
├── Footer.svelte             (UNCHANGED)
├── styles.css                (UNCHANGED)
└── main.ts                   (UNCHANGED)
```

**Counts:**
- **New files**: 3 Svelte components
- **Modified files**: 4 (CandidatesPanel.svelte, state.svelte.ts, engine.ts, engine.test.ts, ship-gate.test.ts — 5 actually)
- **Unchanged**: every other UI file, every non-UI file

---

## 6. Design system (tokens + component styles)

### 6.1 Token reference (from design-v1 § D5, binding)

Do NOT redefine these. Use them via CSS custom properties. The existing `styles.css` declares them; your component `<style>` blocks reference them via `var(--token-name)`.

| Token | Value | Usage in Phase 2 |
|---|---|---|
| `--bg` | `#f8fafc` | n/a (app background, not panel) |
| `--surface` | `#ffffff` | CategorySection background |
| `--border` | `#e2e8f0` | Section dividers, row separators |
| `--border-strong` | `#cbd5e1` | Collapsed-category boundary (future, not v1) |
| `--ink-strong` | `#0f172a` | Section headers |
| `--ink` | `#1e293b` | Body text |
| `--ink-soft` | `#64748b` | Scope badges, counts |
| `--ink-muted` | `#94a3b8` | Placeholder text in AddCandidateInput |
| `--primary` | `#2563eb` | "+ 추가" button, checked checkbox, focus ring |
| `--primary-hover` | `#1d4ed8` | Button hover |
| `--primary-bg` | `#eff6ff` | Selected row background |
| `--primary-border` | `#bfdbfe` | AddCandidateInput focus border |
| `--primary-ink` | `#1d4ed8` | "+ 추가" button text |
| `--warn` | `#d97706` | "추측" section header accent (low confidence) |
| `--warn-bg` | `#fffbeb` | "추측" section background |

### 6.2 Spacing rhythm (from design-v1 § D5)

Base unit: 4px. Allowed steps: 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48.

- Section internal padding: `12px 16px`
- Gap between sections: `8px`
- Gap between rows within a section: `4px`
- Row internal padding: `8px 12px`
- AddCandidateInput padding when expanded: `12px 16px`

### 6.3 Typography (from design-v1 § D5)

- Section header: `14px / 1.4`, `font-weight: 600`, `color: var(--ink-strong)`
- Section count badge: `11px`, `color: var(--ink-soft)`, uppercase letter-spacing `0.02em`
- Row label: `13.5px / 1.5`, `color: var(--ink)`
- Row meta (category, scope, confidence): `11px / 1.4`, `color: var(--ink-soft)`
- Manual-add badge: `10px`, `background: var(--primary-bg)`, `color: var(--primary-ink)`, `padding: 2px 6px`, `border-radius: 999px`

### 6.4 Interaction states

- Hover on a row: `background: var(--primary-bg)` (checked row stays `var(--primary-bg)`; unchecked row shifts from `transparent` to `var(--primary-bg)`)
- Focus on a row: `outline: 2px solid var(--primary)` + `outline-offset: 2px`
- "+ 추가" button hover: `background: var(--primary-bg)`, `color: var(--primary-hover)`
- AddCandidateInput focus: `border-color: var(--primary-border)`, `box-shadow: 0 0 0 3px var(--primary-bg)`

### 6.5 Motion (from design-v1 § D5)

- All transitions: `0.12s–0.15s ease`
- Inline AddCandidateInput expand: height transition 0.15s ease, opacity 0.12s ease
- Button active: `transform: scale(0.98)` on press
- No decorative animations

---

## 7. Category taxonomy (authoritative)

The 7 sections render in this order (top to bottom). Empty sections are hidden (no empty state card — just not rendered).

### 7.1 Section 1 — 당사자 (Entity literals)

- **Korean label:** `당사자`
- **Sub-hint:** `Auto-selected · 자동 선택됨`
- **Source:** `analysis.entityGroups[*].literals` (all groups, flattened)
- **Default selection:** all checked
- **Manual add:** YES (user can add a custom entity literal)
- **Manual-add category key:** `"literals"`
- **Row meta:** seed name + "literal variant" in English, e.g., `ABC Corp · literal`

### 7.2 Section 2 — 정의된 대리어 (Defined term labels — D9)

- **Korean label:** `정의된 대리어`
- **Sub-hint:** `Kept as-is by default (D9 policy — 독해성 유지)`
- **Source:** `analysis.entityGroups[*].defined` (all groups, flattened)
- **Default selection:** all UNCHECKED (D9 preserved)
- **Manual add:** NO (defined terms come exclusively from the propagation layer — user cannot add them manually in Phase 2; future phase may add this)
- **Row meta:** `from definition · {seed}` (same as today)

### 7.3 Section 3 — 식별번호 (PII)

- **Korean label:** `식별번호 (PII)`
- **Sub-hint:** `주민번호 · 사업자번호 · 이메일 · 계좌 — 자동 검출`
- **Source:** `analysis.piiCandidates`
- **Default selection:** all checked
- **Manual add:** NO (PII patterns are regex-driven; user cannot "add a PII"; missed PII are added via the 누락된 항목 fallback — out of scope for v1 Phase 2)
- **Row meta:** PII kind label (e.g., "주민등록번호", "email") + scope summary

### 7.4 Section 4 — 금액 (Financial)

- **Korean label:** `금액`
- **Sub-hint:** `한화 · USD · 외화 · 백분율 — Phase 1 financial rules`
- **Source:** `analysis.nonPiiCandidates.filter(c => c.category === "financial")`
- **Default selection:** all checked (confidence === 1.0 for regex rules)
- **Manual add:** YES
- **Manual-add category key:** `"financial"`
- **Row meta:** rule subcategory (e.g., "won-amount", "usd-symbol") + scope

### 7.5 Section 5 — 날짜 / 기간 (Temporal)

- **Korean label:** `날짜 / 기간`
- **Sub-hint:** `한국식 · ISO · 영문 · 기간 — Phase 1 temporal rules`
- **Source:** `analysis.nonPiiCandidates.filter(c => c.category === "temporal")`
- **Default selection:** all checked
- **Manual add:** YES
- **Manual-add category key:** `"temporal"`
- **Row meta:** rule subcategory + scope

### 7.6 Section 6 — 법인 / 인물 (Entities + structural, merged)

- **Korean label:** `법인 / 인물`
- **Sub-hint:** `주식회사 · 대표이사 · 서명자 — Phase 1 entities + structural`
- **Source:** `analysis.nonPiiCandidates.filter(c => c.category === "entities" || c.category === "structural")`
- **Default selection:** all checked
- **Manual add:** YES
- **Manual-add category key:** `"entities"` (single key covers both entities and structural — structural merges into entities per § 4.5)
- **Row meta:** rule subcategory + scope

### 7.7 Section 7 — 법원 / 사건 (Legal)

- **Korean label:** `법원 / 사건`
- **Sub-hint:** `사건번호 · 법원명 · 법령 · 판례 — Phase 1 legal rules`
- **Source:** `analysis.nonPiiCandidates.filter(c => c.category === "legal")`
- **Default selection:** all checked
- **Manual add:** YES
- **Manual-add category key:** `"legal"`
- **Row meta:** rule subcategory + scope

### 7.8 Section 8 — 추측 (Heuristics, low confidence)

- **Korean label:** `추측 (낮은 신뢰도)`
- **Sub-hint:** `휴리스틱 감지 — 검토 후 체크하세요`
- **Source:** `analysis.nonPiiCandidates.filter(c => c.category === "heuristics")`
- **Default selection:** all UNCHECKED (confidence < 1.0)
- **Manual add:** NO (heuristics fire on patterns; adding a specific heuristic manually doesn't make sense — use 법인/인물 or 누락 fallback instead)
- **Row meta:** rule subcategory + confidence pill (e.g., "0.7") + scope
- **Visual treatment:** `background: var(--warn-bg)`, left border accent `4px solid var(--warn)` — signals "review carefully"

### 7.9 Order rationale

당사자 first because it's the most common "yes-redact" case. 정의된 대리어 second because they are semantically adjacent to 당사자 but default-off. 식별번호 third because it's high-confidence and mandatory for most redaction tasks. 금액 → 날짜 → 법인 → 법원 in increasing specificity. 추측 last because it's the lowest-confidence group — the user scans the panel top-to-bottom and naturally reaches it last.

---

## 8. Default selection policy per category

### 8.1 Policy table

| Section | Source | Default checked? |
|---|---|---|
| 당사자 (entity literals) | `entityGroups[*].literals` | YES |
| 정의된 대리어 | `entityGroups[*].defined` | NO (D9) |
| 식별번호 | `piiCandidates` | YES |
| 금액 | `nonPiiCandidates` where category="financial" | YES (all confidence === 1.0) |
| 날짜/기간 | `nonPiiCandidates` where category="temporal" | YES |
| 법인/인물 | `nonPiiCandidates` where category in ("entities", "structural") | YES |
| 법원/사건 | `nonPiiCandidates` where category="legal" | YES |
| 추측 | `nonPiiCandidates` where category="heuristics" | **NO (confidence < 1.0)** |

### 8.2 Generalized rule

**A candidate is auto-checked iff:**

- It's an entity literal, OR
- It's a PII candidate, OR
- It's a non-PII candidate AND `confidence === 1.0`

**A candidate is auto-UNCHECKED iff:**

- It's a defined term label (D9), OR
- It's a heuristic (confidence < 1.0)

### 8.3 Updated `defaultSelections` implementation

Replace the current `defaultSelections` body in `src/ui/engine.ts` with:

```typescript
export function defaultSelections(analysis: Analysis): Set<string> {
  const out = new Set<string>();

  // 당사자 — entity literals (checked by default)
  for (const group of analysis.entityGroups) {
    for (const cand of group.literals) {
      out.add(cand.text);
    }
  }

  // 식별번호 — PII (checked by default)
  for (const pii of analysis.piiCandidates) {
    out.add(pii.text);
  }

  // Non-PII categories — checked ONLY if confidence === 1.0 (regex-layer certainty)
  for (const cand of analysis.nonPiiCandidates) {
    if (cand.confidence === 1.0) {
      out.add(cand.text);
    }
  }

  // Defined term labels (entityGroups[*].defined) — NOT added (D9 policy)
  // Heuristics (confidence < 1.0) — NOT added (user opts in)

  return out;
}
```

The existing Phase 1 implementation in `engine.ts` unconditionally adds every nonPii candidate to `selections`. Phase 2 narrows this to `confidence === 1.0` only. This is a **behavior change** — the existing test `"populates nonPiiCandidates for Phase 1 matches on the worst-case fixture"` in `engine.test.ts` may need its assertion about `selections.has(cand.text)` tightened to check only high-confidence items. See § 14.2 for the test update.

### 8.4 Phase 0 PII count invariant

The Phase 1 behavior contract stated: "`piiCandidates.length` after Phase 1 is EQUAL to `piiCandidates.length` before Phase 1 on the same input." This invariant MUST continue to hold after Phase 2 — we are not modifying `analyzeZip` or the PII partitioning.

---

## 9. Add affordance (per-category inline input)

### 9.1 Visual structure

```
┌─ 금액 ──────────────────── 3 ──┐
│  [✓] 50,000,000원  financial · body  │
│  [✓] USD 100,000  financial · body   │
│  [✓] 3억           financial · body   │
│                                      │
│  ┌─ + 추가 ─────────────────────┐   │ ← default: collapsed "add" button
│  └───────────────────────────────┘   │
└──────────────────────────────────────┘

 (user clicks "+ 추가")

┌─ 금액 ──────────────────── 3 ──┐
│  [✓] 50,000,000원  ...                │
│  [✓] USD 100,000  ...                 │
│  [✓] 3억          ...                  │
│                                       │
│  ┌──────────────────────────────────┐ │
│  │ [ Enter amount text...         ] │ │ ← input field
│  │ [ Add ] [ Cancel ]               │ │
│  └──────────────────────────────────┘ │
└───────────────────────────────────────┘

 (user types "USD 1,000,000" and clicks "Add")

┌─ 금액 ──────────────────── 4 ──┐
│  [✓] 50,000,000원 ...                 │
│  [✓] USD 100,000 ...                  │
│  [✓] 3억         ...                   │
│  [✓] USD 1,000,000  [manual]  [×]     │ ← new row with manual badge + remove button
│                                       │
│  ┌─ + 추가 ─────────────────────┐    │ ← collapsed again
│  └───────────────────────────────┘    │
└───────────────────────────────────────┘
```

### 9.2 Input validation

In `AddCandidateInput.svelte`:

- Trim leading/trailing whitespace
- Reject empty string (button disabled if input is empty)
- Reject strings > 200 chars (show inline error below input)
- Reject strings already present in the engine's candidates for this category (show inline error "이미 감지됨" / "Already detected")
- Reject duplicates within `manualAdditions.get(category)` (same error)

### 9.3 Persistence across re-analysis

When the user drops a NEW file:
1. `analyzeZip` runs, returns a new `Analysis`
2. `defaultSelections(analysis)` returns the base Set
3. The state module's `loadFile` then MERGES existing `manualAdditions` into `selections`:

```typescript
async loadFile(file: File): Promise<void> {
  this.phase = { kind: "parsing", fileName: file.name };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const analysis = await analyzeZip(bytes, this.seeds);
    const baseSelections = defaultSelections(analysis);
    // Merge manual additions across re-analyses
    for (const set of this.manualAdditions.values()) {
      for (const text of set) {
        baseSelections.add(text);
      }
    }
    this.selections = baseSelections;
    this.phase = { kind: "postParse", fileName: file.name, bytes, analysis };
  } catch (err) {
    this.phase = { kind: "fatalError", fileName: file.name, message: err instanceof Error ? err.message : String(err) };
  }
}
```

### 9.4 Clearing manual additions

`reset()` clears both `selections` and `manualAdditions`.

```typescript
reset(): void {
  this.phase = { kind: "idle" };
  this.selections = new Set();
  this.manualAdditions = new Map();
}
```

---

## 10. Remove affordance (uncheck — no new UI)

Unchecking a checkbox calls `appState.toggleSelection(text)` → removes the text from `selections`. Same behavior as Phase 1. No new UI is introduced for the "remove" case (over-cover) — the existing checkbox uncheck is already the remove affordance.

**Manual-add removal** has a separate path: clicking the "×" button next to a manual row fires `appState.removeManualCandidate(category, text)`, which:
1. Removes from `manualAdditions.get(category)`
2. Removes from `selections`
3. Re-renders the section without that row

The "×" button appears ONLY on rows that were manually added (identified by the "manual" badge).

---

## 11. `state.svelte.ts` additions

### 11.1 New type

Add this type export at the top of `src/ui/state.svelte.ts` (after the existing `AppPhase`):

```typescript
/**
 * Category key for manual candidate additions. Matches the Phase 1
 * `NonPiiCandidate.category` union plus "literals" for entity literal
 * manual additions. Defined term labels have no manual-add affordance
 * in Phase 2 (see § 7.2 of the phase-2 brief).
 */
export type ManualCategory =
  | "literals"
  | "financial"
  | "temporal"
  | "entities"
  | "legal";
```

Note: `"structural"` is merged into `"entities"` (per § 4.5 / § 7.6). `"heuristics"` and defined-terms have no manual-add.

### 11.2 New state field

Add to `class AppState`:

```typescript
/**
 * Manual candidate additions — user-typed strings grouped by category.
 * Persists across re-analyses so a user who adds "USD 1,000,000" to one
 * document sees it pre-checked when they drop another document.
 *
 * Populated by addManualCandidate(). Cleared by reset().
 */
manualAdditions = $state<Map<ManualCategory, Set<string>>>(
  new Map([
    ["literals", new Set()],
    ["financial", new Set()],
    ["temporal", new Set()],
    ["entities", new Set()],
    ["legal", new Set()],
  ]),
);
```

The Map is initialized with all 5 categories present (empty sets) so render-time code can safely call `manualAdditions.get(category)!` without null-checking.

### 11.3 New verbs

Add two methods to `AppState`:

```typescript
/**
 * Add a user-typed candidate to the given category. The text is added
 * to both manualAdditions (for re-analysis persistence) and selections
 * (so the Apply pipeline includes it). Idempotent — adding a duplicate
 * is a no-op.
 */
addManualCandidate(category: ManualCategory, text: string): void {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;
  if (trimmed.length > 200) return;
  const bucket = this.manualAdditions.get(category);
  if (!bucket) return;
  if (bucket.has(trimmed)) return;
  bucket.add(trimmed);
  this.selections.add(trimmed);
  // Trigger reactivity on the Map and Set — Svelte 5 proxies pick up
  // the internal mutations, but assigning the references is defensive.
  this.manualAdditions = new Map(this.manualAdditions);
  this.selections = new Set(this.selections);
}

/**
 * Remove a manually-added candidate. Removes from both manualAdditions
 * and selections. If the text was also auto-detected (same string),
 * it is removed from selections; the auto-detected row will still
 * render with an unchecked checkbox.
 */
removeManualCandidate(category: ManualCategory, text: string): void {
  const bucket = this.manualAdditions.get(category);
  if (!bucket) return;
  if (!bucket.has(text)) return;
  bucket.delete(text);
  this.selections.delete(text);
  this.manualAdditions = new Map(this.manualAdditions);
  this.selections = new Set(this.selections);
}
```

### 11.4 Extend `loadFile` for manual-add persistence

Modify the existing `loadFile` method per § 9.3.

### 11.5 Extend `reset` for manual-add clearing

Modify the existing `reset` method per § 9.4.

---

## 12. Component specifications

### 12.1 `CandidatesPanel.svelte` (top-level — REWRITTEN postParse branch)

**Purpose.** Top-level candidates panel. Dispatches on `phase.kind` to render the right content. Only the `postParse` branch is redesigned; the other 6 phase branches (idle, parsing, redacting, downloadReady, verifyFail, fatalError) preserve their current output byte-for-byte.

**Props:**

```typescript
type Props = {
  phase: AppPhase;
};
```

**Top-of-file JSDoc (mandatory):** include the ASCII mockup from session-log-2026-04-11-v2 lines 131–156 as the authoritative structural reference. This ensures future maintainers see the intent without needing the private-notes repo.

**postParse branch structure (pseudocode):**

```svelte
{#if phase.kind === "postParse"}
  <div class="panel-head">
    <h2 class="panel-title">Candidates</h2>
    <p class="panel-sub">Review every string before redaction. Categories below.</p>
  </div>

  <div class="panel-body">
    <!-- 1. 당사자 -->
    <CategorySection
      label="당사자"
      subHint="Auto-selected · 자동 선택됨"
      category="literals"
      candidates={buildLiteralCandidates(phase.analysis)}
      canManualAdd={true}
    />

    <!-- 2. 정의된 대리어 -->
    <CategorySection
      label="정의된 대리어"
      subHint="Kept as-is by default (D9 — 독해성 유지)"
      category="defined"
      candidates={buildDefinedCandidates(phase.analysis)}
      canManualAdd={false}
    />

    <!-- 3. 식별번호 -->
    <CategorySection
      label="식별번호 (PII)"
      subHint="주민번호 · 사업자번호 · 이메일 · 계좌"
      category="pii"
      candidates={buildPiiCandidates(phase.analysis)}
      canManualAdd={false}
    />

    <!-- 4–7. Non-PII categories -->
    <CategorySection label="금액"      subHint="..." category="financial"  candidates={nonPiiByCategory("financial")}  canManualAdd={true} />
    <CategorySection label="날짜 / 기간" subHint="..." category="temporal"   candidates={nonPiiByCategory("temporal")}   canManualAdd={true} />
    <CategorySection label="법인 / 인물" subHint="..." category="entities"   candidates={nonPiiByCategory(["entities","structural"])} canManualAdd={true} />
    <CategorySection label="법원 / 사건" subHint="..." category="legal"      candidates={nonPiiByCategory("legal")}      canManualAdd={true} />

    <!-- 8. 추측 (last, warn-styled) -->
    <CategorySection label="추측 (낮은 신뢰도)" subHint="휴리스틱 — 검토 후 체크" category="heuristics" candidates={nonPiiByCategory("heuristics")} canManualAdd={false} warnStyle={true} />
  </div>

  <div class="panel-foot">
    <!-- same as today: selected count + Apply button + shortcut hint -->
  </div>
{:else if phase.kind === "idle"}
  <!-- UNCHANGED from current implementation -->
{:else if phase.kind === "parsing"}
  <!-- UNCHANGED -->
{:else if phase.kind === "redacting"}
  <!-- UNCHANGED -->
{:else if phase.kind === "downloadReady"}
  <!-- UNCHANGED -->
{:else if phase.kind === "verifyFail"}
  <!-- UNCHANGED -->
{:else if phase.kind === "fatalError"}
  <!-- UNCHANGED -->
{/if}
```

**Derived helpers (in the `<script>` block):**

```typescript
type CategoryCandidate = {
  readonly text: string;
  readonly meta: string; // e.g., "financial.won-amount · body" or "literal · ABC Corp"
  readonly confidence?: number; // only set for heuristics
  readonly isManual: boolean;
  readonly manualCategory?: ManualCategory; // only set when isManual === true
};

function buildLiteralCandidates(analysis: Analysis): CategoryCandidate[] {
  const out: CategoryCandidate[] = [];
  for (const group of analysis.entityGroups) {
    for (const cand of group.literals) {
      out.push({ text: cand.text, meta: `literal · ${group.seed}`, isManual: false });
    }
  }
  for (const text of appState.manualAdditions.get("literals") ?? []) {
    out.push({ text, meta: "manual", isManual: true, manualCategory: "literals" });
  }
  return out;
}

// ... similar helpers for each category
```

**File length target:** ~250 lines (down from 509 in Phase 1).

### 12.2 `CategorySection.svelte`

**Purpose.** Renders one collapsed/expanded category block with header, candidate rows, and (optionally) an AddCandidateInput.

**Props:**

```typescript
type Props = {
  label: string;              // Korean label e.g., "금액"
  subHint: string;            // gray text below label
  category: string;           // key for grouping — e.g., "financial" or "literals"
  candidates: ReadonlyArray<CategoryCandidate>;
  canManualAdd: boolean;      // if true, renders AddCandidateInput
  warnStyle?: boolean;        // if true, applies warn-bg + warn border (for 추측 section)
};
```

**Structure:**

```svelte
{#if candidates.length > 0 || canManualAdd}
  <section class="cat-section" class:warn={warnStyle}>
    <header class="cat-header">
      <span class="cat-label">{label}</span>
      <span class="cat-count">{candidates.length}</span>
    </header>
    <p class="cat-sub">{subHint}</p>

    <div class="cat-body">
      {#each candidates as cand (cand.text)}
        <CandidateRow
          text={cand.text}
          meta={cand.meta}
          confidence={cand.confidence}
          isManual={cand.isManual}
          manualCategory={cand.manualCategory}
        />
      {/each}

      {#if canManualAdd}
        <AddCandidateInput {category} alreadyDetected={new Set(candidates.map((c) => c.text))} />
      {/if}
    </div>
  </section>
{/if}
```

**Empty-state handling:** if `candidates.length === 0` AND `canManualAdd === false`, the section is entirely hidden (no empty card). If `candidates.length === 0` AND `canManualAdd === true`, the section renders with just the AddCandidateInput (so the user can still add items).

**File length target:** ~150 lines including CSS.

### 12.3 `CandidateRow.svelte`

**Purpose.** Single clickable row with checkbox + text + meta + (optional) confidence badge + (optional) manual-remove button.

**Props:**

```typescript
type Props = {
  text: string;
  meta: string;
  confidence?: number; // shown as pill when < 1.0
  isManual: boolean;
  manualCategory?: ManualCategory; // required when isManual === true (for removeManualCandidate)
};
```

**Interactions:**

- Click anywhere on the row (except the "×" button) → `appState.toggleSelection(text)`.
- Click the "×" button (only visible when `isManual`) → `appState.removeManualCandidate(manualCategory!, text)`. Stop event propagation so the row toggle does not fire.
- Keyboard: Enter/Space toggles selection. Delete removes manual rows.
- Focus: visible outline per § 6.4.

**Structure:**

```svelte
<button
  type="button"
  class="row"
  class:on={appState.isSelected(text)}
  onclick={() => appState.toggleSelection(text)}
>
  <span class="row-check" aria-hidden="true"></span>
  <span class="row-main">
    <span class="row-text">{text}</span>
    <span class="row-meta">{meta}</span>
  </span>
  {#if confidence !== undefined && confidence < 1.0}
    <span class="row-conf">{confidence.toFixed(1)}</span>
  {/if}
  {#if isManual}
    <span class="row-badge">manual</span>
    <button
      type="button"
      class="row-remove"
      aria-label="Remove manual addition"
      onclick={(e) => {
        e.stopPropagation();
        appState.removeManualCandidate(manualCategory!, text);
      }}
    >×</button>
  {/if}
</button>
```

**File length target:** ~80 lines including CSS.

### 12.4 `AddCandidateInput.svelte`

**Purpose.** Inline "+ 추가" button that expands to input + Add/Cancel on click. Validates input and calls `appState.addManualCandidate`.

**Props:**

```typescript
type Props = {
  category: ManualCategory;
  alreadyDetected: ReadonlySet<string>; // used to reject duplicates
};
```

**State (component-local):**

```typescript
let expanded = $state(false);
let value = $state("");
let error = $state<string | null>(null);
```

**Structure:**

```svelte
{#if !expanded}
  <button
    type="button"
    class="add-btn"
    onclick={() => (expanded = true)}
  >
    + 추가
  </button>
{:else}
  <div class="add-form">
    <input
      type="text"
      bind:value
      class="add-input"
      placeholder="직접 입력…"
      maxlength="200"
      oninput={() => (error = null)}
      onkeydown={(e) => {
        if (e.key === "Enter") handleAdd();
        if (e.key === "Escape") handleCancel();
      }}
    />
    <button type="button" class="add-submit" disabled={!isValid()} onclick={handleAdd}>
      Add
    </button>
    <button type="button" class="add-cancel" onclick={handleCancel}>
      Cancel
    </button>
    {#if error}
      <div class="add-error">{error}</div>
    {/if}
  </div>
{/if}
```

**Validation (`isValid` / `handleAdd`):**

```typescript
function isValid(): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200;
}

function handleAdd(): void {
  const trimmed = value.trim();
  if (!isValid()) return;
  if (alreadyDetected.has(trimmed)) {
    error = "이미 감지됨";
    return;
  }
  appState.addManualCandidate(category, trimmed);
  value = "";
  expanded = false;
}

function handleCancel(): void {
  value = "";
  error = null;
  expanded = false;
}
```

**File length target:** ~90 lines including CSS.

---

## 13. Accessibility requirements (design-v1 § D6)

- **Keyboard navigation:** every interactive element (rows, "+ 추가" button, remove "×" button, AddCandidateInput fields) must be focusable via Tab in a natural reading order.
- **Focus visibility:** 2px outline in `var(--primary)` with 2px offset on any focused element.
- **Enter/Space activates buttons.** Enter in the AddCandidateInput submits. Escape cancels AddCandidateInput.
- **Screen reader labels:**
  - Remove "×" button: `aria-label="Remove manual addition"`
  - Checkbox (implicit via row): row has `role="button"` `aria-pressed` reflecting checked state
  - Category section: `<section aria-labelledby="{id}-label">` with header having that id
- **Touch targets:** minimum 44×44 on mobile (auto-applies due to existing CSS), 36×36 on desktop. Row padding already satisfies this.
- **Color contrast:** all text-on-background pairs meet WCAG AA (4.5:1 for body text, 3:1 for large text). Tokens from design-v1 § D5 are already compliant.

---

## 14. Testing strategy

### 14.1 Test infrastructure

**No new Svelte component test infrastructure.** The project uses Vitest with `environment: "node"`; Svelte components are NOT rendered in tests. Instead, Phase 2 tests exercise the UI logic via `engine.ts` + `state.svelte.ts` directly, and integration flow via `ship-gate.test.ts`.

### 14.2 `engine.test.ts` extensions (5 new tests)

Append to the existing `describe("defaultSelections", …)` block:

```typescript
it("does NOT include heuristic candidates (confidence < 1.0) in defaultSelections", () => {
  const analysis: Analysis = {
    entityGroups: [],
    piiCandidates: [],
    nonPiiCandidates: [
      { text: "Acme Holdings", ruleId: "heuristics.capitalization-cluster", category: "heuristics", confidence: 0.7, count: 3, scopes: [] },
      { text: "50,000,000원", ruleId: "financial.won-amount", category: "financial", confidence: 1.0, count: 1, scopes: [] },
    ],
    fileStats: { sizeBytes: 0, scopeCount: 0 },
  };
  const selections = defaultSelections(analysis);
  expect(selections.has("Acme Holdings")).toBe(false);
  expect(selections.has("50,000,000원")).toBe(true);
});

it("excludes defined term labels from defaultSelections (D9 preserved)", () => {
  const analysis: Analysis = {
    entityGroups: [{ seed: "ABC Corp", literals: [{ text: "ABC Corporation", count: 1, scopes: [] }], defined: [{ text: "the Buyer", count: 5, scopes: [] }], variant: "exact" }],
    piiCandidates: [],
    nonPiiCandidates: [],
    fileStats: { sizeBytes: 0, scopeCount: 0 },
  };
  const selections = defaultSelections(analysis);
  expect(selections.has("ABC Corporation")).toBe(true);
  expect(selections.has("the Buyer")).toBe(false);
});

it("includes ALL PII candidates regardless of confidence field presence", () => {
  // PII has no confidence field on PiiCandidate — but the policy is always checked
  const analysis: Analysis = {
    entityGroups: [],
    piiCandidates: [{ text: "user@example.com", kind: "email", count: 1, scopes: [] }],
    nonPiiCandidates: [],
    fileStats: { sizeBytes: 0, scopeCount: 0 },
  };
  const selections = defaultSelections(analysis);
  expect(selections.has("user@example.com")).toBe(true);
});

it("includes non-heuristic nonPii candidates (confidence === 1.0) across all categories", () => {
  const analysis: Analysis = {
    entityGroups: [],
    piiCandidates: [],
    nonPiiCandidates: [
      { text: "50,000원", ruleId: "financial.won-amount", category: "financial", confidence: 1.0, count: 1, scopes: [] },
      { text: "2024년 3월 15일", ruleId: "temporal.date-ko-full", category: "temporal", confidence: 1.0, count: 1, scopes: [] },
      { text: "ABC 주식회사", ruleId: "entities.ko-corp-suffix", category: "entities", confidence: 1.0, count: 1, scopes: [] },
      { text: "대법원", ruleId: "legal.ko-court-name", category: "legal", confidence: 1.0, count: 1, scopes: [] },
      { text: "NDA", ruleId: "structural.header-block", category: "structural", confidence: 1.0, count: 1, scopes: [] },
    ],
    fileStats: { sizeBytes: 0, scopeCount: 0 },
  };
  const selections = defaultSelections(analysis);
  expect(selections.size).toBe(5);
});

it("handles empty analysis by returning empty set", () => {
  const analysis: Analysis = {
    entityGroups: [],
    piiCandidates: [],
    nonPiiCandidates: [],
    fileStats: { sizeBytes: 0, scopeCount: 0 },
  };
  expect(defaultSelections(analysis).size).toBe(0);
});
```

**Update** the existing Phase 1 test `"populates nonPiiCandidates for Phase 1 matches on the worst-case fixture"` — change its assertion from `for (const cand of analysis.nonPiiCandidates) { expect(selections.has(cand.text)).toBe(true); }` to:

```typescript
for (const cand of analysis.nonPiiCandidates) {
  if (cand.confidence === 1.0) {
    expect(selections.has(cand.text)).toBe(true);
  } else {
    expect(selections.has(cand.text)).toBe(false);
  }
}
```

This updated assertion reflects the Phase 2 policy.

### 14.3 `ship-gate.test.ts` extensions (4 new tests)

Append 4 new tests that exercise the state module's new verbs end-to-end:

```typescript
it("addManualCandidate adds text to both manualAdditions and selections", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  await appState.loadFile(new File([bytes], "test.docx"));
  const before = appState.selections.size;
  appState.addManualCandidate("financial", "USD 1,000,000");
  expect(appState.selections.has("USD 1,000,000")).toBe(true);
  expect(appState.manualAdditions.get("financial")?.has("USD 1,000,000")).toBe(true);
  expect(appState.selections.size).toBe(before + 1);
});

it("removeManualCandidate removes text from both manualAdditions and selections", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  await appState.loadFile(new File([bytes], "test.docx"));
  appState.addManualCandidate("financial", "USD 1,000,000");
  appState.removeManualCandidate("financial", "USD 1,000,000");
  expect(appState.selections.has("USD 1,000,000")).toBe(false);
  expect(appState.manualAdditions.get("financial")?.has("USD 1,000,000")).toBe(false);
});

it("manualAdditions persist across re-analysis via loadFile", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  await appState.loadFile(new File([bytes], "test.docx"));
  appState.addManualCandidate("financial", "USD 1,000,000");
  // Re-drop the same file
  await appState.loadFile(new File([bytes], "test.docx"));
  expect(appState.selections.has("USD 1,000,000")).toBe(true);
  expect(appState.manualAdditions.get("financial")?.has("USD 1,000,000")).toBe(true);
});

it("reset clears both selections and manualAdditions", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  await appState.loadFile(new File([bytes], "test.docx"));
  appState.addManualCandidate("financial", "USD 1,000,000");
  appState.reset();
  expect(appState.selections.size).toBe(0);
  expect(appState.manualAdditions.get("financial")?.size ?? 0).toBe(0);
});
```

Note: since `state.svelte.ts` is a singleton, each test must call `appState.reset()` at the end (or use `beforeEach(() => appState.reset())` at the top of the describe block).

### 14.4 Total Phase 2 test count

- `engine.test.ts`: +5 tests (new policy)
- `ship-gate.test.ts`: +4 tests (integration)
- `engine.test.ts` updated: 1 existing test assertion tightened
- **Total new: ~9 tests**, bringing the suite from 1539 → ~1548 passing

The test count is modest because component rendering is not tested directly; logic is tested via the engine + state modules.

---

## 15. TDD sequence (10 steps, execute IN ORDER)

### Step 1 — Baseline verification (no commit)

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"
bun run test 2>&1 | tail -5
# Expected: 1539 passing (after Phase 1 merge)
bun run typecheck 2>&1 | tail -3
# Expected: 0 errors

PHASE1_HEAD=$(git rev-parse --short HEAD)
echo "Phase 1 HEAD: $PHASE1_HEAD"
```

If baseline is NOT 1539 passing, STOP — Phase 1 did not merge cleanly.

### Step 2 — Update `defaultSelections` policy (1 commit)

**What to do:**
1. Update `src/ui/engine.ts` `defaultSelections` body per § 8.3
2. Update the 1 existing test in `engine.test.ts` per § 14.2 (the Phase 1 test that asserts `selections.has` for every nonPii candidate)
3. Append 5 new tests per § 14.2

**Verify:**
```bash
bun run test src/ui/engine.test.ts 2>&1 | tail -5
bun run test 2>&1 | tail -5
# Expected: +5 new tests, 1 modified test, total ~1544 passing
```

**Commit message:** `refactor(ui/engine): default-select only confidence=1.0 nonPii candidates`

### Step 3 — Extend `state.svelte.ts` (1 commit)

**What to do:**
1. Add `ManualCategory` type export (§ 11.1)
2. Add `manualAdditions` state field (§ 11.2)
3. Add `addManualCandidate` and `removeManualCandidate` verbs (§ 11.3)
4. Extend `loadFile` for persistence (§ 9.3)
5. Extend `reset` for clearing (§ 9.4)

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
# Expected: 0 errors
bun run test 2>&1 | tail -5
# Expected: all existing tests still pass (1544 passing)
```

**Commit message:** `feat(ui/state): add manualAdditions map and addManual/removeManual verbs`

### Step 4 — Extend `ship-gate.test.ts` (1 commit)

**What to do:** Append 4 new tests per § 14.3.

**Verify:**
```bash
bun run test src/ui/ship-gate.test.ts 2>&1 | tail -5
# Expected: +4 new tests pass
```

**Commit message:** `test(ui): add manual-candidate integration tests to ship-gate`

### Step 5 — Create `CandidateRow.svelte` (1 commit)

**What to do:** Create the component per § 12.3 with full TypeScript + HTML + CSS.

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
# Expected: 0 errors
```

**Commit message:** `feat(ui): add CandidateRow.svelte — reusable candidate row component`

### Step 6 — Create `AddCandidateInput.svelte` (1 commit)

**What to do:** Create the component per § 12.4 with validation logic.

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
```

**Commit message:** `feat(ui): add AddCandidateInput.svelte — inline per-category manual-add form`

### Step 7 — Create `CategorySection.svelte` (1 commit)

**What to do:** Create the component per § 12.2. Imports `CandidateRow.svelte` and `AddCandidateInput.svelte`.

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
```

**Commit message:** `feat(ui): add CategorySection.svelte — per-category block with rows + add affordance`

### Step 8 — Rewrite `CandidatesPanel.svelte` postParse branch (1 commit)

**What to do:**
1. Rewrite ONLY the `{#if phase.kind === "postParse"}` branch per § 12.1
2. Preserve all other phase branches (idle, parsing, redacting, downloadReady, verifyFail, fatalError) byte-for-byte
3. Add derived helpers (`buildLiteralCandidates`, etc.) in the `<script>` block
4. Keep the panel-foot (Apply button, selected count, shortcut hint) as-is

**Verify:**
```bash
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
bun run test 2>&1 | tail -5
# Expected: all 1548 tests still pass (no test touches CandidatesPanel.svelte directly)
```

**Commit message:** `feat(ui): redesign CandidatesPanel postParse to 8 category-grouped sections`

### Step 9 — Build + smoke test (1 commit — optional if build changes)

**What to do:**
1. Run `bun run build` — must succeed
2. If the new components generate different bundle output, that's expected (new code = different bundle). Determinism must still hold (two sequential builds produce identical sha256).

**Verify:**
```bash
bun run build 2>&1 | tail -5
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build 2>&1 > /dev/null
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
[ "$FIRST" = "$SECOND" ] && echo "DETERMINISM OK" || echo "FAIL"
```

No commit needed for the build itself (build output is gitignored). If a build-time issue surfaces, fix in a new commit.

### Step 10 — Handback document (1 commit)

**What to do:** Create `docs/phases/phase-2-handback.md` using the template in § 17.5.

**Commit:**
```bash
git add docs/phases/phase-2-handback.md
git commit -m "$(cat <<'EOF'
docs(phases): add Phase 2 handback — UI redesign complete

Co-Authored-By: Codex <noreply@openai.com>
EOF
)"
```

### TDD step summary

| Step | Files | Tests added | Running total |
|---|---|---:|---:|
| 1 | (verify) | 0 | 1539 |
| 2 | engine.ts, engine.test.ts | +5 (1 modified) | 1544 |
| 3 | state.svelte.ts | 0 | 1544 |
| 4 | ship-gate.test.ts | +4 | 1548 |
| 5 | CandidateRow.svelte | 0 | 1548 |
| 6 | AddCandidateInput.svelte | 0 | 1548 |
| 7 | CategorySection.svelte | 0 | 1548 |
| 8 | CandidatesPanel.svelte | 0 | 1548 |
| 9 | (build) | 0 | 1548 |
| 10 | phase-2-handback.md | 0 | 1548 |

### Commit conventions

Same as Phase 1: `<type>(<scope>): <summary>` + HEREDOC body + `Co-Authored-By: Codex <noreply@openai.com>`. Valid scopes: `ui`, `ui/engine`, `ui/state`, `docs`.

---

## 16. Verification commands (ship gate)

Run after step 10. All must pass.

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"

# 1. Git state
git status                           # working tree clean
git log --oneline $PHASE1_HEAD..HEAD # 8-9 new commits

# 2. Tests — primary check
bun run test 2>&1 | tail -10
# Expected: ~1548 passing, 0 failing

# 3. Phase 0 ship gate still passes
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tail -5
# Expected: 24 passing (Phase 0 ship gate preserved)

# 4. Phase 1 tests still pass
bun run test src/detection/detect-all.test.ts 2>&1 | tail -5
bun run test src/detection/detect-all.integration.test.ts 2>&1 | tail -5
# Expected: same pass counts as Phase 1 handback (50 + 10)

# 5. Phase 2 new tests
bun run test src/ui/engine.test.ts 2>&1 | tail -5
# Expected: ~23 passing (17 Phase 0 + 1 Phase 1 + 5 Phase 2)
bun run test src/ui/ship-gate.test.ts 2>&1 | tail -5
# Expected: old count + 4 Phase 2

# 6. Type check
bun run typecheck 2>&1 | tail -5
# Expected: 0 errors

# 7. Lint
bun run lint 2>&1 | tail -5
# Expected: 0 errors (3 pre-existing warnings OK)

# 8. Build
bun run build 2>&1 | tail -10

# 9. Build determinism
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build 2>&1 > /dev/null
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
[ "$FIRST" = "$SECOND" ] && echo "DETERMINISM OK: $FIRST" || echo "FAIL"

# 10. No changes to detection/propagation/docx/finalize
git diff $PHASE1_HEAD -- src/detection/ | head -5  # expect empty
git diff $PHASE1_HEAD -- src/propagation/ | head -5
git diff $PHASE1_HEAD -- src/docx/ | head -5
git diff $PHASE1_HEAD -- src/finalize/ | head -5

# 11. Unchanged UI files
git diff $PHASE1_HEAD -- src/ui/App.svelte src/ui/DocumentPreview.svelte src/ui/Topbar.svelte src/ui/Sidebar.svelte src/ui/Footer.svelte src/ui/styles.css src/ui/main.ts | head -5
# Expected: empty

# 12. No network code
grep -rn 'fetch\|XMLHttpRequest\|WebSocket\|EventSource\|sendBeacon\|import(' src/ui/*.svelte src/ui/*.ts | grep -v '\.test\.ts' | grep -v 'import type\|^import' || echo "clean"

# 13. No try/catch in new components
grep -rn '\btry\b' src/ui/CategorySection.svelte src/ui/CandidateRow.svelte src/ui/AddCandidateInput.svelte | head -5 || echo "clean"
```

---

## 17. Gotchas + out-of-scope + acceptance + handback + error handling

### 17.1 Gotchas

**17.1.1 Svelte 5 runes and Map/Set reactivity.** Svelte 5's `$state` proxy wraps Map and Set instances but tracking internal mutations (`.set`, `.delete`) can be inconsistent across the runtime versions. For safety, reassign the whole container after every mutation (`this.manualAdditions = new Map(this.manualAdditions)`) as shown in § 11.3. This is a "defensive reactivity" pattern — mildly wasteful but reliably triggers updates.

**17.1.2 `isSelected` reactivity in row.** `CandidateRow.svelte` reads `appState.isSelected(text)` in its class binding. Since `appState.selections` is `$state<Set<string>>`, reading `.has()` inside a reactive context correctly subscribes. If rows don't update when selection changes, check that `isSelected` is called inside the template, not a one-time component-local `$state`.

**17.1.3 The singleton `appState` across tests.** Tests in `ship-gate.test.ts` share the `appState` singleton. Use `beforeEach(() => appState.reset())` to isolate. Without reset, `manualAdditions` from a previous test leaks.

**17.1.4 Korean inputs in `AddCandidateInput`.** Korean IME composition fires on every keystroke; the validation should only run on `onkeydown` for Enter/Escape and on `onclick` for Add — NOT on `oninput` (which fires mid-composition and could prematurely trigger `isValid`).

**17.1.5 ARIA `aria-pressed` on rows.** Rows act as toggle buttons. Use `aria-pressed={isSelected(text)}` on the `<button>` element.

**17.1.6 `structural` category merges into `entities`.** When filtering `nonPiiCandidates` for the 법인/인물 section, include BOTH `category === "entities"` and `category === "structural"`. This is the only section with a 2-way filter.

**17.1.7 Manual additions with auto-detected duplicates.** If a user manually adds "Samsung Electronics" and the next analysis auto-detects it too, the row is rendered in the 법인/인물 section with the auto-detected meta label (not the "manual" badge) — because the engine's detection wins the rendering. The manualAdditions Set still contains "Samsung Electronics" but the CategoryRow doesn't mark it manual. This is acceptable behavior — documented as a minor UX quirk.

**17.1.8 `maxlength="200"` on input.** HTML attribute enforces client-side truncation. The server-side equivalent is `text.length > 200 → reject` in the state verb. Both must agree on 200.

### 17.2 Out of scope (DO NOT DO)

- ❌ Modify ANY detection-layer file (`src/detection/**`)
- ❌ Modify ANY propagation/docx/finalize file
- ❌ Modify any `.svelte` file other than `CandidatesPanel.svelte` and the 3 new components
- ❌ Modify `engine.ts` beyond the `defaultSelections` body
- ❌ Modify `Analysis` / `NonPiiCandidate` / `PiiCandidate` interfaces
- ❌ Modify `applyRedaction` signature
- ❌ Add Svelte component testing infrastructure (no `@testing-library/svelte`, no `happy-dom`)
- ❌ Add modal components (AddCandidateInput is inline, not modal)
- ❌ Add collapsible sections (v1: always expanded)
- ❌ Add keyboard shortcuts beyond Enter/Escape in AddCandidateInput
- ❌ Add animations beyond the 0.12–0.15s CSS transitions
- ❌ Add dark mode variants
- ❌ Redesign Topbar, Sidebar, DocumentPreview, Footer
- ❌ Modify responsive breakpoints or bottom-sheet logic
- ❌ Add new npm dependencies
- ❌ `git push`

### 17.3 Acceptance criteria (verifiable)

1. ✅ `bun run test` passes (≥ 1548 passing, 0 failing)
2. ✅ `bun run typecheck` → 0 errors
3. ✅ `bun run lint` → 0 errors (pre-existing warnings OK)
4. ✅ `bun run build` succeeds
5. ✅ Build determinism verified (2 runs produce identical sha256)
6. ✅ `src/ui/CategorySection.svelte` exists
7. ✅ `src/ui/CandidateRow.svelte` exists
8. ✅ `src/ui/AddCandidateInput.svelte` exists
9. ✅ `src/ui/CandidatesPanel.svelte` has been rewritten (file size ~250 lines, down from 509)
10. ✅ `src/ui/state.svelte.ts` exports `ManualCategory` type
11. ✅ `AppState` class has `manualAdditions: Map<ManualCategory, Set<string>>` field
12. ✅ `AppState` class has `addManualCandidate(category, text)` method
13. ✅ `AppState` class has `removeManualCandidate(category, text)` method
14. ✅ `defaultSelections(analysis)` excludes nonPii candidates with `confidence < 1.0`
15. ✅ `defaultSelections(analysis)` excludes defined term labels (D9)
16. ✅ Manual additions persist across `loadFile` calls (tested in ship-gate.test.ts)
17. ✅ `reset()` clears `manualAdditions`
18. ✅ `Analysis` shape unchanged (diff against Phase 1 HEAD for `engine.ts` Analysis interface is empty)
19. ✅ `NonPiiCandidate` / `PiiCandidate` / `ApplyOptions` interfaces unchanged
20. ✅ `analyzeZip` / `applyRedaction` signatures unchanged
21. ✅ Zero changes under `src/detection/`, `src/propagation/`, `src/docx/`, `src/finalize/`
22. ✅ Zero changes to Svelte files other than `CandidatesPanel.svelte` and the 3 new ones
23. ✅ Zero changes to `package.json`, `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `svelte.config.js`
24. ✅ No new npm dependencies
25. ✅ Phase 0 ship gate (`detect-pii.characterization.test.ts`) passes byte-for-byte
26. ✅ Phase 1 tests pass (`detect-all.test.ts`, `detect-all.integration.test.ts`, etc.)
27. ✅ No `try/catch` keyword in new components
28. ✅ No network code (`fetch`, `XMLHttpRequest`, etc.) in any UI file
29. ✅ 8–10 commits with conventional format + `Co-Authored-By: Codex`
30. ✅ Handback doc at `docs/phases/phase-2-handback.md`

### 17.4 Error handling (3-attempt rule)

Same 3-attempt rule as Phase 0/1: if you've tried 3 approaches and none work, STOP. Write a `BLOCKED` section in the handback and exit. Do not commit broken code.

**If Svelte 5 reactivity doesn't propagate to rows after selections change:**
- Verify the Map/Set reassignment pattern in § 11.3
- Verify the template reads `appState.isSelected(text)` (not a stale cached value)
- Check `svelte.config.js` for any reactivity-breaking flags

**If a typecheck fails:**
- Most likely: missing `import type` on type-only imports
- `ManualCategory` must be imported as a type (`import type { ManualCategory }`)
- Svelte 5 `$props<Props>()` needs the type passed in

**If a build fails:**
- Do NOT modify `vite.config.ts` or `svelte.config.js`
- Most likely: circular import. Check that `CategorySection.svelte` imports from `./CandidateRow.svelte` and `./AddCandidateInput.svelte` (sibling), not from `./CandidatesPanel.svelte`

### 17.5 Handback document template

Create `docs/phases/phase-2-handback.md`:

```markdown
# Phase 2 handback — UI redesign (category-grouped candidates)

**Completed:** YYYY-MM-DD HH:MM
**Executed by:** Codex 5.4 xhigh
**Starting commit:** {Phase 1 HEAD short hash}
**Ending commit:** {short hash of HEAD}

## Summary (1 paragraph)

One paragraph: what was done, components created, tests added, behavior changes.

## Category sections rendered

- 당사자 (entity literals) — default checked
- 정의된 대리어 — default UNCHECKED (D9)
- 식별번호 (PII) — default checked
- 금액 — default checked, manual-add enabled
- 날짜 / 기간 — default checked, manual-add enabled
- 법인 / 인물 — default checked, manual-add enabled (entities + structural merged)
- 법원 / 사건 — default checked, manual-add enabled
- 추측 (heuristics) — default UNCHECKED, warn-styled, no manual-add

## Commits created

{output of git log --oneline {Phase1HEAD}..HEAD}

## Files created

- src/ui/CategorySection.svelte ({N} lines)
- src/ui/CandidateRow.svelte ({N} lines)
- src/ui/AddCandidateInput.svelte ({N} lines)
- docs/phases/phase-2-handback.md

## Files modified

- src/ui/CandidatesPanel.svelte (rewrite: {old} → {new} lines)
- src/ui/state.svelte.ts (extended: +{N} lines — manualAdditions + 2 verbs)
- src/ui/engine.ts (defaultSelections body only)
- src/ui/engine.test.ts (+5 tests, 1 modified assertion)
- src/ui/ship-gate.test.ts (+4 tests)

## Tests

- Before: 1539 passing
- After: {N} passing
- New: +9 tests (5 engine + 4 ship-gate)

## Build

- Before hash (Phase 1): {old hash}
- After hash (Phase 2): {new hash}
- Determinism: yes

## Acceptance criteria

{For each of the 30 criteria in § 17.3: ✅ or ❌ with evidence}

## Deviations from brief

{Any judgment calls that differed from the brief. If none: "None."}

## Gotchas encountered

{Anything non-obvious.}

## Manual verification recommended

- [ ] Open dist/document-redactor.html in browser
- [ ] Drop tests/fixtures/bilingual_nda_worst_case.docx
- [ ] Verify 7 visible category sections (당사자, 식별번호, 금액, 날짜, 법인, 법원 — 정의된 대리어 may be hidden if no defined terms; 추측 hidden if no heuristics fired)
- [ ] Click "+ 추가" in 금액 section, add "USD 1,000,000", verify it appears with [manual] badge
- [ ] Click "×" on the manual row, verify it disappears
- [ ] Re-drop the same file, verify the manual "USD 1,000,000" is NOT present (it was removed, not persisted via a second re-add)
- [ ] Add again, re-drop, verify it IS present on the re-analysis
- [ ] Verify 추측 section has warn-colored background (if heuristics fire on the fixture)
- [ ] Verify heuristic candidates (confidence < 1.0) are UNCHECKED by default

## Suggested next steps

1. Phase 3 — Heuristic tuning: measure 4 heuristics against 10+ real contracts, recalibrate confidence thresholds and role blacklists
2. Phase 4 — Lane C consolidation: unify propagation/defined-terms.ts with structural/definition-section.ts
3. Phase 5 — Korean NFD→NFC hardening: add pre-normalization for jamo-decomposed input
4. UI polish: collapsible sections, keyboard shortcuts, dark mode (post-v1.1)
```

---

## End of brief

This document is `docs/phases/phase-2-ui-redesign.md`. It specifies the complete Phase 2 UI redesign: 3 new Svelte components + rewrite of `CandidatesPanel.svelte` postParse branch + `state.svelte.ts` extensions + `defaultSelections` policy redefinition. All decisions are locked per the Phase 1 session log. The 10 TDD steps, 13 verification commands, and 30 acceptance criteria are the execution contract.
