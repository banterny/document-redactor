# Rule Engine Review Brief — `document-redactor`

## Purpose of this document

This is the rule-system companion to [project-review-brief.md](./project-review-brief.md).

It exists for external reviewers who specifically want to understand:

- how the rule-based detection system is structured,
- why it is rule-based rather than ML-based,
- how candidates move from text extraction to UI review,
- where safety and performance constraints are enforced,
- what kinds of rule-engine criticism would be most useful.

This document is about the **detection architecture**, not the full product lifecycle. The verifier and DOCX mutation pipeline are mentioned where they constrain rule design, but the primary focus is the rule framework.

---

## 1. Why this project chose rules instead of ML

The choice was not “rules are elegant.” The choice was “rules fit the product constraints.”

### Product constraints that push toward rules

- The tool must run offline as a local HTML file.
- The runtime network count must remain zero.
- The shipped artifact must stay small and auditable.
- Detection should be deterministic and reviewable.
- Regressions should be testable with exact expected outputs.

In that environment, ML introduces major tension:

- larger artifact size,
- weaker explainability,
- harder regression control,
- temptation toward remote inference,
- a trust story that becomes much harder to defend.

Rules are more labor-intensive to build, but they fit the product’s constraints more cleanly.

---

## 2. Current rule inventory

The current implementation includes these registered detection assets:

| Category | Count | Files |
|---|---:|---|
| `identifiers` | 9 | [`src/detection/rules/identifiers.ts`](../../src/detection/rules/identifiers.ts) |
| `financial` | 10 | [`src/detection/rules/financial.ts`](../../src/detection/rules/financial.ts) |
| `temporal` | 8 | [`src/detection/rules/temporal.ts`](../../src/detection/rules/temporal.ts) |
| `entities` | 16 | [`src/detection/rules/entities.ts`](../../src/detection/rules/entities.ts) |
| `legal` | 6 | [`src/detection/rules/legal.ts`](../../src/detection/rules/legal.ts) |
| `structural` parsers | 5 | [`src/detection/rules/structural/`](../../src/detection/rules/structural) |
| `heuristics` | 4 | [`src/detection/rules/heuristics/`](../../src/detection/rules/heuristics) |

These are registered centrally in:

- [`src/detection/_framework/registry.ts`](../../src/detection/_framework/registry.ts)

---

## 3. Rule framework at a glance

The detection system is built around **three rule shapes**, not one.

| Shape | Purpose | Output |
|---|---|---|
| `StructuralParser` | Extract document-context metadata like defined-role mappings | `StructuralDefinition[]` |
| `RegexRule` | Deterministic literal matching for fixed or semi-fixed patterns | `Candidate[]` with confidence `1.0` |
| `Heuristic` | Lower-confidence or context-sensitive entity discovery | `Candidate[]` with confidence `< 1.0` |

See:

- [`src/detection/_framework/types.ts`](../../src/detection/_framework/types.ts)

This split is one of the core design choices. The project does **not** treat every detection primitive as “just another regex,” because structural context and heuristic inference have different contracts and failure modes.

---

## 4. Detection pipeline

```mermaid
flowchart TD
    A[Scope text] --> B[normalizeForMatching once]
    B --> C[Phase 1: structural parsers]
    C --> D[StructuralDefinition[]]
    B --> E[Phase 2: regex rules]
    E --> F[Candidate[] confidence 1.0]
    D --> G[Phase 3: heuristics]
    F --> G
    G --> H[Candidate[] confidence < 1.0]
    D --> I[Combined detectAll result]
    F --> I
    H --> I
```

This logic lives in:

- [`src/detection/_framework/runner.ts`](../../src/detection/_framework/runner.ts)
- [`src/detection/detect-all.ts`](../../src/detection/detect-all.ts)

Key properties:

1. Text normalization happens once per run.
2. Structural parsers run first.
3. Regex rules run second.
4. Heuristics run last and consume structural + prior-candidate context.
5. Early deduplication is intentionally avoided.

---

## 5. Phase-by-phase behavior

### 5.1 Structural phase

Structural parsers are used when position or document structure matters more than pattern shape.

Examples:

- definition section parsing,
- party declaration parsing,
- recital parsing,
- signature block parsing,
- header block parsing.

The structural phase produces `StructuralDefinition` values such as:

- label: `the Buyer`
- referent: `ABC Corporation`

This matters because generic role labels should not automatically be treated as literal sensitive entities.

Current parser registry:

- [`src/detection/rules/structural/index.ts`](../../src/detection/rules/structural/index.ts)

### 5.2 Regex phase

Regex rules are the main deterministic detection layer.

Examples:

- IDs,
- phone numbers,
- emails,
- bank accounts,
- amounts,
- dates,
- court references,
- organization and person patterns tied to explicit context cues.

The runner handles:

- regex cloning,
- `exec` loop,
- normalized-text matching,
- original-byte recovery,
- optional post-filter application.

Regex candidates are emitted with confidence `1.0`.

### 5.3 Heuristic phase

Heuristics are the controlled fuzzy layer.

Current heuristics:

- capitalization cluster,
- quoted term,
- repeatability,
- email-domain inference.

These run last and are expected to consult:

- structural definitions,
- prior regex candidates,
- language context,
- role blacklists.

Heuristics are intentionally lower confidence and should not behave like unconstrained “guess everything” rules.

Registry:

- [`src/detection/rules/heuristics/index.ts`](../../src/detection/rules/heuristics/index.ts)

---

## 6. Rule taxonomy

The project uses seven detection categories:

| Category | What belongs there |
|---|---|
| `identifiers` | Fixed-structure PII like emails, phone numbers, IDs, accounts, cards |
| `financial` | Amounts, currency expressions, percentages |
| `temporal` | Dates and durations |
| `entities` | Organizations and persons detected via explicit cues |
| `structural` | Document-position-aware parsers that produce context |
| `heuristics` | Lower-confidence contextual discovery |
| `legal` | Court, case, statute, and legal-reference patterns |

Public taxonomy guide:

- [`docs/RULES_GUIDE.md`](../RULES_GUIDE.md)

---

## 7. Language and level handling

The framework distinguishes two related but different ideas.

### 7.1 Rule language applicability

Rules can declare:

- `ko`
- `en`
- `universal`

### 7.2 Detected document language

Per run, the system may classify input as:

- `ko`
- `en`
- `mixed`

Important behavior:

- `mixed` means both language tracks run.
- `universal` rules always run.
- language detection is applied per input blob, and in the ZIP flow the “input blob” is each extracted scope.

This matters for bilingual legal documents where headers, body, and footnotes may differ in dominant language.

### 7.3 Level filtering

Rules and heuristics can also declare level applicability:

- `conservative`
- `standard`
- `paranoid`

Today, the product is effectively centered on `standard`, but the framework is built to support level-specific behavior.

---

## 8. Normalization and original-byte recovery

This is one of the most important technical areas in the whole rule engine.

The runner normalizes text for matching, but candidates ultimately need to preserve literal original text because the redactor later searches and rewrites based on original bytes rather than normalized abstractions.

That means the engine must solve two separate problems:

1. matching on a normalized representation,
2. recovering the original source slice for the actual candidate text.

This work lives in and around:

- [`src/detection/normalize.ts`](../../src/detection/normalize.ts)
- [`src/detection/_framework/runner.ts`](../../src/detection/_framework/runner.ts)

For an external reviewer, this is a prime place to look for subtle correctness bugs.

---

## 9. Registry invariants

The registry performs fail-fast validation when loaded.

Current checks include:

- rule IDs must be unique,
- regex rules must use the `g` flag,
- `levels` must be non-empty,
- `languages` must be non-empty,
- descriptions must be non-empty,
- rule ID must align with category and subcategory naming.

See:

- [`src/detection/_framework/registry.ts`](../../src/detection/_framework/registry.ts)

This is intentionally runtime-validated so malformed rule registrations fail loudly instead of silently producing wrong output.

---

## 10. Rule authoring constraints

A reviewer should assume these are intended invariants of the rule system.

### 10.1 No unbounded regex carelessness

Regexes should be designed with ReDoS resistance in mind.

The project explicitly tests adversarial inputs in:

- [`src/detection/_framework/redos-guard.test.ts`](../../src/detection/_framework/redos-guard.test.ts)

### 10.2 Post-filters should be pure

Example:

- Luhn validation for credit cards

Post-filters operate on normalized matches and should not perform I/O or maintain state.

### 10.3 No early deduplication

The runner intentionally does **not** deduplicate candidates.

Why:

- overlap and duplicate behavior is easier to reason about downstream,
- early dedup can hide detection information,
- target building is the appropriate place to collapse literal strings for export.

### 10.4 Fail loud

The framework does not hide exceptions inside runner logic. A broken rule should fail visibly rather than degrade silently.

### 10.5 Structural context should influence heuristics

Heuristics are expected to respect structural definitions so that generic defined-role labels are not reintroduced as literal high-priority candidates.

---

## 11. Current rule-system strengths

These are real design strengths worth preserving.

### 11.1 Strong separation of concerns

Structural parsing, regex matching, and heuristics are separated instead of blurred together.

### 11.2 Per-category rule files

The taxonomy is reflected in the source layout, which helps keep review and maintenance tractable.

### 11.3 Explicit provenance

Candidates carry `ruleId`, which is useful for UI attribution, debugging, and future audit surfaces.

### 11.4 Language-aware design

The rule framework is not implicitly English-only. Korean and English behavior are both first-class.

### 11.5 The rule engine is not the only safety mechanism

This is crucial. Even if a rule misses something, the independent verifier may still block export if the missed string was selected.

That makes the overall safety model stronger than “regex accuracy” alone.

---

## 12. Current weak points or likely stress points

These are good places for an external reviewer to challenge the design.

### 12.1 Complexity from multiple coordinate systems

The rule engine simultaneously manages:

- normalized text,
- original text,
- per-scope runs,
- rule categories,
- confidence levels,
- language filtering,
- UI category aggregation.

This is powerful, but it creates many seam opportunities for mismatch.

### 12.2 Fuzzy heuristics are hard to keep disciplined

Heuristics can quietly become a second, fuzzier rule system if not kept constrained by tests and blacklists.

### 12.3 Structural definitions vs propagation layer

There is some conceptual overlap between:

- structural definitions emitted by the detection framework,
- legacy propagation concepts in `src/propagation/`.

A reviewer may find opportunities to simplify or sharpen that boundary.

### 12.4 Regex inventory growth

As more rules are added, category files may become harder to reason about and more likely to accumulate edge-case overlap or performance regressions.

---

## 13. How detection output is used downstream

The rule engine does not directly redact the document.

The flow is:

1. `detectAllInZip` returns scoped candidates and structural definitions.
2. The UI engine aggregates them into:
   - PII candidates,
   - non-PII candidates,
   - grouped review sections.
3. The state machine stores user selections.
4. The finalizer passes selected literal strings into the redaction pipeline.
5. The verifier checks the output independently.

This means an external review should inspect both:

- rule correctness,
- the seam between detection output and selection/export usage.

Relevant seam:

- [`src/ui/engine.ts`](../../src/ui/engine.ts)

---

## 14. What external feedback would be most valuable

The best review is not “these regexes look fine.” It is targeted analysis in these areas:

### 14.1 False negative risk

- Which realistic sensitive strings are not covered?
- Are there category gaps that are structurally likely to cause misses?

### 14.2 False positive risk

- Are there rules likely to overfire in real bilingual legal documents?
- Are heuristics too eager relative to the UX?

### 14.3 Overlap and precedence

- Are there patterns where multiple categories can fight or duplicate confusingly?
- Is the lack of early dedup always the right tradeoff?

### 14.4 ReDoS and performance

- Which regexes deserve extra scrutiny?
- Are there pattern shapes or context rules that could degrade badly on large adversarial text?

### 14.5 Maintainability

- Are some categories too broad?
- Should rule metadata or registry validation become stricter?
- Should the framework separate more responsibilities or fewer?

### 14.6 Better simplifications

- Are there parts of the rule framework that are more abstract than necessary for the current scope?
- Are there obvious refactors that would reduce cognitive load without harming safety?

---

## 15. Best files to inspect first

### Framework core

- [`src/detection/_framework/types.ts`](../../src/detection/_framework/types.ts)
- [`src/detection/_framework/registry.ts`](../../src/detection/_framework/registry.ts)
- [`src/detection/_framework/runner.ts`](../../src/detection/_framework/runner.ts)
- [`src/detection/detect-all.ts`](../../src/detection/detect-all.ts)

### Rule definitions

- [`src/detection/rules/identifiers.ts`](../../src/detection/rules/identifiers.ts)
- [`src/detection/rules/financial.ts`](../../src/detection/rules/financial.ts)
- [`src/detection/rules/temporal.ts`](../../src/detection/rules/temporal.ts)
- [`src/detection/rules/entities.ts`](../../src/detection/rules/entities.ts)
- [`src/detection/rules/legal.ts`](../../src/detection/rules/legal.ts)
- [`src/detection/rules/structural/index.ts`](../../src/detection/rules/structural/index.ts)
- [`src/detection/rules/heuristics/index.ts`](../../src/detection/rules/heuristics/index.ts)

### Supporting subsystems

- [`src/detection/extract-text.ts`](../../src/detection/extract-text.ts)
- [`src/detection/normalize.ts`](../../src/detection/normalize.ts)
- [`src/ui/engine.ts`](../../src/ui/engine.ts)
- [`src/docx/verify.ts`](../../src/docx/verify.ts)

### Tests

- [`src/detection/_framework/runner.test.ts`](../../src/detection/_framework/runner.test.ts)
- [`src/detection/_framework/redos-guard.test.ts`](../../src/detection/_framework/redos-guard.test.ts)
- category-specific `*.test.ts` files under [`src/detection/rules/`](../../src/detection/rules)

---

## 16. Suggested prompt for a frontier reasoning model

```text
Please review the rule-based detection architecture in this repository.

Read this compact context first:
- docs/review/agent-context.compact.md

Then read these as needed:
- docs/review/project-review-brief.md
- docs/review/rule-engine-review-brief.md

Then inspect the actual implementation files referenced in the briefs.

I want a critical review focused on:
1. rule-engine correctness risks,
2. false negative and false positive tradeoffs,
3. normalization/original-byte recovery risks,
4. language filtering and phase ordering,
5. heuristic discipline and maintainability,
6. ReDoS or large-input performance concerns,
7. UI seam mismatches where detection output may be aggregated or interpreted incorrectly.

Every finding must use this schema:
- severity: P0 | P1 | P2
- dimension: correctness | safety | architecture | performance | prompt | docs
- evidence: file:line
- problem
- impact
- proposed_fix
- tests_to_add

Do not include praise or generic observations. If a concern is a product tradeoff rather than a bug, say so explicitly. If a claim has no file/line evidence, put it under assumptions instead of findings.
```

---

## 17. Closing note

The rule engine is important, but it is not the whole safety story. The project is intentionally designed so that detection quality and export safety are related but not identical concerns.

That is why the best review treats the rule engine as one layer inside a larger trust-sensitive system, not as an isolated regex catalog.
