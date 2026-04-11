# Phase 1 — Comprehensive rulebook (Codex delegation brief)

> ⚠️ **PARTIAL DRAFT — DO NOT EXECUTE** ⚠️
>
> This brief is **incomplete** as of 2026-04-12 (v5, after session +2 second half).
> § 0–10 are written (orientation, mission, invariants, architecture, file
> layout, framework type extensions, runner extensions, detect-all.ts pipeline,
> financial rules, and temporal rules). The remaining rule content (§ 11–14
> entities / structural / legal / heuristics) and § 15–18 (testing / TDD /
> verification / acceptance) are **NOT YET AUTHORED**.
>
> **Do NOT hand this to Codex for execution in its current state.** Codex would
> read the file-layout section, fail to find rule specifications in § 11–14,
> and produce garbage code trying to fill in the gaps.
>
> **If you are Claude in a future session:** jump to the `## RESUME POINTER` section
> at the very bottom of this file. It tells you exactly where to pick up writing.
>
> **If you are the user:** this file will be completed across 2–3 more Claude
> sessions. Decisions are locked (see session log 2026-04-11-v2). The next step is
> writing § 11 (entities, ~700 lines), then § 12 (structural parsers, ~900 lines),
> then § 13–14 (legal / heuristics), followed by § 15–18 (testing / TDD /
> verification / acceptance).

---

**For:** Codex 5.4 xhigh (or any capable autonomous coding agent with filesystem + bash access)
**Project:** document-redactor
**Branch:** `main`
**Starting commit:** `187b7f8` (Phase 0 brief DefinedTerm rename) or descendant after Phase 0 merge
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`
**Date written:** 2026-04-11 (partial, in progress)
**Author of brief:** Claude Opus 4.6 at user's request
**Predecessor:** `docs/phases/phase-0-framework-port.md` (framework plumbing, MUST be merged before this brief executes)

---

## 0. How to read this document

This is a **self-contained task specification** for the complete Phase 1 rulebook. Read the whole thing before touching any code. Every decision has been made during an architectural review (see [session-log-2026-04-11-v2.md](../../document-redactor-private-notes/session-log-2026-04-11-v2.md) for the review record). Your job is to execute, not to re-debate.

### Sections in this document

0. How to read this document
1. Mission statement (one paragraph — the point of all this)
2. Required reading (files you MUST read before writing code)
3. Invariants (hard constraints you MUST NOT violate)
4. Architecture (3-phase runner, strangler-fig API, decided during review)
5. File layout (exact tree you will create — 22 new files)
6. Type extensions in `_framework/types.ts` (after StructuralDefinition rename)
7. Runner extensions (`_framework/runner.ts` — exact TypeScript with ASCII diagram)
8. `detect-all.ts` new pipeline (with Analysis shape extension for `engine.ts`)
9. `rules/financial.ts` — 10 regex rules (KRW, USD, foreign, percentage, fraction)
10. `rules/temporal.ts` — 8 regex rules (Korean/ISO/English dates, durations)
11. `rules/entities.ts` — 12 regex rules (corporate suffixes, titles, honorifics)
12. `rules/structural/` — 5 parsers (definition, signature, party, recitals, header)
13. `rules/legal.ts` — 6 regex rules (Korean + English case numbers, courts, statutes)
14. `rules/heuristics/` — 4 heuristics + 2 role blacklist data files
15. Testing requirements (per-file minimum counts, quality rubric, 475+ new tests)
16. TDD sequence (phase 1's 18 steps, commit at each step)
17. Verification commands (ship gate)
18. Gotchas + out-of-scope + acceptance criteria + handback contract + error handling

### Decisions locked during plan-eng-review (2026-04-11)

These decisions are not up for debate. If you feel tempted to change them, re-read the session log's review section.

| Ref | Decision | Rationale |
|---|---|---|
| **1.1A** Strangler-fig API | New `detect-all.ts` alongside legacy `detect-pii.ts`. Legacy untouched. `engine.ts` migration in one commit at end of Phase 1. | Preserves Phase 0 characterization ship gate (T18 fixture snapshot stays valid). Minimal diff. |
| **1.2A** `StructuralDefinition` not `DefinedTerm` | Framework type is `StructuralDefinition` per the renamed Phase 0 brief. `propagation/defined-terms.ts` stays untouched (separate concept: Lane C role-word classifier). | Avoids name collision and conceptual drift. Phase 0 invariant #2 preserved. |
| **1.3D** UI in separate brief | Phase 1 brief is detection-only. `engine.ts` gets minimal `Analysis` shape extension (new `nonPiiCandidates` field). `CandidatesPanel.svelte` untouched. UI redesign happens in a separate brief after Phase 1 merge + empirical real-document feedback. | v1.0 UI scope-out principle upheld. Rule quality validated before UI is designed around it. |
| **1.4E-1** Fail-loud | No try/catch in runner/parser/heuristic invocation. A throwing rule surfaces as a stack trace, not a silent miss. | Zero-miss invariant (design-v1 Lock-in #15). Matches v1.0 behavior. |
| **2.2** File splits | Single-file for financial, temporal, entities, legal. Subdirectory for structural (5 parsers) and heuristics (4 heuristics). Aggregation via `index.ts`. | Keeps per-file LOC under 500. Avoids premature abstraction for small files. |
| **ReDoS** ReDoS guard expansion | `redos-guard.test.ts` fuzzes regex rules (50ms budget) AND parsers + heuristics (100ms budget). | Parsers and heuristics can have internal regexes with backtracking. |

### What this document is NOT

- Not a rationale document. The review happened before this. If you want the why, read the session log referenced above.
- Not a research document. Every rule below is specified with exact regex source, exact test cases, exact rationale. You do not need to "choose" patterns.
- Not a sandbox. This is production code that ships in v1.1.
- Not a place to improve existing rules. Phase 0 identifiers rules stay untouched per Phase 0 invariants. Tighten in a future hygiene phase.

---

## 1. Mission statement

Add the complete rulebook to the document-redactor detection framework: 46 new detection items across 6 categories (financial / temporal / entities / structural / legal / heuristics), wire them into a new 3-phase runner (structural → regex → heuristics), expose a new parallel detection API at `src/detection/detect-all.ts`, and migrate `src/ui/engine.ts` to use it. All while preserving Phase 0 characterization tests byte-for-byte.

**Zero legacy behavior change.** Phase 0 characterization T1–T18 must all still pass on the exact same `buildTargetsFromZip()` API — because `detect-pii.ts` is untouched by this brief. The new pipeline lives alongside.

**Production, not sandbox.** Every rule ships in v1.1. Every rule has full test coverage (positive / variant / boundary / reject / ReDoS adversarial). The target is ≥90% auto-detection coverage on real contracts (Phase 5 measurement).

Expected deliverables: **22 new files**, **~475-550 new test cases**, **12-15 commits**, **zero npm dependencies**, **zero edits to Phase 0 characterization or integration tests**, and a post-port test count of **~1000 passing**.

---

## 2. Required reading (in order)

Read in this order. Earlier entries win on conflict.

1. **`docs/RULES_GUIDE.md`** (1195 lines) — binding convention spec. Especially:
   - § 2 Taxonomy — 7 categories with boundary resolution rules. Phase 1 fills categories 2–7.
   - § 3 Rule shapes — RegexRule, StructuralParser, Heuristic. Phase 1 exercises all three.
   - § 4 10-step regex rule walkthrough — follow for every regex rule.
   - § 5 Writing a structural parser — follow for every parser in § 12.
   - § 6 Writing a heuristic — especially § 6.2 required behaviors. **Every heuristic MUST consume `structuralDefinitions` + `priorCandidates` + apply role blacklist.**
   - § 7 ReDoS audit checklist — manual + automated. Every new regex goes through this.
   - § 8 Testing convention — minimum per-rule test sets, quality rubric. Migration parity protocol does NOT apply here (Phase 1 is adding new rules, not refactoring existing ones).
   - § 9 Dedup and boundary semantics — critical for `buildAllTargetsFromZip`.
   - § 10 Level/tier mapping — decides which rules run at Conservative vs Standard vs Paranoid.
   - § 11 Language handling — how to wire language filtering into the new runner.
   - § 12 Anti-patterns — every item flagged here must be avoided. Especially **12.1 `\b` in CJK**, **12.2 hardcoded entity names**, **12.4 returning normalized bytes**, **12.9 early dedupe**.
   - § 13 Rule catalog — the living list. Phase 1 fills § 13.2–13.5.

2. **`docs/phases/phase-0-framework-port.md`** (after rename at commit `187b7f8`) — your predecessor brief. Especially:
   - § 6 Type definitions — your starting point. Phase 1 extends this (§ 6 of this brief).
   - § 9 Runner implementation — `runRegexPhase` that Phase 1 extends with structural + heuristic phases.
   - § 12a Characterization tests — these tests MUST still pass after Phase 1.
   - § 19 Acceptance criteria — Phase 0 acceptance must be preserved; Phase 1 criteria are additive.

3. **`src/detection/_framework/types.ts`** — after Phase 0 merges, this file exists with the renamed `StructuralDefinition`. Your Phase 1 work adds zero new types to this file (see § 6 of this brief).

4. **`src/detection/_framework/runner.ts`** — Phase 0 delivers `runRegexPhase`. Phase 1 extends with `runStructuralPhase`, `runHeuristicPhase`, `runAllPhases`, and optional `{ language }` param.

5. **`src/detection/_framework/registry.ts`** — Phase 0 delivers `ALL_REGEX_RULES` with 8 identifiers. Phase 1 extends to include new categories (and also exposes `ALL_STRUCTURAL_PARSERS`, `ALL_HEURISTICS`).

6. **`src/detection/rules/identifiers.ts`** — Phase 0 delivers this. Phase 1 DOES NOT modify it. New categories get new files.

7. **`src/detection/normalize.ts`** — `normalizeForMatching(text)` returns `PositionMap`. Used by every rule in every phase.

8. **`src/detection/extract-text.ts`** — `extractTextFromZip(zip)` walks all scopes. Used by `detectAllInZip`.

9. **`src/propagation/defined-terms.ts`** — **DO NOT MODIFY**. This is Lane C's role-word classifier. It has a type called `DefinedTerm` that is NOT the same as framework's `StructuralDefinition`. Understand the distinction before writing any code that interacts with either.

10. **`src/propagation/propagate.ts`** and **`src/propagation/definition-clauses.ts`** — Lane C variant propagation and the English-only definition clause parser. DO NOT MODIFY. Phase 1 structural parsers (definition-section.ts) include a full Korean + English implementation — they coexist with, do not replace, the existing Lane C parser. (Consolidation is deferred post-Phase-1.)

11. **`src/ui/engine.ts`** — the Lane E engine wrapper. Phase 1's final commit migrates this file from `buildTargetsFromZip` to `buildAllTargetsFromZip`, and extends the `Analysis` type shape with `nonPiiCandidates`. Only TypeScript — no Svelte.

12. **`src/ui/engine.test.ts`** — 17 tests that will migrate along with engine.ts. You must preserve every existing test case's behavior while allowing the new `nonPiiCandidates` field on `Analysis`.

13. **`tests/fixtures/bilingual_nda_worst_case.docx`** — THE fixture. `detect-all.integration.test.ts` runs against it. You do NOT modify this file.

14. **`../document-redactor-private-notes/design-v1.md`** § "Eng Review Lock-in" #1–#15. Binding invariants. Especially #4 (3-tier redaction levels), #11 (Readability target renegotiated per RULES_GUIDE § 1 to be per-category), #13 (ReDoS prevention, now extended to parsers/heuristics).

15. **`../document-redactor-private-notes/session-log-2026-04-11-v2.md`** — the plan-eng-review record that produced this brief. Read the 5 architecture findings to understand why the decisions in § 0 are locked.

Commands to read these files:

```bash
cat docs/RULES_GUIDE.md | head -600
cat docs/RULES_GUIDE.md | tail -600
cat docs/phases/phase-0-framework-port.md | head -800
cat docs/phases/phase-0-framework-port.md | tail -800
cat src/detection/_framework/types.ts
cat src/detection/_framework/runner.ts
cat src/detection/_framework/registry.ts
cat src/detection/rules/identifiers.ts
cat src/detection/normalize.ts
cat src/detection/extract-text.ts
cat src/propagation/defined-terms.ts
cat src/ui/engine.ts
cat src/ui/engine.test.ts
```

---

## 3. Invariants (DO NOT VIOLATE)

These are non-negotiable. Each violation fails the phase.

1. **All 422 v1.0 legacy tests + 137 Phase 0 new tests must still pass** when you finish. `bun run test` must show `Tests N passed` where N is ≥ 559 + Phase 1 additions. If any existing test breaks, you have regressed. Do NOT skip, suppress, disable, or modify existing tests from earlier phases. The ONLY file from earlier phases that Phase 1 modifies is `src/ui/engine.ts` (and its test, to allow the new optional field on `Analysis`).

2. **No changes to Phase 0 files except extension:** you may APPEND to `_framework/runner.ts`, `_framework/registry.ts`, `_framework/types.ts`, and `_framework/redos-guard.test.ts`. You may NOT rename, reorder, or delete anything in those files that Phase 0 created. Think "add new exports, add new tests, extend" — never "rewrite".

3. **No changes to `src/detection/patterns.ts` or `src/detection/detect-pii.ts`** — legacy shim from Phase 0 stays untouched. If you feel tempted to "clean up the shim", STOP. That's Phase 2 or later.

4. **No changes to `src/detection/detect-pii.characterization.test.ts`** — the 18 characterization tests from Phase 0 are the ship gate. They must still pass byte-for-byte after Phase 1.

5. **No changes to `src/detection/detect-pii.integration.test.ts`** — legacy integration test continues to pass unchanged.

6. **No changes to `src/propagation/` or `src/docx/` or `src/finalize/`** — these lanes are downstream consumers or upstream preprocessors. Phase 1 does NOT touch them.

7. **No changes to `src/ui/` other than `engine.ts` and `engine.test.ts`** — no touching Svelte components. UI redesign is a separate brief.

8. **No changes to `package.json` dependencies.** No npm installs.

9. **No changes to Vite config, ESLint config, tsconfig.json, svelte.config.js.** If TypeScript or ESLint complain about your code, fix your code.

10. **Use `.js` extension in imports** (per tsconfig `allowImportingTsExtensions` + Vite convention).

11. **Use `import type` for type-only imports** (`verbatimModuleSyntax: true`).

12. **Use `!` or explicit checks for array access** (`noUncheckedIndexedAccess: true`).

13. **Every new regex MUST be bounded and pass the ReDoS guard.** See RULES_GUIDE § 7 for the checklist. The guard test (`_framework/redos-guard.test.ts`) runs fuzz with 50ms budget per regex rule and 100ms budget per parser / heuristic. A rule that fails must be redesigned, not excluded.

14. **Every heuristic MUST consume `HeuristicContext.structuralDefinitions` + `priorCandidates` + apply role blacklist.** Per RULES_GUIDE § 6.2. This is a safety invariant — heuristics without D9 awareness break the "The Buyer" user experience.

15. **Original-byte recovery via `origOffsets` is load-bearing.** Every phase that produces `Candidate[]` must use `normalizeForMatching` offset map to slice the ORIGINAL unnormalized substring for `candidate.text`. Never return normalized bytes. See RULES_GUIDE § 12.4.

16. **Fail-loud.** No try/catch in the runner, in phase functions, or around individual rule/parser/heuristic invocation. If something throws, let it bubble up as a stack trace. See [session-log-2026-04-11-v2.md](../../document-redactor-private-notes/session-log-2026-04-11-v2.md) Finding 1.4E-1.

17. **New pipeline is parallel, not replacement.** `detect-all.ts` and `detect-pii.ts` coexist. Legacy shim continues working. The ONLY caller migration is `engine.ts` at the final commit.

18. **`StructuralDefinition` ≠ `DefinedTerm`.** They are TWO different types in TWO different files. Do not import the wrong one. Do not "consolidate" them.

19. **Do not `git push`.** Commit locally only. The user reviews and pushes.

20. **Do not modify `tests/fixtures/`** — fixture generation is out of scope.

21. **Do not add network code.** ESLint bans `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, dynamic `import()`, `navigator.sendBeacon`. Any violation fails the lint step.

---

## 4. Architecture

### 4.1 3-phase runner pipeline

```
              ┌───────────────────────────────┐
  text ──────▶│  normalizeForMatching(text)   │
              │   returns { text, origOffsets } │
              └───────────┬───────────────────┘
                          │
                normalizedText + origOffsets
                          │
                          ▼
         ┌────────────────┴─────────────────┐
         │                                  │
         ▼                                  │
   ┌─────────────────┐                      │
   │   Phase 1:      │                      │
   │   Structural    │                      │
   │   parsers run   │                      │
   │   first         │                      │
   │                 │ ──▶ StructuralDefinition[]
   │   Each parser:  │                      │
   │   takes         │                      │
   │   normalizedText│                      │
   │   returns       │                      │
   │   readonly      │                      │
   │   StructDef[]   │                      │
   └────────┬────────┘                      │
            │                                │
            │ context for heuristic phase    │
            ▼                                │
   ┌────────────────┐                        │
   │   Phase 2:     │ ◀──────────────────────┘
   │   Regex rules  │
   │   run second   │
   │                │ ──▶ Candidate[] (phase 2)
   │   Filter by:   │       ruleId = "financial.won-amount"
   │   - level      │       ruleId = "temporal.date-ko"
   │   - language   │       ... etc
   │                │
   │   For each     │
   │   match:       │
   │   - clone re   │
   │   - exec loop  │
   │   - postFilter │
   │   - recover    │
   │     original   │
   │     bytes      │
   └────────┬───────┘
            │
            │ prior candidates for heuristic context
            ▼
   ┌────────────────┐
   │   Phase 3:     │
   │   Heuristics   │
   │   run last     │
   │                │ ──▶ Candidate[] (phase 3)
   │   HeuristicCtx │     confidence 0.5-0.9
   │   includes:    │
   │   - structural │
   │     definitions│
   │   - priorCand  │
   │     (phase 2)  │
   │   - docLang    │
   │                │
   │   Each heur    │
   │   applies role │
   │   blacklist +  │
   │   D9 awareness │
   └────────┬───────┘
            │
            │
            ▼
   ┌────────────────┐
   │   Merge +      │
   │   preserve     │
   │   phase order  │
   │                │ ──▶ Candidate[] (all)
   │   No dedup at  │     structural defs side-channel
   │   this stage.  │
   └────────┬───────┘
            │
            ▼
      consumer: detect-all.ts
      (detectAll, detectAllInZip, buildAllTargetsFromZip)
```

**Key properties of this pipeline:**

1. **Normalization runs ONCE per call.** All three phases see the same `PositionMap`. Parsers and heuristics that need to scan the text use the same offset map for original-byte recovery.

2. **Structural phase runs first, on purpose.** Its output (`StructuralDefinition[]`) becomes part of `HeuristicContext`, so heuristics can skip defined labels (D9 policy).

3. **Regex phase is ignorant of context.** Each rule is stateless. Uses the same semantics as Phase 0's `runRegexPhase`.

4. **Heuristic phase runs last.** Consumes both prior outputs. Applies role blacklist. Produces `Candidate[]` with confidence scores (<1.0).

5. **No dedup until the end.** The runner returns overlapping/duplicate candidates freely. Dedup happens only in `buildAllTargetsFromZip` (the final target materialization step). See RULES_GUIDE § 12.9 anti-pattern.

6. **Fail-loud at every step.** No try/catch. If a parser throws, the whole call throws.

7. **Language filtering is optional per-phase.** When `runAllPhases` is called with `{ language: "ko" }`, every phase filters out rules whose `languages` array excludes `"ko"` and does not include `"universal"`. When called without `{ language }`, all rules run (this matches Phase 0 legacy behavior and is how `detect-pii.ts` shim stays unchanged).

### 4.2 Strangler-fig API — new `detect-all.ts`

```
Legacy (Phase 0, unchanged):
  patterns.ts          (shim exporting PII_KINDS, PII_PATTERNS)
  detect-pii.ts        (shim exporting detectPii, detectPiiInZip, buildTargetsFromZip)
  detect-pii.characterization.test.ts  (Phase 0 ship gate)
  detect-pii.integration.test.ts       (legacy integration)
  detect-pii.test.ts                   (legacy behavioral)

NEW (Phase 1):
  detect-all.ts        (new API: detectAll, detectAllInZip, buildAllTargetsFromZip)
  detect-all.test.ts   (new behavioral tests)
  detect-all.integration.test.ts  (new integration, worst-case + synthetic fixtures)
```

The two APIs run independently. Legacy shim keeps working for the 422 legacy tests + 18 Phase 0 characterization tests. The new `detect-all.ts` is what engine.ts will call after migration.

### 4.3 `engine.ts` migration (Phase 1 final commit)

At the END of Phase 1, a single commit migrates `src/ui/engine.ts` from legacy to new API:

**Before (Phase 0 state):**
```typescript
import { buildTargetsFromZip } from "../detection/detect-pii.js";

export interface Analysis {
  entityGroups: EntityGroup[];
  piiCandidates: PiiCandidate[];
  stats: { /* ... */ };
}

export async function analyzeZip(bytes: Uint8Array, seeds: string[]): Promise<Analysis> {
  // uses buildTargetsFromZip
}
```

**After (Phase 1 state):**
```typescript
import { buildAllTargetsFromZip } from "../detection/detect-all.js";
// buildTargetsFromZip still importable but no longer called in production path

export interface Analysis {
  entityGroups: EntityGroup[];
  piiCandidates: PiiCandidate[];
  /** NEW: non-PII matches from Phase 1 rules (financial, temporal, entities, legal, structural, heuristics) */
  nonPiiCandidates: readonly NonPiiCandidate[];
  stats: { /* ... */ };
}

export interface NonPiiCandidate {
  readonly text: string;
  readonly ruleId: string;
  readonly category: "financial" | "temporal" | "entities" | "legal" | "structural" | "heuristics";
  readonly confidence: number;
}

export async function analyzeZip(bytes: Uint8Array, seeds: string[]): Promise<Analysis> {
  // uses buildAllTargetsFromZip; maps some results to entityGroups/piiCandidates
  // (for backward compat with existing UI), remainder to nonPiiCandidates
}
```

**Behavior contract of the migration:**
- `entityGroups` and `piiCandidates` continue to contain what they previously contained. Test cases that assert on these keep passing.
- `nonPiiCandidates` is a NEW field that the UI does not yet render (that's the UI redesign brief's job). But `defaultSelections(analysis)` DOES include them — so `applyRedaction` will redact them when the user clicks Apply.
- The `Set<string>` returned by `defaultSelections` now includes every entry from `nonPiiCandidates.text` as well.
- `engine.test.ts` gets one new test: `"analyzeZip populates nonPiiCandidates for financial matches in a contract"`. All existing tests continue to pass unchanged.

### 4.4 Three shape-decision summary

From the review findings:

| Decision | Chosen |
|---|---|
| 1.1 Parallel API | **A — Strangler-fig** (new detect-all.ts alongside legacy) |
| 1.2 DefinedTerm naming | **A — rename in framework to StructuralDefinition** (Phase 0 brief already fixed) |
| 1.3 UI migration scope | **D — Phase 1 is detection-only**, UI redesign in separate brief post-Phase-1 merge |
| 1.4E Error handling | **1 — Fail-loud** (no try/catch, exceptions bubble up) |
| ReDoS guard | Expand to parsers (100ms) + heuristics (100ms) |

---

## 5. File layout (exact tree you will create)

Create exactly these files. Do not create additional files. Do not rename files.

```
src/detection/
├── _framework/                               (from Phase 0)
│   ├── types.ts                              ← MODIFIED (§ 6 of this brief)
│   ├── types.test.ts                         ← MODIFIED (extended tests)
│   ├── language-detect.ts                    (from Phase 0, unchanged)
│   ├── language-detect.test.ts               (from Phase 0, unchanged)
│   ├── runner.ts                             ← MODIFIED (§ 7 of this brief)
│   ├── runner.test.ts                        ← MODIFIED (new tests appended)
│   ├── registry.ts                           ← MODIFIED (new exports)
│   └── redos-guard.test.ts                   ← MODIFIED (parser + heuristic fuzz)
│
├── rules/                                    (from Phase 0)
│   ├── identifiers.ts                        (from Phase 0, UNCHANGED)
│   ├── identifiers.test.ts                   (from Phase 0, UNCHANGED)
│   ├── luhn.ts                               (from Phase 0, UNCHANGED)
│   ├── luhn.test.ts                          (from Phase 0, UNCHANGED)
│   │
│   ├── financial.ts                          ← NEW (§ 9 of this brief)
│   ├── financial.test.ts                     ← NEW
│   │
│   ├── temporal.ts                           ← NEW (§ 10)
│   ├── temporal.test.ts                      ← NEW
│   │
│   ├── entities.ts                           ← NEW (§ 11)
│   ├── entities.test.ts                      ← NEW
│   │
│   ├── structural/                           ← NEW directory
│   │   ├── index.ts                          ← NEW (re-exports ALL_STRUCTURAL_PARSERS)
│   │   ├── definition-section.ts             ← NEW (§ 12.1)
│   │   ├── definition-section.test.ts        ← NEW
│   │   ├── signature-block.ts                ← NEW (§ 12.2)
│   │   ├── signature-block.test.ts           ← NEW
│   │   ├── party-declaration.ts              ← NEW (§ 12.3)
│   │   ├── party-declaration.test.ts         ← NEW
│   │   ├── recitals.ts                       ← NEW (§ 12.4)
│   │   ├── recitals.test.ts                  ← NEW
│   │   ├── header-block.ts                   ← NEW (§ 12.5)
│   │   └── header-block.test.ts              ← NEW
│   │
│   ├── legal.ts                              ← NEW (§ 13)
│   ├── legal.test.ts                         ← NEW
│   │
│   ├── heuristics/                           ← NEW directory
│   │   ├── index.ts                          ← NEW (re-exports ALL_HEURISTICS)
│   │   ├── capitalization-cluster.ts         ← NEW (§ 14.1)
│   │   ├── capitalization-cluster.test.ts    ← NEW
│   │   ├── quoted-term.ts                    ← NEW (§ 14.2)
│   │   ├── quoted-term.test.ts               ← NEW
│   │   ├── repeatability.ts                  ← NEW (§ 14.3)
│   │   ├── repeatability.test.ts             ← NEW
│   │   ├── email-domain-inference.ts         ← NEW (§ 14.4)
│   │   └── email-domain-inference.test.ts    ← NEW
│   │
│   ├── role-blacklist-ko.ts                  ← NEW (§ 14.5)
│   ├── role-blacklist-ko.test.ts             ← NEW
│   ├── role-blacklist-en.ts                  ← NEW (§ 14.6)
│   └── role-blacklist-en.test.ts             ← NEW
│
├── detect-all.ts                             ← NEW top-level (§ 8 of this brief)
├── detect-all.test.ts                        ← NEW
├── detect-all.integration.test.ts            ← NEW
│
├── patterns.ts                               (from Phase 0 shim — UNCHANGED)
├── patterns.test.ts                          (UNCHANGED)
├── detect-pii.ts                             (Phase 0 shim — UNCHANGED)
├── detect-pii.test.ts                        (UNCHANGED)
├── detect-pii.integration.test.ts            (UNCHANGED)
├── detect-pii.characterization.test.ts       (UNCHANGED — ship gate)
├── normalize.ts                              (UNCHANGED)
├── normalize.test.ts                         (UNCHANGED)
├── extract-text.ts                           (UNCHANGED)
├── extract-text.test.ts                      (UNCHANGED)
├── stop-phrases.ts                           (UNCHANGED)
├── stop-phrases.test.ts                      (UNCHANGED)
├── suggest-keywords.ts                       (UNCHANGED)
└── suggest-keywords.test.ts                  (UNCHANGED)

src/ui/
├── engine.ts                                 ← MODIFIED (Phase 1 final commit — § 8.3)
├── engine.test.ts                            ← MODIFIED (1 new test)
├── state.svelte.ts                           (UNCHANGED)
├── App.svelte                                (UNCHANGED)
├── Topbar.svelte                             (UNCHANGED)
├── Sidebar.svelte                            (UNCHANGED)
├── DocumentPreview.svelte                    (UNCHANGED)
├── CandidatesPanel.svelte                    (UNCHANGED)
├── styles.css                                (UNCHANGED)
├── main.ts                                   (UNCHANGED)
└── ship-gate.test.ts                         (UNCHANGED)
```

**Counts:**
- **New files**: 34 (22 rule/parser/heuristic files + 12 tests)
- **Modified files**: 6 (`_framework/types.ts`, `_framework/types.test.ts`, `_framework/runner.ts`, `_framework/runner.test.ts`, `_framework/registry.ts`, `_framework/redos-guard.test.ts`, `src/ui/engine.ts`, `src/ui/engine.test.ts`)
- Wait, that's 8 modified. Correction: 8 modified files. Ignore the earlier count.
- **Unchanged but critical**: every Phase 0 file (`identifiers.ts`, `luhn.ts`, their tests, and all 5 characterization/integration/behavioral legacy tests)

**Create directories first:**

```bash
mkdir -p src/detection/rules/structural src/detection/rules/heuristics
```

---

## 6. Type extensions in `_framework/types.ts`

**Phase 1 adds ZERO new exported types to `_framework/types.ts`.** Every type Phase 1 needs — `Level`, `Language`, `Category`, `PostFilter`, `RegexRule`, `StructuralDefinition`, `StructuralParser`, `Candidate`, `HeuristicContext`, `Heuristic` — was already defined by Phase 0. The authoritative source is `docs/phases/phase-0-framework-port.md` § 6, which ships the exact file content. Phase 1 does NOT re-export, re-name, or extend any of those symbols in `types.ts`.

This section is short on purpose: its only job is to enumerate what Phase 0 already delivered and guard against the "helpful cleanup" instinct. If you feel tempted to add a `RunOptions`, `DocumentLanguage`, `DetectAllResult`, `NonPiiCandidate`, or `Phase` type to `types.ts`, **stop** and re-read § 6.2.

### 6.1 What Phase 0 already delivered

After Phase 0 merges, `src/detection/_framework/types.ts` exports the following 10 symbols (exact names, exact shapes — if any of these is missing or renamed, Phase 0 regressed and you must fix Phase 0 before continuing Phase 1):

| Export | Kind | Phase 1 usage |
|---|---|---|
| `Level` | type alias | `"conservative" \| "standard" \| "paranoid"` — used by every new rule's `levels` field |
| `Language` | type alias | `"ko" \| "en" \| "universal"` — used by every new rule's `languages` field |
| `Category` | type alias | 7-way union — Phase 1 fills `"financial"`, `"temporal"`, `"entities"`, `"structural"`, `"heuristics"`, `"legal"` |
| `PostFilter` | type alias | `(normalizedMatch: string) => boolean` — reused by ~3 new regex rules (KRW range sanity check, percentage upper bound, Korean case number year range) |
| `RegexRule` | interface | the 36 new regex rules all satisfy this |
| `StructuralDefinition` | interface | the output type of every new structural parser |
| `StructuralParser` | interface | the 5 new structural parsers all satisfy this |
| `Candidate` | interface | emitted by the regex phase (confidence 1.0) and the heuristic phase (< 1.0) |
| `HeuristicContext` | interface | passed to every new heuristic's `detect()` — contains `structuralDefinitions`, `priorCandidates`, `documentLanguage` |
| `Heuristic` | interface | the 4 new heuristics all satisfy this |

Verify these exports exist before writing any Phase 1 code:

```bash
grep -E '^export (type|interface) (Level|Language|Category|PostFilter|RegexRule|StructuralDefinition|StructuralParser|Candidate|HeuristicContext|Heuristic)\b' src/detection/_framework/types.ts | wc -l
# Expected: 10
```

If the count is not 10, Phase 0 is incomplete — do NOT continue with Phase 1.

### 6.2 Why nothing new goes in `types.ts`

The review (see session-log-2026-04-11-v2.md finding 2.1) confirmed that `HeuristicContext` is the only cross-phase context type the framework needs:

- **Regex rules are stateless.** No context parameter. The runner handles normalization + exec loop; the rule is pure data (`RegExp` + metadata).
- **Structural parsers run first.** Nothing upstream to consume, so no context parameter. They receive only the normalized text.
- **Heuristics run last.** They consume structural definitions + prior regex candidates + document language, all of which live in `HeuristicContext`.

Adding more interfaces would inflate the framework's surface area without adding expressiveness. **Phase 1 extends the runner and adds concrete rule files, but it does NOT extend the type vocabulary.** The types listed below intentionally live elsewhere:

| Type | Lives in | Why not `types.ts` |
|---|---|---|
| `RunAllResult`, `RunAllOptions`, `PhaseOptions` | `_framework/runner.ts` | Runner orchestration concern, not rule-shape concern. Phase 1 adds these as part of § 7. |
| `DetectAllResult`, `DetectAllInZipResult`, `DetectAllOptions`, `ScopedCandidate`, `ScopedStructuralDefinition` | `detect-all.ts` | Top-level detection API surface, not framework primitives. Phase 1 adds these in § 8. |
| `NonPiiCandidate` | `src/ui/engine.ts` | Engine-level aggregated shape (has `count` and `scopes` fields the framework does not know about). Phase 1 adds this in § 8.3. |
| `"ko" \| "en" \| "mixed"` (the DOCUMENT language union, distinct from rule-declared `Language`) | inlined in `HeuristicContext.documentLanguage` and in `runner.ts` as a local helper type | Two different unions for two different purposes (rule declaration vs document detection); merging them loses the `"universal"` vs `"mixed"` distinction. Do NOT add a named alias. |
| `Phase` enum (`"structural" \| "regex" \| "heuristics"`) | DO NOT ADD | Runner has three functions with distinct return types. A phase enum would be dead code that opens the door to switch-on-phase dispatch logic — precisely the anti-pattern RULES_GUIDE § 3.4 rejected. |

### 6.3 What you WILL add to `types.test.ts`

`_framework/types.test.ts` gets a small extension: three new type-level assertions that verify the shapes Phase 1's runner extensions depend on. These are compile-time guards — if a future refactor accidentally loosens a type, the test fails at build time.

Append this `describe` block at the bottom of `src/detection/_framework/types.test.ts` (do NOT modify any Phase 0 test above it):

```typescript
import { describe, it, expect, expectTypeOf } from "vitest";

import type {
  Candidate,
  HeuristicContext,
  Language,
} from "./types.js";

describe("framework types — Phase 1 assertions", () => {
  it("HeuristicContext.documentLanguage is the detected-language union, not rule-language", () => {
    // detectLanguage returns "ko" | "en" | "mixed" — this must be the type of
    // HeuristicContext.documentLanguage. It is NOT `Language` ("ko" | "en" |
    // "universal") because "universal" is only valid as a rule declaration,
    // not as a detected document state.
    const ctx: HeuristicContext = {
      structuralDefinitions: [],
      priorCandidates: [],
      documentLanguage: "mixed",
    };
    expectTypeOf(ctx.documentLanguage).toEqualTypeOf<"ko" | "en" | "mixed">();
    // Compile-time rejection: "universal" must NOT be assignable.
    // @ts-expect-error — "universal" is not a valid documentLanguage value
    const bad: HeuristicContext["documentLanguage"] = "universal";
    void bad;
  });

  it("Language union is closed at three values", () => {
    // Typed exhaustiveness check. If someone adds "ja" or "zh" to Language
    // without updating the registry, this switch stops being exhaustive and
    // TypeScript fails at compile time.
    function narrow(l: Language): "ko" | "en" | "universal" {
      switch (l) {
        case "ko":
          return "ko";
        case "en":
          return "en";
        case "universal":
          return "universal";
      }
    }
    expect(narrow("ko")).toBe("ko");
    expect(narrow("en")).toBe("en");
    expect(narrow("universal")).toBe("universal");
  });

  it("Candidate is plain data (JSON round-trippable)", () => {
    // Guards against accidentally adding a method or getter to Candidate.
    // Candidate must remain JSON-serializable because engine.ts crosses the
    // UI state boundary (via Svelte $state) where proxies plus methods
    // misbehave in subtle ways.
    const c: Candidate = {
      text: "50,000,000원",
      ruleId: "financial.won-amount",
      confidence: 1.0,
    };
    const roundTripped = JSON.parse(JSON.stringify(c));
    expect(roundTripped).toEqual(c);
    expect(Object.keys(roundTripped).sort()).toEqual([
      "confidence",
      "ruleId",
      "text",
    ]);
  });
});
```

These three tests total ~50 lines. Every other test in `types.test.ts` is UNCHANGED.

### 6.4 Verification step

After appending the three tests, verify:

```bash
bun run test src/detection/_framework/types.test.ts
```

Expected: all Phase 0 type tests still pass + the 3 new tests pass. Then verify that `types.ts` itself is untouched relative to Phase 0:

```bash
git diff 187b7f8 -- src/detection/_framework/types.ts
# Expected: empty (no changes)
```

If `git diff` shows any change to `types.ts`, revert it. Phase 1 MUST NOT modify that file.

---

## 7. Runner extensions (`_framework/runner.ts`)

Phase 0 delivers `runRegexPhase` — a single function that normalizes, level-filters, runs the exec loop, recovers original bytes, and returns a flat `Candidate[]`. Phase 1 extends this file with three new phase functions and one top-level orchestrator, plus an optional language-filter hook on the existing `runRegexPhase`.

**The exact new file state is below. Copy it verbatim.** Phase 0's `runRegexPhase` body is preserved line-for-line; the only change is the signature extension to accept an optional 4th parameter and the addition of a private helper that operates on a pre-normalized `PositionMap`.

### 7.1 Top-of-file JSDoc (replace Phase 0's module comment)

Replace the Phase 0 top comment with this block. The ASCII diagram mirrors § 4.1 of this brief with no deviation — update both places if you ever change either.

```typescript
/**
 * Rule runner — Phase 1 implements all three phases.
 *
 * Pipeline:
 *
 *              ┌───────────────────────────────┐
 *  text ──────▶│  normalizeForMatching(text)   │
 *              │   returns { text, origOffsets }│
 *              └───────────┬───────────────────┘
 *                          │
 *                normalizedText + origOffsets
 *                          │
 *                          ▼
 *         ┌────────────────┴─────────────────┐
 *         │                                  │
 *         ▼                                  │
 *   ┌─────────────────┐                      │
 *   │   Phase 1:      │                      │
 *   │   Structural    │ ──▶ StructuralDefinition[]
 *   │   parsers run   │                      │
 *   │   first         │                      │
 *   └────────┬────────┘                      │
 *            │                                │
 *            │ context for heuristic phase    │
 *            ▼                                │
 *   ┌────────────────┐                        │
 *   │   Phase 2:     │ ◀──────────────────────┘
 *   │   Regex rules  │ ──▶ Candidate[] (confidence = 1.0)
 *   └────────┬───────┘
 *            │ prior candidates for heuristic context
 *            ▼
 *   ┌────────────────┐
 *   │   Phase 3:     │ ──▶ Candidate[] (confidence < 1.0)
 *   │   Heuristics   │
 *   │   run last     │
 *   └────────┬───────┘
 *            │
 *            ▼
 *       RunAllResult { candidates, structuralDefinitions, documentLanguage }
 *
 * Key properties:
 *
 *   1. Normalization runs ONCE per call. All three phases share the same
 *      PositionMap. Parsers and heuristics that need original-byte recovery
 *      use the shared offset map — never re-normalize.
 *
 *   2. Structural phase runs first on purpose. Its output becomes
 *      HeuristicContext.structuralDefinitions so phase 3 can skip D9-defined
 *      labels (e.g., "the Buyer" when "the Buyer" means "ABC Corporation").
 *
 *   3. Regex phase is stateless. Same semantics as Phase 0 (clone regex per
 *      rule, exec loop, postFilter, slice original bytes via origOffsets).
 *
 *   4. Heuristic phase runs last. Consumes structural definitions + prior
 *      regex candidates + document language. Applies role blacklist internally
 *      (each heuristic imports its own blacklist; the runner stays blacklist-
 *      agnostic).
 *
 *   5. No dedup at runner level. The runner returns overlapping/duplicate
 *      candidates freely. Dedup happens in `buildAllTargetsFromZip` per
 *      RULES_GUIDE § 12.9 "no early dedupe".
 *
 *   6. FAIL-LOUD at every step. No try/catch anywhere in this file. A
 *      throwing rule / parser / heuristic surfaces as a stack trace per
 *      design-v1 Lock-in #15 (zero-miss invariant). Callers that want
 *      best-effort semantics must wrap the call themselves — the runner
 *      NEVER swallows.
 *
 *   7. Language filter is optional per-call. When `opts.language` is
 *      undefined, every rule runs regardless of its `languages` field
 *      (Phase 0 backward compatibility — this is the code path legacy
 *      `detect-pii.ts` uses). When set to "ko" | "en" | "mixed", rules whose
 *      `languages` excludes the filter value AND does not include "universal"
 *      are skipped. Per RULES_GUIDE § 11.2, "mixed" passes through every
 *      rule (bilingual documents run both language tracks).
 *
 * See:
 *   - docs/RULES_GUIDE.md § 3.4 (three-shape rationale)
 *   - docs/RULES_GUIDE.md § 10.3 (level filter)
 *   - docs/RULES_GUIDE.md § 11.2 (language filter)
 *   - docs/phases/phase-1-rulebook.md § 4.1 (this diagram, authoritative copy)
 *   - docs/phases/phase-1-rulebook.md § 7 (this section, the exact spec)
 */
```

### 7.2 Module imports

Replace Phase 0's import block with:

```typescript
import { normalizeForMatching, type PositionMap } from "../normalize.js";

import { detectLanguage } from "./language-detect.js";
import {
  ALL_HEURISTICS,
  ALL_REGEX_RULES,
  ALL_STRUCTURAL_PARSERS,
} from "./registry.js";
import type {
  Candidate,
  Heuristic,
  HeuristicContext,
  Language,
  Level,
  RegexRule,
  StructuralDefinition,
  StructuralParser,
} from "./types.js";
```

**Note on the registry import:** `ALL_STRUCTURAL_PARSERS` and `ALL_HEURISTICS` do not exist in Phase 0's `registry.ts`. You MUST add them (initially as empty arrays) as part of the same commit that extends `runner.ts`. See § 7.9 for the exact diff on `registry.ts`. Without that extension, this import fails at module load.

### 7.3 Module-local option and helper types

Add these private (unexported) declarations right after the imports. They are not promoted to `types.ts` because they are runner-internal — see § 6.2 for why.

```typescript
/**
 * Options passed through every phase function. Kept minimal on purpose:
 * the runner orchestrates, it does not feature-config.
 *
 * NOT exported. Callers interact with the runner through `RunAllOptions`
 * (exported below), which is a superset of these fields.
 */
interface PhaseOptions {
  /**
   * Document language for rule filtering. When `undefined`, no filter is
   * applied (all rules run — Phase 0 backward compat). When set, rules whose
   * `languages` array does not include this value AND does not include
   * "universal" are skipped. When set to "mixed", every rule passes.
   *
   * The distinction between `Language` ("ko" | "en" | "universal") and this
   * field's type ("ko" | "en" | "mixed") is deliberate: "universal" is a
   * rule-declaration value meaning "applies to any document", while "mixed"
   * is a detection outcome meaning "document has both languages". They are
   * two different concepts in two different coordinate systems.
   */
  readonly language?: "ko" | "en" | "mixed";
}
```

### 7.4 Language filter helper

```typescript
/**
 * Returns true if a rule / parser / heuristic with the given `languages` field
 * should run under the (possibly undefined) document-language filter.
 *
 * Matches RULES_GUIDE § 11.2:
 *
 *   - filter undefined  → true (no filter active — Phase 0 backward compat)
 *   - filter "mixed"    → true (bilingual documents run every rule)
 *   - rule has "universal" in languages → true (applies everywhere)
 *   - else → rule.languages.includes(filter)
 *
 * Pure function, no state. Safe to call from any phase.
 */
function shouldRunForLanguage(
  ruleLanguages: readonly Language[],
  filter: "ko" | "en" | "mixed" | undefined,
): boolean {
  if (filter === undefined) return true;
  if (filter === "mixed") return true;
  if (ruleLanguages.includes("universal")) return true;
  // filter is "ko" | "en" here — safe to pass to includes()
  return ruleLanguages.includes(filter);
}
```

### 7.5 `runRegexPhase` — extended signature, Phase 0 body preserved

The public signature grows a fourth optional parameter. The body is unchanged structurally — the level filter gains an AND-clause for language, and the body is extracted into a private helper so `runAllPhases` can skip re-normalization.

```typescript
/**
 * Run every RegexRule that matches the given level (and optional language),
 * returning candidates with original-byte recovery via `normalizeForMatching`'s
 * offset map.
 *
 * Phase 0 contract preserved: calling without `opts` — i.e., the legacy
 * `runRegexPhase(text, level, rules)` three-arg form — applies level filter
 * only, matching the exact Phase 0 semantics byte-for-byte. This is the code
 * path that `detect-pii.ts` legacy shim uses, so its output MUST NOT change
 * as a result of Phase 1 extensions. The Phase 0 characterization tests
 * (T1–T18) verify this invariant.
 *
 * Does NOT deduplicate. Callers run dedup on the combined output of all phases
 * (see `buildAllTargetsFromZip` in detect-all.ts).
 */
export function runRegexPhase(
  text: string,
  level: Level,
  rules: readonly RegexRule[],
  opts: PhaseOptions = {},
): Candidate[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];
  return runRegexPhaseOnMap(text, map, level, rules, opts);
}

/**
 * Same as `runRegexPhase` but operates on a pre-computed PositionMap. Used by
 * `runAllPhases` to avoid re-normalizing the text between phases (normalize
 * is O(n) and non-trivial on 50KB-scale contract scopes). Not exported —
 * external callers should use `runRegexPhase`.
 */
function runRegexPhaseOnMap(
  originalText: string,
  map: PositionMap,
  level: Level,
  rules: readonly RegexRule[],
  opts: PhaseOptions,
): Candidate[] {
  // Compose level filter with language filter. When `opts.language` is
  // undefined, `shouldRunForLanguage` returns true for every rule — so this
  // reduces to Phase 0's `r.levels.includes(level)` expression exactly.
  const active = rules.filter(
    (r) =>
      r.levels.includes(level) &&
      shouldRunForLanguage(r.languages, opts.language),
  );

  const out: Candidate[] = [];

  for (const rule of active) {
    // Clone per rule to avoid lastIndex state pollution across calls and runs.
    // Cost is negligible (one compile per rule per scope) and the safety is
    // essential — see Phase 0 § 9 for the rationale.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(map.text)) !== null) {
      const normalized = m[0];
      if (rule.postFilter && !rule.postFilter(normalized)) continue;

      const startNorm = m.index;
      const endNorm = startNorm + normalized.length;
      // origOffsets has length map.text.length + 1 (sentinel), so endNorm
      // (which can equal map.text.length) is always in range.
      const startOrig = map.origOffsets[startNorm]!;
      const endOrig = map.origOffsets[endNorm]!;
      const original = originalText.slice(startOrig, endOrig);

      out.push({
        text: original,
        ruleId: rule.id,
        confidence: 1.0,
      });
    }
  }

  return out;
}
```

**Phase 0 preservation proof.** When `opts.language === undefined`, `shouldRunForLanguage(r.languages, undefined)` returns `true` unconditionally (first branch of the helper). The filter expression reduces to `r.levels.includes(level)` — the exact Phase 0 expression. The 18 characterization tests in `detect-pii.characterization.test.ts` continue to pass byte-for-byte after this change, because `detect-pii.ts`'s shim calls `runRegexPhase(text, "standard", IDENTIFIERS)` (three args, no opts).

### 7.6 `runStructuralPhase` — new

```typescript
/**
 * Run every StructuralParser in registry order, collecting their output into
 * a single flat `readonly StructuralDefinition[]`. Parser order matters for
 * downstream heuristics: later parsers can emit definitions that shadow
 * earlier ones. The runner does NOT apply shadow/merge semantics — it
 * concatenates in parser order and lets heuristics (or the UI) decide.
 *
 * Parsers receive the NORMALIZED text (same text the regex phase sees). If a
 * parser needs to recover original bytes for its `label` or `referent`, it
 * imports `normalizeForMatching` itself and re-runs it. Sharing the offset
 * map across phases would require passing a PositionMap parameter to every
 * parser signature — a bigger surface-area change than the one-line re-normal
 * each parser does once per call. (Normalize is idempotent and cheap on
 * already-normalized text.)
 *
 * STRUCTURAL PARSERS HAVE NO LEVEL FILTER. Structural parsing is either
 * useful or not; there is no "paranoid structural parsing". Only regex rules
 * and heuristics are tier-gated. See RULES_GUIDE § 10.2.
 *
 * FAIL-LOUD: a throwing parser bubbles up. The runner does NOT catch.
 */
export function runStructuralPhase(
  text: string,
  parsers: readonly StructuralParser[],
  opts: PhaseOptions = {},
): readonly StructuralDefinition[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];
  return runStructuralPhaseOnMap(map, parsers, opts);
}

/**
 * PositionMap-aware variant used by `runAllPhases` to avoid re-normalization.
 * Not exported.
 */
function runStructuralPhaseOnMap(
  map: PositionMap,
  parsers: readonly StructuralParser[],
  opts: PhaseOptions,
): readonly StructuralDefinition[] {
  const active = parsers.filter((p) =>
    shouldRunForLanguage(p.languages, opts.language),
  );

  const out: StructuralDefinition[] = [];

  for (const parser of active) {
    // FAIL-LOUD: no try/catch. A throwing parser bubbles up as a stack trace.
    const produced = parser.parse(map.text);
    for (const def of produced) {
      out.push(def);
    }
  }

  return out;
}
```

### 7.7 `runHeuristicPhase` — new

```typescript
/**
 * Run every Heuristic that matches the given level (and optional language),
 * threading the provided `HeuristicContext` (which bundles prior structural
 * definitions + prior regex candidates + document language) into each
 * `detect()` call. Returns a flat `Candidate[]` with confidence < 1.0, same
 * shape as the regex phase output.
 *
 * Heuristics are REQUIRED (per RULES_GUIDE § 6.2) to:
 *
 *   1. Consume `context.structuralDefinitions` — skip labels that are already
 *      defined as a structural "the Buyer → ABC Corporation" binding (D9
 *      invariant).
 *   2. Consume `context.priorCandidates` — avoid double-emitting candidates
 *      already found by a higher-confidence regex rule.
 *   3. Consult a role blacklist (imported as a module constant by each
 *      heuristic individually — NOT threaded through this runner).
 *   4. Apply internal confidence calibration (typically 0.5–0.9).
 *
 * The runner does NOT enforce these. Each heuristic's own tests do — see
 * § 14 of this brief for the heuristic-level test spec.
 *
 * FAIL-LOUD: a throwing heuristic bubbles up. A heuristic that wants to
 * gracefully skip on malformed input MUST return an empty array explicitly.
 *
 * Original-byte recovery is the HEURISTIC's responsibility, not the runner's.
 * Unlike the regex phase (where every candidate corresponds to a single
 * `RegExp.exec` match and byte recovery is mechanical), heuristic spans can
 * come from joins, frequency counts, or context windows — there is no
 * universal recovery rule. Each heuristic in § 14 imports a shared helper
 * `recoverOriginalSlice(originalText, map, startNorm, endNorm)` from
 * `_framework/recover-bytes.ts` (which Phase 1 adds as a 6-line utility in
 * the § 14 TDD step). The runner does not call this helper itself.
 */
export function runHeuristicPhase(
  text: string,
  level: Level,
  heuristics: readonly Heuristic[],
  context: HeuristicContext,
  opts: PhaseOptions = {},
): Candidate[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];
  return runHeuristicPhaseOnMap(map, level, heuristics, context, opts);
}

/**
 * PositionMap-aware variant used by `runAllPhases` to avoid re-normalization.
 * Not exported.
 */
function runHeuristicPhaseOnMap(
  map: PositionMap,
  level: Level,
  heuristics: readonly Heuristic[],
  context: HeuristicContext,
  opts: PhaseOptions,
): Candidate[] {
  const active = heuristics.filter(
    (h) =>
      h.levels.includes(level) &&
      shouldRunForLanguage(h.languages, opts.language),
  );

  const out: Candidate[] = [];

  for (const heur of active) {
    // FAIL-LOUD: no try/catch.
    const produced = heur.detect(map.text, context);
    for (const cand of produced) {
      out.push(cand);
    }
  }

  return out;
}
```

### 7.8 `runAllPhases` — top-level orchestrator

```typescript
/**
 * Result of a full three-phase detection run on a single text blob.
 *
 * Shape notes:
 *
 *   - `candidates` contains the UNION of phase-2 (regex) and phase-3
 *     (heuristic) outputs in phase order: regex first, then heuristics. No
 *     dedup. Dedup is the caller's responsibility (see
 *     `buildAllTargetsFromZip` in detect-all.ts).
 *
 *   - `structuralDefinitions` is the phase-1 output, exposed as a side
 *     channel for callers (such as engine.ts) that want to render the
 *     structural tree in the UI without re-running phase 1.
 *
 *   - `documentLanguage` is the detected language at the time of this call.
 *     Callers that want to override detection pass `opts.language` below.
 */
export interface RunAllResult {
  readonly candidates: readonly Candidate[];
  readonly structuralDefinitions: readonly StructuralDefinition[];
  readonly documentLanguage: "ko" | "en" | "mixed";
}

/**
 * Options for `runAllPhases`. `level` is required; everything else is
 * optional.
 *
 *   - `level` (required): which tier to run — "conservative" | "standard" |
 *     "paranoid". Passed to regex + heuristic phases. Structural parsers are
 *     not level-filtered.
 *
 *   - `language`: override the auto-detected document language. Omit to let
 *     the runner call `detectLanguage` on the input.
 *
 *   - `rules`, `parsers`, `heuristics`: override the default registry imports.
 *     Omit to use `ALL_REGEX_RULES`, `ALL_STRUCTURAL_PARSERS`, `ALL_HEURISTICS`
 *     from registry.ts. Tests that want to isolate one rule/parser/heuristic
 *     from the rest of the registry pass explicit arrays here.
 */
export interface RunAllOptions {
  readonly level: Level;
  readonly language?: "ko" | "en" | "mixed";
  readonly rules?: readonly RegexRule[];
  readonly parsers?: readonly StructuralParser[];
  readonly heuristics?: readonly Heuristic[];
}

/**
 * Run all three phases in order on a single text blob.
 *
 *   1. Normalize ONCE. All three phases share the resulting PositionMap.
 *   2. Detect document language (or use the `opts.language` override).
 *   3. Run structural parsers → StructuralDefinition[].
 *   4. Run regex rules → Candidate[] with confidence 1.0.
 *   5. Build HeuristicContext from phases 1 + 2 + document language.
 *   6. Run heuristics → Candidate[] with confidence < 1.0.
 *   7. Return { candidates: [...regex, ...heur], structuralDefinitions,
 *      documentLanguage }.
 *
 * FAIL-LOUD: if any phase throws, the whole call throws with a stack trace.
 * There is no partial-result fallback.
 *
 * Empty-input semantics: empty or whitespace-that-normalizes-to-empty text
 * returns empty arrays with `documentLanguage: "en"` (matches
 * `detectLanguage`'s empty-input default).
 */
export function runAllPhases(text: string, opts: RunAllOptions): RunAllResult {
  if (text.length === 0) {
    return {
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    };
  }
  const map = normalizeForMatching(text);
  if (map.text.length === 0) {
    return {
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    };
  }

  // Resolve registry defaults. The top-of-file registry import pulls these in
  // at module load so the registry verification runs at import time.
  const rules = opts.rules ?? ALL_REGEX_RULES;
  const parsers = opts.parsers ?? ALL_STRUCTURAL_PARSERS;
  const heuristics = opts.heuristics ?? ALL_HEURISTICS;

  // Language detection (or override).
  const documentLanguage: "ko" | "en" | "mixed" =
    opts.language ?? detectLanguage(map.text);

  const phaseOpts: PhaseOptions = { language: documentLanguage };

  // Phase 1: structural parsing. No level filter.
  const structuralDefinitions = runStructuralPhaseOnMap(
    map,
    parsers,
    phaseOpts,
  );

  // Phase 2: regex rules. Level + language filter.
  const regexCandidates = runRegexPhaseOnMap(
    text,
    map,
    opts.level,
    rules,
    phaseOpts,
  );

  // Phase 3: heuristics. Level + language filter. Consumes phases 1 + 2.
  const context: HeuristicContext = {
    structuralDefinitions,
    priorCandidates: regexCandidates,
    documentLanguage,
  };
  const heuristicCandidates = runHeuristicPhaseOnMap(
    map,
    opts.level,
    heuristics,
    context,
    phaseOpts,
  );

  return {
    candidates: [...regexCandidates, ...heuristicCandidates],
    structuralDefinitions,
    documentLanguage,
  };
}
```

### 7.9 `registry.ts` extension (same commit)

The `import { ALL_STRUCTURAL_PARSERS, ALL_HEURISTICS } from "./registry.js"` at the top of `runner.ts` requires those exports to exist. Add them to `src/detection/_framework/registry.ts` in the same commit as the runner extension.

**Diff on `registry.ts`:**

```typescript
// Before (Phase 0 state):
import { IDENTIFIERS } from "../rules/identifiers.js";
import type { RegexRule } from "./types.js";

export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
] as const;

// After (Phase 1 runner-extension commit):
import { IDENTIFIERS } from "../rules/identifiers.js";
// NOTE: structural/heuristics subdirectories do not yet contain parser/
// heuristic implementations at the time this diff lands. Their index.ts files
// export empty arrays. § 12 and § 14 of this brief populate them across
// subsequent TDD steps.
import { ALL_STRUCTURAL_PARSERS as _STRUCTURAL } from "../rules/structural/index.js";
import { ALL_HEURISTICS as _HEURISTICS } from "../rules/heuristics/index.js";
import type {
  Heuristic,
  RegexRule,
  StructuralParser,
} from "./types.js";

export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  // Phase 1 follow-up commits append:
  //   ...FINANCIAL (§ 9)
  //   ...TEMPORAL  (§ 10)
  //   ...ENTITIES  (§ 11)
  //   ...LEGAL     (§ 13)
] as const;

export const ALL_STRUCTURAL_PARSERS: readonly StructuralParser[] = _STRUCTURAL;

export const ALL_HEURISTICS: readonly Heuristic[] = _HEURISTICS;
```

**Scaffolding the subdirectory `index.ts` files.** In the same commit, create two tiny stub files that export empty arrays:

```typescript
// src/detection/rules/structural/index.ts — initial state (populated in § 12)
import type { StructuralParser } from "../../_framework/types.js";

export const ALL_STRUCTURAL_PARSERS: readonly StructuralParser[] = [] as const;
```

```typescript
// src/detection/rules/heuristics/index.ts — initial state (populated in § 14)
import type { Heuristic } from "../../_framework/types.js";

export const ALL_HEURISTICS: readonly Heuristic[] = [] as const;
```

The empty-array scaffolding lets `runner.ts` import the registry without waiting for § 12 / § 14 work. The runner test suite (§ 7.11) uses mock parsers/heuristics passed via `opts`, so it does NOT depend on the registry being populated.

**Verify registry still load-time checks.** The Phase 0 `verifyRegistry()` function only iterates `ALL_REGEX_RULES` to check `g` flag, unique ids, etc. Phase 1 leaves that function unchanged. A later hygiene phase may add parser/heuristic verification; for Phase 1, the per-parser and per-heuristic tests catch malformed entries individually.

### 7.10 Complete extended runner.ts (assembly order)

The final file layout for `src/detection/_framework/runner.ts` is:

1. Top-of-file JSDoc block (§ 7.1)
2. Module imports (§ 7.2)
3. `PhaseOptions` interface (§ 7.3)
4. `shouldRunForLanguage` helper (§ 7.4)
5. `runRegexPhase` public + `runRegexPhaseOnMap` private (§ 7.5)
6. `runStructuralPhase` public + `runStructuralPhaseOnMap` private (§ 7.6)
7. `runHeuristicPhase` public + `runHeuristicPhaseOnMap` private (§ 7.7)
8. `RunAllResult` interface (§ 7.8)
9. `RunAllOptions` interface (§ 7.8)
10. `runAllPhases` public (§ 7.8)

Total lines including JSDoc: approximately 320. The Phase 0 baseline was approximately 70 lines. Phase 1 adds approximately 250 lines to this file.

### 7.11 Runner test additions (`runner.test.ts`)

Append the following `describe` groups to `src/detection/_framework/runner.test.ts`. Phase 0's existing tests (approximately 15 tests across 2 describe blocks) are UNTOUCHED.

**Test group A — `runRegexPhase` language filter (12 tests):**

| # | Assertion |
|---|---|
| A1 | `runRegexPhase(text, "standard", rules)` three-arg form (no opts) runs every rule regardless of language (Phase 0 compat proof) |
| A2 | `{ language: "ko" }` skips rules whose languages is `["en"]` |
| A3 | `{ language: "ko" }` includes rules whose languages is `["universal"]` |
| A4 | `{ language: "ko" }` includes rules whose languages is `["ko"]` |
| A5 | `{ language: "en" }` skips `["ko"]`-only rules |
| A6 | `{ language: "en" }` includes `["universal"]`-only rules |
| A7 | `{ language: "mixed" }` runs every rule regardless of language |
| A8 | `{ language: undefined }` explicit behaves identical to omitted opts |
| A9 | A rule with `languages: ["ko", "en"]` runs under both `"ko"` and `"en"` filters |
| A10 | Level filter and language filter compose with AND (rule must pass BOTH) |
| A11 | Empty `rules` array returns `[]` regardless of filters |
| A12 | Phase 0 compat: the 8 `IDENTIFIERS` rules all fire on a Phase 0 smoke input when called via the three-arg form |

**Test group B — `runStructuralPhase` (10 tests):**

| # | Assertion |
|---|---|
| B1 | Empty `parsers` array returns empty `readonly StructuralDefinition[]` |
| B2 | Single parser emitting 3 definitions passes them through unchanged |
| B3 | Two parsers' output concatenated in parser-array order |
| B4 | Language filter `"ko"` skips English-only parser |
| B5 | Language filter `"en"` skips Korean-only parser |
| B6 | Parser with `languages: ["universal"]` runs under any filter |
| B7 | Language filter `"mixed"` runs every parser |
| B8 | Parser that throws bubbles up (fail-loud) — `expect(() => runStructuralPhase(...)).toThrow()` |
| B9 | Parser receives NORMALIZED text (use fullwidth input that `normalizeForMatching` folds) |
| B10 | Empty input text returns `[]` without calling any parser |

**Test group C — `runHeuristicPhase` (12 tests):**

| # | Assertion |
|---|---|
| C1 | Empty `heuristics` array returns `[]` |
| C2 | Single heuristic's output passes through unchanged |
| C3 | `context.structuralDefinitions` reachable from inside the heuristic (mock heuristic returns `ctx.structuralDefinitions.length` encoded in candidate.text) |
| C4 | `context.priorCandidates` reachable likewise |
| C5 | `context.documentLanguage` reachable likewise |
| C6 | Level filter applied (heuristic with `levels: ["paranoid"]` does NOT run at `"standard"`) |
| C7 | Language filter applied |
| C8 | A throwing heuristic bubbles up |
| C9 | Two heuristics' output concatenated in heuristic-array order |
| C10 | Heuristic confidence values preserved in output (0.75, 0.6, etc. — no rounding) |
| C11 | Empty input text returns `[]` without calling any heuristic |
| C12 | Heuristic returning `[]` is valid (empty-output is not an error) |

**Test group D — `runAllPhases` integration (9 tests):**

| # | Assertion |
|---|---|
| D1 | Empty text → `{ candidates: [], structuralDefinitions: [], documentLanguage: "en" }` |
| D2 | Text with only regex matches → `candidates` has those; `structuralDefinitions` empty |
| D3 | Text with only structural matches → `structuralDefinitions` populated; `candidates` empty |
| D4 | Text exercising all three phases → union of regex + heur in `candidates`; structural side-channel populated |
| D5 | Regex candidates appear BEFORE heuristic candidates in `candidates` (phase order assertion) |
| D6 | `detectLanguage` is called when `opts.language` is undefined; explicit `opts.language` overrides when set (test with an English text forced to `"ko"` and assert Korean-only rules fire) |
| D7 | `HeuristicContext` passed to phase 3 contains the EXACT arrays from phases 1 and 2 (identity check via a mock heuristic that captures the context reference) |
| D8 | Fail-loud propagation — a mock parser set to throw causes the whole `runAllPhases` call to throw |
| D9 | `opts.rules`, `opts.parsers`, `opts.heuristics` override registry defaults (assert by passing empty arrays and observing empty output) |

**Test group E — perf smoke (1 optional test):**

| # | Assertion |
|---|---|
| E1 | `runAllPhases` on a 100KB pathological input returns within 1000ms (soft budget; overlaps with `redos-guard.test.ts` but catches full-pipeline regressions) |

**Total new tests in `runner.test.ts`:** 44 tests (12 + 10 + 12 + 9 + 1). Phase 0 baseline was ~15 tests in this file, so post-Phase-1 count is ~59.

### 7.12 Acceptance checklist for the runner extension

Before committing the runner extension, verify every item:

- [ ] `runner.ts` exports exactly: `runRegexPhase`, `runStructuralPhase`, `runHeuristicPhase`, `runAllPhases`, `RunAllResult`, `RunAllOptions` (6 public exports)
- [ ] `PhaseOptions` interface is NOT exported (it is module-local)
- [ ] `shouldRunForLanguage` helper is NOT exported
- [ ] `runRegexPhaseOnMap`, `runStructuralPhaseOnMap`, `runHeuristicPhaseOnMap` are NOT exported (module-local helpers)
- [ ] `runRegexPhase` signature accepts optional 4th parameter `opts: PhaseOptions`
- [ ] `runRegexPhase(text, level, rules)` three-arg form still compiles and behaves identically to Phase 0
- [ ] Phase 0 characterization tests still pass byte-for-byte (`bun run test src/detection/detect-pii.characterization.test.ts`)
- [ ] Phase 0 runner tests still pass (`bun run test src/detection/_framework/runner.test.ts` — original describe blocks)
- [ ] 44 new runner tests pass
- [ ] `types.ts` has zero new exports relative to commit `187b7f8` (`git diff 187b7f8 -- src/detection/_framework/types.ts` is empty)
- [ ] `registry.ts` exports `ALL_STRUCTURAL_PARSERS` and `ALL_HEURISTICS` (may initially be empty arrays, populated in § 12 and § 14)
- [ ] `src/detection/rules/structural/index.ts` and `src/detection/rules/heuristics/index.ts` exist with empty-array scaffolding
- [ ] No `try` keyword appears in `runner.ts` (`grep -n '\btry\b' src/detection/_framework/runner.ts` returns nothing)
- [ ] The ASCII diagram in the top-of-file comment matches § 4.1 of this brief
- [ ] `shouldRunForLanguage` behavior matches RULES_GUIDE § 11.2 (verified by tests A2–A9)
- [ ] Normalize-once invariant holds: only `runAllPhases` and the three public entry points call `normalizeForMatching` — the three internal `...OnMap` helpers never do (`grep -c normalizeForMatching src/detection/_framework/runner.ts` returns 4: one import + three public-wrapper call sites)

---

## 8. `detect-all.ts` — new top-level pipeline

`src/detection/detect-all.ts` is the new top-level detection API. It mirrors the shape of legacy `detect-pii.ts` — three functions: pure-text, zip-walker, target-builder — but delegates to `runAllPhases` underneath. Legacy `detect-pii.ts` stays untouched. This is the strangler-fig parallel the review locked in as decision 1.1A.

### 8.1 Public surface (exact exports)

`src/detection/detect-all.ts` exports exactly the following, in this order:

```typescript
// Interfaces
export interface DetectAllResult { ... }
export interface ScopedCandidate { ... }
export interface ScopedStructuralDefinition { ... }
export interface DetectAllInZipResult { ... }
export interface DetectAllOptions { ... }

// Functions
export function detectAll(text: string, opts?: DetectAllOptions): DetectAllResult;
export function detectAllInZip(zip: JSZip, opts?: DetectAllOptions): Promise<DetectAllInZipResult>;
export function buildAllTargetsFromZip(zip: JSZip, opts?: DetectAllOptions): Promise<readonly string[]>;
```

**Nothing else.** In particular, `NonPiiCandidate` (the UI-level aggregated shape) is NOT exported from here — it lives in `src/ui/engine.ts` because it has `count` and `scopes` fields that the framework does not produce. See § 8.3 for the engine migration contract.

### 8.2 Complete file content

Put this EXACTLY into `src/detection/detect-all.ts`:

```typescript
/**
 * Top-level detection API — Phase 1 replacement for `detect-pii.ts`.
 *
 * Three public entry points mirroring the legacy `detect-pii` shape:
 *
 *   1. `detectAll(text, opts?)` — pure function, takes plain text, runs all
 *      three phases (structural → regex → heuristic) via `runAllPhases`, and
 *      returns the combined candidates + structural side-channel + detected
 *      document language.
 *
 *   2. `detectAllInZip(zip, opts?)` — async, walks every text-bearing scope
 *      via `extractTextFromZip`, runs `detectAll` on each, and returns the
 *      candidates + structural definitions with their source scope attached.
 *
 *   3. `buildAllTargetsFromZip(zip, opts?)` — async, returns a deduped,
 *      longest-first sorted array of literal strings ready to feed into
 *      `redactDocx({ targets })`. Mirrors legacy `buildTargetsFromZip` from
 *      `detect-pii.ts` so the engine.ts migration is a one-line swap.
 *
 * STRANGLER-FIG NOTE: this file runs IN PARALLEL with `detect-pii.ts`. The
 * legacy shim is untouched. The only caller that migrates to detect-all is
 * `src/ui/engine.ts`, in the final commit of Phase 1. Every other caller
 * (including all Phase 0 characterization tests) continues to use detect-pii.
 * This preserves the Phase 0 ship gate byte-for-byte.
 *
 * FAIL-LOUD: no try/catch anywhere in this file. A throwing rule, parser, or
 * heuristic bubbles up as a stack trace. See phase-1-rulebook.md § 3
 * invariant 16 for rationale.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 8 (this spec, authoritative)
 *   - src/detection/_framework/runner.ts (`runAllPhases`, the core)
 *   - docs/RULES_GUIDE.md § 9 (dedup semantics)
 *   - docs/RULES_GUIDE.md § 11 (language handling)
 */

import type JSZip from "jszip";

import { extractTextFromZip } from "./extract-text.js";
import { runAllPhases } from "./_framework/runner.js";
import type {
  Candidate,
  Level,
  StructuralDefinition,
} from "./_framework/types.js";
import type { Scope } from "../docx/types.js";

/** Result of one `detectAll` call on a single text blob. */
export interface DetectAllResult {
  readonly candidates: readonly Candidate[];
  readonly structuralDefinitions: readonly StructuralDefinition[];
  readonly documentLanguage: "ko" | "en" | "mixed";
}

/** A Candidate annotated with the scope it was found in. */
export interface ScopedCandidate {
  readonly scope: Scope;
  readonly candidate: Candidate;
}

/** A StructuralDefinition annotated with the scope it was found in. */
export interface ScopedStructuralDefinition {
  readonly scope: Scope;
  readonly definition: StructuralDefinition;
}

/** Result of one `detectAllInZip` call. Both arrays preserve walk order. */
export interface DetectAllInZipResult {
  readonly candidates: readonly ScopedCandidate[];
  readonly structuralDefinitions: readonly ScopedStructuralDefinition[];
}

/**
 * Detection options shared by all three public entry points. Every field is
 * optional; passing `{}` (or omitting opts entirely) yields Phase 0-compatible
 * defaults (level `"standard"`, no language override).
 */
export interface DetectAllOptions {
  /**
   * Which tier to run. Defaults to `"standard"` to match v1.0 / Phase 0
   * legacy behavior. Tests that exercise tier filtering pass `"conservative"`
   * or `"paranoid"` explicitly. Propagated to the regex + heuristic phases;
   * structural parsers are not level-filtered.
   */
  readonly level?: Level;
  /**
   * Override auto-detected document language. When undefined, the runner
   * calls `detectLanguage(normalizedText)` internally. Callers that KNOW the
   * language (e.g., a UI panel scoped to a single Korean document) can pass
   * `"ko"` to skip detection.
   */
  readonly language?: "ko" | "en" | "mixed";
}

/** Default level when `opts.level` is omitted. Matches Phase 0 behavior. */
const DEFAULT_LEVEL: Level = "standard";

/**
 * Run all three detection phases on a single text blob. Pure function.
 *
 * Output ordering:
 *   - `candidates`: regex-phase candidates first (phase-2 order), then
 *     heuristic-phase candidates (phase-3 order). No dedup at this stage.
 *   - `structuralDefinitions`: parser order from `ALL_STRUCTURAL_PARSERS`.
 *   - `documentLanguage`: detected or override.
 *
 * Empty input returns empty arrays and language `"en"` (matches
 * `runAllPhases` empty-input semantics).
 */
export function detectAll(
  text: string,
  opts: DetectAllOptions = {},
): DetectAllResult {
  // Forward to runAllPhases with registry defaults. We do NOT expose
  // rules/parsers/heuristics overrides here — `runAllPhases` does, and tests
  // that need isolation should call it directly instead of going through
  // detect-all.ts.
  //
  // The `language` conditional spread pattern is required because
  // `verbatimModuleSyntax` + exactOptionalPropertyTypes won't let us pass
  // `language: undefined` through as a distinct value from "absent".
  const runOpts: {
    level: Level;
    language?: "ko" | "en" | "mixed";
  } = {
    level: opts.level ?? DEFAULT_LEVEL,
    ...(opts.language !== undefined ? { language: opts.language } : {}),
  };
  const { candidates, structuralDefinitions, documentLanguage } =
    runAllPhases(text, runOpts);
  return { candidates, structuralDefinitions, documentLanguage };
}

/**
 * Walk every text-bearing scope in `zip`, run `detectAll` on each, and
 * return the candidates + structural definitions with their source scope
 * attached.
 *
 * Scope iteration order matches `extractTextFromZip` (body → footnotes →
 * endnotes → comments → headers → footers) per the canonical scope walker.
 * Within a scope, candidates and structural definitions appear in the order
 * `detectAll` returned them (phase-2 regex before phase-3 heuristic for
 * candidates; parser order for structural definitions).
 *
 * Language detection runs PER SCOPE, not per document. A bilingual contract
 * whose footnotes are English-only runs the English rule set on the footnote
 * scope even if the body scope is classified Korean. This matches the
 * RULES_GUIDE § 11.1 "detect once per input" rule, where "input" is a
 * single text blob passed to `detectAll`.
 */
export async function detectAllInZip(
  zip: JSZip,
  opts: DetectAllOptions = {},
): Promise<DetectAllInZipResult> {
  const scoped = await extractTextFromZip(zip);

  const candidates: ScopedCandidate[] = [];
  const structuralDefinitions: ScopedStructuralDefinition[] = [];

  for (const { scope, text } of scoped) {
    const result = detectAll(text, opts);
    for (const candidate of result.candidates) {
      candidates.push({ scope, candidate });
    }
    for (const definition of result.structuralDefinitions) {
      structuralDefinitions.push({ scope, definition });
    }
  }

  return { candidates, structuralDefinitions };
}

/**
 * Top-level target builder: deduped, longest-first sorted array of literal
 * strings ready to feed into `redactDocx({ targets })`.
 *
 * Mirrors the legacy `buildTargetsFromZip` semantics:
 *
 *   - Dedup via Set on candidate.text (original unnormalized bytes — Lane B
 *     scans XML for literal bytes, so normalized-form dedup would cause
 *     silent leaks).
 *
 *   - Longest-first sort so the redactor's `findRedactionMatches` contract
 *     holds: when two targets are both prefixes of the input, the longer
 *     wins.
 *
 *   - Structural definitions DO contribute to the target list via their
 *     `referent` field, NOT their `label`. The label is the generic noun
 *     ("the Buyer" / "매수인") that we deliberately DO NOT redact per D9.
 *     The referent is the real entity ("ABC Corporation" / "사과회사") that
 *     we do. A future UI may offer a per-label toggle; for now, labels are
 *     filtered out at the builder level.
 *
 *   - Heuristic candidates with confidence < 1.0 ARE included in the target
 *     list by default. The caller (engine.ts) decides whether to filter by
 *     confidence before presenting to the user. See § 8.3 for the engine
 *     contract — engine.ts partitions results into high-confidence (auto-
 *     select) and low-confidence (suggest-only) based on the 0.8 threshold.
 */
export async function buildAllTargetsFromZip(
  zip: JSZip,
  opts: DetectAllOptions = {},
): Promise<readonly string[]> {
  const { candidates, structuralDefinitions } = await detectAllInZip(zip, opts);

  const set = new Set<string>();
  for (const { candidate } of candidates) {
    set.add(candidate.text);
  }
  for (const { definition } of structuralDefinitions) {
    // Only the referent contributes — the label is NOT redacted (D9).
    // Skip empty referents (some parsers emit label-only definitions when
    // they find a defined-term declaration without a resolved referent).
    if (definition.referent.length > 0) {
      set.add(definition.referent);
    }
  }

  // Longest-first sort matches legacy `buildTargetsFromZip` so the redactor's
  // greedy-alternation semantics stay the same across both pipelines.
  return [...set].sort((a, b) => b.length - a.length);
}
```

**File length:** approximately 200 lines including JSDoc. Matches the § 8 target of ~400 lines once the acceptance-test specs (§ 8.6–§ 8.7 below) are counted separately.

### 8.3 `engine.ts` `Analysis` shape extension contract

The final TDD step of Phase 1 (see § 16) migrates `src/ui/engine.ts` from legacy `detect-pii` to `detect-all`. The migration is fully specified here so that step is mechanical.

**Before (Phase 0 state, `src/ui/engine.ts`):**

```typescript
import { detectPiiInZip, type DetectedMatch } from "../detection/detect-pii.js";

export interface PiiCandidate {
  readonly text: string;
  readonly kind: DetectedMatch["kind"];
  readonly count: number;
  readonly scopes: ReadonlyArray<Scope>;
}

export interface Analysis {
  readonly entityGroups: ReadonlyArray<VariantGroup>;
  readonly piiCandidates: ReadonlyArray<PiiCandidate>;
  readonly fileStats: FileStats;
}
```

**After (Phase 1 final commit):**

```typescript
import {
  detectAllInZip,
  type ScopedCandidate,
  type ScopedStructuralDefinition,
} from "../detection/detect-all.js";
// Legacy import retained as type-only so that the `PiiCandidate.kind` field
// (which is still `DetectedMatch["kind"]`) continues to compile. The value
// `detectPiiInZip` is no longer called in the production code path — engine
// now goes through detect-all. Tests that directly compare against detect-pii
// still import it from its own module.
import type { DetectedMatch } from "../detection/detect-pii.js";

/** PII candidate — preserved shape so UI / tests / state.svelte.ts keep compiling. */
export interface PiiCandidate {
  readonly text: string;
  readonly kind: DetectedMatch["kind"];
  readonly count: number;
  readonly scopes: ReadonlyArray<Scope>;
}

/**
 * NEW: non-PII candidate from the Phase 1 rulebook (financial, temporal,
 * entities, structural, legal, heuristics). Emitted alongside piiCandidates
 * so the UI can render a richer redaction suggestion tree.
 *
 * `category` is derived from the dotted `ruleId` prefix (e.g.
 * `"financial.won-amount"` → `"financial"`). `confidence` is pass-through
 * from the underlying `Candidate` — 1.0 for regex candidates, < 1.0 for
 * heuristic candidates.
 *
 * The UI redesign brief (see session-log-2026-04-11-v2.md finding 1.3) will
 * group these by category and offer per-group add/remove affordances. Until
 * then, `CandidatesPanel.svelte` does not render `nonPiiCandidates`, but
 * `defaultSelections(analysis)` DOES include their text in the returned
 * `Set<string>` — so applying redaction DOES scrub them even in the
 * pre-redesign UI.
 */
export interface NonPiiCandidate {
  readonly text: string;
  readonly ruleId: string;
  readonly category:
    | "financial"
    | "temporal"
    | "entities"
    | "structural"
    | "legal"
    | "heuristics";
  readonly confidence: number;
  readonly count: number;
  readonly scopes: ReadonlyArray<Scope>;
}

export interface Analysis {
  readonly entityGroups: ReadonlyArray<VariantGroup>;
  readonly piiCandidates: ReadonlyArray<PiiCandidate>;
  /**
   * NEW: Phase 1 rulebook output. Ordered longest-first by text length so
   * the panel's default scan order matches the redactor's greedy alternation.
   */
  readonly nonPiiCandidates: ReadonlyArray<NonPiiCandidate>;
  readonly fileStats: FileStats;
}
```

### 8.4 Migration rules for `engine.ts`

The `aggregatePii` helper at `src/ui/engine.ts:178-205` is replaced by a single `aggregateAll` helper that:

1. Calls `detectAllInZip(zip)` ONCE per `analyzeZip` call (not `detectPiiInZip`). Note the call is `await detectAllInZip(zip)` with default options — level `"standard"`, auto-detect language.

2. Partitions the resulting `candidates` array by `ruleId` prefix:
   - `ruleId.startsWith("identifiers.")` → route to `piiCandidates` (kind-mapped via inverse of the `KIND_TO_SUBCATEGORY` table from `src/detection/patterns.ts`; see § 8.1 of the Phase 0 brief for the forward mapping).
   - Everything else → route to `nonPiiCandidates`, keeping the raw `ruleId` and deriving `category` from `ruleId.split(".")[0]`.

3. Within each partition, dedupe by `text` and count occurrences per scope. Dedup semantics match Phase 0 `aggregatePii`: Map keyed on `candidate.text`, `count++` per occurrence, `scopes` is a deduped list of scopes by `.path`.

4. Structural definitions from `detectAllInZip` contribute to `nonPiiCandidates` with `category: "structural"`, `confidence: 1.0`, `text: definition.referent`. The label is NOT added — per § 8.2 `buildAllTargetsFromZip` rationale, labels are D9-protected.

**Behavior contract (invariants for the migration):**

- `piiCandidates.length` after Phase 1 is EQUAL to `piiCandidates.length` before Phase 1 on the same input. The identifier rules are unchanged; the partition is lossless. A new `engine.test.ts` test asserts this directly against the worst-case fixture.

- `nonPiiCandidates` may be empty on pure-identifier inputs. (E.g., a test fixture containing only one email address produces one `piiCandidates` entry and zero `nonPiiCandidates` entries.)

- `defaultSelections(analysis)` includes every entry from `piiCandidates.text` AND `nonPiiCandidates.text` AND `entityGroups[*].literals[*].text`. The returned `Set<string>` grows relative to Phase 0, but no existing entry is removed. Existing tests that assert specific literals are present keep passing; tests that assert specific literals are ABSENT may need to relax their assertions if the literal happens to now be picked up by a Phase 1 rule.

- The `applyRedaction` code path is UNCHANGED. It continues to take `selections: ReadonlySet<string>` and pass `[...selections]` to `finalizeRedaction`. The growth in the selection set is transparent to the finalize layer.

- `listScopes(zip).length` still populates `fileStats.scopeCount`. The migration does not touch `fileStats`.

### 8.5 One new `engine.test.ts` test

Append to the existing `describe("analyzeZip", …)` block (do NOT modify any existing test above it):

```typescript
it("populates nonPiiCandidates for Phase 1 matches on the worst-case fixture", async () => {
  const bytes = await loadFixture("bilingual_nda_worst_case.docx");
  const analysis = await analyzeZip(bytes, ["ABC Corporation"]);

  // The bilingual NDA fixture contains at least one KRW amount
  // ("50,000,000원") and at least one Korean date ("2024년 3월 15일"). Both
  // should appear in nonPiiCandidates under the financial / temporal
  // categories respectively.
  expect(analysis.nonPiiCandidates.length).toBeGreaterThan(0);

  const categoriesSeen = new Set(
    analysis.nonPiiCandidates.map((c) => c.category),
  );
  // At least one of financial or temporal must fire on this fixture.
  expect(
    categoriesSeen.has("financial") || categoriesSeen.has("temporal"),
  ).toBe(true);

  // Backward-compat invariant: piiCandidates does not regress on the same
  // input. The fixture is known to contain at least one email-shaped literal.
  expect(analysis.piiCandidates.length).toBeGreaterThanOrEqual(1);

  // defaultSelections must include every new nonPiiCandidate's text.
  const selections = defaultSelections(analysis);
  for (const cand of analysis.nonPiiCandidates) {
    expect(selections.has(cand.text)).toBe(true);
  }
});
```

No other existing test in `engine.test.ts` is modified. All 17 Phase 0 tests continue to pass unchanged.

### 8.6 `detect-all.test.ts` — new behavioral test file

Create `src/detection/detect-all.test.ts`. The following test-group table specifies shape and count; exact test bodies are written during TDD step 4 of § 16. Phase 1 targets ~50 tests in this file.

**Group 1 — `detectAll` unit tests (20 tests):**

| # | Assertion |
|---|---|
| 1 | Empty text returns `{ candidates: [], structuralDefinitions: [], documentLanguage: "en" }` |
| 2 | Whitespace-only text returns empty result with documentLanguage `"en"` |
| 3 | Single Korean RRN input produces one candidate with `ruleId: "identifiers.korean-rrn"` |
| 4 | Single English email input produces one candidate with `ruleId: "identifiers.email"` |
| 5 | Text containing an identifier and a financial match produces two candidates |
| 6 | Regex candidates appear before heuristic candidates in output (phase-order assertion) |
| 7 | `opts.level: "conservative"` filters out `"paranoid"`-only rules (use a synthetic test rule registered with `["paranoid"]` via `runAllPhases` rules override — but detectAll doesn't expose that; instead test via a real `"paranoid"`-only rule in the registry once § 9–14 land, or skip until then and add to `runner.test.ts`) |
| 8 | `opts.language: "ko"` on an English-only input excludes English-only rule output |
| 9 | `opts.language: "en"` on a Korean-only input excludes Korean-only rule output |
| 10 | `opts.language: "mixed"` runs every rule regardless of input language |
| 11 | `documentLanguage` reflects the input — Korean-only text returns `"ko"` |
| 12 | `documentLanguage` reflects the input — English-only text returns `"en"` |
| 13 | `documentLanguage` reflects the input — 50/50 bilingual returns `"mixed"` |
| 14 | Explicit `opts.language` override wins over auto-detect |
| 15 | `structuralDefinitions` is populated on an input containing a "by and between ABC Corp" party declaration (once § 12 lands) |
| 16 | Heuristic confidence < 1.0 is preserved end-to-end |
| 17 | Regex confidence is exactly 1.0 |
| 18 | Candidates preserve original bytes (fullwidth digits input → fullwidth-digit candidate text, not halfwidth) |
| 19 | 50KB input returns within 1 second (soft perf budget) |
| 20 | Normalize is called ONCE per detectAll call (mock via spy on `normalizeForMatching` — optional; requires `vi.spyOn` setup) |

**Group 2 — `detectAllInZip` unit tests (15 tests):**

| # | Assertion |
|---|---|
| 1 | Empty zip returns empty `{ candidates: [], structuralDefinitions: [] }` |
| 2 | Body-only zip walks the body scope |
| 3 | Header + footer + footnote zip walks all four scope kinds |
| 4 | Per-scope language detection: body in Korean, header in English, each scope runs its own detection (assert via ruleId presence) |
| 5 | Scope attribution is correct: a match found in `footnotes1` has `scope.path === "word/footnotes.xml"` |
| 6 | Walk order matches `extractTextFromZip` (body before footnotes before headers) |
| 7 | Duplicate matches across scopes appear twice in the output (no dedup at this level) |
| 8 | `opts.level: "conservative"` passes through to each scope's detectAll call |
| 9 | `opts.language` override passes through to each scope's detectAll call |
| 10 | Structural definitions found in one scope appear in the output with that scope attached |
| 11 | Structural definitions from the body do NOT leak into the heuristic context of a footnote scope (each scope is an independent runAllPhases call) |
| 12 | Empty scope (`<w:p/>` only) contributes no candidates |
| 13 | Fail-loud: a throwing rule bubbles up through detectAllInZip as a rejected promise |
| 14 | The returned arrays are plain `readonly` arrays, not iterators |
| 15 | `fileStats` is not exposed by `detectAllInZip` (belongs to engine.ts, not detection layer) |

**Group 3 — `buildAllTargetsFromZip` integration (10 tests):**

| # | Assertion |
|---|---|
| 1 | Returns longest-first sorted |
| 2 | Dedupes across scopes (same email in body and footer collapses to one target) |
| 3 | Structural referents included |
| 4 | Structural labels NOT included (D9 guard) |
| 5 | Heuristic-emitted candidates included by default (confidence filter is engine.ts's job, not builder's) |
| 6 | `opts.level: "paranoid"` produces a superset of `"standard"` targets on a contract-shaped fixture |
| 7 | `opts.level: "conservative"` produces a subset of `"standard"` targets |
| 8 | Empty zip → empty array |
| 9 | Zip with only one scope containing one email → one-element array |
| 10 | Empty structural `referent` fields are skipped (no empty-string entries in output) |

**Group 4 — Phase 0 parity sanity checks (5 tests):**

| # | Assertion |
|---|---|
| 1 | On a pure-identifier input (e.g., one email), `buildAllTargetsFromZip` returns the same set as legacy `buildTargetsFromZip` — proves the strangler-fig no-behavior-change invariant for the identifiers subset |
| 2 | On the bilingual worst-case fixture, every legacy `buildTargetsFromZip` target appears in `buildAllTargetsFromZip` output (new pipeline is a superset) |
| 3 | `detectAll` and `detectPii` produce overlapping `identifier.*` candidates on the same input (every `detectPii` match has a corresponding `detectAll` candidate) |
| 4 | Legacy `buildTargetsFromZip` is NOT called from `detect-all.ts` (grep test — `grep buildTargetsFromZip src/detection/detect-all.ts` returns nothing) |
| 5 | Legacy `detectPii` is NOT called from `detect-all.ts` (grep test — same as above) |

**Total new tests in `detect-all.test.ts`:** 50 tests.

### 8.7 `detect-all.integration.test.ts` — new integration file

Create `src/detection/detect-all.integration.test.ts`. Runs against the existing `tests/fixtures/bilingual_nda_worst_case.docx` fixture (DO NOT modify the fixture). Target ~10 tests:

| # | Assertion |
|---|---|
| 1 | `detectAllInZip(fixtureZip).candidates.length` ≥ N, where N is the baseline captured on first run and frozen as a golden number |
| 2 | Every scope from `listScopes(fixtureZip)` is represented in the output OR explicitly documented as empty-of-matches in a comment |
| 3 | Structural definitions found on the fixture include at least one party declaration (the fixture has a "by and between" clause) |
| 4 | Financial candidates include at least one KRW amount (the fixture has "50,000,000원") |
| 5 | Temporal candidates include at least one Korean date (the fixture has "2024년") |
| 6 | `buildAllTargetsFromZip` output on the fixture is a SUPERSET of legacy `buildTargetsFromZip` output — every legacy target is present, new targets may be added |
| 7 | Perf: `buildAllTargetsFromZip(fixtureZip)` completes in under 2000 ms (soft budget — fails the test if exceeded but does not block CI on first-run spikes) |
| 8 | No duplicate targets in the output (Set invariant — use `new Set(result).size === result.length`) |
| 9 | Longest-first ordering holds over the full target list |
| 10 | `documentLanguage` detected on the fixture is `"mixed"` |

These tests double as the ship gate for Phase 1 integration. If any fails, the new pipeline is not yet ready for the engine.ts migration TDD step.

### 8.8 Acceptance checklist for `detect-all.ts`

- [ ] `detect-all.ts` exports exactly: `detectAll`, `detectAllInZip`, `buildAllTargetsFromZip`, `DetectAllResult`, `DetectAllInZipResult`, `DetectAllOptions`, `ScopedCandidate`, `ScopedStructuralDefinition` (8 public exports — no more, no less)
- [ ] `NonPiiCandidate` is NOT exported from `detect-all.ts` (it lives in `src/ui/engine.ts`)
- [ ] `detect-pii.ts` is unchanged (`git diff 187b7f8 -- src/detection/detect-pii.ts` is empty)
- [ ] `detect-pii.characterization.test.ts` still passes (ship gate preserved)
- [ ] `detect-pii.integration.test.ts` still passes
- [ ] `detect-all.test.ts` has ~50 tests, all passing
- [ ] `detect-all.integration.test.ts` has ~10 tests, all passing
- [ ] No `try` keyword in `detect-all.ts` (`grep -n '\btry\b' src/detection/detect-all.ts` returns nothing)
- [ ] `DEFAULT_LEVEL` constant is exactly `"standard"`
- [ ] `buildAllTargetsFromZip` returns `readonly string[]`, longest-first sorted
- [ ] Structural `referent` contributes to targets, `label` does NOT
- [ ] Per-scope language detection works (verified by group 2 test 4)
- [ ] Identifier-partition invariant holds: on a pure-identifier input, the target set from `buildAllTargetsFromZip` equals the target set from legacy `buildTargetsFromZip` (verified by group 4 test 1)
- [ ] `engine.ts` migration test (§ 8.5) passes on the worst-case fixture
- [ ] `engine.test.ts` has 18 tests total (17 Phase 0 + 1 Phase 1) — no existing test was modified, added, or deleted other than the one appended in § 8.5

---

## 9. `rules/financial.ts` — 10 regex rules

Ten financial detection rules covering Korean won, US dollar, foreign currencies, percentages, fractions, and label-driven amount context. All are pure regex with optional post-filters — no heuristics, no parsers. File targets ~250 lines of TypeScript + ~250 lines of tests.

### 9.1 Category overview

| # | id | Languages | Levels | What it catches |
|---|---|---|---|---|
| 1 | `financial.won-amount` | `["ko"]` | C, S, P | Korean won with 원 suffix: `50,000원`, `1000원`, `1,500.50원` |
| 2 | `financial.won-unit` | `["ko"]` | S, P | Korean unit amounts: `1억원`, `500만원`, `3천만원`, `1조원` |
| 3 | `financial.won-formal` | `["universal"]` | C, S, P | Formal KRW marker: `₩50,000`, `KRW 50,000,000` |
| 4 | `financial.usd-symbol` | `["universal"]` | C, S, P | Dollar symbol: `$50,000`, `$1.99`, `$50,000.00` |
| 5 | `financial.usd-code` | `["universal"]` | C, S, P | USD code form: `USD 50,000`, `US$ 50,000` |
| 6 | `financial.foreign-symbol` | `["universal"]` | S, P | `€50,000`, `£1,000`, `¥10,000` |
| 7 | `financial.foreign-code` | `["universal"]` | S, P | ISO codes: `EUR 50,000`, `GBP 1,000`, `JPY 10,000`, `CNY 50,000`, `CHF / AUD / CAD / HKD / SGD` |
| 8 | `financial.percentage` | `["universal"]` | S, P | `15%`, `15.5%`, `15 퍼센트`, `15 프로` |
| 9 | `financial.fraction-ko` | `["ko"]` | P | `3분의 1`, `4분의 3`, `10분의 1` |
| 10 | `financial.amount-context-ko` | `["ko"]` | S, P | Label-driven: `금액: 1,000,000`, `보증금 5억`, `매매대금 50,000,000원` |

Legend: **C** = conservative, **S** = standard, **P** = paranoid.

### 9.2 Normalization assumptions (read before writing patterns)

By the time a regex rule sees the text, `normalizeForMatching` has already applied the following transformations (see `src/detection/normalize.ts` for the authoritative list — do NOT re-apply these in the regex):

- **Fullwidth ASCII folded to halfwidth.** `５０，０００` becomes `50,000`. `＄` becomes `$`. The regex can assume digits, commas, periods, dollar signs, and spaces are all ASCII.
- **CJK space (U+3000) → ASCII space.** Use `\s` normally; don't worry about the CJK space.
- **Smart quotes → ASCII quotes.** Not relevant for financial, but worth knowing.
- **Hyphens (en-dash, em-dash, minus sign, fullwidth hyphen, etc.) → ASCII hyphen.** Not used in financial regex but worth knowing for temporal.
- **Zero-width characters stripped.** `50\u200B,000` becomes `50,000`.

**NOT normalized** (the regex must handle these as-is):

- **Korean currency symbol `₩` (U+20A9).** Passes through unchanged. The `financial.won-formal` rule matches it literally.
- **Euro `€` (U+20AC), pound `£` (U+00A3), yen `¥` (U+00A5).** Pass through unchanged. The `financial.foreign-symbol` rule matches them literally.
- **Korean syllables.** Passed through as whatever codepoints the input had. **The rules below assume the input is NFC-composed** (single-codepoint Hangul syllables), which is how Word and all modern editors emit Korean by default. Jamo-decomposed input (e.g., `원` instead of `원`) is an acknowledged edge case that these rules do not handle; Phase 0's characterization fixture is all NFC, so the invariant holds for the existing test suite. A future hardening phase may add jamo handling, but it is out of scope for Phase 1.
- **Korean number words (만, 억, 조, 천).** The regex matches them as literal UTF-16 sequences. They are not normalized away.

### 9.3 Full file content (`rules/financial.ts`)

Put this EXACTLY into `src/detection/rules/financial.ts`:

```typescript
/**
 * Financial category — money amounts, percentages, fractions.
 *
 * Ten regex rules covering:
 *
 *   1. Korean won with 원 suffix (digit form)
 *   2. Korean won with unit word (억/만/천/조)
 *   3. Formal KRW marker (₩ / KRW)
 *   4. US dollar symbol ($)
 *   5. US dollar code (USD / US$)
 *   6. Foreign currency symbol (€ £ ¥)
 *   7. Foreign currency code (EUR GBP JPY CNY ...)
 *   8. Percentage (% 퍼센트 프로)
 *   9. Korean fraction (N분의 M)
 *  10. Label-driven amount context (금액:, 보증금, ...)
 *
 * All rules return `confidence: 1.0` via the standard runner (see
 * `runRegexPhase`). Two post-filters reject out-of-range values: KRW amounts
 * above ~999조원 (likely typos or account numbers) and percentages above
 * 10,000% (almost certainly not a valid financial claim).
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 9 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.2 — category boundary resolution
 *   - docs/RULES_GUIDE.md § 7 — ReDoS checklist (every pattern in this file
 *     was audited against the 50ms budget)
 *
 * NORMALIZATION: this file assumes `normalizeForMatching` has already folded
 * fullwidth digits and punctuation to ASCII. Do NOT match `０`, `，`, `．` —
 * they are already `0`, `,`, `.` by the time the regex sees them. See
 * src/detection/normalize.ts and § 9.2 of the phase-1 brief.
 */

import type { PostFilter, RegexRule } from "../_framework/types.js";

/**
 * Post-filter for `financial.won-amount`. Rejects values above 999조원
 * (999,999,999,999,999) as they are overwhelmingly typos, account numbers,
 * or transcription noise rather than real money amounts. Values below 1원
 * cannot match the regex (which requires at least one digit).
 *
 * Pure function: extracts digits, converts to Number, bounds-checks.
 */
const wonAmountInRange: PostFilter = (normalizedMatch) => {
  const digits = normalizedMatch.replace(/[^\d]/g, "");
  if (digits.length === 0) return false;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 && n <= 999_999_999_999_999;
};

/**
 * Post-filter for `financial.percentage`. Rejects values above 10,000% as
 * almost certainly not a valid financial claim (growth rates, ROIs, and
 * other extreme percentages used in real contracts top out well below this).
 * Values at or below 0 are also rejected — negative percentages appear in
 * contracts but with a leading minus sign, which this regex does not match
 * to begin with.
 */
const percentageInRange: PostFilter = (normalizedMatch) => {
  const m = normalizedMatch.match(/\d+(?:\.\d+)?/);
  if (!m) return false;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 10_000;
};

export const FINANCIAL = [
  {
    id: "financial.won-amount",
    category: "financial",
    subcategory: "won-amount",
    pattern:
      /(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*원/g,
    postFilter: wonAmountInRange,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean won with 원 suffix, comma-separated or bare digit form",
  },
  {
    id: "financial.won-unit",
    category: "financial",
    subcategory: "won-unit",
    pattern:
      /(?<!\d)\d+(?:,\d{3})*(?:\.\d+)?\s*(?:천만|천억|천|만|억|조)\s*원/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean won with unit word (천/만/억/조 + 원), e.g., '3천만원', '1억원'",
  },
  {
    id: "financial.won-formal",
    category: "financial",
    subcategory: "won-formal",
    pattern:
      /(?<![A-Za-z])(?:₩\s*|KRW\s+)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "Formal Korean won marker (₩ or KRW) followed by digit amount",
  },
  {
    id: "financial.usd-symbol",
    category: "financial",
    subcategory: "usd-symbol",
    pattern:
      /(?<![A-Za-z\d])\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "US dollar with $ prefix, e.g., '$50,000', '$1.99', '$100.00'",
  },
  {
    id: "financial.usd-code",
    category: "financial",
    subcategory: "usd-code",
    pattern:
      /(?<![A-Za-z])(?:USD\s+|US\$\s*)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "US dollar with ISO code (USD) or US$ prefix, e.g., 'USD 50,000', 'US$ 100'",
  },
  {
    id: "financial.foreign-symbol",
    category: "financial",
    subcategory: "foreign-symbol",
    pattern:
      /(?<![A-Za-z\d])[€£¥]\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["standard", "paranoid"],
    languages: ["universal"],
    description:
      "Foreign currency symbol (€, £, ¥) followed by digit amount",
  },
  {
    id: "financial.foreign-code",
    category: "financial",
    subcategory: "foreign-code",
    pattern:
      /(?<![A-Za-z])(?:EUR|GBP|JPY|CNY|CHF|AUD|CAD|HKD|SGD)\s+(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g,
    levels: ["standard", "paranoid"],
    languages: ["universal"],
    description:
      "Foreign currency ISO code (EUR/GBP/JPY/CNY/CHF/AUD/CAD/HKD/SGD) followed by amount",
  },
  {
    id: "financial.percentage",
    category: "financial",
    subcategory: "percentage",
    pattern: /(?<!\d)\d+(?:\.\d+)?\s*(?:%|퍼센트|프로)/g,
    postFilter: percentageInRange,
    levels: ["standard", "paranoid"],
    languages: ["universal"],
    description:
      "Percentage, numeric form with %, 퍼센트, or 프로 suffix",
  },
  {
    id: "financial.fraction-ko",
    category: "financial",
    subcategory: "fraction-ko",
    pattern: /(?<!\d)\d+\s*분의\s*\d+(?!\d)/g,
    levels: ["paranoid"],
    languages: ["ko"],
    description: "Korean fraction notation 'N분의 M', e.g., '3분의 1'",
  },
  {
    id: "financial.amount-context-ko",
    category: "financial",
    subcategory: "amount-context-ko",
    pattern:
      /(?<=(?:금액|총액|보증금|매매대금|계약금|잔금|지급액|수수료|단가|대금)\s*[:：]?\s*)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:원|만원|억원|천원))?/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Digit amount preceded by a Korean financial label (금액/총액/보증금/...)",
  },
] as const satisfies readonly RegexRule[];
```

### 9.4 Per-rule deep dive

#### 9.4.1 `financial.won-amount`

**Pattern:** `(?<![\d.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*원`

**Matches (positive, minimum 3):**
- `"50,000원"` → captures `50,000원`
- `"1000원"` (no commas, short form) → captures `1000원`
- `"1,500.50원"` (decimal) → captures `1,500.50원`

**Variants (minimum 3):**
- `"50000원"` (no commas, long bare form)
- `"50,000  원"` (multiple spaces)
- `"50,000원입니다"` (followed by Korean particle — match is `50,000원`, leaves `입니다`)

**Boundaries (minimum 3):**
- Start of string: `"50,000원 is the total"` → matches at offset 0
- End of string: `"Total: 50,000원"` → matches at end
- Punctuation adjacent: `"(50,000원)"` → matches `50,000원`, leaves parens

**Rejects (must NOT match, minimum 3):**
- `"2024년"` (year suffix 년, not 원 currency) — no match
- `"1500000000000000000원"` (post-filter rejects as > 999조원)
- `"원"` alone (no digit prefix) — no match

**ReDoS:** benign. The repetition `(?:,\d{3})+` is linear — each `,\d{3}` consumes 4 characters deterministically. The optional `(?:\.\d+)?` is also linear. No nested quantifiers. Passes the 50ms fuzz budget easily.

**Known false positive:** `"1.5원칙"` (version 1.5 principle — 원칙 means "principle" with 원 as first syllable of a compound word). The regex matches `1.5원` and leaves `칙`. Documented limitation; a future hygiene pass may add a lookahead blacklist for common 원-prefixed compound words (원칙, 원인, 원래, 원본, 원자, 원점, 원문, 원어, 원고, 원리, 원유, 원자력, ...). Phase 1 does NOT add this blacklist.

**Level rationale:** Conservative tier because the 원 suffix makes this one of the most unambiguous financial signals in Korean text. Contracts that mention any won amount should always have these redacted regardless of tier.

#### 9.4.2 `financial.won-unit`

**Pattern:** `(?<!\d)\d+(?:,\d{3})*(?:\.\d+)?\s*(?:천만|천억|천|만|억|조)\s*원`

**Alternation order matters.** `천만` and `천억` MUST come before `천` in the alternation list. The regex engine tries alternatives left-to-right and uses the first match, so with `(?:천|천만)` the engine would match the bare `천` and never try `천만`, producing wrong candidate boundaries on text like `"3천만원"`. This is a load-bearing ordering decision, NOT a cosmetic one.

**Matches:**
- `"1억원"` → `1억원`
- `"500만원"` → `500만원`
- `"3천만원"` → `3천만원`
- `"1조원"` → `1조원`
- `"1,000만원"` (comma inside digit block) → `1,000만원`

**Variants:**
- `"500 만원"` (space between digit and unit)
- `"500만 원"` (space between unit and 원)
- `"500 만 원"` (spaces both sides)

**Rejects:**
- `"500만"` (no 원 suffix) — no match
- `"천만원"` (no digit prefix) — no match
- `"만원"` alone — no match

**Level rationale:** Standard + Paranoid but NOT Conservative. The unit-word form overlaps with calendrical phrases like `"1억 년 전"` (100 million years ago); the required 원 suffix prevents most false positives, but conservative tier errs on the side of zero-false-positive rules.

**ReDoS:** benign.

#### 9.4.3 `financial.won-formal`

**Pattern:** `(?<![A-Za-z])(?:₩\s*|KRW\s+)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`

**Matches:**
- `"₩50,000"` → `₩50,000`
- `"₩ 50,000"` (space after ₩) → `₩ 50,000`
- `"KRW 50,000,000"` → `KRW 50,000,000`
- `"KRW 1000"` (no commas) → `KRW 1000`

**Boundaries:**
- Left boundary `(?<![A-Za-z])` rejects `"FOOKRW 50,000"` — the `K` of `KRW` has `O` before it (letter), so the negative lookbehind fails. No match. Prevents matching inside identifiers.

**Rejects:**
- `"KRW"` alone — no digits
- `"₩"` alone — no digits
- `"krw 50,000"` lowercase — pattern is case-sensitive (no `i` flag), so lowercase does not match. Intentional: lowercase `krw` in a contract is extremely rare and likely noise.

**Language rationale:** `"universal"` because `₩` and `KRW` appear in English-language documents describing Korean transactions. A purely-English contract between a US buyer and Korean seller may use `KRW 50,000,000` without any Korean text elsewhere.

**ReDoS:** benign.

#### 9.4.4 `financial.usd-symbol`

**Pattern:** `(?<![A-Za-z\d])\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`

**Decimal digit limit of `{1,2}`.** USD is always 2-decimal currency. Allowing arbitrary decimals (`\.\d+`) would let `$100.0000001` match, which is suspicious for money. Cap at 2.

**Matches:**
- `"$50,000"` → `$50,000`
- `"$1.99"` → `$1.99`
- `"$100.00"` → `$100.00`
- `"$0.50"` → `$0.50`
- `"$50000"` (no commas) → `$50000`

**Variants:**
- `"$ 50,000"` (space after `$`)
- `"$50,000.00"` (commas and decimals)

**Boundaries:**
- Left boundary `(?<![A-Za-z\d])` rejects `"US$100"` — the `$` has `S` before it, which is a letter. That match is caught by `usd-code` instead. Prevents double-counting across the two rules.

**Rejects:**
- `"US$100"` (caught by `usd-code`, not `usd-symbol`)
- `"$"` alone (no digits)

**ReDoS:** benign.

#### 9.4.5 `financial.usd-code`

**Pattern:** `(?<![A-Za-z])(?:USD\s+|US\$\s*)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`

**Matches:**
- `"USD 50,000"` → `USD 50,000`
- `"USD 1,000,000.00"` → full match
- `"US$ 100"` → `US$ 100`
- `"US$100"` (no space) → `US$100`

**Variants:**
- `"USD   50,000"` (extra whitespace)
- `"usd 50,000"` lowercase — pattern is case-sensitive, does not match. Intentional.

**Rule interaction:** `"US$100"` matches here (via the `US\$` branch) and does NOT match `usd-symbol` (which requires no letter before `$`). No double-counting.

**Rejects:**
- `"USD"` alone — no digits
- `"US$"` alone — no digits

**Acceptable false positive:** `"AUDIT USD 100"` — the character directly before `U` is a space, not a letter, so lookbehind passes. Matches `USD 100`. This is CORRECT behavior: even inside the phrase `"AUDIT USD 100"`, the substring `USD 100` is a legitimate money amount and should be redacted.

**ReDoS:** benign.

#### 9.4.6 `financial.foreign-symbol`

**Pattern:** `(?<![A-Za-z\d])[€£¥]\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`

**Matches:**
- `"€50,000"` → `€50,000`
- `"£1,000"` → `£1,000`
- `"¥10,000"` → `¥10,000`
- `"€ 50.00"` (space after symbol, 2 decimals)

**Language rationale:** `"universal"` — these symbols appear in documents of any language.

**Note on yen vs yuan.** The symbol `¥` is used for both JPY and CNY historically. In modern practice, CNY uses `元` or `¥` depending on context. This rule catches the symbol `¥` without disambiguating the currency — downstream redaction does not need to know which. The ISO-code form `CNY 50,000` is caught by `foreign-code`.

**Rejects:**
- Chinese `元` character alone — not in the character class `[€£¥]`, so not matched. Acknowledged limitation; a future hygiene pass may add `元`.
- `¥` alone — no digits, no match.

**ReDoS:** benign.

#### 9.4.7 `financial.foreign-code`

**Pattern:** `(?<![A-Za-z])(?:EUR|GBP|JPY|CNY|CHF|AUD|CAD|HKD|SGD)\s+(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`

**Currency code list:** 9 major codes covering Europe (EUR, GBP, CHF), Asia-Pacific (JPY, CNY, HKD, SGD), and Commonwealth (AUD, CAD). Excluded: SEK, NOK, DKK, NZD, INR, BRL, MXN, RUB, ZAR, KRW (KRW is caught by `won-formal`). A future hygiene pass may extend the list; Phase 1 targets the 9 most common in Korean–English cross-border contracts.

**Required space after code:** `\s+` not `\s*`. Reason: `EUR50` is almost always a concatenated identifier (e.g., product code), not a currency amount. Requiring at least one space after the code eliminates most such false positives.

**Matches:**
- `"EUR 50,000"` → `EUR 50,000`
- `"GBP 1,000"` → `GBP 1,000`
- `"JPY 10,000"` → `JPY 10,000`
- `"CNY 50,000"` → `CNY 50,000`

**Rejects:**
- `"EUR50"` (no space, likely product code) — no match
- `"EUROPE 50"` — the engine tries `EUR` at position 0, then requires `\s+`, but the next character is `O`, not whitespace. Fails all 9 code alternatives. No match overall. Correct.
- `"EUR"` alone — no match

**ReDoS:** benign.

#### 9.4.8 `financial.percentage`

**Pattern:** `(?<!\d)\d+(?:\.\d+)?\s*(?:%|퍼센트|프로)`

**Matches:**
- `"15%"` → `15%`
- `"15.5%"` → `15.5%`
- `"15 %"` (space) → `15 %`
- `"15퍼센트"` → `15퍼센트`
- `"15 퍼센트"` (space) → `15 퍼센트`
- `"15 프로"` → `15 프로`

**Boundaries:**
- `(?<!\d)` prevents `"2015%"` from being interpreted as `015%` starting at position 1. With the lookbehind, the engine starts at position 0 and matches `2015%` as a single number.

**Rejects:**
- `"15개"` (15 pieces) — no `%` or percentage word
- `"%"` alone — no digits
- `"15000%"` → matches regex, post-filter rejects (> 10,000%)
- `"0.00001%"` → matches regex, post-filter accepts (0 ≤ 0.00001 ≤ 10,000)

**Acceptable false positive:** `"버전 5%"` could match `5%`, but this is rare outside informal text and the downstream redactor handles it safely (worst case: the `5%` is redacted when it was just informational).

**ReDoS:** benign.

#### 9.4.9 `financial.fraction-ko`

**Pattern:** `(?<!\d)\d+\s*분의\s*\d+(?!\d)`

**Matches:**
- `"3분의 1"` → `3분의 1`
- `"3분의1"` (no space) → `3분의1`
- `"100분의 20"` → `100분의 20`

**Boundaries:**
- `(?<!\d)` prevents matching mid-number
- `(?!\d)` prevents capturing only part of a trailing number (on `"3분의 12"`, the engine correctly matches `3분의 12`, not `3분의 1`)

**Rejects:**
- `"3분간"` (3 minutes) — required `분의`, not `분간`
- `"분의"` alone — no digits
- `"1/3"` — not the Korean fraction form, not matched (a future universal-fraction rule may catch this)

**Level rationale:** Paranoid only. Fractions are rarely redaction targets in contracts — they usually denote shares or ownership ratios that are legitimate content, not PII.

**ReDoS:** benign.

#### 9.4.10 `financial.amount-context-ko`

**Pattern:** `(?<=(?:금액|총액|보증금|매매대금|계약금|잔금|지급액|수수료|단가|대금)\s*[:：]?\s*)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:원|만원|억원|천원))?`

**Variable-length lookbehind:** ES2018+ feature. Supported in Node 18+ and all modern browsers. The tsconfig/vite target is ES2022, so this is fine. No polyfill needed.

**Label list:** 10 Korean financial-context nouns. NOT exhaustive by design — adding every possible label would be a maintenance burden and a slippery slope to hardcoded-entity-names (RULES_GUIDE § 12.2 anti-pattern). These 10 cover the overwhelming majority of labeled amounts in Korean contracts. Adding new labels in a future hygiene phase is cheap (just append to the alternation).

**Matches:**
- `"금액: 1,000,000"` → captures only `1,000,000` (label consumed by lookbehind)
- `"금액 5억"` (no colon, with Korean unit) → captures `5억`
- `"보증금: 50,000,000원"` → captures `50,000,000원`
- `"매매대금 100,000,000"` → captures `100,000,000`

**Rejects:**
- `"금액"` alone (no following digit) — no match
- `"1,000,000"` (no label) — no match
- `"시간 30"` (label `시간` not in the approved list) — no match

**Interaction with won-amount:** `"보증금: 50,000,000원"` is matched by BOTH this rule (which captures the digit portion including the optional 원 suffix) AND `won-amount` (which captures `50,000,000원`). Both emit candidates. Dedup happens later in `buildAllTargetsFromZip` on identical text. Since both captures include the trailing `원`, the strings are identical and the Set dedup collapses them to one target.

**ReDoS consideration:** variable-length lookbehind has higher cost than fixed-length. Worst case: the engine scans backwards up to `max(label_length) + punctuation + whitespace` characters. That is bounded — the longest label `매매대금` is 4 characters, plus colon, plus a few spaces. Passes the 50ms budget.

**Level rationale:** Standard + Paranoid. The label requirement makes it very low-false-positive, but it is NOT Conservative because the label list is inherently incomplete — a real contract could use a label not in the list and this rule would miss it, which means `conservative` (zero-miss tier for its scope) would need to be broader.

### 9.5 Test file specification (`rules/financial.test.ts`)

Create `src/detection/rules/financial.test.ts`. Per RULES_GUIDE § 8.1, minimum per-rule test set is 13 cases (3 positive, 3 variants, 3 boundary, 3 reject, 1 ReDoS adversarial). Ten rules × 13 tests = **130 tests minimum**. Target ~140 tests to allow a few extras per rule for tricky edge cases (`won-amount` has 원-compound-word ambiguity; `amount-context-ko` has variable-length lookbehind edge cases worth explicit coverage).

**Organization:**

```typescript
import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { FINANCIAL } from "./financial.js";

/** Helper: locate a rule by subcategory so tests don't break if array order changes. */
function findRule(subcategory: string): RegexRule {
  const rule = FINANCIAL.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

/** Helper: run one rule on one input at level "paranoid" and return the match texts. */
function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

describe("FINANCIAL registry", () => {
  it("exports exactly 10 rules", () => {
    expect(FINANCIAL).toHaveLength(10);
  });

  it("every rule id starts with 'financial.'", () => {
    for (const rule of FINANCIAL) {
      expect(rule.id.startsWith("financial.")).toBe(true);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of FINANCIAL) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of FINANCIAL) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe("financial.won-amount", () => {
  it("matches a comma-separated amount", () => {
    expect(matchOne("won-amount", "50,000원")).toEqual(["50,000원"]);
  });

  it("matches a bare-digit amount without commas", () => {
    expect(matchOne("won-amount", "1000원")).toEqual(["1000원"]);
  });

  it("matches an amount with decimal", () => {
    expect(matchOne("won-amount", "1,500.50원")).toEqual(["1,500.50원"]);
  });

  // ... 10 more tests per § 9.4.1 (variants, boundaries, rejects, ReDoS)
});

// ... one describe block per rule, 9 more
```

**Quality rubric (per RULES_GUIDE § 8.3).** Every rule's test block must earn **★★★** (3 stars):

- ★ 3 positive matches covering the rule's stated purpose
- ★ 3 variant matches covering the normalization surface (whitespace, comma presence, decimal, unit word placement)
- ★ 3 rejects covering the top false-positive risks identified in § 9.4

Rules that earn fewer than 3 stars do not ship.

**Test case naming:** use behavior-first describe titles, e.g., `it("matches a bare-digit amount without commas")`, NOT symbol-first (`it("tests FINANCIAL[0]")`). The behavior description is what future contributors will read when the test fails.

**ReDoS adversarial test per rule.** Include one test per rule that runs the pattern against a 10KB pathological input drawn from the rule's character class. Example for `won-amount`:

```typescript
it("is ReDoS-safe on pathological comma input", () => {
  const input = "1" + ",000".repeat(2500) + "원"; // ~10KB
  const start = Date.now();
  const matches = matchOne("won-amount", input);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(50); // 50ms budget per RULES_GUIDE § 7
  // The match itself is optional — the test is about not hanging.
  void matches;
});
```

The dedicated `_framework/redos-guard.test.ts` fuzz test already covers this category-wide, but per-rule smoke tests catch regressions faster when an individual rule is tweaked.

### 9.6 Registry integration

Extend `src/detection/_framework/registry.ts` to include FINANCIAL rules in `ALL_REGEX_RULES`. The diff:

```typescript
// Before (runner-extension commit — § 7.9):
import { IDENTIFIERS } from "../rules/identifiers.js";
// ... other imports
export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  // Phase 1 follow-up commits append:
  //   ...FINANCIAL (§ 9)
  //   ...TEMPORAL  (§ 10)
  //   ...ENTITIES  (§ 11)
  //   ...LEGAL     (§ 13)
] as const;

// After (§ 9 commit):
import { IDENTIFIERS } from "../rules/identifiers.js";
import { FINANCIAL } from "../rules/financial.js";
// ... other imports
export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  ...FINANCIAL,
  // Phase 1 follow-up commits append:
  //   ...TEMPORAL  (§ 10)
  //   ...ENTITIES  (§ 11)
  //   ...LEGAL     (§ 13)
] as const;
```

The registry's `verifyRegistry()` function (Phase 0, unchanged) runs at module load and validates:

- All `financial.*` ids are unique (no collision with identifier ids)
- All patterns have the `g` flag
- All `levels` and `languages` arrays are non-empty
- All descriptions are non-empty
- All ids start with `financial.` and end with their `subcategory`

If any of these fail, the import throws. **Do not catch this error.** Fix the rule definition and re-run. The failure surfaces at test discovery time, which is the earliest possible point — exactly the fail-fast semantics Phase 0 § 11 chose.

### 9.7 Acceptance checklist for § 9

Before committing the financial rules, verify every item:

- [ ] `src/detection/rules/financial.ts` exists and exports `FINANCIAL: readonly RegexRule[]`
- [ ] `FINANCIAL.length === 10`
- [ ] Every rule's id starts with `"financial."`
- [ ] Every rule has `category: "financial"`
- [ ] Every rule's pattern has the `g` flag
- [ ] Two rules (`won-amount`, `percentage`) have post-filters; the other eight do not
- [ ] `wonAmountInRange` rejects values above 999,999,999,999,999 and values at or below 0
- [ ] `percentageInRange` rejects values above 10,000 and below 0
- [ ] `rules/financial.test.ts` has ≥ 130 tests, all passing
- [ ] `rules/financial.test.ts` exercises all 10 rules (no orphan rule without a describe block)
- [ ] Every describe block earns ★★★ on the quality rubric
- [ ] Registry update: `ALL_REGEX_RULES` includes `...FINANCIAL` immediately after `...IDENTIFIERS`
- [ ] Registry verification passes at module load (no duplicate ids, no malformed rules)
- [ ] `bun run test src/detection/detect-pii.characterization.test.ts` still passes byte-for-byte — financial rules do not affect identifier output because they have a different category and disjoint patterns
- [ ] `bun run test src/detection/detect-pii.integration.test.ts` still passes
- [ ] `bun run test` overall test count increases by ≥ 130 (financial tests) + 4 (registry tests) = ≥ 134 in this commit
- [ ] ReDoS guard fuzz passes for all 10 financial rules (`bun run test src/detection/_framework/redos-guard.test.ts` with the new rules registered)
- [ ] No new npm dependencies added
- [ ] No edits to `src/detection/patterns.ts`, `detect-pii.ts`, `detect-pii.characterization.test.ts`, `detect-pii.integration.test.ts`, `detect-pii.test.ts`, or any Phase 0 file other than `registry.ts`

---

## 10. `rules/temporal.ts` — 8 regex rules

Eight temporal detection rules covering Korean and English calendar dates, durations, and label-driven date context. File targets ~200 lines of TypeScript + ~200 lines of tests. Structure mirrors § 9 exactly so Codex can use § 9 as a template when authoring.

### 10.1 Category overview

| # | id | Languages | Levels | What it catches |
|---|---|---|---|---|
| 1 | `temporal.date-ko-full` | `["ko"]` | C, S, P | `2024년 3월 15일`, `2024년3월15일`, `2024년 03월 15일` |
| 2 | `temporal.date-ko-short` | `["ko"]` | S, P | `2024.3.15`, `2024-3-15`, `2024/3/15`, `2024.03.15` |
| 3 | `temporal.date-ko-range` | `["ko"]` | S, P | `2024년 3월 15일부터 2024년 6월 30일까지`, `2024.3.15 ~ 2024.6.30` |
| 4 | `temporal.date-iso` | `["universal"]` | C, S, P | Strict ISO 8601: `2024-03-15`, `2024-03-15T14:30:00Z` |
| 5 | `temporal.date-en` | `["en"]` | S, P | `March 15, 2024`, `15 March 2024`, `Mar. 15, 2024` |
| 6 | `temporal.duration-ko` | `["ko"]` | S, P | `3년간`, `6개월`, `90일간`, `2주`, `24시간` |
| 7 | `temporal.duration-en` | `["en"]` | S, P | `3 years`, `6 months`, `90 days`, `2 weeks` |
| 8 | `temporal.date-context-ko` | `["ko"]` | C, S, P | Label + date: `계약일: 2024.3.15`, `체결일 2024년 3월 15일`, `시행일: 2024-03-15` |

Legend: **C** = conservative, **S** = standard, **P** = paranoid.

### 10.2 Normalization and language-filter assumptions

Same normalization assumptions as § 9.2 apply (fullwidth folded to halfwidth, CJK space → ASCII space, hyphen variants → ASCII hyphen, NFC Hangul assumption). Re-read § 9.2 before writing patterns — do not re-apply these transformations inside the regex.

**Temporal-specific notes:**

- **Hyphen variants matter.** Korean dates are commonly written with en-dashes (`2024–03–15`) or em-dashes. `normalizeForMatching` folds all of these to ASCII `-`, so the regex only needs to match ASCII `-`. Do NOT include `–—‒‑−` in the separator character class.
- **Fullwidth period and slash.** `2024．3．15` and `2024／3／15` are pre-folded to `2024.3.15` and `2024/3/15`. Regex uses ASCII only.
- **Korean `년`, `월`, `일` are not normalized.** They pass through as single-codepoint Hangul syllables (assuming NFC input). The regex matches them literally.
- **Language filter interaction.** The language filter (per § 7 runner) skips rules whose `languages` array excludes the detected document language. For a pure-English document, rules 1–3, 6, 8 (all `["ko"]`) are skipped; rules 4–5, 7 run. For a pure-Korean document, only rules 5, 7 (`["en"]`) are skipped; rule 4 (`["universal"]`) always runs. For a `"mixed"` document, every temporal rule runs. This is the expected behavior and matches RULES_GUIDE § 11.2.

### 10.3 Full file content (`rules/temporal.ts`)

Put this EXACTLY into `src/detection/rules/temporal.ts`:

```typescript
/**
 * Temporal category — calendar dates, durations, date-range phrases.
 *
 * Eight regex rules covering:
 *
 *   1. Korean full date (2024년 3월 15일)
 *   2. Korean short date (2024.3.15 / 2024-3-15 / 2024/3/15)
 *   3. Korean date range (2024년 3월 15일부터 2024년 6월 30일까지)
 *   4. ISO 8601 date with optional time (2024-03-15, 2024-03-15T14:30:00Z)
 *   5. English date (March 15, 2024 / 15 March 2024)
 *   6. Korean duration (3년간 / 6개월 / 90일간)
 *   7. English duration (3 years / 6 months / 90 days)
 *   8. Label-driven Korean date context (계약일: 2024.3.15)
 *
 * Two post-filters validate calendar dates: `validNumericDate` checks
 * month/day ranges and month-specific day counts (Feb 30 is rejected) for
 * the numeric and Korean date forms; `validEnglishDate` does the same for
 * the English month-name form. Duration and range rules are not post-
 * filtered — duration has no calendar semantics, and range over-matching
 * is accepted as an acknowledged edge case.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 10 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.3 — temporal category boundary
 *   - docs/RULES_GUIDE.md § 7 — ReDoS checklist
 *
 * NORMALIZATION: this file assumes `normalizeForMatching` has already folded
 * fullwidth digits, hyphen variants, and CJK space. See § 10.2 of the
 * phase-1 brief and src/detection/normalize.ts for the authoritative list.
 */

import type { PostFilter, RegexRule } from "../_framework/types.js";

/** Month name → numeric mapping for English date validation. */
const MONTH_NAME_TO_NUM: Readonly<Record<string, number>> = {
  January: 1,
  Jan: 1,
  February: 2,
  Feb: 2,
  March: 3,
  Mar: 3,
  April: 4,
  Apr: 4,
  May: 5,
  June: 6,
  Jun: 6,
  July: 7,
  Jul: 7,
  August: 8,
  Aug: 8,
  September: 9,
  Sep: 9,
  Sept: 9,
  October: 10,
  Oct: 10,
  November: 11,
  Nov: 11,
  December: 12,
  Dec: 12,
};

/**
 * Return true if the given (year, month, day) is a real calendar date.
 * Uses the Date constructor's roll-over behavior to detect invalid days
 * (e.g., Feb 30 rolls to Mar 2, so `d.getDate() !== 30`).
 *
 * Year is bounded to 1900-2100 to reject obvious typos (year 0024, year
 * 20240) while still allowing historical contract references.
 */
function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

/**
 * Post-filter for numeric and Korean-full date rules. Extracts (year, month,
 * day) from either `YYYY.MM.DD` / `YYYY-MM-DD` / `YYYY/MM/DD` format or
 * `YYYY년 MM월 DD일` format, then validates via `isValidCalendarDate`.
 *
 * If neither format matches (shouldn't happen given the rule's own regex),
 * returns false to reject the candidate defensively.
 */
const validNumericDate: PostFilter = (normalizedMatch) => {
  const numeric = normalizedMatch.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
  );
  if (numeric) {
    return isValidCalendarDate(
      Number(numeric[1]),
      Number(numeric[2]),
      Number(numeric[3]),
    );
  }
  const korean = normalizedMatch.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
  );
  if (korean) {
    return isValidCalendarDate(
      Number(korean[1]),
      Number(korean[2]),
      Number(korean[3]),
    );
  }
  return false;
};

/**
 * Post-filter for the English date rule. Handles both `Month Day, Year`
 * and `Day Month Year` forms. Falls back to false for unrecognized shapes.
 */
const validEnglishDate: PostFilter = (normalizedMatch) => {
  // Month Day, Year — e.g., "March 15, 2024" or "Mar. 15 2024"
  const mdy = normalizedMatch.match(
    /([A-Z][a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/,
  );
  if (mdy) {
    const month = MONTH_NAME_TO_NUM[mdy[1]!];
    if (month === undefined) return false;
    return isValidCalendarDate(Number(mdy[3]), month, Number(mdy[2]));
  }
  // Day Month Year — e.g., "15 March 2024" or "15 Mar 2024"
  const dmy = normalizedMatch.match(
    /(\d{1,2})\s+([A-Z][a-z]+)\.?\s+(\d{4})/,
  );
  if (dmy) {
    const month = MONTH_NAME_TO_NUM[dmy[2]!];
    if (month === undefined) return false;
    return isValidCalendarDate(Number(dmy[3]), month, Number(dmy[1]));
  }
  return false;
};

export const TEMPORAL = [
  {
    id: "temporal.date-ko-full",
    category: "temporal",
    subcategory: "date-ko-full",
    pattern:
      /(?<!\d)(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일/g,
    postFilter: validNumericDate,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description: "Korean full date with 년/월/일 suffixes (e.g., '2024년 3월 15일')",
  },
  {
    id: "temporal.date-ko-short",
    category: "temporal",
    subcategory: "date-ko-short",
    pattern:
      /(?<!\d)(?:19|20)\d{2}[.\-/](?:1[0-2]|0?[1-9])[.\-/](?:3[01]|[12]\d|0?[1-9])(?!\d)/g,
    postFilter: validNumericDate,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean short date with dot/hyphen/slash separators (e.g., '2024.3.15', '2024-03-15')",
  },
  {
    id: "temporal.date-ko-range",
    category: "temporal",
    subcategory: "date-ko-range",
    pattern:
      /(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일\s*(?:부터|~|-)\s*(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일(?:\s*까지)?/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean date range with 부터/~/- separator and optional 까지 suffix",
  },
  {
    id: "temporal.date-iso",
    category: "temporal",
    subcategory: "date-iso",
    pattern:
      /(?<!\d)(?:19|20)\d{2}-(?:1[0-2]|0[1-9])-(?:3[01]|[12]\d|0[1-9])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?(?!\d)/g,
    postFilter: validNumericDate,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description:
      "ISO 8601 date with zero-padded month/day and optional time component",
  },
  {
    id: "temporal.date-en",
    category: "temporal",
    subcategory: "date-en",
    pattern:
      /(?<![A-Za-z\d])(?:(?:3[01]|[12]\d|0?[1-9])\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)\s+(?:3[01]|[12]\d|0?[1-9])(?:st|nd|rd|th)?,?)\s+(?:19|20)\d{2}(?!\d)/g,
    postFilter: validEnglishDate,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English date in 'Month Day, Year' or 'Day Month Year' form with month names and abbreviations",
  },
  {
    id: "temporal.duration-ko",
    category: "temporal",
    subcategory: "duration-ko",
    pattern:
      /(?<!\d)\d+\s*(?:년간|개월|달|주간|주|일간|시간)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean duration with unambiguous unit suffix (년간/개월/달/주간/주/일간/시간)",
  },
  {
    id: "temporal.duration-en",
    category: "temporal",
    subcategory: "duration-en",
    pattern:
      /(?<!\d)\d+\s+(?:years?|months?|weeks?|days?|hours?)\b/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English duration (N years/months/weeks/days/hours)",
  },
  {
    id: "temporal.date-context-ko",
    category: "temporal",
    subcategory: "date-context-ko",
    pattern:
      /(?<=(?:계약일|체결일|시행일|효력발생일|만료일|종료일|발행일|작성일|기준일)\s*[:：]?\s*)(?:(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일|(?:19|20)\d{2}[.\-/](?:1[0-2]|0?[1-9])[.\-/](?:3[01]|[12]\d|0?[1-9]))/g,
    postFilter: validNumericDate,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean date preceded by a label (계약일/체결일/시행일/...)",
  },
] as const satisfies readonly RegexRule[];
```

### 10.4 Per-rule deep dive

#### 10.4.1 `temporal.date-ko-full`

**Pattern:** `(?<!\d)(?:19|20)\d{2}년\s*(?:1[0-2]|0?[1-9])월\s*(?:3[01]|[12]\d|0?[1-9])일`

**Year bound `19|20`.** The year must start with `19` or `20` — i.e., 1900–2099. This rejects `9999년`, `1000년`, and similar typos. Historical contract references (e.g., Seoul Olympics 1988) still match.

**Month class `(?:1[0-2]|0?[1-9])`.** Matches `1`–`12` with or without zero-padding. Order: `1[0-2]` first (greedy preference for 10/11/12), then `0?[1-9]` for single-digit months.

**Day class `(?:3[01]|[12]\d|0?[1-9])`.** Matches `1`–`31`. Month-specific day validation (April has 30, February has 28/29) is delegated to the `validNumericDate` post-filter.

**Matches:**
- `"2024년 3월 15일"` → `2024년 3월 15일`
- `"2024년3월15일"` (no spaces) → `2024년3월15일`
- `"2024년 03월 15일"` (zero-padded month) → `2024년 03월 15일`

**Variants:**
- `"2024년  3월  15일"` (multiple spaces)
- `"2024년 12월 31일"` (end-of-year)
- `"1988년 9월 17일"` (historical)

**Boundaries:**
- Start/end of string
- Adjacent punctuation: `"(2024년 3월 15일)"` → matches the date, leaves parens
- Korean particle after: `"2024년 3월 15일에"` → matches the date, leaves `에`

**Rejects:**
- `"2024년 13월 15일"` (month 13) — regex rejects (no `13` in month class)
- `"2024년 2월 30일"` (Feb 30) — regex matches, post-filter rejects (Feb has 28/29 days)
- `"9999년 3월 15일"` (year 9999) — regex rejects (year prefix must be `19|20`)

**ReDoS:** benign. No nested quantifiers. Each `\s*` is bounded by a required literal Hangul syllable, preventing runaway backtracking.

#### 10.4.2 `temporal.date-ko-short`

**Pattern:** `(?<!\d)(?:19|20)\d{2}[.\-/](?:1[0-2]|0?[1-9])[.\-/](?:3[01]|[12]\d|0?[1-9])(?!\d)`

**Separator class `[.\-/]`.** Accepts dot, hyphen, or slash. The three separators can be MIXED within a single date (e.g., `2024.3-15` technically matches), which is weird but not harmful — dedup collapses identical strings later.

**Why `(?!\d)` at the end.** Prevents `2024.3.155` from matching as `2024.3.15` with a trailing `5` left over.

**Matches:**
- `"2024.3.15"` → `2024.3.15`
- `"2024-3-15"` → `2024-3-15`
- `"2024/3/15"` → `2024/3/15`
- `"2024.03.15"` (zero-padded) → `2024.03.15`

**Rule interaction with `date-iso`.** `"2024-03-15"` matches BOTH `date-ko-short` (via `[.\-/]` class) AND `date-iso` (strict form). Both emit candidates with identical `text`. Dedup in `buildAllTargetsFromZip` collapses them. This is intended — two rules both confirming the same match is a feature (higher confidence in downstream analytics), not a bug.

**Rejects:**
- `"2024.13.15"` (month 13) — regex rejects
- `"2024.2.30"` (Feb 30) — regex matches, post-filter rejects
- `"v2024.3.15"` — the `v` before `2` is not a digit (lookbehind passes), so regex matches. Accepted limitation — `v2024.3.15` as a version string is rare in contracts.

**ReDoS:** benign.

#### 10.4.3 `temporal.date-ko-range`

**Pattern:** see § 10.3. Two `date-ko-full`-style date patterns joined by `\s*(?:부터|~|-)\s*` with an optional `\s*까지` suffix.

**Matches:**
- `"2024년 3월 15일부터 2024년 6월 30일까지"` → full phrase
- `"2024년 3월 15일 ~ 2024년 6월 30일"` → with `~` separator
- `"2024년 3월 15일 - 2024년 6월 30일"` → with hyphen separator
- `"2024년 3월 15일부터 2024년 6월 30일"` → without `까지`

**Rejects:**
- `"2024년 3월 15일"` alone (no range) — no match
- `"2024년 3월 15일부터"` without end date — no match
- `"2024.3.15 ~ 2024.6.30"` — the range rule only matches the full `년/월/일` form. The short form range is NOT supported in Phase 1 (acknowledged limitation). Users who need it get two separate `date-ko-short` matches from the two dates, which is equally useful for redaction.

**No post-filter.** Range matches are accepted verbatim. Invalid date components inside a range (e.g., `2024년 2월 30일부터 ...`) match but are not rejected; this is a rare edge case and the harm is a false positive redaction of an invalid date string, which is harmless.

**Level rationale:** Standard + Paranoid. Not Conservative because the pattern is long and the combined surface allows unusual forms to slip through occasionally.

**ReDoS:** benign. The two date sub-patterns are concatenated with a required separator, so there is no overlap between them.

#### 10.4.4 `temporal.date-iso`

**Pattern:** `(?<!\d)(?:19|20)\d{2}-(?:1[0-2]|0[1-9])-(?:3[01]|[12]\d|0[1-9])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?(?!\d)`

**Strict zero-padding.** Month and day classes require `0[1-9]`, not `0?[1-9]`. `2024-3-15` does NOT match this rule (it matches `date-ko-short` instead). ISO 8601 mandates zero-padding; respecting that is what makes this rule the "conservative" one.

**Optional time component.** `T` followed by `HH:MM`, optional `:SS`, and optional timezone (`Z` or `±HH:MM` or `±HHMM`). All RFC 3339 datetime forms.

**Matches:**
- `"2024-03-15"` (date only)
- `"2024-03-15T14:30:00Z"` (full UTC)
- `"2024-03-15T14:30:00+09:00"` (KST offset)
- `"2024-03-15T14:30"` (date + HH:MM only)

**Rejects:**
- `"2024-3-15"` (not zero-padded) — no match (caught by `date-ko-short` instead)
- `"2024-03-15T25:00:00Z"` (hour 25) — regex rejects (hour class is `[01]\d|2[0-3]`)
- `"2024-02-30"` — regex matches, post-filter rejects

**Language rationale:** `"universal"`. ISO 8601 is language-neutral and appears in technical documents of any language.

**Level rationale:** Conservative. The strict form is near-zero false positive — if a string looks like `2024-03-15`, it IS an ISO date.

**ReDoS:** benign. The time component has a fixed maximum length and no nested quantifiers.

#### 10.4.5 `temporal.date-en`

**Pattern:** see § 10.3. Two branches combined with alternation: `Day Month` and `Month Day,?`, both followed by a required 4-digit year.

**Month name list:** full names and common abbreviations (`Jan` through `Dec`, with optional period). Note that `"May"` appears in the full-name list only — `"May."` with period is unusual and accepted, but `"May"` is ambiguous with the modal verb. The post-filter does not resolve this ambiguity; accept occasional false positives.

**Ordinal suffix** `(?:st|nd|rd|th)?` — optional, matches `"15th"`, `"1st"`, etc. Note: after the ordinal, a comma is optional (`"March 15, 2024"` and `"March 15 2024"` both match).

**Matches:**
- `"March 15, 2024"` (MDY)
- `"March 15 2024"` (MDY no comma)
- `"Mar. 15, 2024"` (MDY abbreviated)
- `"15 March 2024"` (DMY)
- `"15 Mar 2024"` (DMY abbreviated)
- `"March 15th, 2024"` (with ordinal)
- `"September 3, 2024"` — `Sept` vs `Sep` both acceptable

**Rejects:**
- `"March 2024"` (no day) — no match
- `"March 15"` (no year) — no match
- `"March 32, 2024"` — regex rejects (day class)
- `"February 30, 2024"` — regex matches, post-filter rejects

**Language rationale:** `"en"`. English-only rule. Running on Korean text would be noise.

**Level rationale:** Standard + Paranoid. The `"May"` ambiguity prevents conservative tier.

**ReDoS:** benign. The outer alternation has disjoint prefixes (digit vs letter), so backtracking between branches is bounded.

#### 10.4.6 `temporal.duration-ko`

**Pattern:** `(?<!\d)\d+\s*(?:년간|개월|달|주간|주|일간|시간)`

**Why `년간` not `년`.** `년` alone is ambiguous with the year suffix in `date-ko-full` (`2024년`). The unambiguous duration form requires `년간` ("for N years"). Contracts that write `3년` without `간` are treated as ambiguous and NOT matched by this rule — user's responsibility to write `3년간` if they want detection. Acknowledged limitation.

**Why `일간` not `일`.** Same reason — `일` alone is the day suffix in `date-ko-full`.

**Unit list:** `년간`, `개월`, `달`, `주간`, `주`, `일간`, `시간`. The alternation puts longer forms first where they would otherwise shadow (`년간` before any `년`-like form; no standalone `년` in this rule).

**Matches:**
- `"3년간"` → `3년간`
- `"6개월"` → `6개월`
- `"90일간"` → `90일간`
- `"2주"` → `2주`
- `"24시간"` → `24시간`
- `"3 년간"` (space) → `3 년간`

**Rejects:**
- `"2024년"` (date year) — no `간` suffix, not in unit list, no match
- `"3일"` (date day) — no `간`, no match
- `"년간"` alone (no digit) — no match

**ReDoS:** benign.

#### 10.4.7 `temporal.duration-en`

**Pattern:** `(?<!\d)\d+\s+(?:years?|months?|weeks?|days?|hours?)\b`

**Case insensitive (`/gi`).** The pattern uses `i` flag because English durations in contracts appear in mixed case (`"3 Years"`, `"6 MONTHS"`). The runner's invariant is that `g` must be present; `i` is allowed alongside.

**`\b` usage.** This rule is `languages: ["en"]`, so it runs only on English text. RULES_GUIDE § 12.1 warns about `\b` in CJK contexts — English rules are safe.

**Required `\s+` between number and unit.** `"3years"` (no space) does not match. Contracts almost always separate the number and unit with a space; `"3years"` concatenated is a compilation error or a typo.

**Matches:**
- `"3 years"` → `3 years`
- `"1 year"` (singular) → `1 year`
- `"6 months"` → `6 months`
- `"90 days"` → `90 days`
- `"2 weeks"` → `2 weeks`
- `"24 hours"` → `24 hours`
- `"3 Years"` (capitalized) → matches via `/i`

**Rejects:**
- `"3years"` (no space) — no match
- `"years"` alone — no match
- `"3 year old"` — matches `3 year` (the `old` is left over), which is a mild false positive acceptable for paranoid tier

**ReDoS:** benign.

#### 10.4.8 `temporal.date-context-ko`

**Pattern:** see § 10.3. Variable-length lookbehind for Korean date labels (`계약일`, `체결일`, `시행일`, `효력발생일`, `만료일`, `종료일`, `발행일`, `작성일`, `기준일`) followed by either the Korean-full or Korean-short date form.

**Why two date forms in one rule.** The label-driven context is high-signal — if a label is present, the date format could be either form and we want to catch both. Splitting into two rules (`date-context-ko-full`, `date-context-ko-short`) would duplicate the label list.

**Variable-length lookbehind.** ES2018+. Same caveat as `financial.amount-context-ko` in § 9.4.10: supported in Node 18+, bounded performance (longest label is `효력발생일` at 5 characters).

**Matches:**
- `"계약일: 2024.3.15"` → `2024.3.15`
- `"체결일 2024년 3월 15일"` → `2024년 3월 15일`
- `"시행일: 2024-03-15"` → `2024-03-15`
- `"만료일: 2024.12.31"` → `2024.12.31`

**Rejects:**
- `"계약일"` alone (no date) — no match
- `"2024.3.15"` alone (no label) — no match (caught by `date-ko-short` separately)
- `"시간 2024.3.15"` (label `시간` not in list) — no match

**Level rationale:** Conservative. Label + valid date is the most reliable signal in the temporal category.

**Interaction with other temporal rules.** Context-labeled dates ALSO match `date-ko-full`, `date-ko-short`, or `date-iso` depending on form. Dedup collapses identical text. Higher-tier analytics downstream can see that a candidate fired on multiple rules as a confidence signal.

**ReDoS:** benign.

### 10.5 Test file specification (`rules/temporal.test.ts`)

Create `src/detection/rules/temporal.test.ts`. Per RULES_GUIDE § 8.1, minimum per-rule test set is 13 cases. Eight rules × 13 tests = **104 tests minimum**. Target ~115 tests to cover calendar validation edge cases (leap years, month-end days, timezone offsets).

**Organization:** mirror § 9.5 exactly. One `describe("TEMPORAL registry", …)` block with sanity tests (exports 8 rules, every id starts with `temporal.`, every pattern has the `g` flag, every rule has a non-empty description), then one `describe` per rule.

**Shared helpers (copy from § 9.5):**

```typescript
import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { TEMPORAL } from "./temporal.js";

function findRule(subcategory: string): RegexRule {
  const rule = TEMPORAL.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}
```

**Calendar validation tests (add to each date-rule block):**

```typescript
describe("temporal.date-ko-full", () => {
  // ... 10 other tests ...

  it("rejects Feb 30 via post-filter", () => {
    expect(matchOne("date-ko-full", "2024년 2월 30일")).toEqual([]);
  });

  it("accepts Feb 29 on a leap year", () => {
    expect(matchOne("date-ko-full", "2024년 2월 29일")).toEqual([
      "2024년 2월 29일",
    ]);
  });

  it("rejects Feb 29 on a non-leap year", () => {
    expect(matchOne("date-ko-full", "2023년 2월 29일")).toEqual([]);
  });

  it("rejects April 31", () => {
    expect(matchOne("date-ko-full", "2024년 4월 31일")).toEqual([]);
  });
});
```

Similar calendar-validity tests go in `date-ko-short`, `date-iso`, `date-en`, and `date-context-ko` describe blocks (each gets ~4 calendar tests in addition to the 13-minimum base set).

**ReDoS adversarial test per rule.** One per rule against a 10KB pathological input. Example for `date-ko-range` (the longest and most backtrack-prone pattern):

```typescript
it("is ReDoS-safe on long range-like input", () => {
  const input = "2024년 3월 15일부터 ".repeat(500) + "2024년 6월 30일까지";
  const start = Date.now();
  const matches = matchOne("date-ko-range", input);
  expect(Date.now() - start).toBeLessThan(100);
  void matches;
});
```

**Quality rubric:** every rule's test block must earn ★★★ per RULES_GUIDE § 8.3 — 3 positive, 3 variants, 3 rejects, minimum.

### 10.6 Registry integration

Extend `src/detection/_framework/registry.ts` to include TEMPORAL rules. The diff builds on the § 9 state:

```typescript
// Before (§ 9 state):
import { FINANCIAL } from "../rules/financial.js";
import { IDENTIFIERS } from "../rules/identifiers.js";

export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  ...FINANCIAL,
  // Phase 1 follow-up commits append:
  //   ...TEMPORAL  (§ 10)
  //   ...ENTITIES  (§ 11)
  //   ...LEGAL     (§ 13)
] as const;

// After (§ 10 commit):
import { FINANCIAL } from "../rules/financial.js";
import { IDENTIFIERS } from "../rules/identifiers.js";
import { TEMPORAL } from "../rules/temporal.js";

export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  ...FINANCIAL,
  ...TEMPORAL,
  // Phase 1 follow-up commits append:
  //   ...ENTITIES  (§ 11)
  //   ...LEGAL     (§ 13)
] as const;
```

Registry verification at module load catches any malformed rule. Same fail-fast semantics as § 9.6.

### 10.7 Acceptance checklist for § 10

- [ ] `src/detection/rules/temporal.ts` exists and exports `TEMPORAL: readonly RegexRule[]`
- [ ] `TEMPORAL.length === 8`
- [ ] Every rule's id starts with `"temporal."`
- [ ] Every rule has `category: "temporal"`
- [ ] Every rule's pattern has the `g` flag (rule 7 also has `i`)
- [ ] Five rules have `validNumericDate` or `validEnglishDate` post-filter: `date-ko-full`, `date-ko-short`, `date-iso`, `date-en`, `date-context-ko`
- [ ] `isValidCalendarDate` rejects Feb 30, April 31, June 31, Sept 31, Nov 31
- [ ] `isValidCalendarDate` accepts Feb 29 in leap years (2024, 2020, 2000)
- [ ] `isValidCalendarDate` rejects Feb 29 in non-leap years (2023, 2021, 1900)
- [ ] `isValidCalendarDate` rejects years outside 1900–2100
- [ ] `MONTH_NAME_TO_NUM` has 12 months plus 10 abbreviations (Jan/Feb/Mar/Apr/Jun/Jul/Aug/Sep/Sept/Oct/Nov/Dec — "May" has no abbreviation)
- [ ] `rules/temporal.test.ts` has ≥ 104 tests, all passing
- [ ] Every describe block earns ★★★ on the quality rubric
- [ ] Registry update: `ALL_REGEX_RULES` includes `...TEMPORAL` immediately after `...FINANCIAL`
- [ ] Registry verification passes at module load
- [ ] `bun run test src/detection/detect-pii.characterization.test.ts` still passes byte-for-byte
- [ ] `bun run test src/detection/detect-pii.integration.test.ts` still passes
- [ ] `bun run test` overall test count increases by ≥ 104 (temporal tests) + 4 (registry sanity tests) = ≥ 108 in this commit
- [ ] ReDoS guard fuzz passes for all 8 temporal rules
- [ ] No new npm dependencies
- [ ] No edits to any Phase 0 file other than `registry.ts`
- [ ] Rule 3 (`date-ko-range`) has NO post-filter (acknowledged limitation documented in § 10.4.3)
- [ ] Rule 6 (`duration-ko`) and Rule 7 (`duration-en`) have NO post-filter (no calendar semantics to validate)

---

## RESUME POINTER (for Claude in the next session)

**Status as of 2026-04-12 v5 (session +2 second half):** § 0–10 written. § 11–18 pending.

### What is already written (do NOT rewrite)

- **§ 0** — How to read this document, TOC (18 sections), locked-decisions table from the plan-eng-review
- **§ 1** — Mission statement (rulebook additive, zero legacy behavior change, 475–550 new tests, 22 new files)
- **§ 2** — Required reading (15 files, exact `cat` commands)
- **§ 3** — 21 invariants (includes fail-loud, strangler-fig, StructuralDefinition vs DefinedTerm disambiguation, original-byte recovery, no network, no deps, no src/propagation or src/docx changes)
- **§ 4** — Architecture (3-phase runner with ASCII diagram, strangler-fig API, engine.ts migration contract with new `nonPiiCandidates` shape)
- **§ 5** — File layout (22 new + 8 modified files, exact tree, `mkdir` commands)
- **§ 6** — Type extensions: confirms Phase 1 adds ZERO new exports to `types.ts`, enumerates the 10 Phase 0 exports, explains where each non-`types.ts` type lives (`runner.ts` / `detect-all.ts` / `engine.ts`), specs 3 new type-test assertions appended to `types.test.ts`, verification command that `git diff 187b7f8 -- src/detection/_framework/types.ts` is empty
- **§ 7** — Runner extensions: top-of-file JSDoc with ASCII diagram (authoritative copy of § 4.1), exact TypeScript for `shouldRunForLanguage` helper, `PhaseOptions` interface, `runRegexPhase` extended signature with private `runRegexPhaseOnMap` helper (Phase 0 body preserved), `runStructuralPhase` + private OnMap helper, `runHeuristicPhase` + private OnMap helper, `RunAllResult` / `RunAllOptions` / `runAllPhases` orchestrator, `registry.ts` diff to add `ALL_STRUCTURAL_PARSERS` + `ALL_HEURISTICS`, empty-array scaffolding for `rules/structural/index.ts` + `rules/heuristics/index.ts`, complete 44-test specification for `runner.test.ts` additions (groups A–E), 14-item acceptance checklist
- **§ 8** — `detect-all.ts` pipeline: public surface (8 exports), complete file content (~200 lines of TypeScript with full JSDoc), `engine.ts` `Analysis` shape extension contract with `NonPiiCandidate` interface, migration rules for `aggregatePii` → `aggregateAll` with ruleId-prefix partitioning, one new `engine.test.ts` test, 50-test specification for `detect-all.test.ts` (groups 1–4), 10-test specification for `detect-all.integration.test.ts`, 15-item acceptance checklist
- **§ 9** — `rules/financial.ts`: 10 regex rules (won-amount, won-unit, won-formal, usd-symbol, usd-code, foreign-symbol, foreign-code, percentage, fraction-ko, amount-context-ko); normalization assumption guide; complete file content with two post-filter helpers (wonAmountInRange, percentageInRange); per-rule deep dive for each of the 10 rules covering matches/variants/boundaries/rejects/ReDoS/level-rationale/known-false-positives; 130-test minimum plan with ★★★ quality rubric; `registry.ts` diff; 18-item acceptance checklist
- **§ 10** — `rules/temporal.ts`: 8 regex rules (date-ko-full, date-ko-short, date-ko-range, date-iso, date-en, duration-ko, duration-en, date-context-ko); `isValidCalendarDate` helper with Date constructor roll-over detection for leap years and month-specific day counts; `validNumericDate` + `validEnglishDate` post-filters with `MONTH_NAME_TO_NUM` table; per-rule deep dive for each of the 8 rules; 104-test minimum plan with calendar-validity tests (Feb 30, Feb 29 leap/non-leap, April 31); `registry.ts` diff; 21-item acceptance checklist

### What is pending (write in this order, across future sessions)

Each section estimate is rough. Total pending: ~2800 lines (§ 6–10 complete, approximately 2700 lines added across sessions +1 and +2).

| § | Content | Est. lines | Order |
|---|---|---:|---:|
| ~~6~~ | ~~Type extensions in `_framework/types.ts`~~ — **DONE session +1** | ~150 | ✓ |
| ~~7~~ | ~~Runner extensions — `runStructuralPhase`, `runHeuristicPhase`, `runAllPhases`, optional `{ language }` param~~ — **DONE session +1** | ~500 | ✓ |
| ~~8~~ | ~~`detect-all.ts` — `detectAll`, `detectAllInZip`, `buildAllTargetsFromZip`, Analysis shape extension~~ — **DONE session +1** | ~400 | ✓ |
| ~~9~~ | ~~`rules/financial.ts` — 10 regex rules (KRW × 3, USD × 2, foreign × 2, percentage, fraction, context scanner)~~ — **DONE session +2** | ~700 | ✓ |
| ~~10~~ | ~~`rules/temporal.ts` — 8 regex rules (Korean full/short/range dates, ISO, English date, Korean/English duration, label-driven date context)~~ — **DONE session +2** | ~550 | ✓ |
| 10 | `rules/temporal.ts` — 8 regex rules. Korean date (2024년 3월 15일, 2024.3.15), Korean short date, Korean date range, ISO date, English date, Korean duration (3년간, 6개월, 90일), English duration, temporal context scanner. | ~500 | Session +2 |
| 11 | `rules/entities.ts` — 12 regex rules. Korean corporate suffix (주식회사 X / X 주식회사 / (주)X), Korean legal forms (유한회사, 합자회사, 사단법인), Korean title+name (대표이사 김철수, 이사 박영희), English corporate suffix (Corp/Inc/LLC/Ltd/Co), English legal forms (GmbH/S.A./NV/PLC/Pty), English title+name (Mr./Dr./CEO + Name), Korean honorifics, identity context scanner. | ~700 | Session +2 |
| 12 | `rules/structural/` — 5 parsers. Each parser has its own .ts file with StructuralParser implementation + top-of-file JSDoc with rationale. definition-section (Korean + English), signature-block (By:, 이름:, 대표이사), party-declaration (first-para scan), recitals (WHEREAS, 전문), header-block (title, execution date, document number). Plus `index.ts` re-exporting `ALL_STRUCTURAL_PARSERS`. | ~900 | Session +3 |
| 13 | `rules/legal.ts` — 6 regex rules. Korean case number (`2024가합12345`, `2024다67890`, `2024노1234`, `2024도5678`), Korean court name (서울중앙지방법원, 대법원, 서울고등법원, etc.), Korean statute reference (제15조 제2항, 법률 제1234호, 민법 제750조), English case citation (`123 F.3d 456 (2d Cir. 2020)`), English statute (`Section 230`, `17 U.S.C. § 101`), legal context scanner. | ~400 | Session +3 |
| 14 | `rules/heuristics/` — 4 heuristics + 2 role blacklist data files. capitalization-cluster (English 2+ caps, consumes structuralDefinitions + priorCandidates + role blacklist), quoted-term ("X" / 'X' / 「X」 / 『X』 / 〈X〉), repeatability (frequency + role blacklist + definition awareness), email-domain-inference (legal@acme-corp.com → suggest "Acme Corp"). role-blacklist-ko.ts (50 words: 당사자, 갑, 을, 본인, 원고, 피고, 의뢰인, 회사, 법인, 개인, 상대방, ...). role-blacklist-en.ts (50 words: party, plaintiff, defendant, client, licensor, licensee, discloser, recipient, buyer, seller, ...). Plus `index.ts` re-exporting `ALL_HEURISTICS`. | ~700 | Session +3 |
| 15 | Testing requirements — per-file minimum counts table (475-550 new tests), ★★★ quality rubric reference, migration parity DOES NOT apply (Phase 1 is additive), coverage target ≥98% statements. | ~150 | Session +4 |
| 16 | TDD sequence — 18 steps (baseline / runner extensions / category files in order / integration test / engine.ts migration / final ship gate). Per-step commit messages with HEREDOC format. | ~600 | Session +4 |
| 17 | Verification commands — full ship gate including characterization test run (must still pass), new detect-all integration test, performance budget test, build determinism. | ~200 | Session +4 |
| 18 | Gotchas + out-of-scope + acceptance criteria (expected ~30) + handback contract + error handling (same 3-attempt rule as Phase 0). | ~500 | Session +4 |

**Total pending: ~5300 lines across 3-4 more Claude sessions.**

### Decisions locked during plan-eng-review (DO NOT RE-OPEN)

See `../document-redactor-private-notes/session-log-2026-04-11-v2.md` for the full review record. Summary:

| Ref | Decision | One-line rationale |
|---|---|---|
| **1.1A** | Strangler-fig — new `detect-all.ts`, legacy untouched, `engine.ts` migration in final commit | Preserves Phase 0 characterization T1–T18 ship gate byte-for-byte |
| **1.2A** | Rename `DefinedTerm` → `StructuralDefinition` in framework (done in commit 187b7f8) | Avoids name collision with `propagation/defined-terms.ts` |
| **1.3D** | Phase 1 is detection-only; UI redesign in separate brief after Phase 1 merge + empirical data | Rule quality validated on real contracts before UI groups are designed |
| **1.4E-1** | Fail-loud — no try/catch in runner/parser/heuristic invocation | Zero-miss invariant (design-v1 Lock-in #15), matches v1.0 behavior |
| **1.5** | ReDoS guard extended to structural parsers (100ms budget) and heuristics (100ms budget) in addition to regex rules (50ms) | Parsers/heuristics can have internal regexes with backtracking |
| **2.1** | `HeuristicContext` is the only context type (no `RegexContext` or `StructuralContext`) | DRY — regex phase is stateless, structural phase runs first with no context |
| **2.2** | File splits: financial/temporal/entities/legal are single files; structural/heuristics use subdirectory layout with `index.ts` aggregation | Keeps per-file LOC under ~500 without inventing abstractions for small files |
| **2.3** | Registry imports are explicit, not auto-discovered | Same pattern as Phase 0 registry.ts — explicit import + load-time verify |
| **2.4** | `stop-phrases.ts` stays untouched; TODO noted to consolidate with `role-blacklist-*` post-Phase-1 | Different purposes (keyword suggester noise vs heuristic role filter) |
| **2.5** | ASCII diagrams mandatory in top-of-file JSDoc for runner.ts and detect-all.ts | User engineering preference + design-v1 documentation standard |

### Plan-eng-review outputs (all resolved)

- Step 0: **Scope accepted** (complexity triggered at 22+ files but domain-appropriate for rulebook work)
- Architecture: **5 findings, all resolved** (1.1A / 1.2A / 1.3D / 1.4E-1 / 1.5)
- Code Quality: **5 findings, all inline** (2.1–2.5)
- Test Review: **475 planned tests, 0 gaps**, fail-loud convention in test harness
- Performance: **4 items**, perf-budget test added to verification commands
- NOT in scope: **10 items** documented
- What already exists: **12 reuse points**
- TODOs: **7 items** noted in session log
- Failure modes: **9 audited, 0 critical gaps**
- Parallelization: **4 lanes**, informational only (Codex is single-session)
- Lake Score: **10/10** (every choice chose the complete option)

### User insight captured and parked (UI add/remove UX)

During review, user flagged a critical product insight not yet addressed:

> "under cover 되서 유저가 키워드를 추가 하는 경우도 있는데 over cover되서 유저가 키워드를 빼야 하는 경우도 있어서..그것도 모두 화면+기능에 반영해주면 좋을거 같아. 디자인 구성을 잘해야 할듯.. 추가하는거 빼는거 잘 구분되게"

The insight is captured in the UI redesign brief scope (deferred per 1.3D). Draft UI structure (category-grouped sections with `[+ 추가]` per category, confidence-sorted "추측" section, over/under cover visual distinction) is sketched in session log 2026-04-11-v2 § "Finding 1.3 — user insight" for the future UI redesign brief.

Phase 1 brief does NOT address UI. It only ensures `engine.ts` adds `nonPiiCandidates` so a future UI can render what's there.

### Next session startup checklist

1. Open this file and confirm the "PARTIAL DRAFT" warning is still at the top — it should now say "§ 0–10 written".
2. Read `../document-redactor-private-notes/session-log-2026-04-11-v2.md` for the full review context.
3. Read the 4 external feedback files in repo root (`ChatGPT 5.4 Pro Feedback_1.md`, `_2.md`, `Codex Feedback.md`) — these are the quality bar for rule authoring, especially for § 11–14 per-category rule drafting.
4. Verify `git log --oneline -7` shows the session-+1 and session-+2 commits adding § 6–10 after `e41d842 docs(phases): start phase-1 rulebook brief §0-5 (PARTIAL DRAFT)`.
5. Verify `bun run test` still shows 422 passing (Phase 0 has not been executed by Codex yet — these are still the v1.0 legacy tests).
6. Start writing § 11 (`rules/entities.ts` — 12 regex rules, ~700 lines) → § 12 (structural parsers, ~900) → § 13 (legal, ~400) → § 14 (heuristics + role blacklists, ~700). Model every section on § 9 / § 10 structure (overview table, normalization notes, full file content, per-rule deep dive, test spec, registry diff, acceptance checklist). Structural parsers and heuristics have slightly different shapes — see RULES_GUIDE § 5 (parser writeup) and § 6 (heuristic writeup) before starting § 12 and § 14.
7. After each section: `wc -l docs/phases/phase-1-rulebook.md`, commit with a message like `docs(phases): phase-1 brief § 11 entities rules (partial)`.
8. Continue across sessions until every section is written, then remove the "PARTIAL DRAFT" warning at the top as the final commit of the brief-authoring stream.

### Do NOT in future sessions

- Do NOT re-run plan-eng-review on this brief. The review is complete.
- Do NOT rewrite § 0–10. They are locked. § 6–8 specify exact TypeScript for the framework extension surface. § 9 specifies exact regex sources for the 10 financial rules. § 10 specifies exact regex sources for the 8 temporal rules plus the `isValidCalendarDate` / `validNumericDate` / `validEnglishDate` post-filters. Do not "improve", "tune", rename, or refactor any of these without a ReDoS re-audit and a plan-eng-review re-opener.
- Do NOT hand the brief to Codex until the "PARTIAL DRAFT" warning is removed.
- Do NOT commit Phase 1 content changes to `src/` in the same session as brief authoring. This is a doc-only stream until the brief is complete.
- Do NOT modify the Phase 0 brief again after commit 187b7f8. It is locked for Codex execution.

---

<!-- END OF PARTIAL DRAFT -->
<!-- Pending sections will be authored in future sessions starting at the RESUME POINTER above. -->

