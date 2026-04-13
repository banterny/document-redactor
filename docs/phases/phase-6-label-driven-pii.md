# Phase 6 — Label-driven PII coverage (address + landline + phone-context)

> ✅ **READY FOR CODEX EXECUTION** ✅
>
> Authored 2026-04-13 after Phase 5 manual QA surfaced a concrete detection
> gap: users see documents with plain-as-day `Address: 12345 Main St...` or
> `Phone Number: 02-3446-3727` labels but the values are NOT flagged — not
> even as clickable (unchecked) candidates. Two root causes:
>
>   - **No address detection rule exists.** Phase 1 covered identifiers /
>     financial / temporal / entities / legal / heuristics but deliberately
>     skipped addresses because the format is too free. Label-driven capture
>     fixes this cleanly: `Address: {value}` → redact `{value}`.
>   - **Phone regex covers mobile only.** `identifiers.phone-kr` matches
>     010/011/016-019 (mobile) but NOT landlines (02-XXXX-XXXX, 031-XXX-XXXX,
>     051-XXXX-XXXX, ...), VoIP (070), toll-free (080), or premium (060).
>     Users had to manually add landline numbers to the 기타 bucket.
>
> This brief adds 5 new detection rules, all regex-based with explicit label
> context for the address and phone-context rules. No UI changes. No
> detection-framework changes. Scope is purely additive — 5 new rules + ~65
> new tests.

---

**For:** Codex 5.4 xhigh
**Project:** document-redactor
**Branch:** `main`
**Starting commit:** Phase 5 handback HEAD (`ec28ec4` or descendant)
**Working directory:** `/Users/kpsfamily/코딩 프로젝트/document-redactor`
**Date written:** 2026-04-13
**Author of brief:** Claude Opus 4.6 at user's request
**Predecessor:** `docs/phases/phase-5-verification-recovery.md` + Phase 5 handback

---

## 0. How to read this document

Self-contained execution spec. Read the whole thing before touching code. Every decision is locked.

### Sections

0. How to read this document
1. Mission statement
2. Required reading
3. Invariants
4. The 5 new rules (overview)
5. Detailed regex specs
6. File layout
7. `rules/identifiers.ts` extension
8. `rules/entities.ts` extension
9. Registry integration
10. Testing strategy
11. TDD sequence (6 steps)
12. Verification commands
13. Gotchas + out-of-scope + acceptance criteria + handback

### Decisions locked

| Ref | Decision | Rationale |
|---|---|---|
| **6.1** Label-driven approach for addresses | Regex captures `{label}\s*[:：]?\s*{value}` via variable-length lookbehind. No "any standalone address" rule. | Address formats are too varied for standalone regex. Label gives unambiguous high-confidence context. |
| **6.2** Phone landline as a separate identifier rule | `identifiers.phone-kr-landline` is new, not an extension of the existing `phone-kr`. | Keeps v1.0 `phone-kr` regex byte-locked (per Phase 0 invariants). The new rule lives alongside. |
| **6.3** Phone-context rule complements the landline rule | Address/phone with label may include formats the landline rule misses (e.g., `+82-2-3446-3727`, `(02) 3446-3727`). Label-driven phone-context captures these by requiring a label prefix. | Defense in depth. Both rules emit independent candidates; dedup handles overlaps. |
| **6.4** All 5 rules at `standard` + `paranoid` levels | Not `conservative` because the label lists are inherently incomplete and value captures may over-match on unusual formats. | Matches the convention from other context-based rules (§ 11.4.11 entities.ko-identity-context, § 10.4.8 temporal.date-context-ko). |
| **6.5** Categories | `identifiers.phone-kr-landline` → identifiers. 4 label-driven rules → entities (follows the ko-identity-context precedent). | The context-based rules semantically fit entities (they identify person/location); the standalone landline fits the existing identifiers category. |
| **6.6** No detection-framework changes | Rules are pure regex additions. No runner/registry/type changes. | Minimizes blast radius. |
| **6.7** No UI changes | CandidatesPanel auto-renders new candidates (financial/temporal/entities/legal sections already handle non-PII). Identifiers section shows the new landline rule. | Phase 2/3 UI infrastructure picks up new rules without code changes. |
| **6.8** No new npm dependencies | Zero `bun add` / `npm install`. | Consistent with all prior phases. |

---

## 1. Mission statement

Close the detection gap for addresses and non-mobile phone numbers by adding 5 new regex rules. Label-driven rules capture `{label}: {value}` patterns with high confidence. A standalone landline rule catches Korean non-mobile phone numbers without requiring a label. All rules are additive; no existing regex is modified.

**Zero engine/framework/UI behavior change.** The detection pipeline, runner, registry verifier, and UI components all remain unchanged. Only the rule arrays grow.

**Phase 0 characterization preserved.** `detect-pii.characterization.test.ts` T1–T24 must still pass byte-for-byte — the new rules do not affect the 8 Phase 0 identifier rules' behavior on the worst-case fixture.

Expected deliverables: **1 new identifier rule** + **4 new entity rules** + **~65 new tests** + **registry sanity test updates**. Zero new files. Zero new dependencies. Post-phase test count ~1670 passing.

---

## 2. Required reading

1. **`docs/phases/phase-1-rulebook.md` § 11.4.11** (`entities.ko-identity-context`) — authoritative template for label-driven capture with variable-length lookbehind.

2. **`docs/phases/phase-1-rulebook.md` § 9.4.10** (`financial.amount-context-ko`) — another template with terminator lookahead.

3. **`src/detection/rules/identifiers.ts`** — where `identifiers.phone-kr-landline` will be appended.

4. **`src/detection/rules/entities.ts`** — where the 4 new label-driven rules will be appended.

5. **`src/detection/rules/identifiers.test.ts`** — test file to extend for the new phone-kr-landline rule.

6. **`src/detection/rules/entities.test.ts`** — test file to extend for the 4 new label-driven rules.

7. **`src/detection/_framework/redos-guard.test.ts`** — registry-driven fuzz test. New rules auto-register and auto-fuzz; confirm they pass the 50ms budget.

8. **`docs/RULES_GUIDE.md` § 7** — ReDoS checklist. Every new regex must pass manual inspection.

9. **`docs/RULES_GUIDE.md` § 12.1** — `\b` in CJK anti-pattern. The Korean rules must use lookbehind/lookahead, not `\b`.

Commands:

```bash
cat docs/phases/phase-1-rulebook.md | sed -n '/### 11\.4\.11/,/### 11\.4\.12/p'
cat docs/phases/phase-1-rulebook.md | sed -n '/### 9\.4\.10/,/### 9\.5/p'
cat src/detection/rules/identifiers.ts
cat src/detection/rules/entities.ts
cat src/detection/rules/identifiers.test.ts
cat src/detection/rules/entities.test.ts
cat src/detection/_framework/redos-guard.test.ts
```

---

## 3. Invariants (DO NOT VIOLATE)

1. **All prior-phase tests must still pass.** `bun run test` → ≥ 1607 (post-Phase-5) + Phase 6 additions, 0 failing.

2. **No changes to `_framework/**`, `src/propagation/**`, `src/docx/**`, `src/finalize/**`, `src/ui/**`.** Phase 6 is detection-rule addition only.

3. **No modifications to existing rules.** The 8 Phase 0 identifier rules stay byte-locked. The 10 financial / 8 temporal / 12 entities / 6 legal / 5 structural / 4 heuristic rules all stay unchanged in their source. Phase 6 APPENDS to the arrays; it does not edit existing entries.

4. **No changes to `_framework/types.ts`.** No new types, no shape changes.

5. **No changes to `_framework/registry.ts`.** IDENTIFIERS and ENTITIES arrays are already spread into `ALL_REGEX_RULES`; appending to those arrays auto-registers the new rules.

6. **No changes to `package.json`, `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `svelte.config.js`.**

7. **Use `.js` extension in imports. Use `import type` for type-only imports.**

8. **No `try/catch`** in rule files. Rule files are pure data + regex.

9. **Phase 0 characterization preserved.** `bun run test src/detection/detect-pii.characterization.test.ts` passes byte-for-byte. The new rules do NOT change the set of candidates emitted on the worst-case fixture for PII kinds (the 8 Phase 0 rules still fire exactly as before).

10. **ReDoS guard passes for all new rules.** `bun run test src/detection/_framework/redos-guard.test.ts` includes the new rules automatically via `ALL_REGEX_RULES` iteration; they must pass the 50ms budget on all 6 adversarial inputs.

11. **No hardcoded entity names.** Labels and patterns only. Never `주소: 서울특별시 강남구` → specific city/gu pattern. That would be the RULES_GUIDE § 12.2 anti-pattern.

12. **No network code.** ESLint bans fetch/XHR/WebSocket.

13. **Do NOT `git push`.** Commit locally only.

14. **Do NOT modify `tests/fixtures/`.**

15. **Deterministic output.** The build determinism ship gate must still pass.

16. **Registry verification passes at load time.** `verifyRegistry()` in `_framework/registry.ts` runs on import. Every new rule's id must start with its category prefix (`identifiers.` or `entities.`) and end with its subcategory.

---

## 4. The 5 new rules (overview)

| # | id | Language | Level | What it catches |
|---|---|---|---|---|
| 1 | `identifiers.phone-kr-landline` | `["ko"]` | S, P | Korean landline + VoIP + toll-free + premium (02-, 031-66 series, 070, 080, 060, 050) |
| 2 | `entities.ko-address-context` | `["ko"]` | S, P | `주소/소재지/거주지/본점 주소/본사 주소/지점 주소/연락지/주민등록지: {value}` |
| 3 | `entities.en-address-context` | `["en"]` | S, P | `Address/Street Address/Mailing Address/Residence/Domicile/Location/Registered Address: {value}` |
| 4 | `entities.ko-phone-context` | `["ko"]` | S, P | `전화/전화번호/연락처/휴대폰/휴대전화/팩스: {digit-heavy value}` |
| 5 | `entities.en-phone-context` | `["en"]` | S, P | `Phone/Phone Number/Telephone/Tel/Fax/Mobile/Cell: {digit-heavy value}` |

Legend: **S** = standard, **P** = paranoid. No conservative tier — label lists are inherently incomplete.

---

## 5. Detailed regex specs

### 5.1 Rule 1: `identifiers.phone-kr-landline`

**Pattern:**

```
/(?<!\d)(?:02|0[3-6]\d|070|060|050|080)-?\d{3,4}-?\d{4}(?!\d)/g
```

**Semantic breakdown:**

- `(?<!\d)` — not preceded by a digit (no mid-number matching)
- `(?:02|0[3-6]\d|070|060|050|080)` — Korean area code or service prefix:
  - `02` — Seoul (2-digit)
  - `0[3-6]\d` — other regional area codes: 031–069 (Gyeonggi, Gangwon, Chungcheong, Jeolla, Gyeongsang, Jeju)
  - `070` — VoIP (internet phone)
  - `060` — premium/paid service
  - `050` — personal/alternate numbers
  - `080` — toll-free
- `-?\d{3,4}-?\d{4}` — subscriber number with optional hyphens
- `(?!\d)` — not followed by a digit

**Matches:**

- `"02-3446-3727"` → `02-3446-3727`
- `"02-345-6789"` → `02-345-6789`
- `"031-123-4567"` → `031-123-4567`
- `"070-1234-5678"` → `070-1234-5678`
- `"0234463727"` (no hyphens) → `0234463727`
- `"080-123-4567"` → `080-123-4567`

**Rejects:**

- `"010-1234-5678"` (mobile — caught by existing `phone-kr`) — no match on this rule (area prefix `010` is NOT in the alternation)
- `"02-345"` (too short) — subscriber portion requires 3–4 then 4
- `"099-1234-5678"` (invalid area code) — `0[3-6]\d` only covers 030–069

**Interaction with existing `phone-kr`:**

The existing `phone-kr` matches `010/011/016-019` mobile. This rule does NOT match those (the alternation explicitly excludes `01x`). So both rules together cover the full Korean telephone space with no overlap.

**ReDoS:** benign. No nested quantifiers; each segment is bounded.

**Level:** Standard + Paranoid. Not Conservative because area-code-only prefix is a weaker signal than the existing `010` mobile prefix.

### 5.2 Rule 2: `entities.ko-address-context`

**Pattern:**

```
/(?<=(?:주소|소재지|거주지|본점\s*주소|본사\s*주소|지점\s*주소|사업장\s*주소|연락지|주민등록지|등록기준지)\s*[:：]?\s*).{5,100}?(?=$|\n|;)/g
```

**Semantic breakdown:**

- Variable-length lookbehind with 10 Korean address labels
- Optional `:` or `：` (fullwidth colon) after label
- `.{5,100}?` — non-greedy value, 5–100 chars
- Terminator: newline, semicolon, or end-of-string

**Matches:**

- `"주소: 서울특별시 강남구 논현로 568 15층"` → `서울특별시 강남구 논현로 568 15층`
- `"소재지: 경기도 성남시 분당구 판교로 235"` → full address
- `"본점 주소 : 서울시 중구 을지로 100"` → full address (space around colon)
- `"사업장 주소: 부산광역시 해운대구 APEC로 55"` → full address
- `"연락지: 서울시 서초구 반포대로 108, 101호"` → full including apartment (comma NOT a terminator in this regex — user's intent is to redact the whole address)

**Rejects:**

- `"주소"` alone (no value) — no match
- `"주소: 서"` (2 chars) — min is 5 chars, no match
- Value beyond 100 chars — regex caps at 100 via non-greedy

**Why 5-char minimum:** a meaningful address has at least 5 characters. 3-char values are usually abbreviations or typos.

**Why 100-char maximum:** prevents runaway matching when the lookahead can't find a terminator. Real addresses rarely exceed 80 chars.

**Why comma NOT a terminator:** Korean addresses commonly use commas within them (`서울시 서초구 반포대로 108, 101호`). Terminating at comma would split these. Semicolon and newline remain as primary terminators.

**ReDoS:** variable-length lookbehind is bounded (longest label is `주민등록지` / `사업장 주소` at ~5 syllables). `.{5,100}?` with non-greedy is O(n). Passes 50ms budget.

### 5.3 Rule 3: `entities.en-address-context`

**Pattern:**

```
/(?<=(?:Registered\s+Address|Mailing\s+Address|Street\s+Address|Business\s+Address|Residence|Domicile|Location|Address)\s*:\s*).{5,100}?(?=$|\n|;)/g
```

**Alternation order:** multi-word labels BEFORE single-word `Address` so longer matches win (otherwise the single-word `Address` consumes the first 7 chars and misses the compound).

**Matches:**

- `"Address: 12345 Main St, Anytown, CA 12345"` → `12345 Main St, Anytown, CA 12345`
- `"Mailing Address: P.O. Box 1234, New York, NY 10001"` → full value
- `"Registered Address: 100 Wall Street, 5th Floor"` → full value
- `"Residence: 456 Oak Avenue, Apt 3B"` → full value

**Rejects:**

- `"address: foo"` lowercase label — no match (case-sensitive; convention)
- `"Address"` alone — no match
- Value < 5 chars or > 100 chars — rejected by repetition bounds

**Language rationale:** `"en"` only. English labels on Korean documents are rare; if they appear, the English rule still fires (language filter = mixed on such documents).

### 5.4 Rule 4: `entities.ko-phone-context`

**Pattern:**

```
/(?<=(?:전화번호|전화|연락처|휴대전화|휴대폰|핸드폰|팩스번호|팩스|Fax|Tel)\s*[:：]?\s*)[+\d\s\-().]{7,25}(?=$|\n|;|[^\d+\-\s()])/g
```

**Alternation order:** longer forms first (`전화번호` before `전화`, `팩스번호` before `팩스`, `휴대전화` before `휴대폰` before `핸드폰`).

**Semantic breakdown:**

- Variable-length lookbehind for 10 Korean phone labels (plus `Fax` and `Tel` as common English labels that appear in Korean documents)
- `[+\d\s\-().]{7,25}` — phone-like digit span: digits, hyphens, spaces, parens, plus sign, period. 7–25 chars covers everything from 7-digit local `345-6789` to international `+82 (0)2-3446-3727 ext. 123`
- Terminator: end-of-string, newline, semicolon, OR any non-phone character (letter/punctuation other than allowed)

**Matches:**

- `"전화: 02-3446-3727"` → `02-3446-3727`
- `"전화번호: 010-1234-5678"` → `010-1234-5678`
- `"연락처: +82-2-3446-3727"` → `+82-2-3446-3727`
- `"팩스: (02) 3446-3728"` → `(02) 3446-3728`
- `"Tel: 02.3446.3727"` (period separators) → `02.3446.3727`
- `"휴대폰: 010 1234 5678"` (space separators) → `010 1234 5678`

**Rejects:**

- `"전화"` alone — no value
- `"전화: abc"` — no digits, fails repetition
- `"전화: 123456"` (6 chars) — below minimum

**Interaction with other phone rules:**

`"전화: 010-1234-5678"` fires BOTH `phone-kr` (mobile regex) AND `ko-phone-context` (label+value). Both emit candidates with the same `text`, dedup collapses. This is intended — two rules both confirming the match is a higher-confidence signal.

### 5.5 Rule 5: `entities.en-phone-context`

**Pattern:**

```
/(?<=(?:Phone\s+Number|Telephone|Phone|Mobile|Cell|Tel|Fax)\s*:\s*)[+\d\s\-().]{7,25}(?=$|\n|;|[^\d+\-\s()])/g
```

**Alternation order:** `Phone Number` BEFORE `Phone`.

**Matches:**

- `"Phone Number: 02-3446-3727"` → `02-3446-3727`
- `"Phone: +1 (555) 123-4567"` → `+1 (555) 123-4567`
- `"Mobile: 010-1234-5678"` → `010-1234-5678`
- `"Fax: 02 345 6789"` → `02 345 6789`
- `"Tel: +82.2.3446.3727"` → `+82.2.3446.3727`

**Rejects:**

- `"phone: foo"` lowercase label — no match
- `"Phone Number"` alone — no value

---

## 6. File layout

```
src/detection/rules/
├── identifiers.ts            ← MODIFIED (append 1 rule)
├── identifiers.test.ts       ← MODIFIED (append ~13 tests)
├── entities.ts               ← MODIFIED (append 4 rules)
├── entities.test.ts          ← MODIFIED (append ~52 tests)
├── ... (other files UNCHANGED)

src/detection/_framework/
├── registry.ts               (UNCHANGED — rules auto-registered via existing spread)
├── redos-guard.test.ts       (UNCHANGED — auto-picks up new rules via ALL_REGEX_RULES iteration)
├── ... (other files UNCHANGED)

docs/phases/
├── phase-6-label-driven-pii.md  (THIS DOCUMENT)
└── phase-6-handback.md          ← NEW at end of phase
```

**Counts:**
- New files: 0 (just the handback doc)
- Modified files: 4 (identifiers.ts + test, entities.ts + test)
- Unchanged: every other file

---

## 7. `rules/identifiers.ts` extension

### 7.1 Where to append

Append a new entry to the `IDENTIFIERS` array AFTER the existing `identifiers.phone-intl` entry and BEFORE `identifiers.email`. This keeps phone-related rules grouped.

Wait — actually keep the existing order untouched. APPEND the new rule at the END of the array, after `identifiers.credit-card`. This minimizes the diff and preserves the v1.0 Phase 0 rule order exactly.

### 7.2 New entry

Append this exact block as the last array entry:

```typescript
  {
    id: "identifiers.phone-kr-landline",
    category: "identifiers",
    subcategory: "phone-kr-landline",
    pattern: /(?<!\d)(?:02|0[3-6]\d|070|060|050|080)-?\d{3,4}-?\d{4}(?!\d)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean landline + VoIP + toll-free + premium phone numbers (02/031-069/070/060/050/080)",
  },
```

### 7.3 Verify the file

After the edit:

```bash
grep -c "^  {" src/detection/rules/identifiers.ts
# Expected: 9 (8 Phase 0 + 1 new)
```

`IDENTIFIERS.length === 9` after Phase 6.

### 7.4 The 8 Phase 0 rules remain byte-locked

Do NOT modify:
- `identifiers.korean-rrn`
- `identifiers.korean-brn`
- `identifiers.us-ein`
- `identifiers.phone-kr`
- `identifiers.phone-intl`
- `identifiers.email`
- `identifiers.account-kr`
- `identifiers.credit-card`

Their `pattern.source` must still match the `EXPECTED_REGEX_SOURCE` table in `detect-pii.characterization.test.ts`.

---

## 8. `rules/entities.ts` extension

### 8.1 Where to append

Append 4 new entries at the END of the `ENTITIES` array, after the existing `entities.en-identity-context` entry. Order within the new block:

1. `entities.ko-address-context`
2. `entities.en-address-context`
3. `entities.ko-phone-context`
4. `entities.en-phone-context`

### 8.2 New entries

Append this block as the last 4 array entries:

```typescript
  {
    id: "entities.ko-address-context",
    category: "entities",
    subcategory: "ko-address-context",
    pattern:
      /(?<=(?:주소|소재지|거주지|본점\s*주소|본사\s*주소|지점\s*주소|사업장\s*주소|연락지|주민등록지|등록기준지)\s*[:：]?\s*).{5,100}?(?=$|\n|;)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean address value following a label (주소/소재지/거주지/본점 주소/...)",
  },
  {
    id: "entities.en-address-context",
    category: "entities",
    subcategory: "en-address-context",
    pattern:
      /(?<=(?:Registered\s+Address|Mailing\s+Address|Street\s+Address|Business\s+Address|Residence|Domicile|Location|Address)\s*:\s*).{5,100}?(?=$|\n|;)/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English address value following a label (Address/Mailing Address/Residence/...)",
  },
  {
    id: "entities.ko-phone-context",
    category: "entities",
    subcategory: "ko-phone-context",
    pattern:
      /(?<=(?:전화번호|전화|연락처|휴대전화|휴대폰|핸드폰|팩스번호|팩스|Fax|Tel)\s*[:：]?\s*)[+\d\s\-().]{7,25}(?=$|\n|;|[^\d+\-\s()])/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Phone number value following a Korean label (전화/전화번호/연락처/휴대폰/팩스/...)",
  },
  {
    id: "entities.en-phone-context",
    category: "entities",
    subcategory: "en-phone-context",
    pattern:
      /(?<=(?:Phone\s+Number|Telephone|Phone|Mobile|Cell|Tel|Fax)\s*:\s*)[+\d\s\-().]{7,25}(?=$|\n|;|[^\d+\-\s()])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Phone number value following an English label (Phone/Phone Number/Mobile/Cell/Tel/Fax)",
  },
```

### 8.3 Verify

```bash
grep -c "^  {" src/detection/rules/entities.ts
# Expected: 16 (12 Phase 1 + 4 new)
```

`ENTITIES.length === 16` after Phase 6.

### 8.4 The 12 Phase 1 entity rules remain unchanged

Do NOT modify any existing entry in `entities.ts`. The existing 12 rules stay byte-identical.

---

## 9. Registry integration

### 9.1 No explicit registry.ts changes required

`_framework/registry.ts` already contains:

```typescript
export const ALL_REGEX_RULES: readonly RegexRule[] = [
  ...IDENTIFIERS,
  ...FINANCIAL,
  ...TEMPORAL,
  ...ENTITIES,
  ...LEGAL,
] as const;
```

Since Phase 6 extends the arrays directly, `ALL_REGEX_RULES` automatically grows by 5 (4 entities + 1 identifier). Total rules:

| Category | Before | After | Delta |
|---|---:|---:|---:|
| identifiers | 8 | 9 | +1 |
| financial | 10 | 10 | 0 |
| temporal | 8 | 8 | 0 |
| entities | 12 | 16 | +4 |
| legal | 6 | 6 | 0 |
| **Total** | **44** | **49** | **+5** |

### 9.2 Registry verifier

`verifyRegistry()` runs at module load and checks:

- All `id`s unique (no collision)
- All patterns have `g` flag
- All `levels` and `languages` non-empty
- All `descriptions` non-empty
- All `id`s match `{category}.{subcategory}` format

The new rules follow all conventions, so verification passes unchanged. If you see a `verifyRegistry` error at test discovery time, you typo'd an id — fix the typo.

### 9.3 Registry sanity test updates

If `identifiers.test.ts` or `entities.test.ts` has a test like `expect(IDENTIFIERS.length).toBe(8)` or `expect(ENTITIES.length).toBe(12)`, update the number to `9` and `16` respectively. Search for these expectations:

```bash
grep -n "toBe(8)\|toBe(12)\|toHaveLength(8)\|toHaveLength(12)" src/detection/rules/identifiers.test.ts src/detection/rules/entities.test.ts
```

Update any registry-count assertion.

---

## 10. Testing strategy

### 10.1 `identifiers.test.ts` additions (~13 tests)

Append a new `describe("identifiers.phone-kr-landline", …)` block with these minimum tests:

**Positive matches (3):**
- Matches Seoul 02 with 4-digit subscriber: `02-1234-5678`
- Matches region 031 with 3-digit prefix: `031-123-4567`
- Matches 070 VoIP: `070-1234-5678`

**Variants (3):**
- Matches without hyphens: `0234463727`
- Matches 080 toll-free: `080-123-4567`
- Matches 050 alternate: `050-1234-5678`

**Boundaries (3):**
- Start of string: `02-1234-5678 is the Seoul office`
- End of string: `Call 02-1234-5678`
- After colon: `Tel: 02-1234-5678`

**Rejects (3):**
- Mobile `010-1234-5678` — does NOT match (caught by existing phone-kr rule)
- Too short `02-123` — no match
- Invalid area code `099-1234-5678` — no match

**ReDoS (1):**
- 10KB adversarial input `0-`.repeat(5000) — elapsed < 50ms

### 10.2 `entities.test.ts` additions (~52 tests)

Append 4 new `describe(...)` blocks — one per new rule. Each block has ≥ 13 tests following the same structure:

- 3 positive
- 3 variants
- 3 boundaries (including interaction with adjacent labels/values)
- 3 rejects
- 1 ReDoS adversarial

Total: 4 × 13 = 52 tests minimum.

**Key test cases:**

For `entities.ko-address-context`:
- `"주소: 서울특별시 강남구 논현로 568"` → full value captured
- `"소재지: 경기도 성남시 분당구 판교로 235"` → full
- `"주소: 서울시 서초구 반포대로 108, 101호"` → includes comma (comma is NOT a terminator)
- Label-only `"주소"` → no match
- Min length `"주소: 서"` (2 chars) → no match
- Terminator `"주소: 서울시;"` → captures `서울시`

For `entities.en-address-context`:
- `"Address: 12345 Main St, Anytown, CA 12345"` → full value
- Alternation order: `"Mailing Address: 456 Oak Ave"` → full match (Mailing Address wins over plain Address)
- Lowercase `"address: foo"` → no match

For `entities.ko-phone-context`:
- `"전화: 02-3446-3727"` → `02-3446-3727`
- `"연락처: +82-2-3446-3727"` → includes `+82` prefix
- `"팩스: (02) 3446-3728"` → includes parens
- Alternation: `"전화번호"` wins over `"전화"` on input `"전화번호: 010-1234-5678"`

For `entities.en-phone-context`:
- `"Phone Number: 02-3446-3727"` → full match
- `"Phone: +1 (555) 123-4567"` → includes international format
- Alternation: `"Phone Number"` wins over `"Phone"`

### 10.3 Registry sanity test (1 new test in both files)

```typescript
// In identifiers.test.ts
it("exports exactly 9 rules", () => {
  expect(IDENTIFIERS).toHaveLength(9);
});

// In entities.test.ts
it("exports exactly 16 rules", () => {
  expect(ENTITIES).toHaveLength(16);
});
```

Update any existing length assertion in each file.

### 10.4 Total Phase 6 test count

- `identifiers.test.ts`: +13 new + 1 length update = +14
- `entities.test.ts`: +52 new + 1 length update = +53
- **Total new: ~67 tests**

Bringing suite from ~1607 → ~1674.

---

## 11. TDD sequence (6 steps)

### Step 1 — Baseline verification (no commit)

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"
bun run test 2>&1 | tail -5
# Expected: 1607 passing
bun run typecheck 2>&1 | tail -3

PHASE5_HEAD=$(git rev-parse --short HEAD)
echo "Phase 5 HEAD: $PHASE5_HEAD"
```

Fail-stop if baseline is not clean.

### Step 2 — Append `identifiers.phone-kr-landline` + tests (1 commit)

Extend `rules/identifiers.ts` per § 7.2. Extend `rules/identifiers.test.ts` per § 10.1.

**Verify:**
```bash
bun run test src/detection/rules/identifiers.test.ts 2>&1 | tail -5
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tail -5
# Phase 0 ship gate still passes
bun run test src/detection/_framework/redos-guard.test.ts 2>&1 | tail -5
# ReDoS guard auto-picks up the new rule and passes
```

**Commit message:** `feat(detection/rules): add phone-kr-landline for Korean non-mobile numbers`

### Step 3 — Append 4 new label-driven entity rules + tests (1 commit)

Extend `rules/entities.ts` per § 8.2. Extend `rules/entities.test.ts` per § 10.2.

**Verify:**
```bash
bun run test src/detection/rules/entities.test.ts 2>&1 | tail -5
bun run test 2>&1 | tail -5
# All 1674+ passing
```

**Commit message:** `feat(detection/rules): add 4 label-driven address+phone entity rules`

### Step 4 — Full regression check (no commit)

```bash
bun run test 2>&1 | tail -10
# Expected: ≥ 1674 passing, 0 failing
bun run typecheck 2>&1 | tail -3
bun run lint 2>&1 | tail -5
bun run build 2>&1 | tail -5
```

### Step 5 — Build determinism (no commit)

```bash
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build 2>&1 > /dev/null
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
[ "$FIRST" = "$SECOND" ] && echo "DETERMINISM OK" || echo "FAIL"
```

### Step 6 — Handback document (1 commit)

Create `docs/phases/phase-6-handback.md` per § 13.5.

**Commit message:** `docs(phases): add Phase 6 handback — label-driven PII coverage`

### TDD step summary

| Step | Files | Tests added | Running total |
|---|---|---:|---:|
| 1 | (verify) | 0 | 1607 |
| 2 | identifiers.ts + test | ~14 | ~1621 |
| 3 | entities.ts + test | ~53 | ~1674 |
| 4 | (verify full suite) | 0 | ~1674 |
| 5 | (build determinism) | 0 | ~1674 |
| 6 | phase-6-handback.md | 0 | ~1674 |

---

## 12. Verification commands

```bash
cd "/Users/kpsfamily/코딩 프로젝트/document-redactor"

# 1. Git state
git status
git log --oneline $PHASE5_HEAD..HEAD  # 2-3 new commits

# 2. Tests
bun run test 2>&1 | tail -10
# Expected: ≥ 1674 passing, 0 failing

# 3. Phase 0 ship gate
bun run test src/detection/detect-pii.characterization.test.ts 2>&1 | tail -5
# Expected: 24 passing (byte-for-byte preservation)

# 4. Rules tests
bun run test src/detection/rules/identifiers.test.ts 2>&1 | tail -5
bun run test src/detection/rules/entities.test.ts 2>&1 | tail -5

# 5. ReDoS guard
bun run test src/detection/_framework/redos-guard.test.ts 2>&1 | tail -5

# 6. Registry counts
bun -e '
import("./src/detection/_framework/registry.js").then((m) => {
  console.log("ALL_REGEX_RULES:", m.ALL_REGEX_RULES.length, "(expected 49)");
  const byCategory = {};
  for (const r of m.ALL_REGEX_RULES) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }
  console.log("by category:", byCategory);
});
'
# Expected: ALL_REGEX_RULES 49, identifiers 9, entities 16

# 7. Type check
bun run typecheck 2>&1 | tail -5

# 8. Lint
bun run lint 2>&1 | tail -5

# 9. Build + determinism
bun run build 2>&1 | tail -5
FIRST=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
bun run build 2>&1 > /dev/null
SECOND=$(cat dist/document-redactor.html.sha256 | awk '{print $1}')
[ "$FIRST" = "$SECOND" ] && echo "DETERMINISM OK: $FIRST" || echo "FAIL"

# 10. No unintended changes
git diff $PHASE5_HEAD --name-only
# Expected: only identifiers.ts, identifiers.test.ts, entities.ts, entities.test.ts, docs/phases/phase-6-handback.md

# 11. Sanity: new rules actually in the registry
bun -e '
import("./src/detection/_framework/registry.js").then((m) => {
  const ids = m.ALL_REGEX_RULES.map((r) => r.id);
  const expected = [
    "identifiers.phone-kr-landline",
    "entities.ko-address-context",
    "entities.en-address-context",
    "entities.ko-phone-context",
    "entities.en-phone-context",
  ];
  for (const e of expected) {
    console.log(e, ids.includes(e) ? "✓" : "✗ MISSING");
  }
});
'
# Expected: all 5 with ✓
```

---

## 13. Gotchas + out-of-scope + acceptance criteria + handback

### 13.1 Gotchas

**13.1.1 Variable-length lookbehind is ES2018+.** All 4 label-driven rules use it. Supported in Node 18+ and modern browsers. Not a concern for this project but note it.

**13.1.2 Alternation order matters for multi-word labels.** `Mailing Address` must come BEFORE `Address` in the alternation; `Phone Number` before `Phone`; `전화번호` before `전화`; `팩스번호` before `팩스`. Otherwise the shorter label matches first and the value starts one word too late. Tests MUST verify alternation order via explicit test cases.

**13.1.3 Comma inside addresses.** Korean addresses legitimately contain commas (`서울시 서초구 반포대로 108, 101호`). The address regex does NOT terminate on comma. Only newline, semicolon, end-of-string. Tests must verify this.

**13.1.4 Phone value character class.** The phone-context regex uses `[+\d\s\-().]` — digit, plus, whitespace, hyphen, parenthesis, period. Covers all common phone formats. Does NOT include alphanumeric like `ext.` or `extension` — those trail the number and are NOT captured. If a user has `"Phone: 02-3446-3727 ext. 100"`, only `02-3446-3727 ` (with trailing space) matches up to the first letter `e`.

**13.1.5 Phone min length 7.** Prevents false positives on 3-4-digit numbers that appear in other contexts (section numbers, dates, etc.). Adjust downward ONLY if a test reveals a missed real phone.

**13.1.6 Trailing space in captures.** The phone-context regex may capture trailing whitespace (e.g., `"02-3446-3727 "` with trailing space if the line ends with a space). This is acceptable — the redactor does exact-string replacement, so `"02-3446-3727 "` with trailing space will find `"02-3446-3727 "` in the XML. Visually the highlight may extend slightly but semantically correct.

**13.1.7 Phase 0 characterization must still pass.** The new rules do NOT affect the 8 Phase 0 identifier rules. But the worst-case fixture is bilingual and may contain `주소:` labels — if so, the new `ko-address-context` rule fires on the fixture and produces new `nonPiiCandidates`. This is NOT a regression (the Phase 0 characterization tests T1–T24 check the PII pipeline, not nonPiiCandidates). Verify that the characterization test file is unchanged and still passes.

**13.1.8 Registry count assertions.** If `identifiers.test.ts` or `entities.test.ts` has a `toHaveLength(8)` or `toHaveLength(12)` assertion, it will FAIL after Phase 6. Update those assertions to `9` and `16` respectively.

**13.1.9 Label-driven rules and the 기타 bucket.** Users who added `02-3446-3727` to the 기타 (그 외) section before Phase 6 will see the same text now auto-detected by the new landline rule. Their manual entry stays — dedup happens at the Set level, so the user sees ONE row (marked by whichever source got there first). This is fine.

### 13.2 Out of scope

- ❌ Modify any existing regex rule
- ❌ Modify `_framework/` files (types, runner, registry, language-detect)
- ❌ Modify structural parsers or heuristics
- ❌ Modify propagation, docx, finalize, UI layers
- ❌ Add new categories (e.g., `personal-info`) — reuse identifiers and entities
- ❌ Add label-driven rules for other PII types (passport, driver's license, social security) — Paranoid-level phase
- ❌ Add phone number range/validity checks (e.g., reject area codes that don't exist) — out of scope
- ❌ Add address structure validation (ZIP code format, state codes) — out of scope
- ❌ Add `w:rsidR` / revision ID scrubbing — Paranoid phase
- ❌ Add `tests/fixtures/` changes
- ❌ Add new npm dependencies
- ❌ `git push`

### 13.3 Acceptance criteria

1. ✅ `bun run test` passes ≥ 1674 total, 0 failing
2. ✅ `bun run typecheck` → 0 errors
3. ✅ `bun run lint` → 0 errors (pre-existing warnings OK)
4. ✅ `bun run build` succeeds
5. ✅ Build determinism verified
6. ✅ Phase 0 characterization (T1–T24) passes byte-for-byte
7. ✅ `identifiers.test.ts` has 1 new `describe` block for `phone-kr-landline` with ≥ 13 tests
8. ✅ `entities.test.ts` has 4 new `describe` blocks (one per new rule) with ≥ 52 tests total
9. ✅ `IDENTIFIERS.length === 9`
10. ✅ `ENTITIES.length === 16`
11. ✅ `ALL_REGEX_RULES.length === 49`
12. ✅ Registry verifier passes (no duplicate ids, all patterns have `g` flag, etc.)
13. ✅ ReDoS guard passes for all 5 new rules on all 6 adversarial inputs (50ms budget)
14. ✅ Alternation order test verifies `Mailing Address` beats `Address`, `전화번호` beats `전화`, `Phone Number` beats `Phone`, `팩스번호` beats `팩스`
15. ✅ Comma-in-address test passes: `"주소: 서울시 서초구 반포대로 108, 101호"` captures full value including comma
16. ✅ No changes to `_framework/`, `propagation/`, `docx/`, `finalize/`, `ui/`
17. ✅ No new try/catch in the rules files
18. ✅ No new npm dependencies
19. ✅ 2–3 commits with conventional format + `Co-Authored-By: Codex`
20. ✅ Handback doc at `docs/phases/phase-6-handback.md`
21. ✅ On manual verification: dropping a document with `Address: {value}` or `Phone Number: {value}` labels highlights the value in the center preview

### 13.4 Error handling (3-attempt rule)

Same as prior phases. If 3 attempts fail, write BLOCKED section in handback and exit.

**If a new test fails:**
- Print the regex being tested: `console.log(rule.pattern.source)`
- Print the matches: `console.log([...matches(rule, text)])`
- Adjust the regex minimally to pass OR adjust the test if the expectation was wrong
- DO NOT skip or disable tests

**If ReDoS guard fails for a new rule:**
- The pattern has catastrophic backtracking. Redesign:
  - Cap the `.{5,100}?` to smaller range if needed
  - Remove nested quantifiers
  - Add terminator lookahead closer to the match
- DO NOT increase the budget

**If Phase 0 characterization fails:**
- You accidentally modified an existing rule. Check the diff carefully.
- `git diff src/detection/rules/identifiers.ts` — only the new last entry should be added, nothing else touched.

**If Svelte typecheck fails:**
- Should not happen — Phase 6 doesn't touch UI. If it does, you modified something you weren't supposed to. Revert.

### 13.5 Handback document template

Create `docs/phases/phase-6-handback.md`:

```markdown
# Phase 6 handback — Label-driven PII coverage

**Completed:** YYYY-MM-DD HH:MM
**Executed by:** Codex 5.4 xhigh
**Starting commit:** {Phase 5 HEAD short hash}
**Ending commit:** {short hash of HEAD}

## Summary

One paragraph describing the 5 new rules, tests added, and confirmation
that the user's pain points (Address: / Phone Number: labels not flagged)
are resolved.

## Commits created

{git log --oneline {Phase5HEAD}..HEAD}

## Files modified

- src/detection/rules/identifiers.ts (+{N} lines, +1 rule → 9 total)
- src/detection/rules/identifiers.test.ts (+{N} lines, +~14 tests)
- src/detection/rules/entities.ts (+{N} lines, +4 rules → 16 total)
- src/detection/rules/entities.test.ts (+{N} lines, +~53 tests)

## Registry counts

- identifiers: 9 (Phase 0: 8 + Phase 6: 1)
- financial: 10
- temporal: 8
- entities: 16 (Phase 1: 12 + Phase 6: 4)
- legal: 6
- **Total ALL_REGEX_RULES: 49**

## Tests

- Before: ~1607 passing
- After: {N} passing
- New: +{M} tests

## Build

- Before hash (Phase 5): {hash}
- After hash (Phase 6): {hash}
- Determinism: yes

## Acceptance criteria

{For each of the 21 criteria in § 13.3: ✅ or ❌ with evidence}

## Deviations from brief

{Any judgment call. If none: "None."}

## Gotchas encountered

{Anything non-obvious.}

## Manual verification recommended

- [ ] Open dist/document-redactor.html
- [ ] Drop a document containing `주소: {value}` or `Address: {value}` labels
- [ ] Confirm the address value is highlighted in the center preview
- [ ] Confirm it appears in the 법인/인물 section of the right panel (entities category includes ko-address-context and en-address-context)
- [ ] Same for `전화: {value}` / `Phone Number: {value}` labels
- [ ] Drop a document containing a Korean landline like `02-3446-3727`
- [ ] Confirm the landline is highlighted and appears in the 식별번호 (PII) section (identifiers.phone-kr-landline)

## Suggested next steps

1. Add Paranoid-tier rules for passport numbers, driver's licenses, other government IDs
2. Add phone number range validation (reject area codes that don't exist)
3. Address structure validation (ZIP code format, state codes)
4. Label-driven rules for remaining common labels (계좌번호, Account Number, 등록번호, ID)
```

---

## End of brief

This document is `docs/phases/phase-6-label-driven-pii.md`. It specifies 5 new regex rules to close the detection gap for addresses and non-mobile phone numbers: 1 standalone Korean landline rule + 4 label-driven rules (Korean/English × address/phone). Pure regex additions; no framework changes. ~67 new tests. 6 TDD steps, 11 verification commands, 21 acceptance criteria.
