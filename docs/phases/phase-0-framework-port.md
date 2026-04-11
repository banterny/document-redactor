# Phase 0 — Rule framework port (Codex delegation brief)

**For:** Codex 5.4 xhigh (or any capable autonomous coding agent with filesystem + bash access)
**Project:** document-redactor
**Branch:** `main`
**Starting commit:** `74dfb2c` (v1.0.0 release)
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`
**Date written:** 2026-04-10
**Author of brief:** Claude Opus 4.6 at user's request

---

## 0. How to read this document

This is a **self-contained task specification**. Read the whole thing before touching any code. Every decision has already been made — your job is to execute, not to re-debate.

Sections in this document:

1. Mission statement (one paragraph — the point of all this)
2. Required reading (files you MUST read before writing code)
3. Invariants (hard constraints you MUST NOT violate)
4. Architecture (already decided, do not re-open)
5. File layout (exact tree you will create)
6. Type definitions (exact TypeScript for `_framework/types.ts`)
7. The 8 rules to port (exact spec for each)
8. Migration strategy (how the old code becomes thin shims)
9. Runner implementation (exact TypeScript for `_framework/runner.ts`)
10. Language detector (exact TypeScript for `_framework/language-detect.ts`)
11. Registry (exact TypeScript for `_framework/registry.ts`)
12. Luhn extraction (moving existing code to a dedicated file)
13. TDD sequence (13 steps, do them in order)
14. Testing requirements (minimum test sets, quality rubric)
15. Verification commands (ship gate)
16. Commit conventions
17. Gotchas (non-obvious constraints that will trip you up)
18. Out of scope (DO NOT DO)
19. Acceptance criteria (how we know you're done)
20. Handback contract (what you produce when finished)
21. Error handling (what to do when you get stuck)

If you feel an impulse to deviate from this brief — stop. The user specifically wrote this document because they want consistency across Phase 0, 1, 2, 3, 4. Deviation here creates drift that hurts every later phase.

---

## 1. Mission statement

Port the existing Lane A PII detection code (currently in `src/detection/patterns.ts` + `src/detection/detect-pii.ts`) into a new rule framework (`src/detection/_framework/` + `src/detection/rules/identifiers.ts`) **without changing any observable behavior**. The 422 existing tests must continue to pass after your work, and the worst-case fixture integration test must produce byte-identical output compared to v1.0.

**This is a refactor + structural reorganization, not a feature addition.** No new detection capabilities will exist after you finish. The purpose is to establish the framework scaffolding that Phase 1, 2, 3, and 4 will add new rules on top of. Phase 0 is plumbing; the plumbing has to work perfectly before anything flows through it.

Expected deliverables: ~10 new files, ~2 modified files, ~100-150 new test cases, 8-12 commits, zero regressions, zero new npm dependencies.

---

## 2. Required reading (in order)

You MUST read these files before writing any code. If any of them contradict each other, the order here determines precedence: earlier entries win.

1. **`docs/RULES_GUIDE.md`** (1172 lines) — the binding convention spec for rule authoring. Especially:
   - § 3 Rule shapes (three shapes: RegexRule / StructuralParser / Heuristic — you will define all three in `types.ts` but only implement RegexRule processing in the runner)
   - § 4 Writing a regex rule (10-step walkthrough — follow it)
   - § 7 ReDoS audit checklist (you will add an automated fuzz test)
   - § 8 Testing convention (minimum test sets per rule)
   - § 9 Dedup and boundary semantics
   - § 10 Level/tier mapping (all `identifiers` rules get `["conservative", "standard", "paranoid"]`)
   - § 11 Language handling (you will implement `detectLanguage` but NOT wire it into the runner in Phase 0 — see § 9 of this brief for why)
   - § 13.1 v1.0 ported rules table (the 8 rules you are porting)

2. **`src/detection/patterns.ts`** (93 lines) — the current rule registry. Top-of-file comment is the mini-guide. Each pattern is documented with its rationale. The 8 rules you port come from here.

3. **`src/detection/detect-pii.ts`** (161 lines) — the current runner. Understand this pipeline before touching anything:
   - `detectPii(text)` — normalize → for each kind, clone regex → exec loop → Luhn check for cards → recover original bytes via offset map → push `DetectedMatch`
   - `detectPiiInZip(zip)` — walks scopes, runs detectPii per scope
   - `buildTargetsFromZip(zip)` — dedupes via `Set<string>`, returns longest-first sorted array

4. **`src/detection/normalize.ts`** (206 lines) — especially `normalizeForMatching(text): PositionMap` (line 128). You MUST use this for position-preserving matching. The offset map is the bridge from normalized-space regex matches back to original-space bytes.

5. **`src/detection/patterns.test.ts`** (existing tests for the 8 patterns) — your new `rules/identifiers.test.ts` should include every test case from here (adapted to the new shape), plus additions per RULES_GUIDE § 8.1.

6. **`src/detection/detect-pii.test.ts`** — the behavioral tests for `detectPii()`. Do not modify. Your refactored `detect-pii.ts` must make every one of these pass.

7. **`src/detection/detect-pii.integration.test.ts`** — the worst-case fixture integration test. This is THE ship gate for Phase 0. Do not modify it. Your refactor must make it pass with byte-identical output.

8. **`src/detection/extract-text.ts`** — the scope walker. You do not modify this, but understand that `detectPiiInZip` and `buildTargetsFromZip` depend on it.

9. **`tsconfig.json`** — note especially:
   - `allowImportingTsExtensions: true` — imports must use `.js` extension even though source files are `.ts`
   - `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }` syntax
   - `noUncheckedIndexedAccess: true` — array access is `T | undefined`, you'll need `!` or checks
   - `exactOptionalPropertyTypes: true` — optional fields must be omitted or explicitly undefined, not both

10. **`../document-redactor-private-notes/design-v1.md`** § "Eng Review Lock-in" #1-#15 (especially #2 Round-trip verification, #3 Unicode normalization, #10 Code quality, #11 Readability, #13 ReDoS). These are binding invariants. Your framework must not violate them.

Commands to read these files quickly:

```bash
cat docs/RULES_GUIDE.md | head -400         # first half
cat docs/RULES_GUIDE.md | tail -800         # second half
cat src/detection/patterns.ts
cat src/detection/detect-pii.ts
cat src/detection/normalize.ts
cat src/detection/patterns.test.ts
cat src/detection/detect-pii.test.ts
cat src/detection/detect-pii.integration.test.ts
cat tsconfig.json
```

---

## 3. Invariants (DO NOT VIOLATE)

These are non-negotiable. Each violation fails the phase.

1. **All 422 existing tests must still pass** when you finish. `bun run test` must show `Tests 422 passed (422)` PLUS your new tests (expected total: 520-580). If even one existing test breaks, you have regressed. Do NOT skip tests, do NOT mark them as `it.skip`, do NOT suppress them.

2. **No changes to `src/docx/`, `src/finalize/`, `src/propagation/`, `src/ui/`, `src/ui/engine.ts`.** The framework is a refactor of Lane A (detection) ONLY. All other lanes are downstream consumers via `buildTargetsFromZip()` and must not be touched. If you feel tempted to "improve" something in another lane, STOP — that's out of scope.

3. **No changes to `package.json` dependencies.** Do not add any npm package. No `safe-regex`, no `regexp-tree`, no `@types/*`. The framework is pure TypeScript using only what's already in `node_modules/`.

4. **No changes to Vite config, ESLint config, tsconfig.json, svelte.config.js.** If TypeScript or ESLint complain about your code, fix your code, not the config.

5. **`buildTargetsFromZip(zip)` must return the same `string[]` for the worst-case fixture** as it does on commit `74dfb2c`. This is THE ship gate. It is locked in by the T18 fixture snapshot test (characterization test added in Step 2, verified post-port in Step 15). The legacy integration test at `src/detection/detect-pii.integration.test.ts` remains a secondary check. Verify both explicitly as part of the Step 15 full ship gate.

6. **The framework is self-contained within `src/detection/`.** No imports from `src/docx/`, `src/finalize/`, `src/propagation/`, `src/ui/`. The only external dep is `jszip` (already used by `extractTextFromZip`).

7. **Do not delete `src/detection/patterns.ts` or `src/detection/detect-pii.ts`** in this phase. They become thin re-export shims that source from the new framework (see § 8 Migration strategy). Deletion is a future phase's decision.

8. **Do not `git push`.** Commit locally only. The user reviews and pushes.

9. **Do not modify `tests/fixtures/bilingual_nda_worst_case.docx`** or any file under `tests/fixtures/`. Regenerating fixtures is out of scope.

10. **Do not add network code.** `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, dynamic `import()`, `navigator.sendBeacon` are ESLint-banned and will fail the lint step.

11. **Use `import type` for type-only imports.** `verbatimModuleSyntax: true` enforces this. Example: `import type { RegexRule } from "./types.js"` — note the `type` keyword.

12. **Use `.js` extension in imports** even though source files are `.ts`. Example: `from "./types.js"` not `from "./types"` or `from "./types.ts"`.

13. **The `detect-pii.ts` legacy shim MUST pass `IDENTIFIERS` to `runRegexPhase`, NOT `ALL_REGEX_RULES`.** This invariant is easy to violate during a "DRY cleanup" refactor in Phase 1+ when other categories are added to the registry. If the shim starts using `ALL_REGEX_RULES`, the legacy public API `DetectedMatch.kind: PiiKind` silently expands to include non-PII categories, breaking every downstream consumer that pattern-matches on `PiiKind`. A characterization test (§ 12a) asserts this invariant — do not disable that test.

14. **⚠️ PASSING THE EXISTING 422 TESTS IS NECESSARY BUT NOT SUFFICIENT. ⚠️** The current test suite does NOT lock down several dimensions the brief demands: exact rule output order, exact `PiiKind↔subcategory` bijection, exact regex `.source`/`.flags` parity, exact `buildTargetsFromZip` fixture array, fullwidth card Luhn parity, and no-language-filter behavior. The characterization tests added in **TDD Step 2** (§ 12a) are the REAL ship gate. Phase 0 is accepted only when BOTH the 422 legacy tests AND all characterization tests pass on the ported code. If you're tempted to merge because "all green", go re-read § 12a and check that every test there is present and passing.

---

## 4. Architecture (decided — do not re-debate)

The architecture is **Hybrid** as documented in `docs/RULES_GUIDE.md` § 3. Three rule shapes:

- **`RegexRule`** — 80% of rules in future phases, 100% of Phase 0 rules. Has a `pattern: RegExp` data field, optional `postFilter`, and metadata (category, subcategory, levels, languages, description). The runner handles normalization, exec loop, original-byte recovery, post-filter application.

- **`StructuralParser`** — position-dependent, outputs `StructuralDefinition[]` not `Candidate[]`. NOT implemented in Phase 0. Only the TypeScript interface is defined, so Phase 1/Phase 2 can start without another type round.

  **Naming note:** the type is `StructuralDefinition`, NOT `DefinedTerm`. A separate concept called `DefinedTerm` already exists at [src/propagation/defined-terms.ts](../src/propagation/defined-terms.ts) for Lane C's D9 role-word classifier (classifying seed-propagated aliases like "the Buyer" / "매수인" / "갑"). The framework type is a STRUCTURAL parser output (from definition sections / recitals / party declarations) — a different concept that needs a different name. Do not collapse them.

- **`Heuristic`** — fuzzy, confidence-scored, context-aware. NOT implemented in Phase 0. Interface only.

**Phase 0 exercises only `RegexRule`. But you MUST define all three interfaces in `types.ts` so future phases do not require another type-definition round.**

**There is no `priority: number` field in any rule type.** The runner uses phases (structural → regex → heuristics), not per-rule priority. Do not add a priority field. If you see one in an older draft somewhere, ignore it — it was removed during scope reduction.

**There is no `RuleContext` type.** `HeuristicContext` exists (as a parameter type for Heuristic.detect), but RegexRule has no context because it's stateless. Do not create a generic RuleContext.

**There is no rule-registry auto-discovery.** The registry file (`_framework/registry.ts`) explicitly imports every category file and concatenates their exports. No directory scanning, no dynamic imports.

---

## 5. File layout (exact tree you will create)

Create exactly these files under `src/detection/`. Do not create additional files. Do not rename files.

```
src/detection/
├── _framework/                                        ← NEW DIRECTORY
│   ├── types.ts                                       ← NEW (§ 6 of this brief)
│   ├── types.test.ts                                  ← NEW (§ 14 of this brief)
│   ├── language-detect.ts                             ← NEW (§ 10 of this brief)
│   ├── language-detect.test.ts                        ← NEW
│   ├── runner.ts                                      ← NEW (§ 9 of this brief)
│   ├── runner.test.ts                                 ← NEW
│   ├── registry.ts                                    ← NEW (§ 11 of this brief)
│   └── redos-guard.test.ts                            ← NEW (§ 14 of this brief)
│
├── rules/                                             ← NEW DIRECTORY
│   ├── identifiers.ts                                 ← NEW (§ 7 of this brief)
│   ├── identifiers.test.ts                            ← NEW
│   ├── luhn.ts                                        ← NEW (§ 12 of this brief)
│   └── luhn.test.ts                                   ← NEW
│
├── normalize.ts                                       ← UNCHANGED
├── normalize.test.ts                                  ← UNCHANGED
├── extract-text.ts                                    ← UNCHANGED
├── extract-text.test.ts                               ← UNCHANGED
├── stop-phrases.ts                                    ← UNCHANGED
├── stop-phrases.test.ts                               ← UNCHANGED
├── suggest-keywords.ts                                ← UNCHANGED
├── suggest-keywords.test.ts                           ← UNCHANGED
├── patterns.ts                                        ← MODIFIED (§ 8 of this brief)
├── patterns.test.ts                                   ← UNCHANGED
├── detect-pii.ts                                      ← MODIFIED (§ 8 of this brief)
├── detect-pii.test.ts                                 ← UNCHANGED
└── detect-pii.integration.test.ts                     ← UNCHANGED
```

**Count:**
- New files: 12 (types.ts + types.test.ts + language-detect.ts + language-detect.test.ts + runner.ts + runner.test.ts + registry.ts + redos-guard.test.ts + identifiers.ts + identifiers.test.ts + luhn.ts + luhn.test.ts)
- Modified files: 2 (patterns.ts, detect-pii.ts)
- Unchanged files: everything else (including all tests for unchanged files)

**Create the directories first:**

```bash
mkdir -p src/detection/_framework src/detection/rules
```

---

## 6. Type definitions (exact TypeScript for `_framework/types.ts`)

Put this content EXACTLY into `src/detection/_framework/types.ts`. Do not add fields, do not remove fields, do not reorder (reordering causes diff noise).

```typescript
/**
 * Rule framework types — Phase 0.
 *
 * Defines the three rule shapes (RegexRule, StructuralParser, Heuristic) plus
 * supporting types (Candidate, StructuralDefinition, Level, Language, HeuristicContext).
 *
 * See docs/RULES_GUIDE.md § 3 for the rationale behind having three shapes
 * instead of one unified interface.
 *
 * Phase 0 exercises only RegexRule. StructuralParser and Heuristic are defined
 * here for forward compatibility with Phase 2 and Phase 4; their runners will
 * be added in those phases.
 */

/** UI tier per design-v1.md § Eng Review Lock-in #4. */
export type Level = "conservative" | "standard" | "paranoid";

/** Language a rule applies to. "universal" = runs regardless of document language. */
export type Language = "ko" | "en" | "universal";

/** All rule categories per docs/RULES_GUIDE.md § 2. */
export type Category =
  | "identifiers"
  | "financial"
  | "temporal"
  | "entities"
  | "structural"
  | "heuristics"
  | "legal";

/**
 * Post-filter receives the normalized matched string and returns true to keep
 * the match, false to reject (false positive). Example: Luhn check for credit
 * cards. Post-filters must be pure functions — no I/O, no state, no mutation.
 */
export type PostFilter = (normalizedMatch: string) => boolean;

/**
 * A regex-based detection rule. The runner handles normalization, exec loop,
 * original-byte recovery via offset map, and post-filter application.
 *
 * Invariants (enforced at registration time in registry.ts):
 *   - `pattern.flags` must include "g"
 *   - `pattern` must be bounded (see docs/RULES_GUIDE.md § 7 ReDoS checklist)
 *   - `levels` and `languages` must be non-empty arrays
 *   - `id` must be unique across all categories
 *   - `category` excludes "structural" and "heuristics" (those shapes have
 *     different interfaces in this file)
 */
export interface RegexRule {
  /** Dotted id: "{category}.{subcategory}". Unique across all rules. */
  readonly id: string;
  readonly category: Exclude<Category, "structural" | "heuristics">;
  readonly subcategory: string;
  /** Must have the `g` flag. Cloned per call to avoid lastIndex pollution. */
  readonly pattern: RegExp;
  /** Optional false-positive rejection applied to the NORMALIZED match. */
  readonly postFilter?: PostFilter;
  readonly levels: readonly Level[];
  readonly languages: readonly Language[];
  /** One-line human summary. Surfaces in audit log + rule catalog. */
  readonly description: string;
}

/**
 * Structured context extracted by a StructuralParser. Used by later phases
 * (heuristics) for D9 defined-term awareness and role classification.
 *
 * IMPORTANT naming: this type is `StructuralDefinition`, not `DefinedTerm`.
 * A separate `DefinedTerm` concept already exists at
 * `src/propagation/defined-terms.ts` for Lane C's role-word classifier
 * (matches tokens like "the Buyer" / "매수인" / "갑" from seed propagation).
 * That is NOT this type. Keep the two distinct.
 */
export interface StructuralDefinition {
  /** The label used in the document: "the Buyer", "매수인", "'갑'" */
  readonly label: string;
  /** The entity the label refers to: "ABC Corporation", "사과회사" */
  readonly referent: string;
  readonly source: "definition-section" | "recitals" | "party-declaration";
}

/**
 * Position-dependent parser. Runs BEFORE regex rules and heuristics. Output
 * is used as context for heuristics. Not implemented in Phase 0 — interface
 * only. Phase 2 will add the first implementations.
 */
export interface StructuralParser {
  readonly id: string;
  readonly category: "structural";
  readonly subcategory: string;
  readonly languages: readonly Language[];
  readonly description: string;
  parse(normalizedText: string): readonly StructuralDefinition[];
}

/**
 * A single detection result. Regex rules emit these with confidence 1.0.
 * Heuristics emit them with confidence < 1.0 based on signal strength.
 */
export interface Candidate {
  /** Original bytes (NOT normalized). Literal string for the redactor. */
  readonly text: string;
  /** Provenance: which rule fired this candidate. Dotted id from the rule. */
  readonly ruleId: string;
  /** 0..1. Regex rules = 1.0. Heuristics vary. */
  readonly confidence: number;
}

/**
 * Input context passed to Heuristic.detect(). Heuristics consume:
 *  - structuralDefinitions (from structural phase) to skip D9 defined labels
 *  - priorCandidates (from regex phase) to avoid double-counting
 *  - documentLanguage (from runner) to filter role blacklists
 */
export interface HeuristicContext {
  readonly structuralDefinitions: readonly StructuralDefinition[];
  readonly priorCandidates: readonly Candidate[];
  readonly documentLanguage: "ko" | "en" | "mixed";
}

/**
 * Fuzzy / context-aware detection rule. Not implemented in Phase 0 — interface
 * only. Phase 4 will add the first implementations.
 */
export interface Heuristic {
  readonly id: string;
  readonly category: "heuristics";
  readonly subcategory: string;
  readonly languages: readonly Language[];
  readonly levels: readonly Level[];
  readonly description: string;
  detect(normalizedText: string, context: HeuristicContext): readonly Candidate[];
}
```

### Notes on the types

- **`Category`** exists for TypeScript exhaustiveness. `RegexRule.category` deliberately excludes `"structural"` and `"heuristics"` via `Exclude<Category, "structural" | "heuristics">`. This prevents writing `{ category: "structural", pattern: /.../ }` which would be a shape confusion.
- **`PostFilter`** is a named type alias (not inlined) so it can be reused and documented in one place.
- **No `priority: number` field.** The runner orchestrates phases, not per-rule priority.
- **No runner state.** Every rule is stateless. State lives in the runner's local variables per call.
- **All `readonly`**, all fields. Immutability is enforced at the type level to prevent accidental mutation during the exec loop.

---

## 7. The 8 rules to port (exact spec for `rules/identifiers.ts`)

Create `src/detection/rules/identifiers.ts` with exactly this content. Every rule must match the spec byte-for-byte — the regex source, flags, metadata fields. The current `patterns.ts` regex is the source of truth for `pattern`; the metadata below is new and prescribed.

```typescript
/**
 * Identifiers category — fixed-structure PII.
 *
 * Ported from the v1.0 Lane A `patterns.ts` registry. Each rule below matches
 * the current patterns.ts regex byte-for-byte. The structure around them is
 * new: explicit RegexRule type, category metadata, level/language declarations.
 *
 * See docs/RULES_GUIDE.md § 13.1 for the mapping table.
 */

import type { RegexRule } from "../_framework/types.js";

import { luhnCheck } from "./luhn.js";

export const IDENTIFIERS: readonly RegexRule[] = [
  {
    id: "identifiers.korean-rrn",
    category: "identifiers",
    subcategory: "korean-rrn",
    pattern: /(?<!\d)\d{6}-[1-8]\d{6}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean resident registration number (주민등록번호), 6-7 hyphenated form with gender code 1-8",
  },
  {
    id: "identifiers.korean-brn",
    category: "identifiers",
    subcategory: "korean-brn",
    pattern: /(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean business registration number (사업자등록번호), 3-2-5 hyphenated form",
  },
  {
    id: "identifiers.us-ein",
    category: "identifiers",
    subcategory: "us-ein",
    pattern: /(?<!\d)\d{2}-\d{7}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["en"],
    description: "US Employer Identification Number, 2-7 hyphenated form",
  },
  {
    id: "identifiers.phone-kr",
    category: "identifiers",
    subcategory: "phone-kr",
    pattern: /(?<!\d)01[016-9]-?\d{3,4}-?\d{4}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description: "Korean mobile phone (010/011/016-019), dashed or dashless",
  },
  {
    id: "identifiers.phone-intl",
    category: "identifiers",
    subcategory: "phone-intl",
    pattern: /(?<![\w+])\+\d{1,3}(?:[\s-]\d{1,4}){2,4}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description: "International phone number with + country code prefix",
  },
  {
    id: "identifiers.email",
    category: "identifiers",
    subcategory: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description: "Email address, bounded form with 2+ letter TLD",
  },
  {
    id: "identifiers.account-kr",
    category: "identifiers",
    subcategory: "account-kr",
    pattern: /(?<!\d)\d{3,6}-\d{2,3}-\d{4,7}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean bank account number, canonical 3-6 / 2-3 / 4-7 hyphenated form",
  },
  {
    id: "identifiers.credit-card",
    category: "identifiers",
    subcategory: "credit-card",
    pattern: /(?<![\d-])\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d-])/g,
    postFilter: luhnCheck,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["universal"],
    description: "Credit card, 16 digits in 4 groups, Luhn-validated",
  },
] as const satisfies readonly RegexRule[];
```

### Rule-to-old-PiiKind mapping (critical for the shim in § 8)

| New rule id | Old PiiKind | Notes |
|---|---|---|
| `identifiers.korean-rrn` | `rrn` | subcategory differs from kind |
| `identifiers.korean-brn` | `brn` | subcategory differs from kind |
| `identifiers.us-ein` | `ein` | subcategory differs from kind |
| `identifiers.phone-kr` | `phone-kr` | subcategory matches kind |
| `identifiers.phone-intl` | `phone-intl` | subcategory matches kind |
| `identifiers.email` | `email` | subcategory matches kind |
| `identifiers.account-kr` | `account-kr` | subcategory matches kind |
| `identifiers.credit-card` | `card` | subcategory differs from kind |

You will need this mapping table as a `Record<PiiKind, string>` in the migrated `patterns.ts` (§ 8).

### Why all rules get `["conservative", "standard", "paranoid"]`

Per `docs/RULES_GUIDE.md` § 10.2, the `identifiers` category is "always on" at every tier — these are PII, they should be redacted regardless of user tier selection. This does NOT change observable behavior vs v1.0 (which had no tier filtering at all, so it effectively ran every rule always).

---

## 8. Migration strategy (making the old files into thin shims)

The goal is **zero behavior change** on the existing public APIs (`detectPii`, `detectPiiInZip`, `buildTargetsFromZip`, `PiiKind`, `PII_KINDS`, `PII_PATTERNS`) while making them source from the new framework underneath.

### 8.1 New `patterns.ts` (rewritten but API-compatible)

Replace the current content of `src/detection/patterns.ts` with:

```typescript
/**
 * PII regex patterns — Lane A legacy export surface.
 *
 * This file preserves the v1.0 public API (PiiKind, PII_KINDS, PII_PATTERNS)
 * so that existing callers (especially patterns.test.ts) keep working. The
 * actual rule definitions now live in `rules/identifiers.ts` as part of the
 * new rule framework; this file derives the old types from those.
 *
 * Phase 0 kept this shim to avoid a big-bang migration. A future phase may
 * delete this file and update callers to import from `rules/identifiers.ts`
 * directly.
 */

import type { RegexRule } from "./_framework/types.js";

import { IDENTIFIERS } from "./rules/identifiers.js";

export type PiiKind =
  | "rrn"
  | "brn"
  | "ein"
  | "phone-kr"
  | "phone-intl"
  | "email"
  | "account-kr"
  | "card";

/** Stable, iterable list of all kinds — used by detect-pii and tests. */
export const PII_KINDS = [
  "rrn",
  "brn",
  "ein",
  "phone-kr",
  "phone-intl",
  "email",
  "account-kr",
  "card",
] as const satisfies ReadonlyArray<PiiKind>;

/**
 * Mapping from legacy PiiKind to the new framework's rule subcategory.
 * Used by the shim to locate a rule by its old kind name.
 */
const KIND_TO_SUBCATEGORY: Record<PiiKind, string> = {
  rrn: "korean-rrn",
  brn: "korean-brn",
  ein: "us-ein",
  "phone-kr": "phone-kr",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  card: "credit-card",
};

function findRule(kind: PiiKind): RegexRule {
  const subcategory = KIND_TO_SUBCATEGORY[kind];
  const rule = IDENTIFIERS.find((r) => r.subcategory === subcategory);
  if (!rule) {
    throw new Error(
      `Internal: no rule registered for PiiKind "${kind}" (subcategory "${subcategory}")`,
    );
  }
  return rule;
}

/**
 * The regex registry. Same shape as v1.0 for backward compatibility, but the
 * values are sourced from the new rule framework instead of defined inline.
 */
export const PII_PATTERNS: Record<PiiKind, RegExp> = Object.fromEntries(
  PII_KINDS.map((kind) => [kind, findRule(kind).pattern] as const),
) as Record<PiiKind, RegExp>;
```

After this migration, `patterns.test.ts` should still pass without modification because it uses `PII_PATTERNS[kind]` which now returns the same RegExp objects from the new framework.

### 8.2 New `detect-pii.ts` (shim over the runner)

The public API must stay identical:

```typescript
// exports that must remain after migration:
export interface DetectedMatch { ... }           // unchanged shape
export interface ScopedDetectedMatch { ... }     // unchanged shape
export function detectPii(text: string): DetectedMatch[];
export async function detectPiiInZip(zip: JSZip): Promise<ScopedDetectedMatch[]>;
export async function buildTargetsFromZip(zip: JSZip): Promise<string[]>;
```

The new implementation delegates to `runRegexPhase` and adapts:

```typescript
/**
 * PII detection — Lane A's top-level entry point (Phase 0 shim).
 *
 * After Phase 0, this file is a thin adapter that delegates detection to the
 * rule framework runner (`_framework/runner.ts`) and maps the resulting
 * `Candidate[]` back to the legacy `DetectedMatch[]` shape for backward
 * compatibility with downstream callers (engine.ts, audit log, etc.).
 *
 * The three public surfaces (`detectPii`, `detectPiiInZip`, `buildTargetsFromZip`)
 * have unchanged signatures from v1.0.
 */

import type JSZip from "jszip";

import { runRegexPhase } from "./_framework/runner.js";
import { extractTextFromZip } from "./extract-text.js";
import { normalizeForMatching } from "./normalize.js";
import type { PiiKind } from "./patterns.js";
import { IDENTIFIERS } from "./rules/identifiers.js";
import type { Scope } from "../docx/types.js";

/**
 * One PII match. Unchanged from v1.0 shape.
 */
export interface DetectedMatch {
  readonly kind: PiiKind;
  readonly original: string;
  readonly normalized: string;
}

export interface ScopedDetectedMatch {
  readonly scope: Scope;
  readonly match: DetectedMatch;
}

/**
 * Inverse of patterns.ts KIND_TO_SUBCATEGORY — maps new rule subcategory
 * back to legacy PiiKind for the DetectedMatch output shape.
 */
const SUBCATEGORY_TO_KIND: Record<string, PiiKind> = {
  "korean-rrn": "rrn",
  "korean-brn": "brn",
  "us-ein": "ein",
  "phone-kr": "phone-kr",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  "credit-card": "card",
};

function ruleIdToPiiKind(ruleId: string): PiiKind {
  // ruleId has form "identifiers.{subcategory}"
  const subcategory = ruleId.replace(/^identifiers\./, "");
  const kind = SUBCATEGORY_TO_KIND[subcategory];
  if (!kind) {
    throw new Error(`Internal: unknown ruleId "${ruleId}"`);
  }
  return kind;
}

/**
 * Run every PII pattern against `text` and return the matches.
 * Thin shim over `runRegexPhase` — same output bytes as v1.0.
 */
export function detectPii(text: string): DetectedMatch[] {
  const candidates = runRegexPhase(text, "standard", IDENTIFIERS);
  return candidates.map((c) => {
    // Recompute normalized form for the legacy DetectedMatch shape.
    // The runner only returns `text` (original bytes); `normalized` is a
    // legacy field consumed by audit logs and the keyword suggester.
    const normMap = normalizeForMatching(c.text);
    return {
      kind: ruleIdToPiiKind(c.ruleId),
      original: c.text,
      normalized: normMap.text,
    };
  });
}

/**
 * Walk every text-bearing scope in `zip`, run `detectPii` on each, and
 * return the matches with their source scope attached.
 */
export async function detectPiiInZip(
  zip: JSZip,
): Promise<ScopedDetectedMatch[]> {
  const out: ScopedDetectedMatch[] = [];
  const scoped = await extractTextFromZip(zip);
  for (const { scope, text } of scoped) {
    for (const match of detectPii(text)) {
      out.push({ scope, match });
    }
  }
  return out;
}

/**
 * Deduped, sorted array of literal strings ready for redactDocx({ targets }).
 * Sorted longest-first (so the redactor matches greedy alternation correctly).
 */
export async function buildTargetsFromZip(zip: JSZip): Promise<string[]> {
  const matches = await detectPiiInZip(zip);
  const set = new Set<string>();
  for (const { match } of matches) {
    set.add(match.original);
  }
  return [...set].sort((a, b) => b.length - a.length);
}
```

**Critical note on the shim:** the old `detect-pii.ts` defined a private `luhnCheck` function inline. You are moving it to `src/detection/rules/luhn.ts` (§ 12). The new `detect-pii.ts` does not need `luhnCheck` at all — the runner applies post-filters automatically.

**Critical note on output ordering:** the old `detectPii` iterated over `PII_KINDS` in array order, and within a kind, in document order. The new runner iterates over the rules in the order they appear in `IDENTIFIERS`. The order of rules in `IDENTIFIERS` MUST match the order of `PII_KINDS` in patterns.ts for the test output to match. Verify this:

```
PII_KINDS:  rrn → brn → ein → phone-kr → phone-intl → email → account-kr → card
IDENTIFIERS: korean-rrn → korean-brn → us-ein → phone-kr → phone-intl → email → account-kr → credit-card
```

Yes, they match. Good.

---

## 9. Runner implementation (`_framework/runner.ts`)

Put this EXACTLY into `src/detection/_framework/runner.ts`:

```typescript
/**
 * Rule runner — Phase 0 implements only the regex phase.
 * Structural and heuristic phases will be added in Phase 2 and Phase 4.
 *
 * See docs/RULES_GUIDE.md § 3.4 for the three-shape design rationale and
 * § 10.3 for the level filter semantics.
 *
 * Phase 0 does NOT filter by language — that would change observable behavior
 * vs v1.0 (which runs all rules regardless of document language). Language
 * filtering will be added in Phase 1 when it can be tested against a richer
 * rule set. The `detectLanguage` helper exists in this directory for Phase 1's
 * convenience; this runner just does not use it yet.
 */

import { normalizeForMatching } from "../normalize.js";

import type { Candidate, Level, RegexRule } from "./types.js";

/**
 * Run every RegexRule that matches the given level, return candidates with
 * original byte recovery via the normalizeForMatching offset map.
 *
 * Does NOT deduplicate. Callers run dedup on the combined output of all phases
 * (see `buildTargetsFromZip` for the current Set-based dedup).
 */
export function runRegexPhase(
  text: string,
  level: Level,
  rules: readonly RegexRule[],
): Candidate[] {
  if (text.length === 0) return [];
  const map = normalizeForMatching(text);
  if (map.text.length === 0) return [];

  // Phase 0: level filter only. Language filter deferred to Phase 1.
  const active = rules.filter((r) => r.levels.includes(level));

  const out: Candidate[] = [];

  for (const rule of active) {
    // Clone per rule to avoid lastIndex state pollution across calls and runs.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(map.text)) !== null) {
      const normalized = m[0];
      if (rule.postFilter && !rule.postFilter(normalized)) continue;

      const startNorm = m.index;
      const endNorm = startNorm + normalized.length;
      // origOffsets has length map.text.length + 1 (sentinel at end), so
      // endNorm (which can be map.text.length after zero-width stripping)
      // is always in range. NOTE: the sentinel is indexed by the NORMALIZED
      // length, not the ORIGINAL length — the two differ whenever
      // normalizeForMatching stripped any zero-width codepoints.
      const startOrig = map.origOffsets[startNorm]!;
      const endOrig = map.origOffsets[endNorm]!;
      const original = text.slice(startOrig, endOrig);

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

### Why no language filter in Phase 0

If the runner filtered by language, English-only documents would no longer run Korean RRN detection, and vice versa. The current `detectPii` runs every rule unconditionally. Changing that in Phase 0 would break the behavioral promise of "byte-identical output on the worst-case fixture" because that fixture is bilingual AND has some Korean rules that might or might not fire on the English scopes.

Language filtering is intentionally deferred to Phase 1, where it can be tested in isolation (new rules are added at the same time as the filter) and the behavior change is well-scoped.

### Why level filter IS in Phase 0

All Phase 0 rules have `levels: ["conservative", "standard", "paranoid"]`, so the filter is a no-op for them. But the shim in `detect-pii.ts` calls `runRegexPhase(text, "standard", IDENTIFIERS)` with `level: "standard"`, which is the v1.0 default. If you ever call it with a different level in the future, the filter is already wired.

---

## 10. Language detector (`_framework/language-detect.ts`)

Put this into `src/detection/_framework/language-detect.ts`:

```typescript
/**
 * Document language detection.
 *
 * Used by the runner in Phase 1+ to filter rules by language. Phase 0 defines
 * and tests this function but does NOT wire it into the runner yet (see
 * runner.ts comment for rationale).
 *
 * Heuristic: count Hangul codepoints vs ASCII letters. Thresholds are tuned
 * for bilingual Korean-English legal documents, which is the target use case.
 *
 * See docs/RULES_GUIDE.md § 11.1 for the definition.
 */

/**
 * Detect the primary language of a document.
 *
 * Returns:
 *   - "ko" if Hangul is > 60% of the total letter count
 *   - "en" if Hangul is < 20% of the total letter count
 *   - "mixed" otherwise (bilingual documents)
 *
 * Edge cases:
 *   - Empty / symbol-only text → "en" (default)
 *   - Hangul-only → "ko"
 *   - ASCII-only → "en"
 *   - 50/50 split → "mixed"
 */
export function detectLanguage(text: string): "ko" | "en" | "mixed" {
  const hangulCount = countHangul(text);
  const asciiLetterCount = countAsciiLetters(text);
  const total = hangulCount + asciiLetterCount;

  // No letters at all (numeric / symbol only): default to English.
  if (total === 0) return "en";

  const koRatio = hangulCount / total;
  if (koRatio > 0.6) return "ko";
  if (koRatio < 0.2) return "en";
  return "mixed";
}

function countHangul(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Hangul syllables block: U+AC00..U+D7A3
    if (c >= 0xAC00 && c <= 0xD7A3) n++;
  }
  return n;
}

function countAsciiLetters(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) n++;
  }
  return n;
}
```

### Test file `language-detect.test.ts`

Create at minimum these test cases in `src/detection/_framework/language-detect.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { detectLanguage } from "./language-detect.js";

describe("detectLanguage", () => {
  it("returns 'ko' for Korean-only text", () => {
    expect(detectLanguage("안녕하세요 오늘 계약서를 검토합니다")).toBe("ko");
  });

  it("returns 'en' for English-only text", () => {
    expect(detectLanguage("This is a confidential disclosure agreement")).toBe(
      "en",
    );
  });

  it("returns 'mixed' for balanced bilingual text", () => {
    expect(
      detectLanguage(
        "This Agreement is between ABC 주식회사 and Sunrise Inc",
      ),
    ).toBe("mixed");
  });

  it("returns 'en' for empty text", () => {
    expect(detectLanguage("")).toBe("en");
  });

  it("returns 'en' for symbol-only text", () => {
    expect(detectLanguage("!!! 1234 ###")).toBe("en");
  });

  it("ignores digits and punctuation in the ratio", () => {
    expect(detectLanguage("한국어 text with 123 and ,,,")).toMatch(
      /^(ko|en|mixed)$/,
    );
  });

  it("returns 'ko' at 80% Hangul threshold", () => {
    // 8 hangul, 2 ascii = 80% > 60%
    expect(detectLanguage("가나다라마바사아ab")).toBe("ko");
  });

  it("returns 'en' at 10% Hangul threshold", () => {
    // 1 hangul, 9 ascii = 10% < 20%
    expect(detectLanguage("가abcdefghi")).toBe("en");
  });
});
```

---

## 11. Registry (`_framework/registry.ts`)

Put this into `src/detection/_framework/registry.ts`:

```typescript
/**
 * Rule registry — the single point where all category files are collected
 * into a flat list of registered rules.
 *
 * Invariants are verified at module load time (bottom of this file). If any
 * rule violates an invariant, the import fails fast with a descriptive error
 * rather than silently producing wrong output at runtime.
 *
 * Adding a new category:
 *   1. Create the category file under rules/, e.g. rules/financial.ts
 *   2. Import its exported array here
 *   3. Add it to ALL_REGEX_RULES
 */

import { IDENTIFIERS } from "../rules/identifiers.js";
import type { RegexRule } from "./types.js";

/** All registered RegexRules across every category, in a stable iteration order. */
export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  // Phase 1: ...FINANCIAL
  // Phase 1: ...TEMPORAL
  // Phase 1: ...ENTITIES
  // Phase 3: ...LEGAL
] as const;

/**
 * Runtime sanity checks. Fails fast at module load if any rule is malformed.
 * Thrown errors bubble up to whoever imports this module — usually a test or
 * the runtime bundle, either of which will fail in a visible way.
 */
function verifyRegistry(): void {
  const ids = new Set<string>();
  for (const rule of ALL_REGEX_RULES) {
    if (ids.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    ids.add(rule.id);

    if (!rule.pattern.flags.includes("g")) {
      throw new Error(`Rule ${rule.id}: pattern must have the 'g' flag`);
    }
    if (rule.levels.length === 0) {
      throw new Error(`Rule ${rule.id}: levels must be a non-empty array`);
    }
    if (rule.languages.length === 0) {
      throw new Error(`Rule ${rule.id}: languages must be a non-empty array`);
    }
    if (rule.description.length === 0) {
      throw new Error(`Rule ${rule.id}: description must be non-empty`);
    }
    if (!rule.id.startsWith(`${rule.category}.`)) {
      throw new Error(
        `Rule ${rule.id}: id must start with "${rule.category}." to match category`,
      );
    }
    if (!rule.id.endsWith(rule.subcategory)) {
      throw new Error(
        `Rule ${rule.id}: id must end with subcategory "${rule.subcategory}"`,
      );
    }
  }
}

verifyRegistry();
```

### Why run verification at module load

If a rule is malformed, we want the failure to happen at the earliest possible moment — preferably when `vitest` imports the registry at test discovery time. Deferring verification to runtime inside the runner means a malformed rule can ship in production silently. Fail-fast at import is the safer default.

---

## 12. Luhn extraction (`rules/luhn.ts`)

Extract the `luhnCheck` function from `src/detection/detect-pii.ts:145-161` into its own file.

Create `src/detection/rules/luhn.ts`:

```typescript
/**
 * Luhn (mod-10) checksum for credit card validation.
 *
 * Used as the postFilter for the credit-card rule in rules/identifiers.ts.
 * Extracted from detect-pii.ts during Phase 0 refactor so both the new rule
 * framework and the legacy shim can import it without duplication.
 *
 * Operates on the digit characters of the input string (skips spaces, hyphens,
 * and any other non-digit chars). Returns true if the digit sequence is
 * Luhn-valid, false otherwise. Empty string and all-non-digit strings return
 * false.
 */
export function luhnCheck(s: string): boolean {
  let sum = 0;
  let alt = false;
  // Iterate from right to left.
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) continue; // skip non-digits (spaces, hyphens)
    let d = c - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum > 0 && sum % 10 === 0;
}
```

This is copied verbatim from `detect-pii.ts`. Do not change the logic.

After extraction, remove the private `luhnCheck` function from `detect-pii.ts`. The new shim (§ 8.2) does not need it at all because the runner applies postFilters automatically.

### Test file `luhn.test.ts`

```typescript
import { describe, it, expect } from "vitest";

import { luhnCheck } from "./luhn.js";

describe("luhnCheck", () => {
  it("returns true for the canonical Visa test number", () => {
    expect(luhnCheck("4111111111111111")).toBe(true);
  });

  it("returns true for Visa with spaces", () => {
    expect(luhnCheck("4111 1111 1111 1111")).toBe(true);
  });

  it("returns true for Visa with hyphens", () => {
    expect(luhnCheck("4111-1111-1111-1111")).toBe(true);
  });

  it("returns true for the canonical Mastercard test number", () => {
    expect(luhnCheck("5555555555554444")).toBe(true);
  });

  it("returns false for a 16-digit non-Luhn-valid blob", () => {
    expect(luhnCheck("1234567890123456")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(luhnCheck("")).toBe(false);
  });

  it("returns false for non-digit input", () => {
    expect(luhnCheck("abcd-efgh-ijkl-mnop")).toBe(false);
  });

  it("ignores whitespace and punctuation between digits", () => {
    expect(luhnCheck("4111 - 1111 - 1111 - 1111")).toBe(true);
  });
});
```

---

## 12a. Pre-port characterization tests (THE REAL SHIP GATE)

**Why this section exists.** The existing 422 tests prove that v1.0 works but do NOT lock down several properties the brief demands are preserved byte-for-byte: exact output order, regex source parity, `PiiKind↔subcategory` bijection, fullwidth card Luhn parity, fixture target array, and no-language-filter behavior. Without these tests, a port can drift in those dimensions while still showing "422 passing". This section closes that gap.

**All tests in this section are CHARACTERIZATION TESTS.** That means: they capture the CURRENT behavior (even if weird or suboptimal) and lock it in. Tests marked "pre-port" MUST pass against the v1.0 code as it exists on commit `74dfb2c`, BEFORE you touch anything. Tests marked "post-port" run after the relevant new file exists and verify parity between legacy and ported code.

**If any pre-port characterization test fails on v1.0 code, STOP.** That means the v1.0 behavior is different from what this brief assumes, and the brief's guidance is wrong for your codebase. Escalate per § 21.

### 12a.1 File layout for characterization tests

Create one new test file for pre-port characterization:

```
src/detection/detect-pii.characterization.test.ts    ← NEW (Step 2)
```

Post-port characterization tests are integrated into existing/new test files:

- **T3 (regex source parity)** → appended to `src/detection/rules/identifiers.test.ts` when that file is created in Step 9
- **T9 (normalized reconstruction parity)** → appended to `src/detection/detect-pii.characterization.test.ts` in a new `describe("post-port parity", ...)` block, once the shim exists
- **T11 (level no-op)** → appended to `src/detection/_framework/runner.test.ts` in Step 11

### 12a.2 The 18 tests (exact code)

```typescript
// src/detection/detect-pii.characterization.test.ts
//
// Pre-port characterization suite. Locks in current v1.0 behavior that the
// existing tests do NOT cover. These tests are the ship gate for Phase 0 —
// they must pass on v1.0 (before any porting) AND on the ported code.
//
// Do not modify any test in this file during the port. If a test fails after
// porting, the port has drifted. Fix the port, not the test.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";

import { detectPii, detectPiiInZip, buildTargetsFromZip } from "./detect-pii.js";
import { normalizeForMatching } from "./normalize.js";
import {
  PII_KINDS,
  PII_PATTERNS,
  type PiiKind,
} from "./patterns.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

/**
 * Authoritative mapping from legacy PiiKind to ported rule subcategory.
 * This is the single source of truth for the Phase 0 migration: any shim
 * that exposes a KIND_TO_SUBCATEGORY mapping MUST agree with this one
 * (T2 verifies the agreement).
 */
const EXPECTED_KIND_TO_SUBCATEGORY: Record<PiiKind, string> = {
  rrn: "korean-rrn",
  brn: "korean-brn",
  ein: "us-ein",
  "phone-kr": "phone-kr",
  "phone-intl": "phone-intl",
  email: "email",
  "account-kr": "account-kr",
  card: "credit-card",
};

/**
 * Regex source parity table. Each entry is the exact legacy pattern's
 * `.source` string. The ported rule's pattern.source MUST equal this.
 */
const EXPECTED_REGEX_SOURCE: Record<PiiKind, string> = {
  rrn: "(?<!\\d)\\d{6}-[1-8]\\d{6}(?!\\d)",
  brn: "(?<!\\d)\\d{3}-\\d{2}-\\d{5}(?!\\d)",
  ein: "(?<!\\d)\\d{2}-\\d{7}(?!\\d)",
  "phone-kr": "(?<!\\d)01[016-9]-?\\d{3,4}-?\\d{4}(?!\\d)",
  "phone-intl": "(?<![\\w+])\\+\\d{1,3}(?:[\\s-]\\d{1,4}){2,4}(?!\\d)",
  email: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b",
  "account-kr": "(?<!\\d)\\d{3,6}-\\d{2,3}-\\d{4,7}(?!\\d)",
  card: "(?<![\\d-])\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}(?![\\d-])",
};

// ============================================================================
// T1 — detectPii kind-major output order
// ============================================================================
describe("T1: detectPii mixed-kind output order is PII_KINDS-major", () => {
  it("preserves kind-major ordering, not global document order", () => {
    // Email appears FIRST textually, but PII_KINDS iterates brn → phone-kr →
    // email, so the output order must be brn, phone-kr, email.
    const input = "email kim@abc.kr phone 010-1234-5678 tax 123-45-67890";
    const kinds = detectPii(input).map((m) => m.kind);
    // brn before phone-kr (PII_KINDS order), phone-kr before email, then
    // account-kr also matches the BRN form because the regex accepts 3-2-5.
    expect(kinds).toEqual(["brn", "phone-kr", "email", "account-kr"]);
  });

  it("returns matches in document order within a single kind", () => {
    const input = "first kim@a.io middle lee@b.io last park@c.io";
    const emails = detectPii(input).map((m) => m.original);
    expect(emails).toEqual(["kim@a.io", "lee@b.io", "park@c.io"]);
  });
});

// ============================================================================
// T2 — Exhaustive PiiKind ↔ subcategory bijection (pre-port and post-port)
// ============================================================================
describe("T2: PiiKind ↔ subcategory is a total bijection", () => {
  it("every PiiKind maps to a distinct subcategory", () => {
    const subcategories = new Set<string>();
    for (const k of PII_KINDS) {
      const sub = EXPECTED_KIND_TO_SUBCATEGORY[k];
      expect(sub).toBeDefined();
      subcategories.add(sub);
    }
    expect(subcategories.size).toBe(PII_KINDS.length); // 8
  });

  it("round-trips kind → subcategory → kind without loss", () => {
    const inverse = new Map<string, PiiKind>();
    for (const k of PII_KINDS) {
      inverse.set(EXPECTED_KIND_TO_SUBCATEGORY[k], k);
    }
    for (const k of PII_KINDS) {
      const sub = EXPECTED_KIND_TO_SUBCATEGORY[k];
      expect(inverse.get(sub)).toBe(k);
    }
  });

  it("covers exactly the 8 known kinds", () => {
    expect(Object.keys(EXPECTED_KIND_TO_SUBCATEGORY).sort()).toEqual(
      [...PII_KINDS].sort(),
    );
  });
});

// ============================================================================
// T3 — Regex source + flags byte-for-byte parity (runs pre-port AND post-port)
// ============================================================================
describe("T3: PII_PATTERNS regex source + flags byte-for-byte parity", () => {
  it("each PII_PATTERNS entry has the expected .source", () => {
    for (const k of PII_KINDS) {
      expect(PII_PATTERNS[k].source).toBe(EXPECTED_REGEX_SOURCE[k]);
    }
  });

  it("each PII_PATTERNS entry has the 'g' flag", () => {
    for (const k of PII_KINDS) {
      expect(PII_PATTERNS[k].flags).toContain("g");
    }
  });

  it("no PII_PATTERNS entry has unexpected flags", () => {
    for (const k of PII_KINDS) {
      // Legacy only uses the `g` flag. Additional flags would change
      // matching semantics (e.g., `u` changes character class handling).
      expect(PII_PATTERNS[k].flags).toBe("g");
    }
  });
});

// ============================================================================
// T4 — Fullwidth card Luhn validation
// ============================================================================
describe("T4: fullwidth card Luhn validation preserved", () => {
  it("matches fullwidth Visa test number, returns fullwidth original", () => {
    const input = "Card: ４１１１ １１１１ １１１１ １１１１";
    const matches = detectPii(input);
    const card = matches.find((m) => m.kind === "card");
    expect(card).toBeDefined();
    expect(card!.original).toBe("４１１１ １１１１ １１１１ １１１１");
    expect(card!.normalized).toBe("4111 1111 1111 1111");
  });

  it("rejects fullwidth Luhn-invalid card", () => {
    const input = "Card: ４１１１ １１１１ １１１１ １１１２"; // last digit flipped
    const cards = detectPii(input).filter((m) => m.kind === "card");
    expect(cards).toEqual([]);
  });
});

// ============================================================================
// T5 — En-dash phone original recovery
// ============================================================================
describe("T5: en-dash phone original recovery", () => {
  it("matches en-dash variant, returns en-dash original bytes", () => {
    const input = "Call 010\u20131234\u20135678 urgently";
    const phones = detectPii(input).filter((m) => m.kind === "phone-kr");
    expect(phones).toHaveLength(1);
    expect(phones[0]!.original).toBe("010\u20131234\u20135678");
    expect(phones[0]!.normalized).toBe("010-1234-5678");
  });
});

// ============================================================================
// T6 — Fullwidth phone original recovery
// ============================================================================
describe("T6: fullwidth phone original recovery", () => {
  it("matches fullwidth variant, returns fullwidth original bytes", () => {
    const input = "Tel ０１０-１２３４-５６７８";
    const phones = detectPii(input).filter((m) => m.kind === "phone-kr");
    expect(phones).toHaveLength(1);
    expect(phones[0]!.original).toBe("０１０-１２３４-５６７８");
    expect(phones[0]!.normalized).toBe("010-1234-5678");
  });
});

// ============================================================================
// T7 — Zero-width codepoint INSIDE a phone is stripped for matching,
//      preserved in original bytes via the offset map
// ============================================================================
describe("T7: zero-width inside phone preserved in original bytes", () => {
  it("matches through an interior zero-width space", () => {
    const input = "Call 010-12\u200B34-5678 now";
    const phones = detectPii(input).filter((m) => m.kind === "phone-kr");
    expect(phones).toHaveLength(1);
    // Original bytes include the \u200B; normalized strips it.
    expect(phones[0]!.original).toContain("\u200B");
    expect(phones[0]!.normalized).toBe("010-1234-5678");
  });
});

// ============================================================================
// T8 — Luhn rejects all-zero (sum > 0 requirement)
// ============================================================================
describe("T8: luhnCheck rejects all-zero card", () => {
  it("all-zero 16-digit blob does not match as card", () => {
    const input = "Card: 0000 0000 0000 0000";
    const cards = detectPii(input).filter((m) => m.kind === "card");
    expect(cards).toEqual([]);
  });
});

// ============================================================================
// T9 — (POST-PORT) DetectedMatch.normalized equals normalizeForMatching
//      (original).text — proves the shim reconstruction is lossless
// ============================================================================
describe("T9: DetectedMatch.normalized parity with normalizeForMatching", () => {
  it("for every match in a corpus, normalized === normalizeForMatching(original).text", () => {
    const corpus = [
      "Email kim@abc-corp.kr phone 010\u20131234\u20135678",
      "RRN 900101-1234567 BRN 123-45-67890 card ４１１１ １１１１ １１１１ １１１１",
      "Tel ０１０-１２３４-５６７８ EIN 12-3456789 intl +1 415 555 0199",
      "Acct 123456-12-1234567 email alice@example.com",
    ];
    for (const text of corpus) {
      const matches = detectPii(text);
      for (const m of matches) {
        const reNormalized = normalizeForMatching(m.original).text;
        expect(reNormalized).toBe(m.normalized);
      }
    }
  });
});

// ============================================================================
// T10 — No language filter (legacy runs every rule regardless of language)
// ============================================================================
describe("T10: detectPii is language-agnostic", () => {
  it("detects Korean-form PII inside predominantly English text", () => {
    const input =
      "This English memo has RRN 900101-1234567 and BRN 123-45-67890";
    const kinds = detectPii(input).map((m) => m.kind);
    expect(kinds).toContain("rrn");
    expect(kinds).toContain("brn");
  });

  it("detects US-form PII inside predominantly Korean text", () => {
    const input = "이 한국어 문서에 EIN 12-3456789가 포함되어 있습니다";
    const kinds = detectPii(input).map((m) => m.kind);
    expect(kinds).toContain("ein");
  });
});

// ============================================================================
// T11 — (POST-PORT) Level filter is no-op for identifiers in Phase 0
//      Added to _framework/runner.test.ts in Step 11, not in this file.
//      Placeholder description only — see Step 11 TDD code for impl.
// ============================================================================
// (deferred — lives in runner.test.ts)

// ============================================================================
// T12 — Overlap preservation before final dedupe
// ============================================================================
describe("T12: overlapping matches preserved in detectPii", () => {
  it("BRN-form digit string produces both brn and account-kr matches", () => {
    const input = "Tax 123-45-67890";
    const matches = detectPii(input);
    const kinds = matches.map((m) => m.kind);
    // Both rules match the same bytes. detectPii does NOT dedupe —
    // dedupe happens only in buildTargetsFromZip.
    expect(kinds).toEqual(["brn", "account-kr"]);
    expect(matches.every((m) => m.original === "123-45-67890")).toBe(true);
  });
});

// ============================================================================
// T13 — Scope-level duplicate retention: same email in two scopes returns
//      two ScopedDetectedMatch entries, but buildTargetsFromZip dedupes.
// ============================================================================
describe("T13: scope-level duplicate retention", () => {
  it("detectPiiInZip preserves per-scope duplicates; buildTargetsFromZip dedupes", async () => {
    // Build a minimal synthetic DOCX: main document + one header, both
    // containing the same email literal. Uses JSZip directly — no fixture file.
    const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Body contact legal@sunrise.com please</w:t></w:r></w:p></w:body>
</w:document>`;
    const HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:r><w:t>Header contact legal@sunrise.com also</w:t></w:r></w:p>
</w:hdr>`;
    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`;
    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
    const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/_rels/document.xml.rels", DOC_RELS);
    zip.file("word/document.xml", DOC_XML);
    zip.file("word/header1.xml", HEADER_XML);

    const scoped = await detectPiiInZip(zip);
    const emailHits = scoped.filter((s) => s.match.kind === "email");
    // Two distinct ScopedDetectedMatch entries (different scope paths)
    expect(emailHits.length).toBe(2);
    const scopes = new Set(emailHits.map((s) => s.scope.path));
    expect(scopes.size).toBe(2);

    const targets = await buildTargetsFromZip(zip);
    // Only one final target, because dedupe collapses identical originals.
    expect(targets.filter((t) => t === "legal@sunrise.com")).toEqual([
      "legal@sunrise.com",
    ]);
  });
});

// ============================================================================
// T14 — lastIndex pollution resistance: setting the shared regex's lastIndex
//      does not affect detectPii's output (runner clones before exec).
// ============================================================================
describe("T14: lastIndex pollution resistance", () => {
  it("detectPii unaffected by external lastIndex tampering", () => {
    // This mutation should have no effect because detectPii clones.
    (PII_PATTERNS.email as RegExp).lastIndex = 999;
    const matches = detectPii("kim@abc.kr");
    expect(matches.map((m) => m.original)).toEqual(["kim@abc.kr"]);
    // Restore
    (PII_PATTERNS.email as RegExp).lastIndex = 0;
  });
});

// ============================================================================
// T15 — Deterministic repeated invocation
// ============================================================================
describe("T15: deterministic repeated invocation", () => {
  it("two identical detectPii calls return deep-equal outputs", () => {
    const text =
      "email kim@abc.kr phone 010-1234-5678 tax 123-45-67890 EIN 12-3456789";
    const first = detectPii(text);
    const second = detectPii(text);
    expect(first).toEqual(second);
  });
});

// ============================================================================
// T16 — Dedupe-by-original, not by normalized
// ============================================================================
describe("T16: buildTargetsFromZip dedupes by original, not normalized", () => {
  it("ASCII and en-dash phone variants both survive as distinct targets", async () => {
    const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>ASCII 010-1234-5678 here</w:t></w:r></w:p>
<w:p><w:r><w:t>En-dash 010\u20131234\u20135678 here</w:t></w:r></w:p>
</w:body>
</w:document>`;
    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", DOC_XML);

    const targets = await buildTargetsFromZip(zip);
    expect(targets).toContain("010-1234-5678");
    expect(targets).toContain("010\u20131234\u20135678");
  });
});

// ============================================================================
// T17 — Same-length tie order preserved after longest-first sort
// ============================================================================
describe("T17: same-length tie order preserved", () => {
  it("two same-length emails remain in first-insertion order", async () => {
    const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>aa@x.io bb@y.io</w:t></w:r></w:p></w:body>
</w:document>`;
    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", DOC_XML);

    const targets = await buildTargetsFromZip(zip);
    // Both emails have length 8 — longest-first sort is stable within ties,
    // so the first-encountered email must come first.
    const aa = targets.indexOf("aa@x.io");
    const bb = targets.indexOf("bb@y.io");
    expect(aa).toBeGreaterThanOrEqual(0);
    expect(bb).toBeGreaterThanOrEqual(0);
    expect(aa).toBeLessThan(bb);
  });
});

// ============================================================================
// T18 — Worst-case fixture target array exact snapshot
//
// This is the single most important test in this file. It captures the
// EXACT output of buildTargetsFromZip() on the v1.0 worst-case fixture.
// The ported code must produce this array byte-for-byte.
//
// HOW TO POPULATE EXPECTED_WORST_CASE_TARGETS:
//   1. Write this test with EXPECTED_WORST_CASE_TARGETS = [] initially.
//   2. Run `bun run test src/detection/detect-pii.characterization.test.ts`.
//   3. Observe the "Expected: [] / Received: [...]" output.
//   4. Copy the Received array verbatim into EXPECTED_WORST_CASE_TARGETS.
//   5. Re-run the test — now it must pass.
//   6. Commit. This snapshot is now the Phase 0 ship gate.
// ============================================================================
describe("T18: worst-case fixture target array exact snapshot", () => {
  // To be populated once against v1.0 code. Do not modify after that.
  // See the comment above for how to fill this in.
  const EXPECTED_WORST_CASE_TARGETS: readonly string[] = [
    // populated in Step 2 by running the test against v1.0 code
  ];

  let zip: JSZip;

  beforeAll(async () => {
    const buf = fs.readFileSync(FIXTURE);
    zip = await JSZip.loadAsync(buf);
  });

  it("buildTargetsFromZip(worstCase) exactly matches v1.0 snapshot", async () => {
    const actual = await buildTargetsFromZip(zip);
    if (EXPECTED_WORST_CASE_TARGETS.length === 0) {
      // Placeholder branch — fail with actual output printed so the author
      // can copy it into EXPECTED_WORST_CASE_TARGETS. See file-level comment.
      expect(actual).toEqual([
        "PLACEHOLDER_POPULATE_FROM_V1_RUN",
      ]);
    }
    expect(actual).toEqual(EXPECTED_WORST_CASE_TARGETS);
  });
});
```

### 12a.3 Test count by priority

| Priority | Test ID | Scope | File | When added |
|---|---|---|---|---|
| P1 | T1 | detectPii kind order | characterization | Step 2 (pre-port) |
| P1 | T2 | PiiKind↔subcategory bijection | characterization | Step 2 (pre-port) |
| P1 | T3 | Regex source + flags parity | characterization + identifiers.test | Step 2 (pre-port) + Step 9 (post-port extension) |
| P2 | T4 | Fullwidth card Luhn | characterization | Step 2 (pre-port) |
| P2 | T5 | En-dash phone original recovery | characterization | Step 2 (pre-port) |
| P2 | T6 | Fullwidth phone original recovery | characterization | Step 2 (pre-port) |
| P2 | T7 | Zero-width inside phone | characterization | Step 2 (pre-port) |
| P2 | T8 | Luhn rejects all-zero | characterization | Step 2 (pre-port) |
| P3 | T9 | Normalized reconstruction parity | characterization | Step 2 (pre-port baseline) |
| P4 | T10 | Language-agnostic | characterization | Step 2 (pre-port) |
| P4 | T11 | Runner level no-op | runner.test.ts | Step 11 (post-port, not in this file) |
| P5 | T12 | Overlap preservation | characterization | Step 2 (pre-port) |
| P5 | T13 | Scope duplicate retention | characterization | Step 2 (pre-port, uses synthetic zip) |
| P6 | T14 | lastIndex resistance | characterization | Step 2 (pre-port) |
| P6 | T15 | Deterministic repeat | characterization | Step 2 (pre-port) |
| P7 | T16 | Dedupe by original | characterization | Step 2 (pre-port, uses synthetic zip) |
| P7 | T17 | Same-length tie order | characterization | Step 2 (pre-port, uses synthetic zip) |
| P7 | T18 | Fixture target snapshot | characterization | Step 2 (pre-port — single most important test) |

**Pre-port count**: 17 tests added in Step 2. **Post-port extension**: T3 regex source parity also verified against `IDENTIFIERS` array in `rules/identifiers.test.ts` (Step 9); T11 added to `runner.test.ts` (Step 11).

### 12a.4 Populating the T18 snapshot

The `EXPECTED_WORST_CASE_TARGETS` array starts empty. You will populate it **exactly once**, against v1.0 code, in Step 2:

1. After writing the characterization test file, run:
   ```bash
   bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tee /tmp/phase0-t18-capture.txt
   ```
2. Find the T18 failure in the output. It will show the full `Received:` array.
3. Copy the array elements verbatim into `EXPECTED_WORST_CASE_TARGETS`, preserving order.
4. Re-run the test. T18 must now pass.
5. Commit the populated snapshot as part of the Step 2 commit.

Do not manually author this array from guesses. Do not sort it alphabetically. Do not add or remove entries. The snapshot is authoritative because it came from v1.0 behavior, not from human judgment about "what the right set should be".

---

## 12b. Stale documentation fixes

Three pieces of prose drift were flagged by external reviewers. Fix them during Phase 0 as part of the characterization scope — these are comment/title corrections only, no behavior change.

### 12b.1 Fix `patterns.test.ts` RRN test title

**File**: `src/detection/patterns.test.ts`

**Current** (around the RRN describe block):
```typescript
it("rejects 7th-digit codes outside 1-4 (gender code)", () => {
  expect(matches("rrn", "900101-9234567")).toEqual([]);
  expect(matches("rrn", "900101-0234567")).toEqual([]);
});
```

**Problem**: Title says "outside 1-4" but the regex is `[1-8]` (accepts both citizen codes 1-4 AND foreigner codes 5-8). Assertions test 9 and 0, which are outside 1-8, so the assertions are correct — only the title is stale.

**Fix**: change title to match what the test actually verifies:
```typescript
it("rejects 7th-digit codes outside 1-8 (gender + foreigner codes)", () => {
  expect(matches("rrn", "900101-9234567")).toEqual([]);
  expect(matches("rrn", "900101-0234567")).toEqual([]);
});
```

### 12b.2 Fix `patterns.ts` account-kr comment

**File**: `src/detection/patterns.ts`

**Current** (comment above the `account-kr` regex):
```typescript
// Korean bank account: vendor-specific lengths but the canonical separator
// pattern is `3-6 / 2-3 / 4-7`. Conservative bounds keep noise low and
// avoid colliding with `brn`.
```

**Problem**: Claims the pattern avoids BRN collision, but `123-45-67890` (BRN form) falls inside the `3-6 / 2-3 / 4-7` ranges and DOES match. T12 characterization test proves this.

**Fix**: replace the comment with an accurate description of current behavior:
```typescript
// Korean bank account: vendor-specific lengths but the canonical separator
// pattern is `3-6 / 2-3 / 4-7`. This intentionally overlaps with `brn` (3-2-5)
// and older short-form `phone-kr` (3-3-4); overlap is resolved at the
// buildTargetsFromZip dedupe stage where identical original strings collapse.
// Detection order ensures brn and phone-kr are emitted BEFORE account-kr for
// the same literal, preserving legacy provenance.
```

### 12b.3 Fix `detect-pii.ts` origOffsets length comment

**File**: `src/detection/detect-pii.ts`

**Current** (inside `detectPii`, around the offset recovery):
```typescript
// origOffsets has length text.length + 1, so endNorm (which can be
// text.length) is always in range.
```

**Problem**: `text` is the function parameter (ORIGINAL text). But `origOffsets` has length `map.text.length + 1` (NORMALIZED text length), which differs from original whenever `normalizeForMatching` stripped any zero-width codepoints.

**Fix**: clarify the length is normalized-relative:
```typescript
// origOffsets has length map.text.length + 1 (normalized-space length +
// sentinel), so endNorm (which can be map.text.length after any zero-width
// stripping) is always in range. NOTE: length differs from original text
// whenever normalizeForMatching dropped any zero-width codepoints.
```

### 12b.4 Verification after 12b fixes

After applying all three fixes, run:

```bash
bun run test 2>&1 | tail -5        # must still be 422 + characterization passing
bun run typecheck 2>&1 | tail -3   # must be clean
bun run lint 2>&1 | tail -3        # must be clean
```

No behavior change expected. Any assertion failure here means you accidentally modified the logic instead of the prose.

---

## 13. TDD sequence (15 steps, execute IN ORDER)

Do not skip steps. Do not reorder. Do not merge steps. Commit at the end of each step with the specified message. Each step has a verification command that must pass before you proceed to the next step.

### Step 1 — Establish baseline

**Purpose:** confirm the working tree is clean and v1.0 tests all pass before you touch anything.

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"
git status                              # must show: working tree clean
git log --oneline -1                    # must show: 74dfb2c release: v1.0.0 (or later main commit)
bun run test 2>&1 | tail -5             # must show: Tests 422 passed (422)
bun run typecheck 2>&1 | tail -3        # must show: 0 errors 0 warnings
bun run lint 2>&1 | tail -3             # must show: 0 errors (3 pre-existing warnings OK)
```

If ANY of these fail, STOP and report. Do not proceed.

### Step 2 — Add pre-port characterization tests (THE REAL SHIP GATE)

**Purpose:** lock in the current v1.0 behavior along dimensions that the existing 422 tests do NOT cover. See § 12a for the full rationale and the exact test code. These tests become the ship gate for Phase 0 — they must pass on v1.0 code now, and they must still pass on the ported code at the end of Step 15.

**Do this step BEFORE creating any new framework files.** The tests must run against v1.0 code exactly as it exists on commit `74dfb2c` so the baseline is authoritative.

**2a.** Create `src/detection/detect-pii.characterization.test.ts` with the exact content from § 12a.2. Leave `EXPECTED_WORST_CASE_TARGETS` as an empty array for now — the T18 test will fail intentionally so you can capture the snapshot.

**2b.** Run the characterization suite:

```bash
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tee /tmp/phase0-t18-capture.txt
```

Expected result at this point:
- T1 through T17 (17 tests) should all pass against v1.0 code
- T18 (fixture snapshot) should FAIL with an `Expected: [...] / Received: [...]` diff

If any of T1–T17 fails, STOP. That means either v1.0 behavior is different from what § 12a documents, or you made an error copying the test code. Re-read § 12a carefully and compare to the characterization test file. Do NOT patch the test to make it pass; the test specifies the invariant and v1.0 should already satisfy it.

**2c.** Capture the T18 fixture snapshot. From `/tmp/phase0-t18-capture.txt`, find the T18 failure output. It will show:

```
Expected: []
Received: [
  "some-email@example.com",
  "010-1234-5678",
  ...
]
```

Copy the elements of the `Received:` array verbatim into `EXPECTED_WORST_CASE_TARGETS` in the test file, preserving order exactly. Do NOT sort, reformat, or edit entries. Replace the placeholder line:

```typescript
const EXPECTED_WORST_CASE_TARGETS: readonly string[] = [
  // populated in Step 2 by running the test against v1.0 code
];
```

with the captured literal:

```typescript
const EXPECTED_WORST_CASE_TARGETS: readonly string[] = [
  "...first target captured from v1.0...",
  "...second target...",
  // ... all entries, in exact order ...
];
```

Also delete the placeholder branch in the T18 test body:

```typescript
if (EXPECTED_WORST_CASE_TARGETS.length === 0) {
  expect(actual).toEqual([
    "PLACEHOLDER_POPULATE_FROM_V1_RUN",
  ]);
}
```

Remove that block so only the unconditional `expect(actual).toEqual(EXPECTED_WORST_CASE_TARGETS)` remains.

**2d.** Re-run the suite and confirm all 18 characterization tests pass:

```bash
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tail -10
# must show: Tests 18+ passed
```

**2e.** Run the full suite to verify 422 legacy + characterization all green:

```bash
bun run test 2>&1 | tail -5
# must show: Tests {> 440} passed
bun run typecheck 2>&1 | tail -3
# must be clean
bun run lint 2>&1 | tail -3
# must be clean (3 pre-existing warnings OK)
```

Commit:

```bash
git add src/detection/detect-pii.characterization.test.ts
git commit -m "$(cat <<'EOF'
test(detection): add pre-port characterization suite for Phase 0 ship gate

Captures v1.0 behavior along dimensions the existing 422 tests do NOT lock
down: exact detectPii kind-major order, PiiKind-to-subcategory bijection,
regex source/flags byte-for-byte parity, fullwidth card Luhn validation,
en-dash and fullwidth phone original-byte recovery, zero-width interior
matching, no-language-filter invariant, overlap preservation,
dedupe-by-original semantics, same-length tie order, lastIndex pollution
resistance, and an exact buildTargetsFromZip(worst-case fixture) snapshot.

These are the REAL Phase 0 ship gate per § 12a of the Phase 0 brief. They
must pass pre-port (v1.0) and post-port (ported code) — drift in any of
these dimensions fails the phase.

Co-Authored-By: Codex <noreply@openai.com>
EOF
)"
```

### Step 3 — Apply stale documentation fixes

**Purpose:** fix three prose-drift items flagged by external review (see § 12b for details). Comment/title corrections only — no behavior change. Doing this before any framework code is written prevents a future porter from following stale prose and reimplementing wrong invariants.

**3a.** Fix `src/detection/patterns.test.ts` RRN test title per § 12b.1. Change title "rejects 7th-digit codes outside 1-4 (gender code)" to "rejects 7th-digit codes outside 1-8 (gender + foreigner codes)". Assertions unchanged.

**3b.** Fix `src/detection/patterns.ts` account-kr comment per § 12b.2. Replace the "avoid colliding with `brn`" comment block with the new one that accurately describes the current overlap behavior.

**3c.** Fix `src/detection/detect-pii.ts` origOffsets length comment per § 12b.3. Update the comment to reference `map.text.length` (normalized length) instead of ambiguous `text.length`.

**3d.** Verify nothing broke:

```bash
bun run test 2>&1 | tail -5        # must still show all tests passing (422 + characterization)
bun run typecheck 2>&1 | tail -3   # must be clean
bun run lint 2>&1 | tail -3        # must be clean
```

No assertion failure is expected. Any failure means you modified logic instead of prose — revert and try again.

Commit:

```bash
git add src/detection/patterns.test.ts src/detection/patterns.ts src/detection/detect-pii.ts
git commit -m "$(cat <<'EOF'
docs(detection): fix stale prose in patterns/detect-pii pre-Phase-0

Three comment/title corrections flagged by external review (ChatGPT 5.4 Pro
Feedback #1 and #2). No behavior change:

- patterns.test.ts: RRN test title said "outside 1-4" but the regex is [1-8]
  and assertions test 9/0 (outside 1-8). Title corrected to match reality.

- patterns.ts: account-kr comment claimed "avoid colliding with brn" but the
  current 3-6/2-3/4-7 pattern DOES match BRN form 123-45-67890. Comment
  rewritten to document the overlap accurately and point to the
  buildTargetsFromZip dedupe stage where it collapses.

- detect-pii.ts: origOffsets length comment said "text.length + 1" where
  "text" was ambiguous. Clarified to "map.text.length + 1" (normalized
  length) since normalizeForMatching strips zero-width codepoints.

Doing this before the framework port prevents stale prose from misleading
the porter into reimplementing incorrect invariants.

Co-Authored-By: Codex <noreply@openai.com>
EOF
)"
```

### Step 4 — Create `_framework/types.ts`

```bash
mkdir -p src/detection/_framework src/detection/rules
```

Write `src/detection/_framework/types.ts` with the exact content from § 6. No deviations.

```bash
bun run typecheck 2>&1 | tail -3        # must be clean (no new errors)
```

Commit:

```bash
git add src/detection/_framework/types.ts
git commit -m "$(cat <<'EOF'
refactor(detection): add _framework/types.ts — rule framework type definitions

Introduces RegexRule, StructuralParser, Heuristic, Candidate, StructuralDefinition,
HeuristicContext, Level, Language, Category, PostFilter. All three rule shapes
are defined in this phase but only RegexRule is exercised by Phase 0; the
other two are forward compatibility for Phase 2 and Phase 4.

See docs/RULES_GUIDE.md § 3 for the design rationale.

Co-Authored-By: Codex <noreply@openai.com>
EOF
)"
```

### Step 5 — Create `_framework/types.test.ts`

Add type-level sanity tests. At minimum:

```typescript
import { describe, it, expectTypeOf } from "vitest";

import type {
  Candidate,
  Category,
  StructuralDefinition,
  Heuristic,
  HeuristicContext,
  Language,
  Level,
  PostFilter,
  RegexRule,
  StructuralParser,
} from "./types.js";

describe("types.ts exports", () => {
  it("Level is a string union of exactly three values", () => {
    const values: Level[] = ["conservative", "standard", "paranoid"];
    expectTypeOf(values).toMatchTypeOf<Level[]>();
  });

  it("Language is a string union of exactly three values", () => {
    const values: Language[] = ["ko", "en", "universal"];
    expectTypeOf(values).toMatchTypeOf<Language[]>();
  });

  it("Category includes all seven taxonomy values", () => {
    const values: Category[] = [
      "identifiers",
      "financial",
      "temporal",
      "entities",
      "structural",
      "heuristics",
      "legal",
    ];
    expectTypeOf(values).toMatchTypeOf<Category[]>();
  });

  it("RegexRule.category excludes structural and heuristics", () => {
    // @ts-expect-error — structural is not assignable to RegexRule.category
    const bad: RegexRule = {
      id: "structural.x",
      category: "structural",
      subcategory: "x",
      pattern: /x/g,
      levels: ["standard"],
      languages: ["universal"],
      description: "x",
    };
    void bad;
  });

  it("RegexRule compiles with all required fields", () => {
    const rule: RegexRule = {
      id: "identifiers.test",
      category: "identifiers",
      subcategory: "test",
      pattern: /test/g,
      levels: ["standard"],
      languages: ["universal"],
      description: "test",
    };
    expectTypeOf(rule).toMatchTypeOf<RegexRule>();
  });

  it("RegexRule accepts optional postFilter", () => {
    const filter: PostFilter = (s) => s.length > 0;
    const rule: RegexRule = {
      id: "identifiers.test-with-filter",
      category: "identifiers",
      subcategory: "test-with-filter",
      pattern: /test/g,
      postFilter: filter,
      levels: ["standard"],
      languages: ["universal"],
      description: "test with filter",
    };
    expectTypeOf(rule).toMatchTypeOf<RegexRule>();
  });

  it("Candidate requires text, ruleId, confidence", () => {
    const c: Candidate = {
      text: "hello",
      ruleId: "identifiers.test",
      confidence: 1.0,
    };
    expectTypeOf(c).toMatchTypeOf<Candidate>();
  });

  it("StructuralDefinition requires label, referent, source", () => {
    const dt: StructuralDefinition = {
      label: "the Buyer",
      referent: "ABC Corp",
      source: "definition-section",
    };
    expectTypeOf(dt).toMatchTypeOf<StructuralDefinition>();
  });

  it("HeuristicContext has readonly arrays", () => {
    const ctx: HeuristicContext = {
      structuralDefinitions: [],
      priorCandidates: [],
      documentLanguage: "mixed",
    };
    expectTypeOf(ctx).toMatchTypeOf<HeuristicContext>();
  });

  it("StructuralParser.parse returns readonly StructuralDefinition[]", () => {
    const parser: StructuralParser = {
      id: "structural.test",
      category: "structural",
      subcategory: "test",
      languages: ["en"],
      description: "test",
      parse: (_text) => [],
    };
    expectTypeOf(parser.parse).returns.toMatchTypeOf<readonly StructuralDefinition[]>();
  });

  it("Heuristic.detect returns readonly Candidate[]", () => {
    const h: Heuristic = {
      id: "heuristics.test",
      category: "heuristics",
      subcategory: "test",
      languages: ["en"],
      levels: ["paranoid"],
      description: "test",
      detect: (_text, _ctx) => [],
    };
    expectTypeOf(h.detect).returns.toMatchTypeOf<readonly Candidate[]>();
  });
});
```

```bash
bun run test src/detection/_framework/types.test.ts 2>&1 | tail -5
# must show all 10+ tests passing
```

Commit:

```bash
git add src/detection/_framework/types.test.ts
git commit -m "test(detection): add _framework/types.test.ts — type-level sanity tests"
```

### Step 6 — Create `_framework/language-detect.ts` + test (TDD)

**6a.** Create `src/detection/_framework/language-detect.test.ts` with the test cases from § 10 above. RUN FIRST — it should fail because `language-detect.ts` doesn't exist yet.

```bash
bun run test src/detection/_framework/language-detect.test.ts 2>&1 | tail -10
# expect: FAILS (module not found)
```

**6b.** Create `src/detection/_framework/language-detect.ts` with the exact content from § 10.

```bash
bun run test src/detection/_framework/language-detect.test.ts 2>&1 | tail -5
# must show all 8 tests passing
bun run typecheck 2>&1 | tail -3
# must be clean
```

Commit:

```bash
git add src/detection/_framework/language-detect.ts src/detection/_framework/language-detect.test.ts
git commit -m "feat(detection): add _framework/language-detect — Hangul vs ASCII letter ratio"
```

### Step 7 — Extract `rules/luhn.ts`

**7a.** Create `src/detection/rules/luhn.ts` with the exact content from § 12.

**7b.** Create `src/detection/rules/luhn.test.ts` with the test cases from § 12.

```bash
bun run test src/detection/rules/luhn.test.ts 2>&1 | tail -5
# must show 8 tests passing
```

**7c.** Edit `src/detection/detect-pii.ts` to import `luhnCheck` from `./rules/luhn.js` and delete the local `luhnCheck` definition (the `function luhnCheck(...)` at the bottom of the file, lines ~145-161). The inline call `luhnCheck(normalized)` inside `detectPii()` stays unchanged — it now references the imported function.

Add this import at the top of `detect-pii.ts`:

```typescript
import { luhnCheck } from "./rules/luhn.js";
```

```bash
bun run test 2>&1 | tail -5
# must show: Tests {422 + 8 new luhn} passed
bun run typecheck 2>&1 | tail -3
# must be clean
```

Commit:

```bash
git add src/detection/rules/luhn.ts src/detection/rules/luhn.test.ts src/detection/detect-pii.ts
git commit -m "refactor(detection): extract luhnCheck to rules/luhn for reuse"
```

### Step 8 — Create `rules/identifiers.ts`

Write `src/detection/rules/identifiers.ts` with the exact content from § 7. Import `luhnCheck` from `./luhn.js`.

```bash
bun run typecheck 2>&1 | tail -3
# must be clean
```

Do NOT write the test file in this step — it gets its own step so commits stay focused.

Commit:

```bash
git add src/detection/rules/identifiers.ts
git commit -m "feat(detection): add rules/identifiers with 8 v1.0 PII rules ported to RegexRule shape"
```

### Step 9 — Create `rules/identifiers.test.ts`

Create `src/detection/rules/identifiers.test.ts`. At minimum, include these tests (adapted from `src/detection/patterns.test.ts`):

```typescript
import { describe, it, expect } from "vitest";

import type { RegexRule } from "../_framework/types.js";

import { IDENTIFIERS } from "./identifiers.js";

/** Find a rule in IDENTIFIERS by its subcategory. Throws if not found. */
function rule(subcategory: string): RegexRule {
  const found = IDENTIFIERS.find((r) => r.subcategory === subcategory);
  if (!found) throw new Error(`rule not registered: ${subcategory}`);
  return found;
}

/** Run a rule's pattern (with postFilter) against a sample, return matched strings. */
function matches(subcategory: string, sample: string): string[] {
  const r = rule(subcategory);
  const re = new RegExp(r.pattern.source, r.pattern.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sample)) !== null) {
    if (r.postFilter && !r.postFilter(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

describe("IDENTIFIERS registry", () => {
  it("exports exactly 8 rules", () => {
    expect(IDENTIFIERS.length).toBe(8);
  });

  it("every rule has category = 'identifiers'", () => {
    for (const r of IDENTIFIERS) {
      expect(r.category).toBe("identifiers");
    }
  });

  it("every rule has a unique id", () => {
    const ids = new Set(IDENTIFIERS.map((r) => r.id));
    expect(ids.size).toBe(IDENTIFIERS.length);
  });

  it("every rule id starts with 'identifiers.'", () => {
    for (const r of IDENTIFIERS) {
      expect(r.id).toMatch(/^identifiers\./);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const r of IDENTIFIERS) {
      expect(r.pattern.flags).toContain("g");
    }
  });

  it("every rule levels array is non-empty", () => {
    for (const r of IDENTIFIERS) {
      expect(r.levels.length).toBeGreaterThan(0);
    }
  });

  it("every rule languages array is non-empty", () => {
    for (const r of IDENTIFIERS) {
      expect(r.languages.length).toBeGreaterThan(0);
    }
  });
});

describe("korean-rrn", () => {
  it("matches the canonical 6-7 form", () => {
    expect(matches("korean-rrn", "주민번호: 900101-1234567 입니다.")).toEqual([
      "900101-1234567",
    ]);
  });

  it("rejects gender code outside 1-8", () => {
    expect(matches("korean-rrn", "900101-9234567")).toEqual([]);
    expect(matches("korean-rrn", "900101-0234567")).toEqual([]);
  });

  it("does not match inside a longer digit run", () => {
    expect(matches("korean-rrn", "1234900101-12345678")).toEqual([]);
    expect(matches("korean-rrn", "900101-12345678")).toEqual([]);
  });

  it("matches multiple RRNs in one paragraph", () => {
    expect(
      matches("korean-rrn", "A: 900101-1234567, B: 850515-2345678"),
    ).toEqual(["900101-1234567", "850515-2345678"]);
  });
});

describe("korean-brn", () => {
  it("matches the canonical 3-2-5 form", () => {
    expect(matches("korean-brn", "사업자번호 123-45-67890 입니다.")).toEqual([
      "123-45-67890",
    ]);
  });

  it("does not match inside a longer digit run", () => {
    expect(matches("korean-brn", "9123-45-67890")).toEqual([]);
    expect(matches("korean-brn", "123-45-678901")).toEqual([]);
  });
});

describe("us-ein", () => {
  it("matches the canonical 2-7 form", () => {
    expect(matches("us-ein", "EIN: 12-3456789")).toEqual(["12-3456789"]);
  });

  it("does not match inside a longer digit run", () => {
    expect(matches("us-ein", "112-3456789")).toEqual([]);
    expect(matches("us-ein", "12-34567890")).toEqual([]);
  });
});

describe("phone-kr", () => {
  it("matches dashed 010 form", () => {
    expect(matches("phone-kr", "010-1234-5678")).toEqual(["010-1234-5678"]);
  });

  it("matches dashless form", () => {
    expect(matches("phone-kr", "01012345678")).toEqual(["01012345678"]);
  });

  it("matches 011, 016-019 carriers", () => {
    expect(matches("phone-kr", "011-234-5678")).toEqual(["011-234-5678"]);
    expect(matches("phone-kr", "016-234-5678")).toEqual(["016-234-5678"]);
    expect(matches("phone-kr", "019-234-5678")).toEqual(["019-234-5678"]);
  });

  it("rejects 015 (not a mobile carrier)", () => {
    expect(matches("phone-kr", "015-234-5678")).toEqual([]);
  });
});

describe("phone-intl", () => {
  it("matches US number with + prefix", () => {
    expect(matches("phone-intl", "Call +1 415 555 0199 soon")).toEqual([
      "+1 415 555 0199",
    ]);
  });

  it("matches Korean international form", () => {
    expect(matches("phone-intl", "+82-10-1234-5678")).toEqual([
      "+82-10-1234-5678",
    ]);
  });

  it("does not match a bare + character", () => {
    expect(matches("phone-intl", "version+1 is fine")).toEqual([]);
  });
});

describe("email", () => {
  it("matches bounded form", () => {
    expect(matches("email", "Contact kim@abc-corp.kr please")).toEqual([
      "kim@abc-corp.kr",
    ]);
  });

  it("matches with subdomains and plus tags", () => {
    expect(matches("email", "legal+filter@mail.sunrise.com")).toEqual([
      "legal+filter@mail.sunrise.com",
    ]);
  });

  it("requires a 2+ letter TLD", () => {
    expect(matches("email", "alice@example.c")).toEqual([]);
  });
});

describe("account-kr", () => {
  it("matches canonical 3-2-5 form (same shape as brn)", () => {
    // This matches BRN shape too — dedup happens at the runner level.
    expect(matches("account-kr", "계좌 123-45-67890")).toContain(
      "123-45-67890",
    );
  });

  it("matches 6-3-7 form", () => {
    expect(matches("account-kr", "123456-123-1234567")).toContain(
      "123456-123-1234567",
    );
  });
});

describe("credit-card (Luhn-validated)", () => {
  it("matches a Visa test number", () => {
    expect(matches("credit-card", "Card: 4111 1111 1111 1111")).toEqual([
      "4111 1111 1111 1111",
    ]);
  });

  it("rejects a 16-digit blob that fails Luhn", () => {
    expect(matches("credit-card", "1234 5678 9012 3456")).toEqual([]);
  });

  it("matches hyphenated form", () => {
    expect(matches("credit-card", "4111-1111-1111-1111")).toEqual([
      "4111-1111-1111-1111",
    ]);
  });

  it("matches unspaced form", () => {
    expect(matches("credit-card", "4111111111111111")).toEqual([
      "4111111111111111",
    ]);
  });
});
```

```bash
bun run test src/detection/rules/identifiers.test.ts 2>&1 | tail -10
# must show all ~35 tests passing
```

Commit:

```bash
git add src/detection/rules/identifiers.test.ts
git commit -m "test(detection): add rules/identifiers.test — per-rule positive/negative coverage"
```

### Step 10 — Create `_framework/registry.ts`

Write `src/detection/_framework/registry.ts` with the exact content from § 11.

```bash
bun run typecheck 2>&1 | tail -3
# must be clean — if verifyRegistry throws, fix the offending rule in identifiers.ts
```

Do NOT create a test file for registry.ts in this step. The verification runs at module load, which means any malformed rule breaks every test that imports the registry. That's the enforcement.

Commit:

```bash
git add src/detection/_framework/registry.ts
git commit -m "feat(detection): add _framework/registry — ALL_REGEX_RULES with load-time invariant checks"
```

### Step 11 — Create `_framework/runner.ts` + test (TDD)

**11a.** Create `src/detection/_framework/runner.test.ts` with these tests:

```typescript
import { describe, it, expect } from "vitest";

import type { RegexRule } from "./types.js";

import { runRegexPhase } from "./runner.js";

const EMAIL_RULE: RegexRule = {
  id: "identifiers.email",
  category: "identifiers",
  subcategory: "email",
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  levels: ["conservative", "standard", "paranoid"],
  languages: ["universal"],
  description: "email",
};

const PHONE_KR_RULE: RegexRule = {
  id: "identifiers.phone-kr",
  category: "identifiers",
  subcategory: "phone-kr",
  pattern: /(?<!\d)01[016-9]-?\d{3,4}-?\d{4}(?!\d)/g,
  levels: ["conservative", "standard", "paranoid"],
  languages: ["ko"],
  description: "Korean mobile",
};

const PARANOID_ONLY_RULE: RegexRule = {
  id: "identifiers.paranoid-only-test",
  category: "identifiers",
  subcategory: "paranoid-only-test",
  pattern: /TEST/g,
  levels: ["paranoid"],
  languages: ["universal"],
  description: "paranoid-only test rule",
};

describe("runRegexPhase", () => {
  it("returns [] for empty text", () => {
    expect(runRegexPhase("", "standard", [EMAIL_RULE])).toEqual([]);
  });

  it("returns [] when no rules match", () => {
    expect(runRegexPhase("hello world", "standard", [EMAIL_RULE])).toEqual([]);
  });

  it("returns a Candidate for a single match", () => {
    const candidates = runRegexPhase(
      "Contact legal@sunrise.com for details",
      "standard",
      [EMAIL_RULE],
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      text: "legal@sunrise.com",
      ruleId: "identifiers.email",
      confidence: 1,
    });
  });

  it("returns multiple candidates for multiple matches", () => {
    const candidates = runRegexPhase(
      "a@x.com and b@y.com",
      "standard",
      [EMAIL_RULE],
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.text)).toEqual(["a@x.com", "b@y.com"]);
  });

  it("applies postFilter to reject false positives", () => {
    const BAD_RULE: RegexRule = {
      id: "identifiers.test-filter",
      category: "identifiers",
      subcategory: "test-filter",
      pattern: /\d{4}/g,
      postFilter: (m) => m === "1234", // only accept "1234"
      levels: ["standard"],
      languages: ["universal"],
      description: "test",
    };
    const candidates = runRegexPhase("5678 1234 9999", "standard", [BAD_RULE]);
    expect(candidates.map((c) => c.text)).toEqual(["1234"]);
  });

  it("filters out rules whose levels do not include the given level", () => {
    const candidates = runRegexPhase(
      "TEST string here",
      "standard",
      [PARANOID_ONLY_RULE],
    );
    expect(candidates).toEqual([]);
  });

  it("includes rules whose levels do match", () => {
    const candidates = runRegexPhase(
      "TEST string here",
      "paranoid",
      [PARANOID_ONLY_RULE],
    );
    expect(candidates.map((c) => c.text)).toEqual(["TEST"]);
  });

  it("runs multiple rules in order they appear in the input array", () => {
    const candidates = runRegexPhase(
      "legal@sunrise.com and 010-1234-5678",
      "standard",
      [EMAIL_RULE, PHONE_KR_RULE],
    );
    expect(candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.email",
      "identifiers.phone-kr",
    ]);
  });

  it("recovers ORIGINAL bytes (not normalized) for en-dashed phone", () => {
    // en-dash variants should normalize to ASCII hyphens for matching, but
    // the returned Candidate.text must contain the ORIGINAL en-dash form.
    const candidates = runRegexPhase("010\u20131234\u20135678", "standard", [
      PHONE_KR_RULE,
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.text).toBe("010\u20131234\u20135678");
  });

  it("is deterministic — same input yields same output", () => {
    const text = "a@x.com b@y.com 010-1234-5678";
    const first = runRegexPhase(text, "standard", [EMAIL_RULE, PHONE_KR_RULE]);
    const second = runRegexPhase(text, "standard", [EMAIL_RULE, PHONE_KR_RULE]);
    expect(first).toEqual(second);
  });
});
```

**11b.** Write `src/detection/_framework/runner.ts` with the exact content from § 9.

```bash
bun run test src/detection/_framework/runner.test.ts 2>&1 | tail -5
# must show all 10 tests passing
bun run typecheck 2>&1 | tail -3
# must be clean
```

Commit:

```bash
git add src/detection/_framework/runner.ts src/detection/_framework/runner.test.ts
git commit -m "feat(detection): add _framework/runner — regex phase with level filter + byte recovery"
```

### Step 12 — Create `_framework/redos-guard.test.ts`

Fuzz every registered rule with adversarial inputs per `docs/RULES_GUIDE.md` § 7.3:

```typescript
import { describe, it, expect } from "vitest";

import { ALL_REGEX_RULES } from "./registry.js";

const ADVERSARIAL_INPUTS: readonly string[] = [
  "a".repeat(10_000),
  "1".repeat(10_000),
  "-".repeat(10_000),
  "a-".repeat(5_000),
  "1 ".repeat(5_000),
  " ".repeat(10_000),
];

describe("ReDoS guard", () => {
  for (const rule of ALL_REGEX_RULES) {
    for (const input of ADVERSARIAL_INPUTS) {
      it(`${rule.id} returns within 50ms on ${input.length}-char adversarial input`, () => {
        const start = performance.now();
        const re = new RegExp(rule.pattern.source, rule.pattern.flags);
        let count = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(input)) !== null && count < 10_000) count++;
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
      });
    }
  }
});
```

```bash
bun run test src/detection/_framework/redos-guard.test.ts 2>&1 | tail -5
# must show all 48 tests passing (8 rules × 6 inputs)
```

If any test fails — that's a ReDoS in a ported rule, which is unexpected (v1.0 patterns were hand-audited). Report it immediately and STOP. Do not "fix" by relaxing the 50ms budget. The budget is the contract.

Commit:

```bash
git add src/detection/_framework/redos-guard.test.ts
git commit -m "test(detection): add _framework/redos-guard — adversarial fuzz for all rules"
```

### Step 13 — Rewrite `detect-pii.ts` as shim

Replace the content of `src/detection/detect-pii.ts` with the shim from § 8.2.

Do NOT delete the file. Do NOT modify `detect-pii.test.ts`. Do NOT modify `detect-pii.integration.test.ts`.

```bash
bun run test 2>&1 | tail -10
# must show all 422 original tests STILL passing plus new framework tests
# Pay special attention to:
#   - src/detection/detect-pii.test.ts (the behavioral tests)
#   - src/detection/detect-pii.integration.test.ts (the ship-gate)
```

If `detect-pii.integration.test.ts` fails, the shim has diverged from v1.0 output. Debug by:

1. Checking the `SUBCATEGORY_TO_KIND` mapping — did you typo a subcategory name?
2. Checking rule iteration order — does `IDENTIFIERS` array order match `PII_KINDS` array order?
3. Adding a temporary log to compare old vs new output on a single text sample.

Do NOT suppress the test. Do NOT add `it.skip`. If you can't make it pass, STOP and escalate.

```bash
bun run typecheck 2>&1 | tail -3
# must be clean
```

Commit:

```bash
git add src/detection/detect-pii.ts
git commit -m "refactor(detection): rewrite detect-pii as shim over _framework/runner"
```

### Step 14 — Migrate `patterns.ts`

Replace the content of `src/detection/patterns.ts` with the migration code from § 8.1.

Do NOT modify `patterns.test.ts`.

```bash
bun run test src/detection/patterns.test.ts 2>&1 | tail -5
# must show all existing patterns.test.ts tests passing

bun run test 2>&1 | tail -10
# must show 422 original tests + new framework tests all passing
```

Commit:

```bash
git add src/detection/patterns.ts
git commit -m "refactor(detection): migrate patterns.ts to thin re-export layer over rules/identifiers"
```

### Step 15 — Full ship gate

Run the complete gate:

```bash
bun run test 2>&1 | tail -10
# must show: Test Files {> 26} passed
#            Tests {> 422, expected 520-580} passed

bun run typecheck 2>&1 | tail -5
# must show: 0 errors 0 warnings

bun run lint 2>&1 | tail -5
# must show: 0 errors (3 pre-existing warnings in coverage/*.js OK)

bun run build 2>&1 | tail -10
# must produce dist/document-redactor.html + dist/document-redactor.html.sha256
# build must complete without errors

# Determinism check — run build twice, compare hashes
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
if [ "$FIRST" = "$SECOND" ]; then
  echo "DETERMINISM OK: $FIRST"
else
  echo "DETERMINISM BROKEN: $FIRST != $SECOND"
  exit 1
fi
```

The build output hash will be different from v1.0's hash (`8ef843da5d416fee67dc720b13353ac4d11542bf4cca218aec16c54f75100721`) because the code changed. This is EXPECTED. What's required is that **the new hash is itself deterministic** — running `bun run build` twice produces the same hash.

If the determinism check fails, something is non-deterministic in your new code (rare — the existing finalize.ts pins zip dates, so it should stay deterministic). Report and investigate.

Do NOT commit `dist/`. It's gitignored.

Do NOT run `git push`.

---

## 14. Testing requirements (summary)

### Minimum new test counts

| File | Minimum tests | Notes |
|---|---:|---|
| `detect-pii.characterization.test.ts` (Step 2) | 17 | T1–T10, T12–T18 added pre-port; T11 and T9 post-port verification |
| `_framework/types.test.ts` (Step 5) | 10 | type-level sanity + compile checks |
| `_framework/language-detect.test.ts` (Step 6) | 8 | ko-only, en-only, mixed, empty, symbol-only, thresholds |
| `rules/luhn.test.ts` (Step 7) | 8 | Visa, Mastercard, formatting variants, empty, non-digit |
| `rules/identifiers.test.ts` (Step 9) | 35+ | registry sanity + 5-7 tests per rule × 8 rules + T3 post-port regex source parity vs `IDENTIFIERS` |
| `_framework/runner.test.ts` (Step 11) | 11 | empty, single match, multi match, postFilter, level filter, byte recovery, determinism, + T11 level no-op over IDENTIFIERS |
| `_framework/redos-guard.test.ts` (Step 12) | 48 | 8 rules × 6 adversarial inputs |
| **Total new tests** | **~137** | Expected total: 422 + 137 = ~559 |

### Characterization tests are the ship gate

The characterization suite added in **Step 2** (file: `detect-pii.characterization.test.ts`) is the single most important test artifact in Phase 0. It captures 17 invariants across ordering, mapping, regex parity, normalized-vs-original semantics, fullwidth card Luhn, zero-width handling, no-language-filter behavior, overlap preservation, dedupe-by-original, same-length tie order, lastIndex resistance, and an exact fixture-target snapshot (T18). See § 12a for the full rationale.

**Do not weaken these tests during the port.** If one fails after you write ported code, the port has drifted. Fix the port, not the test. The only exception is T18's `EXPECTED_WORST_CASE_TARGETS` array, which is populated exactly once in Step 2c from v1.0 output and never edited again.

### Test quality target

Per `docs/RULES_GUIDE.md` § 8.3:

- **★★★** — canonical + variants + edge cases + error paths + regression
- **★★** — canonical + at least one edge case
- **★** — smoke test only

Target: every new test file is ★★★. If you find yourself writing ★★ tests to save time, STOP and add the edge cases.

### Coverage target

`src/detection/**` must maintain ≥98% statement coverage. Run `bun run test --coverage` to verify (optional, final step).

---

## 15. Verification commands (ship gate)

Run these commands in order at the end of Step 15. All must succeed for the phase to be accepted.

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"

# 1. Git state
git status                           # working tree clean
git log --oneline -18                # ~10-14 new commits on top of 74dfb2c
git diff 74dfb2c --stat              # see file-level summary

# 2. Tests
bun run test 2>&1 | tail -10         # 540-600 passing, 0 failing

# 3. Type check
bun run typecheck 2>&1 | tail -5     # 0 errors

# 4. Lint
bun run lint 2>&1 | tail -5          # 0 errors

# 5. Build
bun run build 2>&1 | tail -10        # completes without errors
ls -la dist/document-redactor.html dist/document-redactor.html.sha256

# 6. Build determinism
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build 2>&1 > /dev/null
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
[ "$FIRST" = "$SECOND" ] && echo "DETERMINISM OK: $FIRST" || echo "FAIL"

# 7. CHARACTERIZATION SHIP GATE — the most important check
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tail -10
# Must show ALL characterization tests passing (T1–T10, T12–T18 pre-port
# + T9 post-port parity). If ANY fail, the port has drifted — DO NOT accept.

# 8. Integration test passes (secondary check vs characterization T18)
bun run test src/detection/detect-pii.integration.test.ts 2>&1 | tail -5

# 9. No accidental untracked files
git status --porcelain | grep -v '^??' || echo "clean"
git status --ignored --short
```

If ANY of these fail at the final run, the phase is NOT complete. Do not proceed to the handback until every line above is green. **In particular, if any characterization test fails, the failure mode is NOT "flaky test — retry" — the ported code has observable behavior drift from v1.0 along the dimension that test locks down. Diagnose and fix the port.**

---

## 16. Commit conventions

Every commit must follow this format:

```
<type>(<scope>): <short summary in imperative mood>

<optional body — wrap at 72 chars>

Co-Authored-By: Codex <noreply@openai.com>
```

### Valid `<type>` values

- `feat` — new feature (new file, new exported function)
- `refactor` — restructuring without behavior change
- `test` — test-only commits (no production code change)
- `fix` — bug fix (should not be needed in Phase 0 since you're not fixing bugs)

### Valid `<scope>` values

- `detection` — anything under `src/detection/`
- `detection/framework` — anything under `src/detection/_framework/`
- `detection/rules` — anything under `src/detection/rules/`

### Example commits

See the TDD sequence in § 13 for the exact commit messages to use. Copy them verbatim.

### Critical rules

- **Do not squash commits.** Each TDD step is its own commit.
- **Do not amend commits after the initial commit.** If you made a mistake, fix it in a new commit.
- **Do not use `--no-verify`.** If a pre-commit hook fails, fix the issue.
- **Use HEREDOCs for multi-line commit messages** (see the Step 2 example).
- **Include `Co-Authored-By: Codex <noreply@openai.com>`** on every commit for attribution.

---

## 17. Gotchas (non-obvious constraints)

These are things that will trip you up if you don't know them.

### 17.1 `.svelte.ts` extension is load-bearing

If you rename `src/ui/state.svelte.ts` to `state.ts`, the Svelte compiler will not enable runes mode for it and the UI will break at runtime. **Don't touch `src/ui/` at all.** It's out of scope anyway.

### 17.2 `allowImportingTsExtensions` + `.js` convention

The tsconfig has `allowImportingTsExtensions: true` AND Vite's convention is to use `.js` extensions in imports. Example:

```typescript
import { IDENTIFIERS } from "./rules/identifiers.js";  // ✅ correct
import { IDENTIFIERS } from "./rules/identifiers";     // ❌ won't resolve
import { IDENTIFIERS } from "./rules/identifiers.ts";  // ❌ violates lint
```

Always use `.js` extension in imports, even though the source file is `.ts`. This is non-negotiable — the bundler depends on it.

### 17.3 `verbatimModuleSyntax: true` — type imports must use `import type`

The tsconfig has `verbatimModuleSyntax: true`, which means type-only imports MUST use the `import type` syntax:

```typescript
// ✅ correct
import type { RegexRule } from "./types.js";
import { IDENTIFIERS } from "./rules/identifiers.js";

// ❌ fails — RegexRule is a type, not a runtime value
import { RegexRule, IDENTIFIERS } from "./rules/identifiers.js";
```

If your build or typecheck complains about "cannot be used as a value" or similar, you probably forgot the `type` keyword.

### 17.4 `noUncheckedIndexedAccess: true`

Array access is `T | undefined`. You must assert non-null or check explicitly:

```typescript
const rule = IDENTIFIERS[0];           // type: RegexRule | undefined
const rule2 = IDENTIFIERS[0]!;         // type: RegexRule (non-null assertion)
if (IDENTIFIERS[0]) { /* use it */ }   // narrowed inside
```

Use `!` sparingly and only when you are certain the index is in range (e.g., the `origOffsets[startNorm]!` pattern from the runner — `startNorm` comes from a match so it's guaranteed valid).

### 17.5 `exactOptionalPropertyTypes: true`

Optional fields must be either omitted or explicitly `undefined` — but not both styles mixed:

```typescript
// ✅ correct — omitted when not present
const rule: RegexRule = {
  id: "identifiers.test",
  // ... no postFilter field at all
};

// ✅ correct — explicit undefined
const rule: RegexRule = {
  id: "identifiers.test",
  postFilter: undefined,
  // ...
};

// ❌ wrong — `postFilter?: undefined` in the type means you can't set it AND have the type accept it
```

This mostly shows up with `postFilter`. When a rule has no post-filter, omit the field entirely. Do not set it to `undefined`.

### 17.6 Regex `lastIndex` state

Every RegExp object with the `g` flag has a `lastIndex` property that tracks the position of the last match. Calling `exec` advances it. Calling `exec` again AFTER a `null` return resets it.

**The danger:** if you reuse the same RegExp object across calls (or across rules accessing the same pattern), `lastIndex` from one call pollutes another. The fix is to **clone the regex** before each call:

```typescript
const re = new RegExp(rule.pattern.source, rule.pattern.flags);
```

The runner in § 9 does this inside the per-rule loop. Do not optimize it away.

### 17.7 `normalizeForMatching` offset map

The `PositionMap.origOffsets` array has `text.length + 1` elements — there's a sentinel at the end equal to the original text length. This lets you compute `slice(start, end)` where `end` can be exactly `text.length`. Do not forget the sentinel.

The old `detect-pii.ts:87-93` has the canonical pattern:

```typescript
const startNorm = m.index;
const endNorm = startNorm + normalized.length;
const startOrig = map.origOffsets[startNorm]!;
const endOrig = map.origOffsets[endNorm]!;
const original = text.slice(startOrig, endOrig);
```

Copy this exactly into the runner. Do not attempt to "simplify" the offset math.

### 17.8 Bun vs Vitest test runners

`bun run test` invokes Vitest (the project's configured test runner). Do NOT use `bun test` directly — that invokes Bun's native test runner, which has incompatible semantics and different imports. Always use `bun run test`.

### 17.9 `as const satisfies` idiom

The existing code uses this pattern for typed const arrays:

```typescript
export const IDENTIFIERS = [
  { /* rule 1 */ },
  { /* rule 2 */ },
] as const satisfies readonly RegexRule[];
```

Use this pattern for `IDENTIFIERS` in `rules/identifiers.ts`. It gives you both the readonly const inference AND the type check.

### 17.10 Korean character range

Hangul syllables are `U+AC00..U+D7A3`. In regex, this is `[\uAC00-\uD7A3]`. Use the lower range in any rule that needs to match Korean characters (future phases, not Phase 0).

### 17.11 Tests run in parallel by default

Vitest runs test files in parallel. If your tests accidentally share state (global module variables, singletons), they can interfere. Your rules and runner are stateless — this should not be an issue, but if you see flaky tests, check for shared state.

---

## 18. Out of scope (DO NOT DO)

- ❌ Add new detection rules beyond the 8 v1.0 ports
- ❌ Add structural parsers or heuristics (Phase 2 and 4)
- ❌ Add financial / temporal / entities / legal rules (Phase 1 and 3)
- ❌ Add language filtering to the runner (Phase 1)
- ❌ Write the coverage-audit script (Phase 5)
- ❌ Modify the UI (`src/ui/`) to use the new framework
- ❌ Modify the build pipeline, ESLint config, tsconfig, or package.json
- ❌ Delete old `patterns.ts` or `detect-pii.ts` (they become thin shims)
- ❌ Rename `detect-pii.ts` or `patterns.ts`
- ❌ Reformat, restyle, or refactor code outside the strict porting scope
- ❌ Add comments or improvements to unmodified files
- ❌ Update existing test files (other than adapting existing tests INTO `rules/identifiers.test.ts` as references — you do not modify the old files)
- ❌ `git push`
- ❌ Modify `tests/fixtures/`
- ❌ Add any npm package (`bun add` / `npm install`)
- ❌ Change anything in `docs/` other than the handback file (§ 20)
- ❌ Change anything in `../document-redactor-private-notes/` (you do not have write access there anyway)

**If you feel an urge to do any of these, STOP.** Record the urge in the handback doc's "deviations" section if you think it's important, but do not act on it. The user decides whether to pursue it in a future phase.

---

## 19. Acceptance criteria (verifiable, numeric)

Your work is accepted if and only if ALL of the following are true. Run each check and report the result in the handback doc.

1. ✅ `bun run test` → `Tests N passed (N)` where N is between 540 and 600 (422 original + ~120-170 new including characterization)
2. ✅ `bun run typecheck` → `0 errors 0 warnings`
3. ✅ `bun run lint` → 0 errors (3 pre-existing warnings in `coverage/*.js` are OK, no new warnings)
4. ✅ `bun run build` → `dist/document-redactor.html` + `dist/document-redactor.html.sha256` produced, no errors
5. ✅ `bun run build` run twice produces byte-identical `dist/document-redactor.html.sha256` (determinism)
6. ✅ `src/detection/_framework/types.ts` exists and exports: `Level`, `Language`, `Category`, `PostFilter`, `RegexRule`, `StructuralDefinition`, `StructuralParser`, `Candidate`, `HeuristicContext`, `Heuristic` (10 exports)
7. ✅ `src/detection/_framework/runner.ts` exists and exports `runRegexPhase`
8. ✅ `src/detection/_framework/language-detect.ts` exists and exports `detectLanguage`
9. ✅ `src/detection/_framework/registry.ts` exists and exports `ALL_REGEX_RULES` with exactly 8 entries
10. ✅ `src/detection/rules/identifiers.ts` exists and exports `IDENTIFIERS` with exactly 8 rules
11. ✅ `src/detection/rules/luhn.ts` exists and exports `luhnCheck`
12. ✅ `src/detection/patterns.ts` still exports `PiiKind`, `PII_KINDS`, `PII_PATTERNS` (now derived from the new framework)
13. ✅ `src/detection/detect-pii.ts` still exports `DetectedMatch`, `ScopedDetectedMatch`, `detectPii`, `detectPiiInZip`, `buildTargetsFromZip` (same signatures)
14. ✅ `git log --oneline 74dfb2c..HEAD` shows 10-14 new commits, each with a conventional commit message
15. ✅ `git status` is clean (no untracked files other than `dist/` and any other gitignored paths)
16. ✅ `src/detection/detect-pii.integration.test.ts` passes (worst-case fixture round-trip)
17. ✅ `src/detection/detect-pii.test.ts` passes (all behavioral tests)
18. ✅ `src/detection/patterns.test.ts` passes (all pattern-level tests — including the Step 3 title fix)
19. ✅ `src/detection/_framework/redos-guard.test.ts` passes (all 48 fuzz tests under 50ms)
20. ✅ **`src/detection/detect-pii.characterization.test.ts` passes ALL 18 characterization tests** (T1–T10, T12–T18 pre-port + T9 post-port parity). **This is the single most important acceptance criterion — it is the real Phase 0 ship gate.**
21. ✅ T18 `EXPECTED_WORST_CASE_TARGETS` is populated from v1.0 output (not empty, not a placeholder) and the ported code produces byte-identical match against it.
22. ✅ `rules/identifiers.test.ts` T3 post-port extension: every entry in `IDENTIFIERS` has `pattern.source` and `pattern.flags` byte-for-byte equal to the corresponding legacy `PII_PATTERNS` entry.
23. ✅ `_framework/runner.test.ts` T11 post-port extension: `runRegexPhase` over `IDENTIFIERS` produces deep-equal output for `conservative`, `standard`, and `paranoid` levels (the level filter is a no-op in Phase 0).
24. ✅ `detect-pii.ts` shim passes `IDENTIFIERS` (not `ALL_REGEX_RULES`) to `runRegexPhase` — verified by reading the file and by the characterization tests that would break if any non-identifier match leaked into `DetectedMatch.kind`.

If any criterion fails, the phase is NOT accepted. Fix and re-verify before handback.

**Pre-port and post-port milestones**

The phase has TWO gates:

- **Pre-port gate** (end of Step 3): 17 characterization tests passing on v1.0 code, `EXPECTED_WORST_CASE_TARGETS` populated and T18 green, 3 stale docs fixed. No framework code written yet. Tests total ≈ 440 (422 + ~18 characterization).
- **Post-port gate** (end of Step 15): all criteria 1–24 above green. Tests total ≈ 540–600.

If the pre-port gate fails, stop and escalate — the v1.0 baseline is different from what § 12a assumes, and the brief needs human review before the port can proceed.

---

## 20. Handback contract

When (and only when) all 19 acceptance criteria are green, create a single markdown file at `docs/phases/phase-0-handback.md` with the following structure:

```markdown
# Phase 0 handback — Rule framework port

**Completed:** YYYY-MM-DD HH:MM
**Executed by:** Codex 5.4 xhigh
**Starting commit:** 74dfb2c
**Ending commit:** {short hash of HEAD}

## Summary (1 paragraph)

One paragraph describing what was done, how many files touched, how many
tests added, any notable findings.

## Commits created

```
{output of `git log --oneline 74dfb2c..HEAD`}
```

## Files created

- src/detection/_framework/types.ts  ({N} lines)
- src/detection/_framework/types.test.ts  ({N} lines)
- ... (full list)

## Files modified

- src/detection/patterns.ts  (rewritten as shim, {N} lines)
- src/detection/detect-pii.ts  (rewritten as shim, {N} lines)

## Tests

- Before: 422 passing / 422 total
- After: {N} passing / {N} total
- New: {N} added across {M} files

## Build

- Before hash (v1.0.0): 8ef843da5d416fee67dc720b13353ac4d11542bf4cca218aec16c54f75100721
- After hash (Phase 0): {new hash}
- Determinism verified: {yes/no} (ran build twice, hashes matched)

## Deviations from brief

{Any section where you made a judgment call different from the brief. Explain why.
If no deviations, write "None."}

## Gotchas encountered

{Anything non-obvious you hit and had to work around. Useful as learning for
future phases.}

## Manual verification recommended before accepting

{Things the user should check manually before pushing:}

- [ ] Open `dist/document-redactor.html` in a browser, drop `tests/fixtures/bilingual_nda_worst_case.docx`, verify redaction still works visually
- [ ] Compare `IDENTIFIERS` rule order against `PII_KINDS` order — they must match
- [ ] Check `git diff 74dfb2c -- src/detection/detect-pii.ts` to confirm the shim is tight (no dead code left over)
- [ ] Spot-check a rule in `rules/identifiers.ts` — does the regex source match the current `patterns.ts` exactly?

## Suggested next steps (Phase 1 bootstrap)

Phase 1 adds ~10-15 high-value regex rules across financial + temporal + entities
categories. Starting points:

1. Create `src/detection/rules/financial.ts` with `FINANCIAL: readonly RegexRule[]`
2. Add `...FINANCIAL` to `ALL_REGEX_RULES` in `registry.ts`
3. Follow `docs/RULES_GUIDE.md` § 4 (10-step walkthrough) for each rule
4. Same TDD pattern as Phase 0 (test first, then rule, then registry verification)
5. Consider wiring language filter into the runner at the same time (see `runner.ts` TODO comment)
```

Do NOT commit the handback doc in the same commit as production code. Its own commit, its own message:

```bash
git add docs/phases/phase-0-handback.md
git commit -m "docs(phases): add Phase 0 handback — rule framework port complete"
```

This commit can be the 13th (or later) commit in the sequence.

---

## 21. Error handling (what to do when you get stuck)

**If a test fails unexpectedly:**

1. Read the error message carefully — which assertion? What was expected vs actual?
2. Run just that test file in isolation to reproduce.
3. Add temporary `console.log` statements to compare old vs new output.
4. Check your SUBCATEGORY_TO_KIND / KIND_TO_SUBCATEGORY mappings for typos.
5. Check rule iteration order in `IDENTIFIERS` vs `PII_KINDS`.
6. DO NOT skip the test. DO NOT suppress the test. DO NOT add `it.skip`.

**If TypeScript complains:**

1. Read the exact error location (file:line:column).
2. Check for missing `import type` on type-only imports.
3. Check for missing `.js` extension on imports.
4. Check for `noUncheckedIndexedAccess` — you may need `!` or a check.
5. DO NOT disable the compiler option. DO NOT add `// @ts-ignore`. DO NOT cast to `any`.

**If ESLint complains:**

1. Read the rule name and the violation.
2. If it's a `no-restricted-syntax` ban (fetch, XMLHttpRequest, etc.), remove the network code — that's out of scope.
3. If it's a formatting issue, fix the format.
4. DO NOT use `// eslint-disable-next-line`. DO NOT modify `.eslintrc`.

**If the build fails:**

1. Read the error. Is it a type error? An import error? A Vite config error?
2. If Vite can't resolve a module, check the `.js` extension.
3. If Vite complains about dynamic import, you probably added a fetch or similar — remove it.
4. DO NOT modify `vite.config.ts`.

**If you've tried 3 times and still can't fix the problem:**

STOP. Write a section in the handback doc titled "BLOCKED" with:
- What you were trying to do
- The exact error message
- What you tried
- What you think the root cause might be

Then exit. Do not commit broken code. Do not try to "just get it passing" by cheating.

**If the acceptance criteria cannot be met (some test you can't make pass):**

Same protocol as above. Write a BLOCKED section. The user will diagnose and unblock.

**If the mission statement is unclear or contradicts itself:**

The mission statement is the source of truth. If you find a contradiction between the mission and a later section of the brief, the mission wins. Record the contradiction in the handback's "deviations" section.

---

## End of brief

This document is `docs/phases/phase-0-framework-port.md`. Bookmark it. Reference it by name in your commit messages when relevant. If you return to this task after a break, re-read § 1 (mission), § 3 (invariants), and § 19 (acceptance criteria) before resuming work.

Good hunting.
