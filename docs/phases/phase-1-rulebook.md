# Phase 1 — Comprehensive rulebook (Codex delegation brief)

> ⚠️ **PARTIAL DRAFT — DO NOT EXECUTE** ⚠️
>
> This brief is **incomplete** as of 2026-04-11 21:40 KST. Only § 0–5 are written
> (orientation, mission, invariants, architecture, file layout). The rule content
> (§ 6–18 including all TypeScript specs, regex sources, test cases, TDD sequence,
> and acceptance criteria) is **NOT YET AUTHORED**.
>
> **Do NOT hand this to Codex for execution in its current state.** Codex would
> read the file-layout section, fail to find rule specifications, and produce
> garbage code trying to fill in the gaps.
>
> **If you are Claude in a future session:** jump to the `## RESUME POINTER` section
> at the very bottom of this file. It tells you exactly where to pick up writing.
>
> **If you are the user:** this file will be completed across 2–3 more Claude
> sessions. Decisions are locked (see session log 2026-04-11-v2). The next step is
> writing § 6–8 (framework code specs) followed by § 9–14 (the rulebook itself).

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

*[This brief continues with § 6 through § 18 in subsequent sections. The remaining ~5300 lines embed exact TypeScript for type extensions, runner extensions, detect-all.ts, and every rule/parser/heuristic with full JSDoc + regex + test cases. The brief is authored across multiple Claude sessions to manage token budgets, but you — the Codex agent — should only read and execute this brief once it is COMPLETE (no `PARTIAL DRAFT` warning at the top).]*

---

## RESUME POINTER (for Claude in the next session)

**Status as of 2026-04-11 21:40 KST:** 506 lines written, sections § 0–5 complete.

### What is already written (do NOT rewrite)

- **§ 0** — How to read this document, TOC (18 sections), locked-decisions table from the plan-eng-review
- **§ 1** — Mission statement (rulebook additive, zero legacy behavior change, 475–550 new tests, 22 new files)
- **§ 2** — Required reading (15 files, exact `cat` commands)
- **§ 3** — 21 invariants (includes fail-loud, strangler-fig, StructuralDefinition vs DefinedTerm disambiguation, original-byte recovery, no network, no deps, no src/propagation or src/docx changes)
- **§ 4** — Architecture (3-phase runner with ASCII diagram, strangler-fig API, engine.ts migration contract with new `nonPiiCandidates` shape)
- **§ 5** — File layout (22 new + 8 modified files, exact tree, `mkdir` commands)

### What is pending (write in this order, across future sessions)

Each section estimate is rough. Total pending: ~5300 lines.

| § | Content | Est. lines | Order |
|---|---|---:|---:|
| 6 | Type extensions in `_framework/types.ts` — Phase 0 already has all types; § 6 just confirms no new type additions, shows the exact file state after Phase 0, clarifies that `StructuralDefinition` / `StructuralParser` / `Heuristic` / `HeuristicContext` are already defined (only `runner.ts` needs extensions) | ~150 | Session +1 |
| 7 | Runner extensions — exact TypeScript for `runStructuralPhase`, `runHeuristicPhase`, `runAllPhases`, optional `{ language }` param wiring in `runRegexPhase`. Includes the ASCII diagram from § 4 as a top-of-file comment. | ~500 | Session +1 |
| 8 | `detect-all.ts` — full TypeScript for `detectAll`, `detectAllInZip`, `buildAllTargetsFromZip`. Analysis shape extension contract for `engine.ts` (adds `nonPiiCandidates` field, migration rules). | ~400 | Session +1 |
| 9 | `rules/financial.ts` — 10 regex rules with JSDoc + regex source + test cases embedded. Financial KRW (won-amount, won-unit, won-formal), USD (`$50,000`, `USD 50,000`), foreign (EUR, JPY, GBP, CNY), percentage, fraction (3분의 1), context scanner. | ~600 | Session +2 |
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

1. Open this file, jump to line 506 (end of § 5), confirm the "PARTIAL DRAFT" warning is still at the top.
2. Read `../document-redactor-private-notes/session-log-2026-04-11-v2.md` for the full review context.
3. Read the 4 external feedback files in repo root (`ChatGPT 5.4 Pro Feedback_1.md`, `_2.md`, `_3.md`, `Codex Feedback.md`) — these are the quality bar for rule authoring.
4. Verify `git log --oneline -3` shows `187b7f8 docs(phases): rename framework DefinedTerm` as the most recent Phase 0 brief change.
5. Verify `bun run test` shows 422 passing (Phase 0 has not been executed by Codex yet — these are still the v1.0 legacy tests).
6. Start writing § 6 (types — short, just confirms Phase 0 state is sufficient) → § 7 (runner extensions — ~500 lines of exact TypeScript) → § 8 (detect-all.ts — ~400 lines).
7. After each section: `wc -l docs/phases/phase-1-rulebook.md`, commit with message like `docs(phases): phase-1 brief § 6-8 framework extensions (partial)` or similar.
8. Continue across sessions until the "PARTIAL DRAFT" warning at the top can be removed.

### Do NOT in future sessions

- Do NOT re-run plan-eng-review on this brief. The review is complete.
- Do NOT rewrite § 0–5. They are locked.
- Do NOT hand the brief to Codex until the "PARTIAL DRAFT" warning is removed.
- Do NOT commit Phase 1 content changes to `src/` in the same session as brief authoring. This is a doc-only stream until the brief is complete.
- Do NOT modify the Phase 0 brief again after commit 187b7f8. It is locked for Codex execution.

---

<!-- END OF PARTIAL DRAFT -->
<!-- Pending sections will be authored in future sessions starting at the RESUME POINTER above. -->

