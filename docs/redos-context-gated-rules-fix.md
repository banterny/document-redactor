# ReDoS in four context-gated UK rules — analysis and fix

**Date:** 2026-07-17 · **Branch:** `fix/redos-context-gated-rules` · **Commits:** `ecc4900`, `57b21a6`

Four context-gated UK rules backtracked catastrophically on adversarial whitespace. One did not terminate at all. This document records the measurements, the fix, why the existing ReDoS guard never caught it, and the one limitation the fix deliberately accepts.

Found while porting this repo's UK rules into another project, whose port of `redos-guard.test.ts` failed immediately. The bug is in this repo, not in the port.

---

## 1. The vulnerability

Each rule's pattern driven against `" ".repeat(10_000)` — the exact adversarial input already present in `redos-guard.test.ts`'s deep-mode corpus — out of process, fresh `node -e` per run:

| rule | file | measured @10k | budget |
|---|---|---:|---|
| `entities.uk-medical-context` | `entities-uk.ts` | **63.77ms** | 50ms |
| `legal.uk-coroner-ref` | `legal-uk.ts` | **189.96ms** | 50ms |
| `identifiers.uk-hospital-mrn` | `identifiers-uk.ts` | **238.64ms** | 50ms |
| `legal.uk-legal-context` | `legal-uk.ts` | **did not terminate** (>8s per call; `test:redos:deep` hung 120s+ and had to be killed) | 50ms |

The first three scale roughly quadratically (`uk-hospital-mrn`: 2000→10.8ms, 4000→40.1ms, 6000→91.4ms — each doubling roughly quadruples the time). `legal.uk-legal-context` is near-cubic: isolating its alternatives showed the `Claim No`/`Case No`/`Ref` branches — each containing `\.?\s*:?\s*`, **two independent unbounded `\s*` runs separated only by an optional colon** — scale 1000→278ms, 2000→2090ms, 4000→timeout. The `Inquest ... the death of` branch, which has no adjacent-optional-quantifier shape, was fine alone (1000→2.7ms, 4000→11.8ms). The double-`\s*` shape is the cost, not the four-way alternation.

**Impact:** a `.docx` containing a long whitespace run hangs the detection pass. In a tool whose whole purpose is a pre-disclosure safety gate, a hang is a real availability failure.

## 2. Why the existing guard never caught it

`RULES_GUIDE.md` §7 mandates exactly this fuzz test and `redos-guard.test.ts` exists. Two compounding gaps, both found by reading git history.

### 2a. Historical — the guard never ran in CI against these rules

The four rules were authored in `21136bc` / `eb84d64` (2026-04-20), on a branch forked from `bc0f5c1` (v1.1.1). At that point `redos-guard.test.ts`'s entire `describe` block was gated by:

```ts
const skipInCi = process.env.CI === "true" || process.env.SKIP_REDOS_FUZZ === "1";
```

— an **unconditional** skip whenever `CI==='true'`, with no smoke-mode fallback and no CI step invoking any variant of it. GitHub Actions always sets `CI=true`, so on every push and PR the whole guard suite silently no-op'd: zero assertions, zero signal, no red X.

The fix for *that* — the smoke/deep split, `SMOKE_ADVERSARIAL_INPUTS`, `test:redos:smoke`, and the CI step — landed six days later in `ce59b6c`, but on the **upstream** line of history. It only reached this fork via `8f56967` (the v1.2.0/v1.2.1 merge), long after these rules were in. **The fuzz did not run and miss them; it never ran.**

Locally, catching it would have required running `bun run test` in a shell where `CI` was not `"true"` — and the `test:redos:deep`/`test:redos:smoke` scripts didn't exist yet either.

### 2b. Structural — the smoke corpus is too short for this bug class (still live on `main`)

CI's actual gate is `bun run test:redos:smoke`, whose corpus is 1,000 characters. Run against the pre-fix code it caught only one of the four:

```
× legal.uk-legal-context returns within 50ms on 1000-char adversarial input
  → expected 937.49 to be less than 50
```

| rule | smoke (1,000 chars) | deep (10,000 chars) |
|---|---:|---:|
| `entities.uk-medical-context` | 0.84ms | **63.77ms** |
| `legal.uk-coroner-ref` | 2.24ms | **189.96ms** |
| `identifiers.uk-hospital-mrn` | 2.59ms | **238.64ms** |
| `legal.uk-legal-context` | **898.5ms** | timeout |

Three of the four are only *quadratic*, so they cross the 50ms budget somewhere around 8,000–13,000 characters — invisible to a 1,000-character corpus, even though the **deep corpus already contained the exact input that catches all three** (`" ".repeat(10_000)`). Deep mode only runs locally. CI was a backstop for "catastrophic" ReDoS but not for "merely quadratic" — still a hang on a safety gate.

### 2c. The rule-level test measured the wrong dimension

`RULES_GUIDE.md` §8.1 requires a per-rule ReDoS test. The pre-existing one for `legal.uk-legal-context` was:

```ts
expectFast("uk-legal-context", "Claim No: " + "A".repeat(10000), 100);
```

It fills with `A`, not whitespace, so it never touches the whitespace-specific pathology — and passed all along. **A diligent author who ran and passed the mandated test would still not have caught this:** the test exercised a long *value*, not long *padding between label and value*.

## 3. The fix, per rule

### `entities.uk-medical-context`, `identifiers.uk-hospital-mrn` — hoist the existing guard

Both already had a `(?![ \t])` guard, but *after* the lookbehind:

```
(?<=LOOKBEHIND)(?![ \t])BODY     →     (?![ \t])(?<=LOOKBEHIND)BODY
```

Both are zero-width assertions at the same position, so conjunction order cannot change the matched language (AND is commutative) — only performance. V8 evaluates left to right, so the cheap guard rejects most positions in an adversarial whitespace run in O(1), before the expensive variable-length lookbehind runs.

**After: flat ~2ms** at 1,000–20,000 chars, vs 63.77ms / 238.64ms at 10,000.

### `legal.uk-coroner-ref` — add a guard (verified safe)

Had no guard. Its value body (`(?:\d{2,4}[-/]\d{2,6}|[A-Z]{1,3}[-/]?\d{4,8})`) can **never** legitimately start with a space or tab — always a digit or uppercase letter — so adding `(?![ \t])` ahead of the lookbehind cannot reject any position that would otherwise match.

**After: flat ~2ms** at 10,000–20,000 chars, vs 189.96ms.

### `legal.uk-legal-context` — the guard technique does not apply

This rule's value body (`[^\n;,]{3,80}`) **can** legitimately start with whitespace, and `legal-uk.test.ts` already asserted it: `"Claim No: KB-2024-001234"` matches `[": KB-2024-001234"]` (colon and space included, via leftmost-match-wins plus the lookbehind's flexible `\s*`), and `"Claim No\n  X"` matches `["  X"]`. Adding a leading-char guard changes both. Two alternatives were tried and **rejected on differential testing**: moving the whitespace connector outside the lookbehind over-matched (`m[0]` gained the consumed whitespace); deleting it broke the label-at-EOL/indented-value case entirely.

The fix combines two independently-necessary restructurings inside each of the four lookbehind alternatives:

1. **Nest the trailing `:?\s*` as `(?::\s*)?`.** `\s*:?\s*` and `\s*(?::\s*)?` describe the same regular language, but the first gives the engine O(k) ways to split a k-character whitespace run across two `\s*` before concluding the label isn't there. Nesting gates the second `\s*` behind a required, cheap `:` literal, so a colon-less position fails in O(1). This alone took the near-cubic blowup down to quadratic (~140–500ms @10k) — still over budget.
2. **Bound each `\s*` to `\s{0,100}`.** The remaining quadratic cost is the single unbounded `\s*` still checked at O(n) positions, each costing O(distance). Bounding caps per-position cost to a constant.

Both are necessary: bounding alone (no nesting) still measured **309ms @10k**.

**After: ~2ms @1k, ~22ms @10k, ~42ms @20k** — under budget with margin. (The ~4.6s vitest wall-clock against the deep-gate test is `node` subprocess spawn and JIT warmup inherent to that gate's own methodology, not regex time.)

## 4. Behaviour preservation — and the one accepted limitation

Differential harness per rule, pre-fix vs post-fix pattern, across label × padding × value matrices plus realistic UK court and clinical-negligence fixtures:

| rule | matrix | diffs |
|---|---:|---:|
| `entities.uk-medical-context` | 5,763 | **0** |
| `legal.uk-coroner-ref` | 2,027 | **0** |
| `identifiers.uk-hospital-mrn` | 2,476 | **0** |
| `legal.uk-legal-context` | 6,336 | **0** |

For the first three the preservation is **unconditional** — provably exact for any input (a commutative reorder, or a guard that cannot reject a matchable position), re-confirmed at up to 50,000 characters of padding with zero divergence.

### `legal.uk-legal-context` has a real, deliberate cliff — stated here because the matrix cannot show it

The matrix covers 0–40 characters of padding; the bound is `\s{0,100}`. **A matrix that stops at 40 cannot distinguish `{0,100}` from unbounded**, so "0 diffs" proves less than it reads as. Binary-searched against the committed pattern:

| value | len | largest padding that still matches | `100 + 80 − len` |
|---|---:|---:|---:|
| `"Jane Doe"` | 8 | 172 | 172 |
| `"KB-2024-001234"` | 14 | 166 | 166 |
| `"Margaret Hollis"` | 15 | 165 | 165 |
| a 60-char name | 60 | 120 | 120 |

The cliff is **`100 + 80 − value.length`** consecutive spaces, exactly, in every case: the lookbehind bridges up to 100 whitespace characters invisibly, and the body's own `{3,80}` budget absorbs adjacent *space* padding as matched content. For **newline** padding the cliff is a flat **100** regardless of value length — the body excludes `\n`, so it cannot absorb newline overrun.

**Why `{0,100}` and not larger.** Time scales roughly linearly with the bound; the cliff is roughly 2× the bound:

| bound | @10k whitespace | cliff |
|---|---:|---:|
| `{0,100}` | 22.1ms | ~166 |
| `{0,250}` | 48.9ms | ~400 |
| `{0,500}` | 94.4ms | ~600 |

`{0,250}` is the most that fits the 50ms budget and leaves no headroom. `{0,100}` at 22ms is the trade taken: 166 consecutive whitespace characters between a label and its value is not a real document, and the alternative is a non-terminating hang. `{0,10}` was explicitly **rejected** — tried in the port, it broke column-aligned discharge-summary padding at 11+ spaces, silently dropping a patient's name, DOB, GMC number and NMC PIN.

**Consequence to know:** on the `Inquest ... the death of` branch the value is **the deceased's name, which no other rule catches**. The `Claim No`/`Case No`/`Ref` branches' values are independently caught by `legal.uk-claim-number` and `legal.uk-coroner-ref` regardless of padding, so a cliff there is lower-consequence. The cliff is pinned by explicit tests in `legal-uk.test.ts`.

## 5. Guard hardening

1. **`SMOKE_ADVERSARIAL_INPUTS` widened 1,000 → 10,000 chars**, matching `ADVERSARIAL_INPUTS`. Closes §2b. Smoke stays in-process (subprocess spawn overhead — the cause of a prior 2.5-hour CI incident — was always the real reason smoke had to be cheap, not input length), so the cost is negligible: full smoke suite 39ms → **238ms** across 260 tests.
2. **20-second `timeout` added to the deep gate's `execFileSync`.** Before this, `test:redos:deep` against the unpatched rule hung indefinitely with **no output at all** — `execFileSync` had no timeout, so a non-terminating pattern blocks the suite forever with zero diagnostic signal instead of failing loudly. 20s clears the worst plausible passing case (~11s) while bounding the failure mode.

## 6. Verification

- `bun run test` (deep gate included): **67 files / 2290 tests green**, ~29s. Previously: hung indefinitely.
- `SKIP_REDOS_FUZZ=0 bun run test`: same.
- `bun run test:redos:smoke`: 260/260, 238ms · `bun run test:redos:deep`: 399/399, ~24s (was: did not terminate).
- `bunx eslint .`, `bunx tsc --noEmit`, `bunx svelte-check`: all clean (443 files, 0 errors, 0 warnings).
- `bun run build`: succeeds, within the 3MB cap, SHA-256 sidecar generated.

## 7. Residual risks

1. **The 50ms budget is wall-clock**, so the guard tests are timing-sensitive and can fail spuriously on a loaded CI runner. Observed elsewhere on the same class of test: a contended run took 1024s with a spurious failure; idle, 13.1s and green. **If this bites, do not raise the budget until it stops complaining** — that silently removes the guard's teeth, which is how the original four rules shipped. Prefer CPU-time, or a warm-up plus a relative-to-baseline assertion, or running the guard serially.
2. **Smoke mode has no hard kill-switch** for a hypothetical future in-process hang — a structural consequence of smoke avoiding subprocess spawning. Widening the corpus closes today's gap but adds no absolute ceiling.
3. **`legal.uk-legal-context`'s cliff** (§4) is accepted and pinned, not eliminated.
