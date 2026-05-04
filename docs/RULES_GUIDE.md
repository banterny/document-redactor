# Rules Guide — document-redactor

**Status:** v0 draft (2026-04-10). Binding convention spec for rule authoring.
**Companion spec:** [design-v1.md](../../document-redactor-private-notes/design-v1.md) § "Eng Review Lock-in (2026-04-09)" (strategic invariants — read that first if you haven't).
**Reference implementation:** [src/detection/patterns.ts](../src/detection/patterns.ts), [src/detection/detect-pii.ts](../src/detection/detect-pii.ts), [src/detection/normalize.ts](../src/detection/normalize.ts) — current Lane A PII detection. The new rule framework extends this same pattern.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Taxonomy — 7 categories](#2-taxonomy--7-categories)
3. [Rule shapes](#3-rule-shapes)
4. [Writing a regex rule — 10-step walkthrough](#4-writing-a-regex-rule--10-step-walkthrough)
5. [Writing a structural parser](#5-writing-a-structural-parser)
6. [Writing a heuristic](#6-writing-a-heuristic)
7. [ReDoS audit checklist](#7-redos-audit-checklist)
8. [Testing convention](#8-testing-convention)
9. [Dedup and boundary semantics](#9-dedup-and-boundary-semantics)
10. [Level/tier mapping (Conservative / Standard / Paranoid)](#10-leveltier-mapping)
11. [Language handling](#11-language-handling)
12. [Anti-patterns (forbidden list)](#12-anti-patterns)
13. [Rule catalog (living)](#13-rule-catalog)
14. [Measurement protocol (Phase 5 ≥90% bar)](#14-measurement-protocol)

---

## 1. Purpose and scope

### What this document is

A binding convention spec for how detection rules are written, registered, tested, and audited in document-redactor. It complements [design-v1.md](../../document-redactor-private-notes/design-v1.md) (strategic spec — invariants, distribution model, D1–D9 UX decisions) with the mechanical "how do you actually write a rule" playbook.

This document exists because v1.1 will add ~200 rules across 5–8 Claude Code sessions. Without a shared convention, those sessions drift: rule IDs diverge, test sets get inconsistent, ReDoS slips in, normalization assumptions contradict. For a legal tool where **false negatives are silent leaks**, drift is not a style issue. It is a safety issue.

### What this document is not

- Not a tutorial on regex. Assumes you know lookbehind, lookahead, bounded quantifiers.
- Not a specification of the DOCX format. See [src/docx/](../src/docx/) for the XML story.
- Not a replacement for design-v1.md's 15 Eng Review Lock-ins. Those are load-bearing invariants; this document is mechanical convention on top of them.
- Not immutable. Sections 13 (rule catalog) and 14 (measurement protocol) grow per phase. Sections 1–12 should change only via explicit decision with a commit explaining why.

### Read order for contributors (or future you)

1. [design-v1.md](../../document-redactor-private-notes/design-v1.md) § "Eng Review Lock-in" (strategic invariants)
2. This document § 1–3 (taxonomy + shapes)
3. [src/detection/patterns.ts](../src/detection/patterns.ts) top-of-file comment (the reference implementation's own mini-guide)
4. Then pick a section per task.

### Tension with Lock-in #11 (readability target)

design-v1.md § Eng Review Lock-in #11 targets "total lines < 2000, total files < 15, smart junior dev in 1 hour". v1.0 ships at ~3124 production LOC across ~35 files — already past that target because the DOCX engine (coalescer, scope walker, verifier, finalizer) is structurally irreducible. Adding 200 rules pushes this to ~5000–6500 LOC across ~45–50 files.

**The renegotiation of Lock-in #11 for v1.1 is this:** readability is measured per category-file, not across the whole codebase. A junior dev reading `src/detection/rules/identifiers.ts` should understand every rule in that file in under 10 minutes. They should not have to read every category file to work on one. Category files are independent; coupling between them is zero (dedup is the runner's job, not the category's). This is the condition under which 200 rules can coexist without breaking Lock-in #11's spirit.

If a category file grows past ~500 lines or ~30 rules, split it (e.g., `identifiers-korean.ts` and `identifiers-us.ts`). That's the pressure valve.

---

## 2. Taxonomy — 7 categories

Why 7 categories, not 4 or 12:

- **4 is too few.** Lumps together structural parsers with regex PII, which have fundamentally different shapes and different runtime phases. Boundary disputes become frequent.
- **12 is too many.** Categories blur into each other (e.g., "finance-contract-terms" vs "finance-statutory-limits"), boundary disputes per rule, authors waste time on taxonomy instead of rules.
- **7 reflects the structure of real legal documents.** PII, money, dates, names, structure, heuristics, legal-specific. This is also the decomposition used in Microsoft Presidio and spaCy NER trained on legal corpora, so it's not novel — it's boring by default.

### 2.1 `identifiers`

Fixed-structure PII with known canonical forms.

**Boundary:** if it has a deterministic regex (government-issued number, network identifier, payment card, bank account), it belongs here.

**Examples:**
- 주민등록번호 (Korean RRN): `900101-1234567`
- 사업자등록번호 (Korean BRN): `123-45-67890`
- US EIN: `12-3456789`
- Korean mobile phone: `010-1234-5678`
- International phone: `+82-10-1234-5678`
- Email: `legal@sunrise.com`
- Korean bank account: `123-456-78901234`
- Credit card (Luhn-validated): `4111 1111 1111 1111`

**What doesn't belong:**
- Person names → `entities`
- Company names → `entities`
- Court case numbers → `legal`

### 2.2 `financial`

Amounts, percentages, currencies. Any number that denotes value, price, rate, or monetary size.

**Boundary:** if it's a number with a currency or rate unit attached, it belongs here.

**Examples:**
- Korean won: `₩10,000,000`, `10,000,000원`, `만원`, `억원`, `일금 오천만원정`
- Foreign currency: `$50,000`, `USD 500,000`, `€1,000`, `JPY 1,000,000`
- Percentages: `5%`, `0.25%`, `5 퍼센트`, `3분의 1`
- Royalty rates: `매출의 5%`, `5% of net sales`

**What doesn't belong:**
- Bank account numbers → `identifiers` (they're IDs, not values)
- Contract durations denominated in years/months → `temporal`
- Page numbers → not a rule at all (not sensitive)

### 2.3 `temporal`

Dates (points in time) and durations (intervals).

**Boundary:** if it locates a moment in time or measures a span of time, it belongs here.

**Examples:**
- Korean dates: `2024년 1월 15일`, `2024.1.15`, `24년 1월`
- ISO dates: `2024-01-15`, `2024/01/15`
- English dates: `January 15, 2024`, `Jan 15, 2024`, `1/15/2024`
- Korean durations: `3년간`, `6개월`, `90일`, `유효기간 1년`
- English durations: `3 years`, `6 months`, `90 days`, `two-year term`

**What doesn't belong:**
- Court case numbers containing years (`2024가합12345`) → `legal` (the year is incidental)
- Birth dates as part of RRN (`900101-1234567`) → `identifiers` (already captured)

### 2.4 `entities`

Person names and legal entity names — detected via **structural cues** (corporate suffixes, honorifics, titles), not by hardcoding specific names.

**Boundary:** if the match is a proper name detected because of a surrounding cue word (`주식회사`, `Corp`, `대표이사`, `Mr.`), it belongs here.

**Examples:**
- `주식회사 ABC`, `ABC 주식회사`, `(주) ABC`, `ABC (주)`
- `ABC Corp.`, `ABC Inc.`, `ABC LLC`, `ABC Ltd.`
- `대표이사 김철수`, `이사 박영희`, `대표 이영숙`
- `Mr. Smith`, `Prof. Kim`, `Dr. Park`
- `CEO Jane Doe`, `President Kim`

**What doesn't belong:**
- Specific hardcoded names like "Acme Corp" (use manual additions or internal propagation fixtures, not shipped rules)
- Heuristic capitalization matches without a suffix cue → `heuristics`

### 2.5 `structural`

Position-dependent parsers that extract **context**, not candidates directly.

**Boundary:** if it depends on *where* in the document something appears (beginning, signature block, definition section), it belongs here.

**Key difference from other categories:** structural parsers output `StructuralDefinition[]`, NOT `Candidate[]`. Their output is used as **input** to later phases (heuristics in particular).

**Examples:**
- Definition section: `"X" means Y`, `"X" shall mean Y`, `hereinafter "X"`, `"X"이라 함은 Y`, `(이하 "X")`
- Signature block: `By: ___`, `이름:`, `성명:`, `대표이사 ___`
- Party declaration: first paragraph `This Agreement is made between A and B`, `본 계약은 A(이하 '갑')와 B(이하 '을') 간에`
- Recitals: `WHEREAS A desires…`, `전문 …`
- Header block: document title, execution date, document number

**What doesn't belong:**
- Anything that works without knowing document position (→ other categories)

### 2.6 `heuristics`

Document-specific entity discovery — the "everything else" category for fuzzy matches.

**Boundary:** if it's a pattern that requires tuning, confidence scoring, or role-word blacklisting, it belongs here.

**Examples:**
- Capitalization cluster: English 2+ consecutive capitalized words → candidate entity
- Quoted term: everything inside `"X"`, `「X」`, `『X』`, `'X'`
- Repeatability with role blacklist: token appears 3+ times AND is not in the role blacklist (`당사자`, `party`, `plaintiff`, …) → candidate entity
- Email-domain inference: `legal@acme-corp.com` → suggest `Acme Corp`

**Key invariant:** heuristics **must** consume `context.structuralDefinitions` from the structural phase to preserve D9 defined-term policy. A label classified by the parser MUST NOT be re-flagged by a heuristic as a literal.

**Runs last** because heuristics depend on structural output (definition awareness) and regex output (to avoid double-counting identifiers that already matched a rule).

### 2.7 `legal`

Litigation-specific patterns that can identify a case or docket.

**Boundary:** if the string can directly connect the document to a specific case or docket (case numbers, docket labels, case-number labels), it belongs here.

**Examples:**
- Korean court case numbers: `2024가합12345`, `2024다67890`, `2024노1234`, `2024도5678`
- Case/docket labels: `Case No.: 24-CV-1234`, `Docket No.: 1:24-cv-00001`

**What doesn't belong:**
- Contract article/section references: `Section 10.1`, `제15조 제2항`
- Public statute citations: `민법 제750조`, `17 U.S.C. § 101`
- Court names: `서울중앙지방법원`, `대법원`, `Seoul Central District Court`
- Precedent citations: `123 F.3d 456`, `456 U.S. 789`
- Corporate names of parties → `entities`
- Dates of proceedings → `temporal`

### 2.8 Boundary dispute resolution

When a candidate could fit two categories, apply these in order:

1. **Prefer the more specific category.** `2024가합12345` matches `\d{4}` (a temporal year prefix) AND the `가합` court format — `legal` wins because it's the more specific match.
2. **Prefer the category with stricter false-positive constraints.** Priority: `identifiers` > `legal` > `financial` > `temporal` > `entities` > `heuristics`. Stricter categories (deterministic shapes) should win over fuzzy ones.
3. **Never register the same pattern in two categories.** Pick one. Document the choice in the rule file's top comment with one sentence explaining why.
4. **If still unclear,** file a decision note in [session-log-*.md] and move on. Don't let taxonomy become a 30-minute blocker.

---

## 3. Rule shapes

Three shapes. Each has a different purpose and a different signature.

### 3.1 `RegexRule`

```typescript
export type Level = "conservative" | "standard" | "paranoid";
export type Language = "ko" | "en" | "universal";

export interface RegexRule {
  /** Stable dotted id: "{category}.{subcategory}". Used for provenance + audit log. */
  readonly id: string;
  readonly category: "identifiers" | "financial" | "temporal" | "entities" | "legal";
  readonly subcategory: string;
  /** Must have the `g` flag. Must be bounded (see § 7 ReDoS checklist). */
  readonly pattern: RegExp;
  /** Optional post-filter for false-positive rejection (Luhn, sanity check, etc.). */
  readonly postFilter?: (normalizedMatch: string) => boolean;
  /** Tier filtering per Lock-in #4. A rule with `["standard", "paranoid"]` runs at Standard and Paranoid but not Conservative. */
  readonly levels: readonly Level[];
  readonly languages: readonly Language[];
  /** One-line human summary for audit log + rule catalog. */
  readonly description: string;
}
```

**80%+ of rules use this shape.** The runner handles the mechanical work: apply `normalizeForMatching(text)` once, clone the pattern (to avoid `lastIndex` state), `exec` in a loop, recover original bytes via the offset map, apply `postFilter` if present, return `Candidate[]`.

**Why `pattern: RegExp` and not a `detect` function?** Because the runner can batch-validate every registered pattern for ReDoS (fuzz with adversarial input), enforce the `g` flag at registration time, and run a single hot loop. A `detect: (text) => string[]` function hides this from the runner — you'd lose batch audit and each rule would need its own loop.

### 3.2 `StructuralParser`

```typescript
export interface StructuralDefinition {
  /** "the Buyer", "매수인", "'갑'" */
  readonly label: string;
  /** "ABC Corporation", "사과회사" */
  readonly referent: string;
  readonly source: "definition-section" | "recitals" | "party-declaration";
}

export interface StructuralParser {
  readonly id: string;
  readonly category: "structural";
  readonly subcategory: string;
  readonly languages: readonly Language[];
  readonly description: string;
  /** Pure function: text → structured context. No side effects. */
  parse(normalizedText: string): readonly StructuralDefinition[];
}
```

**Used for position-dependent extraction.** Runs BEFORE any RegexRule. Output is fed into the heuristic phase as context (for D9 awareness).

StructuralParser's output shape (`StructuralDefinition`) is deliberately different from `Candidate`. A structural definition is not a redaction target in itself — it's metadata about what role a label plays in the document. The heuristic phase (§ 3.3) uses structural definitions as context and must not rediscover their labels as ordinary literals.

### 3.3 `Heuristic`

```typescript
export interface Candidate {
  /** Original bytes (not normalized). Literal string for the redactor. */
  readonly text: string;
  /** Provenance: which rule fired. Used for audit log + debugging. */
  readonly ruleId: string;
  /** 0..1. Regex rules emit 1.0 (pattern matched = confident). Heuristics can be lower. */
  readonly confidence: number;
}

export interface HeuristicContext {
  readonly structuralDefinitions: readonly StructuralDefinition[];
  readonly priorCandidates: readonly Candidate[];
  readonly documentLanguage: "ko" | "en" | "mixed";
}

export interface Heuristic {
  readonly id: string;
  readonly category: "heuristics";
  readonly subcategory: string;
  readonly languages: readonly Language[];
  readonly levels: readonly Level[];
  readonly description: string;
  /** Custom logic (not a single regex). Can read context for D9 + dedup awareness. */
  detect(normalizedText: string, context: HeuristicContext): readonly Candidate[];
}
```

**Used for fuzzy discovery.** Confidence scoring exists because heuristics have false positives — the UI can sort by confidence or hide low-confidence matches from the default view.

**Key invariant:** every heuristic MUST call `context.structuralDefinitions.some(def => def.label === candidateText)` and skip labels that are structural definitions (per D9). This is not a suggestion — it's a safety requirement. A future lint rule should enforce this (see § 7).

### 3.4 Why three shapes, not one

A single unified `Rule` interface was considered and rejected. Reasons:

- **RegexRule's `pattern: RegExp` is a data field.** The runner can batch-validate, batch-fuzz, batch-ReDoS-audit without calling each rule. A unified shape would force every rule to be a function, losing this.
- **StructuralParser's output is `StructuralDefinition[]`, not `Candidate[]`.** A union type (`Candidate | StructuralDefinition`) forces every consumer to narrow, which is boilerplate noise.
- **Heuristic's `HeuristicContext` dependency is not needed by RegexRule.** A unified signature means regex rules take parameters they never use, which hurts readability.

The three shapes correspond to three runner phases:

1. **Structural phase** — run `StructuralParser[]`, accumulate `StructuralDefinition[]`. No candidates produced.
2. **Regex phase** — run `RegexRule[]`, produce `Candidate[]` from pattern matches. Normalization done once.
3. **Heuristic phase** — run `Heuristic[]` with context from (1) + (2), produce more `Candidate[]`.

Dedup runs at the end across all candidates. See § 9.

---

## 4. Writing a regex rule — 10-step walkthrough

Follow these in order. Every step matters.

### Step 1 — Decide the category

Consult § 2 taxonomy. If you're unsure between two categories, apply § 2.8 resolution rules. If you're still unsure after that, pick the more specific one and note the decision in the rule file comment.

### Step 2 — Decide normalization assumption

Default: your pattern runs on the output of `normalizeForMatching(text)` ([normalize.ts:128](../src/detection/normalize.ts#L128)). This means you can assume:

- Fullwidth digits are converted to ASCII (`０１０` → `010`)
- Smart quotes are converted to straight quotes (`"` `"` → `"`)
- Hyphen variants are converted to ASCII hyphen (`–` `—` `−` → `-`)
- Zero-width characters are stripped
- NFC composition is **NOT** applied (to preserve positions)

**If you need NFC (e.g., for matching Korean entity names with NFD input),** don't write a regex rule — write a structural parser or heuristic that uses `normalizeText()` instead ([normalize.ts:96](../src/detection/normalize.ts#L96)).

### Step 3 — Draft the pattern

Write the simplest pattern that matches your canonical examples. Start loose and tighten. Example for Korean business registration number (사업자등록번호):

```typescript
// Step 3 (draft):
const brn = /\d{3}-\d{2}-\d{5}/g;
```

### Step 4 — Run the ReDoS audit checklist (§ 7)

Before you add any character classes or quantifiers, walk the checklist:

- [ ] No nested quantifiers: `(a+)+`, `(a*)*`, `(a|a)+`
- [ ] No unbounded `.*` or `.+` in the middle of the pattern
- [ ] All repetitions are bounded: `{1,10}` not `*` where possible
- [ ] Character class alternation minimized
- [ ] Adversarial input test (see § 7 automation)

If the pattern fails any item, redesign before continuing.

### Step 5 — Add lookbehind/lookaround boundaries

The biggest source of false positives in PII regex is "substring of a longer number". Use `(?<!\d)` and `(?!\d)` to prevent digit glue:

```typescript
// Step 5:
const brn = /(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)/g;
```

Without these, `9123-45-678901` would match `123-45-67890`. Silent false positive.

**Do NOT use `\b` for CJK contexts.** `\b` is a word-character boundary defined as `[A-Za-z0-9_]` transitions. It does not behave correctly around Korean Hangul. Use explicit negative lookbehind/lookahead instead.

### Step 6 — Add a post-filter if needed

If regex alone can't eliminate false positives, add a post-filter function. Example — credit card number:

```typescript
// Step 6:
{
  id: "identifiers.credit-card",
  pattern: /(?<![\d-])\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d-])/g,
  postFilter: luhnCheck,  // reject non-Luhn-valid 16-digit blobs
  // ...
}
```

The post-filter receives the **normalized** match (not the original bytes — the runner handles byte recovery before returning the Candidate). Keep post-filters pure and stateless. No fetches, no file I/O, no side effects.

### Step 7 — Write positive test cases (minimum 3)

- Canonical form (the example from Step 3)
- Variant (dashed vs dashless, short vs long form)
- Boundary case (at start of string, at end of string, surrounded by punctuation)

### Step 8 — Write negative test cases (minimum 3)

- Obvious non-match (unrelated text)
- Longer digit run that contains a rule-shaped substring (tests the lookaround from Step 5)
- Wrong language / wrong format (for language-specific rules)

### Step 9 — Write a false-positive guard test

Pick one realistic scenario where a naive pattern would false-positive and write a test that asserts your tightened pattern rejects it. Example for 사업자등록번호:

```typescript
it("does not match against a longer surrounding digit run", () => {
  expect(matches("brn", "9123-45-67890")).toEqual([]);
  expect(matches("brn", "123-45-678901")).toEqual([]);
});
```

### Step 10 — Register in the category file + commit

Add the rule to its category file (e.g., `src/detection/rules/identifiers.ts`) with explicit type:

```typescript
import type { RegexRule } from "../_framework/types.js";

export const IDENTIFIERS: readonly RegexRule[] = [
  {
    id: "identifiers.korean-brn",
    category: "identifiers",
    subcategory: "korean-brn",
    pattern: /(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)/g,
    levels: ["conservative", "standard", "paranoid"],
    languages: ["ko"],
    description: "Korean business registration number (사업자등록번호), 3-2-5 hyphenated form",
  },
  // ...
] as const satisfies readonly RegexRule[];
```

Commit message format: `feat(detection): add {category}.{subcategory} rule` or `feat(detection/{category}): {subcategory}`.

---

## 5. Writing a structural parser

Structural parsers are different from regex rules because they depend on **position** in the document, not just pattern. They typically combine regex with position tests (beginning of document, inside a known region, after a trigger phrase).

### 5.1 Signature

```typescript
export interface StructuralParser {
  readonly id: string;
  readonly category: "structural";
  readonly subcategory: string;
  readonly languages: readonly Language[];
  readonly description: string;
  parse(normalizedText: string): readonly StructuralDefinition[];
}
```

### 5.2 Example — definition-section parser (Korean + English)

```typescript
import type { StructuralParser, StructuralDefinition } from "../_framework/types.js";

export const DEFINITION_SECTION: StructuralParser = {
  id: "structural.definition-section",
  category: "structural",
  subcategory: "definition-section",
  languages: ["ko", "en"],
  description: "Extracts defined terms from 'X means Y' / '\"X\"이라 함은 Y' patterns",
  parse(text: string): readonly StructuralDefinition[] {
    const out: StructuralDefinition[] = [];
    // English: "X" means Y, "X" shall mean Y, hereinafter "X"
    const english = /"([^"]+)"\s+(?:means|shall\s+mean)\s+([^.;]+)/g;
    let m: RegExpExecArray | null;
    while ((m = english.exec(text)) !== null) {
      out.push({ label: m[1]!, referent: m[2]!.trim(), source: "definition-section" });
    }
    // Korean: "X"이라 함은 Y, (이하 "X")
    const korean = /"([^"]+)"(?:이라)?\s*함은\s+([^.。]+)/g;
    while ((m = korean.exec(text)) !== null) {
      out.push({ label: m[1]!, referent: m[2]!.trim(), source: "definition-section" });
    }
    return out;
  },
};
```

### 5.3 Key constraints

- **Pure function.** Same input → same output. No Date.now, no Math.random, no I/O.
- **Position-aware.** If your parser only looks at `text[0..100]` (first paragraph for party declaration), document that in the description field.
- **Output is `StructuralDefinition[]`, not `Candidate[]`.** Structural parsers do not produce redaction candidates directly. They produce metadata that later phases use.
- **NFC not required.** The runner passes in `normalizeForMatching(text)` which does NOT apply NFC. If you need NFC for name matching, call `text.normalize("NFC")` inside `parse` — but then you lose position fidelity, so only do this for structural parsers that don't need offsets in their output.

### 5.4 Testing

Structural parsers are tested against full document fixtures, not just text snippets. See `tests/fixtures/bilingual_nda_worst_case.docx` for the canonical fixture. Add at least:

- One positive: a document with definitions → parser extracts them all
- One negative: a document without definitions → parser returns `[]`
- One edge: a document with partial / malformed definitions → parser doesn't crash and returns what it can

---

## 6. Writing a heuristic

Heuristics are the trickiest rules. They have the highest false-positive rates and require the most tuning. Follow the conventions below or you will leak.

### 6.1 Signature

```typescript
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

### 6.2 Required behaviors

**Every heuristic must:**

1. **Consume `context.structuralDefinitions`.** If your candidate matches a structural definition's `label`, skip it (D9 policy: defined labels are unchecked by default and must not be rediscovered as literals).
2. **Consume `context.priorCandidates`.** If your candidate is a substring of an already-matched prior candidate with higher confidence, skip it (dedup happens later, but double-emission wastes the user's review time).
3. **Apply the role-word blacklist.** Tokens like `당사자`, `party`, `plaintiff`, `claimant`, `respondent`, `client`, `대표`, `본인` are repeated heavily in legal documents but are NOT sensitive. Every heuristic must filter them out BEFORE emitting candidates.
4. **Assign a confidence score < 1.0.** Regex rules emit 1.0 (pattern matched = confident). Heuristics by definition are uncertain. Use 0.5–0.9 based on how many positive signals (cap cluster + quoted + frequency) aligned.
5. **Return `Candidate[]` with original bytes.** Not normalized bytes. Recover via the same offset map technique the regex runner uses.

### 6.3 Example — capitalization cluster (English)

```typescript
import type { Heuristic, Candidate, HeuristicContext } from "../_framework/types.js";
import { ROLE_BLACKLIST_EN } from "./role-blacklist-en.js";

export const CAPITALIZATION_CLUSTER_EN: Heuristic = {
  id: "heuristics.capitalization-cluster-en",
  category: "heuristics",
  subcategory: "capitalization-cluster-en",
  languages: ["en"],
  levels: ["standard", "paranoid"],
  description: "English 2+ consecutive capitalized words as candidate entity name",
  detect(text: string, ctx: HeuristicContext): readonly Candidate[] {
    const definedLabels = new Set(ctx.structuralDefinitions.map((d) => d.label));
    const priorTexts = new Set(ctx.priorCandidates.map((c) => c.text));
    const pattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g;
    const out: Candidate[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const candidate = m[0]!;
      if (definedLabels.has(candidate)) continue;         // D9 skip
      if (priorTexts.has(candidate)) continue;            // dedup skip
      if (ROLE_BLACKLIST_EN.has(candidate.toLowerCase())) continue;
      out.push({ text: candidate, ruleId: "heuristics.capitalization-cluster-en", confidence: 0.7 });
    }
    return out;
  },
};
```

### 6.4 Tuning cycle

Heuristics require iteration:

1. Draft the heuristic with what you think is a reasonable confidence threshold.
2. Run it against 1–2 real documents (Phase 5 § 14 measurement protocol).
3. Count false positives and false negatives.
4. Adjust the role blacklist, confidence threshold, or pattern strictness.
5. Re-test. Repeat until FP rate < 30% and FN rate < 20% on real documents.

Heuristics that can't reach this threshold should be dropped or moved to Paranoid-only tier.

---

## 7. ReDoS audit checklist

Per [design-v1.md](../../document-redactor-private-notes/design-v1.md) Eng Review Lock-in #13, all regexes must be bounded and ReDoS-free. With 200+ rules, human discipline is not enough — we need automation.

### 7.1 Manual checklist (every rule at authoring time)

Before committing a new rule:

- [ ] **No nested quantifiers.** Forbidden patterns: `(a+)+`, `(a*)*`, `(a+)*`, `(a|a)+`, `(a|ab)+`. These are the classic catastrophic backtracking shapes.
- [ ] **No unbounded `.*` or `.+` in middle of pattern.** `A.*B` is fine if A and B are at string boundaries, but `(foo).*?(bar).*?(baz)` over untrusted text is a slow walk.
- [ ] **Bounded repetition.** Prefer `{1,10}` over `*` when you have a known maximum length. `\d{1,12}` beats `\d+` because it gives the engine an upper bound.
- [ ] **Character class alternation minimized.** `[abc]` beats `(a|b|c)`. `[\s-]` beats `(\s|-)`.
- [ ] **Lookbehind/lookahead for boundaries, not `\b` in CJK contexts.** `\b` is ASCII-only.
- [ ] **Test with adversarial input.** See § 7.3.

### 7.2 What the runner enforces at registration time

The rule registration step (or a vitest smoke test) MUST verify:

- [ ] Every `RegexRule.pattern` has the `g` flag (`pattern.flags.includes("g")`)
- [ ] Every rule ID is unique across all categories (no duplicate IDs = no provenance ambiguity)
- [ ] Every rule's `languages` array is non-empty
- [ ] Every rule's `levels` array is non-empty
- [ ] Every rule's category matches its enclosing file (`identifiers.ts` only exports rules with `category: "identifiers"`)

These checks should fail the build, not a runtime warning.

### 7.3 Automated ReDoS fuzz test

Add one vitest describe block that iterates every registered rule and runs it against adversarial input:

```typescript
// src/detection/_framework/redos-guard.test.ts
import { describe, it, expect } from "vitest";
import { ALL_REGEX_RULES } from "./registry.js";

describe("ReDoS guard", () => {
  const ADVERSARIAL_INPUTS = [
    "a".repeat(10_000),
    "1".repeat(10_000),
    "-".repeat(10_000),
    "a-".repeat(5_000),
    "1 ".repeat(5_000),
    "\u0020".repeat(10_000),
  ];

  for (const rule of ALL_REGEX_RULES) {
    for (const input of ADVERSARIAL_INPUTS) {
      it(`${rule.id} returns within 50ms on adversarial input (${input.length} chars)`, () => {
        const start = performance.now();
        const re = new RegExp(rule.pattern.source, rule.pattern.flags);
        let count = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(input)) !== null && count < 10_000) count++;
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);  // 50ms budget per adversarial run
      });
    }
  }
});
```

This adds `(# regex rules) × 6` test cases — for 30 regex rules that's 180 tests. Still runs under 2 seconds. **A rule that fails this test must be redesigned before merge, not quarantined.**

### 7.4 When you find a ReDoS

1. Do NOT suppress the test.
2. Redesign the pattern using § 7.1 checklist.
3. Add a regression test with the exact adversarial input that triggered the failure.
4. Commit the fix as `fix(detection/{category}): bound {subcategory} pattern to prevent ReDoS`.

---

## 8. Testing convention

### 8.1 Minimum test set per rule

Every rule (regex, structural, heuristic) ships with at least these tests, co-located in a `.test.ts` file next to the rule file:

| Test class | Min count | Example |
|---|---:|---|
| Positive — canonical form | 1 | "matches `900101-1234567`" |
| Positive — variant | 1 | "matches `010-1234-5678` and `01012345678`" |
| Positive — boundary | 1 | "matches at start / end / middle of string" |
| Negative — obvious non-match | 1 | "does not match unrelated text" |
| Negative — substring-in-longer | 1 | "does not match `9123-45-67890`" |
| Negative — wrong language | 1 | (for language-specific rules) |
| Post-filter rejection (if applicable) | 1 | "rejects non-Luhn-valid card" |
| Regression (if fixing a bug) | 1 | Copy the exact failing input that triggered the bug |
| **Migration parity (if refactoring an existing rule)** | 1 | "`pattern.source` and `pattern.flags` match pre-refactor values byte-for-byte" |

**Total minimum: 5–7 tests per rule.** For 200 rules that's 1000–1400 new test cases. Verify the count in Phase 5 against the coverage bar.

**Migration parity protocol.** Any refactor that touches existing rules (moving files, renaming subcategories, changing the rule shape, extracting post-filters) MUST follow this order: (1) write a characterization test that captures the current behavior exactly — regex source/flags, kind-to-subcategory mapping, detection output order — and passes on the pre-refactor code; (2) perform the refactor; (3) verify the characterization test still passes byte-for-byte. A "green suite" after a refactor is necessary but not sufficient — the characterization test is the only thing that proves the refactor was strictly behavior-preserving. See `phase-0-framework-port.md` § 12a in the internal design docs (`~/.document-redactor-internal/phases/`) for the canonical example.

### 8.2 Test file template

```typescript
// src/detection/rules/financial.test.ts
import { describe, it, expect } from "vitest";

import { FINANCIAL } from "./financial.js";

/** Find a rule by subcategory in a category's export array. */
function rule(subcategory: string) {
  const found = FINANCIAL.find((r) => r.subcategory === subcategory);
  if (!found) throw new Error(`rule not registered: ${subcategory}`);
  return found;
}

function matches(subcategory: string, sample: string): string[] {
  const r = rule(subcategory);
  const re = new RegExp(r.pattern.source, r.pattern.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sample)) !== null) {
    if (r.postFilter && !r.postFilter(m[0]!)) continue;
    out.push(m[0]!);
  }
  return out;
}

describe("financial.currency-krw", () => {
  it("matches canonical form with comma separator", () => {
    expect(matches("currency-krw", "금액: 10,000,000원 입니다.")).toEqual(["10,000,000원"]);
  });

  it("matches 만원 / 억원 variants", () => {
    expect(matches("currency-krw", "500만원")).toEqual(["500만원"]);
    expect(matches("currency-krw", "10억원")).toEqual(["10억원"]);
  });

  it("matches 일금 오천만원정 formal form", () => {
    expect(matches("currency-krw", "일금 오천만원정")).toContain("일금 오천만원정");
  });

  it("does not match bare numbers without currency marker", () => {
    expect(matches("currency-krw", "10,000")).toEqual([]);
  });

  it("does not match inside longer numeric runs", () => {
    expect(matches("currency-krw", "1234567890원")).toBeDefined();
    // (adjust based on whether the rule accepts arbitrary-length or requires comma separators)
  });
});
```

### 8.3 Quality rubric

Borrowed from plan-eng-review skill. Grade every rule's test set:

- **★★★** — Tests canonical + variants + edge cases + error paths + regression
- **★★** — Tests canonical + at least one edge case
- **★** — Smoke test only (exists, doesn't throw)

**Target: every production rule has ★★★ tests.** Tests graded ★★ or ★ are flagged for follow-up, not accepted.

### 8.4 Coverage target

Per design-v1.md Eng Review Lock-in #12: **100% branch coverage on detection code.** The new framework + all rules should maintain this. vitest `--coverage` should report ≥98% statements / ≥95% branches / 100% functions on `src/detection/**`.

---

## 9. Dedup and boundary semantics

### 9.1 The dedup contract

After all three phases run, the runner produces a flat `Candidate[]`. Dedup then:

1. **Groups candidates by `text` (original bytes).** Same text → one entry.
2. **Preserves the earliest rule as provenance.** Within a text group, keep the `ruleId` of the first rule that matched (in category order: identifiers → financial → temporal → entities → legal → heuristics). This gives deterministic provenance for audit logs.
3. **Does NOT deduplicate across overlapping spans of different text.** If rule A matches `010-1234-5678` and rule B matches `1234-5678`, both are kept. The redactor (Lane B) handles longest-first substitution, so matching both doesn't cause double redaction.
4. **Uses `Set<string>` as the implementation.** Not a complex graph. The boundary contract in [detect-pii.ts:123-138](../src/detection/detect-pii.ts#L123-L138) is already this — extend it with provenance tracking.

### 9.2 Example

Input text: `대표이사 김철수 (RRN: 900101-1234567) 010-1234-5678`

Candidates before dedup:
- `"김철수"` from `entities.title-ko`
- `"900101-1234567"` from `identifiers.korean-rrn`
- `"010-1234-5678"` from `identifiers.phone-kr`

No dedup needed (all texts are distinct).

Input text: `legal@acme.com 이메일: legal@acme.com`

Candidates before dedup:
- `"legal@acme.com"` from `identifiers.email` (first match)
- `"legal@acme.com"` from `identifiers.email` (second match)

After dedup: one entry, `"legal@acme.com"`, ruleId `identifiers.email`.

### 9.3 Cross-category dedup

Input text: `2024가합12345`

Candidates before dedup:
- `"2024"` from `temporal.date-ko` (matches the year prefix alone? — probably not, because the pattern should require `년` or `-`)
- `"2024가합12345"` from `legal.ko-case-number`

If both fire, keep both — they are different texts, no conflict. The redactor replaces longest first, so `2024가합12345` is handled before the standalone `2024` would need to be touched.

If the year-only match `"2024"` DOES fire (bad rule design), the dedup phase does nothing — that's a BUG in the `temporal.date-ko` pattern, which should require additional context (month / day). Fix the rule, don't fix the dedup.

### 9.4 When NOT to rely on dedup

Dedup is the SAFETY NET, not the primary mechanism. **Rules should be tight enough to not need dedup to fix false positives.** If you're relying on dedup to suppress a rule's false positives, rewrite the rule.

---

## 10. Level/tier mapping

Per design-v1.md Lock-in #4, the UI exposes three levels: Conservative, Standard (default), Paranoid. Each rule has a `levels: Level[]` field declaring which tiers activate it. The runner filters rules by active level before running.

### 10.1 Tier definitions

| Level | What it does | Who uses it |
|---|---|---|
| **Conservative** | Click-to-select + manual additions. Structural parsers + identifiers (PII). **No heuristics.** No fuzzy matching. | Users who want full control, never want a tool to pick for them |
| **Standard (default)** | Conservative + financial + temporal + entities + legal. Covers 80%+ of real contracts with one click. **No heuristics.** | 95% of users — lawyers who want "drop, review, apply" |
| **Paranoid** | Standard + heuristics (capitalization cluster, quoted term, repeatability). Adds false positives but catches everything. | High-risk M&A docs, maximum-risk filings |

### 10.2 Rule level assignment

| Category | Default level assignment |
|---|---|
| `identifiers` | `["conservative", "standard", "paranoid"]` — always on |
| `structural` | `["conservative", "standard", "paranoid"]` — always on (context only, no candidates) |
| `financial` | `["standard", "paranoid"]` |
| `temporal` | `["standard", "paranoid"]` |
| `entities` | `["standard", "paranoid"]` |
| `legal` | `["standard", "paranoid"]` |
| `heuristics` | `["paranoid"]` only |

**Exception:** specific rules can override the category default. Example: `temporal.duration` could be marked `["paranoid"]` only if duration redaction is deemed too aggressive for Standard. Document the exception in the rule file comment.

### 10.3 Runner filter

```typescript
export function runRegexPhase(text: string, level: Level, allRules: readonly RegexRule[]): Candidate[] {
  const active = allRules.filter((r) => r.levels.includes(level));
  // ... normalize, exec, post-filter, return candidates
}
```

One line. No complexity.

---

## 11. Language handling

### 11.1 Document language detection

The runner detects document language ONCE per input (not per rule), using a cheap heuristic:

```typescript
export function detectLanguage(text: string): "ko" | "en" | "mixed" {
  const hangulCount = (text.match(/[\uAC00-\uD7A3]/g) ?? []).length;
  const asciiLetterCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = hangulCount + asciiLetterCount;
  if (total === 0) return "en"; // no letters at all: default to English (document is numeric/symbol only)
  const koRatio = hangulCount / total;
  if (koRatio > 0.6) return "ko";
  if (koRatio < 0.2) return "en";
  return "mixed";
}
```

**Thresholds are tuned for bilingual Korean-English legal documents.** 60% Hangul = Korean-primary, under 20% = English-primary, in between = mixed (both language rules active).

### 11.2 Rule language filter

The runner filters rules by language before running them:

```typescript
const activeRules = allRules.filter((r) => {
  if (r.languages.includes("universal")) return true;
  if (lang === "mixed") return true; // mixed docs run all rules
  return r.languages.includes(lang);
});
```

Korean-only rules don't run on English documents (saves time + prevents noise). English-only rules don't run on Korean documents (same reason).

### 11.3 When to use `"universal"`

Use `"universal"` for language-neutral patterns:

- Email addresses (same format in every language)
- International phone numbers with `+` prefix
- URLs
- IP addresses
- Credit card numbers
- ISO dates (`2024-01-15`)

Use explicit `["ko"]` or `["en"]` for language-specific patterns:

- Korean RRN, BRN → `["ko"]`
- US EIN → `["en"]`
- Korean won amounts → `["ko"]`
- USD amounts → `["en"]`
- Definition section parser → `["ko", "en"]` (both languages have their own definition syntax)

---

## 12. Anti-patterns

**Do NOT do these.** Each has bitten someone before (in this codebase or in reference implementations we studied).

### 12.1 `\b` in CJK contexts

```typescript
// ❌ WRONG
const pattern = /\b김철수\b/g;
```

`\b` is defined as a transition between `[A-Za-z0-9_]` and non-word chars. Korean Hangul is "non-word" by that definition, so `\b` fires on every character boundary in Korean text — totally wrong. Use explicit lookbehind / lookahead with character classes.

```typescript
// ✅ CORRECT
const pattern = /(?<![\uAC00-\uD7A3])김철수(?![\uAC00-\uD7A3])/g;
```

### 12.2 Hardcoded entity names

```typescript
// ❌ WRONG
const pattern = /(ABC\s+Corp|Sunrise\s+Inc|Acme\s+Ltd)/g;
```

Specific entity names belong in user review/manual additions or internal propagation fixtures. The tool should NOT ship with hardcoded lists of company names, and the current UI has no public seed-entry workflow. Rules should detect by STRUCTURE (suffix cues), not by LIST.

### 12.3 Whole-sentence matching

```typescript
// ❌ WRONG — too greedy
const pattern = /로열티[는은]\s+[^.]+/g;
```

This grabs entire sentences, which: (a) is a poor user experience (the user sees "로열티는 본 계약상 매출액의 5%로 한다." as one candidate to redact, when they probably only want to hide "5%"), (b) loses granularity for the D9 policy. Use `context.financial-context` scanner with sentence-level snippets for review UI, but the actual CANDIDATE emitted should be the specific value (`5%`, `₩10,000,000`), not the sentence.

### 12.4 Returning normalized bytes

```typescript
// ❌ WRONG
return matches.map((m) => m.normalizedText);
```

The redactor (Lane B) scans the DOCX XML for literal byte sequences. If you return `"010-1234-5678"` (ASCII hyphen) when the original text had `"010–1234–5678"` (en-dashes), the redactor will not find the en-dash form in the XML → silent leak. ALWAYS recover original bytes via the offset map from `normalizeForMatching`.

### 12.5 Mutating `PII_PATTERNS` / `RegexRule` at runtime

```typescript
// ❌ WRONG
RegexRule.pattern.lastIndex = 0; // or any mutation
```

`lastIndex` is stateful. Two calls to the same rule in sequence can interfere. Always clone via `new RegExp(r.pattern.source, r.pattern.flags)` before running. [detect-pii.ts:78](../src/detection/detect-pii.ts#L78) does this. Same convention applies to new rules.

### 12.6 Adding features the user didn't ask for

```typescript
// ❌ WRONG — "while I'm here, let me add fuzzy matching to email rule"
```

Stick to the minimum change that fixes the problem. A bug-fix commit adds one test and one pattern change. A new-rule commit adds one rule and its tests. Don't refactor unrelated rules "while you're in the file". Don't add speculative features. See CLAUDE.md if a feature creep reflex hits you.

### 12.7 Skipping the ReDoS checklist

Every new regex rule walks § 7.1 checklist AND the automated § 7.3 fuzz test. No exceptions. A "simple" pattern can still ReDoS — `(a|a)+` looks simple and is catastrophic.

### 12.8 Rule without a test

```typescript
// ❌ WRONG — rule committed without a test file
export const NEW_RULE: RegexRule = { /* ... */ };
```

Every rule has a co-located `.test.ts` with at least the 5–7 minimum tests from § 8.1. A rule without tests is a rule that will silently regress. No exceptions.

### 12.9 Early dedupe (deduping before `buildTargetsFromZip`)

```typescript
// ❌ WRONG — dedupe inside the runner or inside detectPii
export function runRegexPhase(text: string, ...): Candidate[] {
  const seen = new Set<string>();
  // ... emit only if !seen.has(candidate.text)
}
```

Dedupe MUST happen only at the final target-building stage (`buildTargetsFromZip`), and ONLY on `match.original` (the original-bytes literal). Never dedupe by normalized form, by rule id, by subcategory, or by any canonical key.

Three reasons this is a load-bearing rule, not a preference:

1. **Scope attribution.** `detectPiiInZip` attaches a source scope to every match. Early dedupe erases per-scope provenance — the audit log can no longer tell you which header/footer/body a PII literal came from.
2. **Original-byte literal integrity.** If scope A contains `010-1234-5678` (ASCII hyphens) and scope B contains `010–1234–5678` (en-dashes), the two strings normalize to the same form but are byte-different. The redactor (Lane B) searches the DOCX XML for literal bytes — if dedupe collapses them to one, the other byte sequence is never scrubbed and leaks silently.
3. **Ordering determinism.** `buildTargetsFromZip` relies on `Set<string>` insertion order to break ties when two strings are the same length after longest-first sort. Dedupe happening earlier in the pipeline changes the insertion order and destroys that deterministic property — same input, different target array across runs.

If you feel the urge to dedupe earlier "for performance" or "cleanliness", STOP. The pipeline is intentionally a fat stream. Dedupe is a property of the final target set, not of intermediate detection results.

---

## 13. Rule catalog

This section is **living**. Each phase adds to it. The catalog serves as a progress dashboard and a shared reference for "what's covered vs what's not".

### 13.1 v1.0 ported rules (Phase 0 — identifiers only)

| Rule ID | Current location | New location | Status |
|---|---|---|---|
| `identifiers.korean-rrn` | [patterns.ts:56](../src/detection/patterns.ts#L56) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.korean-brn` | [patterns.ts:61](../src/detection/patterns.ts#L61) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.us-ein` | [patterns.ts:64](../src/detection/patterns.ts#L64) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.phone-kr` | [patterns.ts:70](../src/detection/patterns.ts#L70) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.phone-intl` | [patterns.ts:76](../src/detection/patterns.ts#L76) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.email` | [patterns.ts:81](../src/detection/patterns.ts#L81) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.account-kr` | [patterns.ts:86](../src/detection/patterns.ts#L86) | `rules/identifiers.ts` | pending Phase 0 port |
| `identifiers.credit-card` (with Luhn postFilter) | [patterns.ts:92](../src/detection/patterns.ts#L92) + [detect-pii.ts:145](../src/detection/detect-pii.ts#L145) | `rules/identifiers.ts` | pending Phase 0 port |

Phase 0 acceptance criterion: all 8 rules ported, 422 existing tests pass, output bytes identical to current `detect-pii.ts` on the worst-case fixture.

### 13.2 Phase 1 targets — high-value regex (financial + temporal + entities)

| Rule ID | Priority | Example matches |
|---|---|---|
| `financial.currency-krw` | high | `10,000,000원`, `500만원`, `10억원`, `일금 오천만원정` |
| `financial.currency-foreign` | high | `$50,000`, `USD 500,000`, `€1,000`, `JPY 1,000,000` |
| `financial.percentage` | high | `5%`, `0.25%`, `5 퍼센트`, `3분의 1` |
| `temporal.date-ko` | high | `2024년 1월 15일`, `2024.1.15` |
| `temporal.date-iso` | high | `2024-01-15`, `2024/01/15` |
| `temporal.date-en` | high | `January 15, 2024`, `Jan 15 2024` |
| `temporal.duration` | high | `3년간`, `6 months`, `90일` |
| `entities.corporate-suffix-ko` | high | `주식회사 ABC`, `ABC 주식회사`, `(주) ABC` |
| `entities.corporate-suffix-en` | high | `ABC Corp.`, `ABC Inc.`, `ABC LLC` |
| `entities.title-ko` | high | `대표이사 김철수`, `이사 박영희` |
| `entities.title-en` | medium | `Mr. Smith`, `Prof. Kim`, `CEO Jane Doe` |

Target: 10–15 rules. Measurement against Phase 0 baseline after Phase 1 completion.

### 13.3 Phase 2 targets — structural parsers

| Rule ID | Purpose |
|---|---|
| `structural.definition-section` | `"X" means Y` / `"X"이라 함은 Y` / `(이하 "X")` |
| `structural.signature-block` | `By: ___`, `이름:`, `대표이사 ___` |
| `structural.party-declaration` | Contract first paragraph party extraction |
| `structural.recitals` | WHEREAS clauses, 전문 |
| `structural.header-block` | Title, execution date, document number |

Target: 5 parsers. Integrated tests against `tests/fixtures/bilingual_nda_worst_case.docx` plus 1–2 new fixtures.

### 13.4 Phase 3 targets — context scanners + legal

| Rule ID | Category | Purpose |
|---|---|---|
| `financial.financial-context` | heuristic (yes, it's a heuristic despite the name — context-aware) | 로열티/수수료/요율 keyword proximity |
| `temporal.temporal-context` | heuristic | 기간/유효기간/효력 proximity |
| `entities.identity-context` | heuristic | 원고/피고/claimant proximity |
| `legal.ko-case-number` | legal | `2024가합12345` et al |

### 13.5 Phase 4 targets — heuristics

| Rule ID | Category | Purpose |
|---|---|---|
| `heuristics.capitalization-cluster-en` | heuristics | English 2+ consecutive caps |
| `heuristics.quoted-term` | heuristics | `"X"`, `「X」`, `『X』`, `'X'` |
| `heuristics.repeatability` | heuristics | Frequency-based with role blacklist + definition awareness |
| `heuristics.email-domain-inference` | heuristics | `legal@acme.com` → suggest "Acme Corp" |

Plus supporting data files:
- `rules/role-blacklist-ko.ts` — 50+ Korean role words
- `rules/role-blacklist-en.ts` — 50+ English role words

### 13.6 Phase 5 — direction decision point

Not a phase of rules. A phase of measurement + decision. See § 14.

### 13.7 Rule count summary

| Phase | Rules added | Cumulative | Est LOC delta |
|---|---:|---:|---:|
| Phase 0 | 8 (ported) | 8 | +600 framework, +200 rules |
| Phase 1 | 10–15 | 18–23 | +500–800 |
| Phase 2 | 5 parsers | 23–28 | +400–600 |
| Phase 3 | 6 rules | 29–34 | +300–500 |
| Phase 4 | 4 heuristics + 2 blacklist files | 33–38 | +400–600 |
| **Totals** | **33–38 rules + 5 parsers + 4 heuristics** | | **+2200–3300 LOC** |

Note: the Hybrid architecture ships ~38 rules (not 200+). Each "rule" can be one multi-pattern object (e.g., `financial.currency-krw` has 3 patterns inside), so effective pattern count is ~80–120. That's sufficient for the ≥90% bar on typical documents.

---

## 14. Measurement protocol

Phase 5 decides whether to stay on Path X (ship v1.1 with current rule set) or pivot to Path Y-lite (Tauri + Rust NER). The decision is **numerical**, not vibes-based. Define "satisfactory" in advance.

### 14.1 The bar (finalized 2026-04-10)

- **Pass (ship Path X v1.1):** ≥90% auto-detection coverage on 3 real document samples, remaining ≤10% fillable by quick manual-addition review (user adds misses in under 60 seconds after seeing auto-detect list).
- **Borderline (one more Phase 4 tuning round):** 80–90% coverage.
- **Fail (pivot to Path Y-lite):** <80% coverage.

### 14.2 Document selection

User picks 3 real documents covering variety:

- Sample 1: bilingual NDA (Korean + English body)
- Sample 2: Korean-only service agreement or licensing contract
- Sample 3: English-only M&A or disclosure schedule

Samples should be real documents the user has actually received. Synthetic fixtures don't count for Phase 5 — they prove the engine works, not that the rules cover reality.

### 14.3 Ground truth construction

For each sample:

1. Open the document in Word.
2. Write a flat list of "every string that should be redacted" — as if you were doing the job manually with Ctrl+H.
3. Be conservative: when in doubt, include. Ground truth should reflect the user's worst-case expectation, not an optimistic baseline.
4. Save the list alongside the document as `{stem}.ground-truth.json`:

```json
{
  "source": "msa_with_client.docx",
  "language": "ko",
  "ground_truth": [
    "ABC 주식회사",
    "대표이사 김철수",
    "010-1234-5678",
    "legal@abc.co.kr",
    "10,000,000원",
    "2024년 3월 15일",
    "유효기간 3년"
  ]
}
```

### 14.4 Automated coverage measurement

A script `bun run coverage-audit <doc.docx> <ground-truth.json>` (to be written in Phase 5) computes:

```
coverage = |auto_detected ∩ ground_truth| / |ground_truth|
false_positive_rate = |auto_detected \ ground_truth| / |auto_detected|
```

The script runs the tool's `analyzeZip` pipeline without injected propagation seeds and compares the auto-detected list against the ground truth. It does NOT require running the UI — pure engine test.

### 14.5 Time-to-complete (secondary metric)

For each sample, also measure: how long does the user spend going from "drop file" to "download redacted copy" in the UI, **including** the time to review the auto-detect list and add any missed strings?

- Target: < 60 seconds for a 10–20 page contract
- Time under 30 seconds → Path X is working
- Time over 2 minutes → either false positives are too noisy or coverage is too low

### 14.6 Decision matrix

| Coverage | FP rate | Time-to-complete | Decision |
|---|---|---|---|
| ≥90% | <30% | <60s | **Ship v1.1 on Path X** |
| 80–90% | <30% | <90s | **Phase 4 tuning round**, re-measure |
| 80–90% | ≥30% | any | **Phase 4 tuning round** focused on FP reduction |
| <80% | any | any | **Pivot to Path Y-lite** |
| ≥90% | ≥30% | >90s | **Phase 4 tuning round** focused on FP reduction |

This is the ship gate for v1.1.

---

## Appendix A — Quick reference

### Commands

```bash
bun run test                 # vitest, full suite, ~2s
bun run typecheck            # tsc + svelte-check
bun run lint                 # eslint
bun run build                # dist/document-redactor.html + .sha256
bun run coverage-audit <doc> # (Phase 5) measure coverage against ground truth
```

### File layout (target, Phase 0 onwards)

```
src/detection/
├── _framework/
│   ├── types.ts              (RegexRule, StructuralParser, Heuristic, Candidate, StructuralDefinition)
│   ├── registry.ts           (imports all category files, flattens into ALL_REGEX_RULES / ALL_STRUCTURAL_PARSERS / ALL_HEURISTICS)
│   ├── runner.ts             (runAllRules, 3 phases)
│   ├── language-detect.ts    (detectLanguage)
│   ├── redos-guard.test.ts   (fuzz every registered rule)
│   └── runner.test.ts
│
├── rules/
│   ├── identifiers.ts        (RegexRule[])
│   ├── identifiers.test.ts
│   ├── financial.ts
│   ├── financial.test.ts
│   ├── temporal.ts
│   ├── temporal.test.ts
│   ├── entities.ts
│   ├── entities.test.ts
│   ├── structural.ts         (StructuralParser[])
│   ├── structural.test.ts
│   ├── heuristics.ts         (Heuristic[])
│   ├── heuristics.test.ts
│   ├── legal.ts
│   ├── legal.test.ts
│   ├── role-blacklist-ko.ts
│   └── role-blacklist-en.ts
│
├── normalize.ts              (existing, unchanged)
├── extract-text.ts           (existing, unchanged)
├── stop-phrases.ts           (existing, may be absorbed into heuristics)
├── suggest-keywords.ts       (existing, D7)
├── patterns.ts               (existing — DEPRECATED after Phase 0 port, delete when migration complete)
└── detect-pii.ts             (existing — REWRITTEN as a thin shim over runner in Phase 0)
```

### References

- [design-v1.md](../../document-redactor-private-notes/design-v1.md) — strategic spec (D1–D9, 15 Lock-ins, distribution model)
- [session-log-2026-04-10-v2.md](../../document-redactor-private-notes/session-log-2026-04-10-v2.md) — v1.0 ship attempt + rollback + rule framework decision
- [patterns.ts](../src/detection/patterns.ts) top-of-file comment — original mini-guide that seeded this document

---

*v0 draft 2026-04-10. Revisions welcome via PR. Sections 1–12 are binding convention; sections 13–14 are living.*
