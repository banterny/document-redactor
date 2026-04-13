# Phase 6 handback — Label-driven PII coverage

**Completed:** 2026-04-13 16:06 KST
**Executed by:** Codex 5.4 xhigh
**Starting commit:** `885873a`
**Ending commit:** `0431bdb` (code-complete HEAD before this handback commit)

## Summary

Phase 6 closed the label-driven PII gap with 5 additive regex rules: one standalone Korean landline rule in `identifiers.ts`, plus four new label-driven entity rules for Korean/English address and phone labels. The direct pain points from manual QA are now covered: `Address: {value}` / `주소: {value}` values are emitted as entity candidates, non-mobile Korean numbers like `02-3446-3727` are emitted as identifier candidates, and phone labels such as `Phone Number:` / `전화번호:` produce context-backed matches that complement the existing mobile and international phone rules. The suite grew from 1607 to 1702 passing tests (+95 total), including +65 direct rule tests and +30 auto-added ReDoS guard cases through registry growth.

## Commits created

```text
0431bdb feat(detection/rules): add 4 label-driven address+phone entity rules
3b374bb feat(detection/rules): add phone-kr-landline for Korean non-mobile numbers
```

## Files modified

- `src/detection/rules/identifiers.ts` (103 lines, +1 rule -> 9 total)
- `src/detection/rules/identifiers.test.ts` (266 lines, +13 tests)
- `src/detection/rules/entities.ts` (213 lines, +4 rules -> 16 total)
- `src/detection/rules/entities.test.ts` (515 lines, +52 tests)
- `src/detection/detect-all.test.ts` (543 lines, +1 expectation update for additive label-driven match)

## Registry counts

- identifiers: 9 (Phase 0: 8 + Phase 6: 1)
- financial: 10
- temporal: 8
- entities: 16 (Phase 1: 12 + Phase 6: 4)
- legal: 6
- **Total ALL_REGEX_RULES: 49**

## Tests

- Before: 1607 passing
- After: 1702 passing
- New: +95 tests

Breakdown:
- `src/detection/rules/identifiers.test.ts`: +13
- `src/detection/rules/entities.test.ts`: +52
- `src/detection/_framework/redos-guard.test.ts`: +30 auto-added cases from 5 new regex rules x 6 adversarial inputs

## Build

- Before hash (Phase 5): `a0f706b6adff62604e766d690c418704e0745af23fac9be80cfb8523790f421d`
- After hash (Phase 6): `68b631d45edc7b92fd4cb3955f5913e9b44d26726f02ead585c07f47fe7edbde`
- Determinism: yes; two sequential `bun run build` executions produced the same sha256

## Acceptance criteria

1. ✅ `bun run test` passed `1702 passed (1702)` with 0 failures.
2. ✅ `bun run typecheck` passed with `0 errors` and `0 warnings`.
3. ✅ `bun run lint` reported 0 errors; only the same 3 pre-existing `coverage/*.js` warnings remain.
4. ✅ `bun run build` succeeded and produced `dist/document-redactor.html`.
5. ✅ Build determinism verified: two sequential builds produced the same sha256 `68b631d45edc7b92fd4cb3955f5913e9b44d26726f02ead585c07f47fe7edbde`.
6. ✅ Phase 0 characterization still passes byte-for-byte: `src/detection/detect-pii.characterization.test.ts` -> `24 passed`.
7. ✅ `src/detection/rules/identifiers.test.ts` now has a dedicated `phone-kr-landline` block with 13 tests.
8. ✅ `src/detection/rules/entities.test.ts` now has 4 new describe blocks totaling 52 tests.
9. ✅ `IDENTIFIERS.length === 9`.
10. ✅ `ENTITIES.length === 16`.
11. ✅ `ALL_REGEX_RULES.length === 49`.
12. ✅ Registry verification passes at import time; no duplicate ids or malformed rule metadata surfaced during test discovery.
13. ✅ ReDoS guard passed for all 5 new rules on all 6 adversarial inputs under the locked 50ms budget.
14. ✅ Alternation-order coverage exists in tests for `Mailing Address`, `전화번호`, `팩스번호`, and `Phone Number` label cases.
15. ✅ Comma-in-address coverage exists: `"연락지: 서울시 서초구 반포대로 108, 101호"` captures the full value including the comma.
16. ✅ Locked layers remained untouched: no modifications to `_framework/**`, `src/propagation/**`, `src/docx/**`, `src/finalize/**`, or `src/ui/**`.
17. ✅ No new `try/catch` was added to the rules files.
18. ✅ No new npm dependencies were added.
19. ✅ Two local conventional commits were created, both with `Co-Authored-By: Codex <noreply@openai.com>`.
20. ✅ This handback exists at `docs/phases/phase-6-handback.md`.
21. ⚠️ Browser-only manual verification was not executed in this CLI-only session; see the checklist below.

## Deviations from brief

- `src/detection/detect-all.test.ts` needed one expectation update even though the brief's file-layout section did not list it. The new `entities.en-phone-context` rule correctly adds an extra candidate to the normalization-preservation sample (`Cell: ０１０-...`), so the old single-candidate expectation was no longer valid.
- `entities.en-address-context` does not ship the literal regex from § 8.2 verbatim. The initial spec-compliant version failed the locked 50ms ReDoS guard, so the final pattern was tightened to:
  - fixed-string lookbehind alternatives for the supported labels
  - an address-value start of `[0-9A-Z]`
  - a bounded `[^\n;]{4,99}?` tail
  This preserves the intended examples and test coverage while satisfying the guard.

## Gotchas encountered

- Label-driven lookbehind plus permissive value classes initially let `:` and leading spaces leak into the captured text for address/phone context rules. Tightening the value-start character solved that without changing the rule categories or runner behavior.
- Using `\s` inside the phone-context value class caused newline characters to be swallowed in boundary cases. Replacing it with a plain-space character class kept the intended phone formats while avoiding line-break captures.
- The English address rule was the only Phase 6 rule to fail the 50ms guard, and it failed by a small margin repeatedly. It needed two optimization passes before landing safely below budget.

## Manual verification recommended

- [ ] Open `dist/document-redactor.html`
- [ ] Drop a document containing `주소: {value}` or `Address: {value}` labels
- [ ] Confirm the address value is highlighted in the center preview
- [ ] Confirm it appears in the `법인 / 인물` section of the right panel
- [ ] Drop a document containing `전화: {value}` / `Phone Number: {value}` labels
- [ ] Confirm the phone value is highlighted and appears as a candidate
- [ ] Drop a document containing a Korean landline such as `02-3446-3727`
- [ ] Confirm the landline is highlighted and appears in the `식별번호 (PII)` section

## Suggested next steps

1. Add Paranoid-tier label-driven rules for additional labeled identifiers such as `Account Number`, `등록번호`, and `ID`.
2. Add stricter phone-number plausibility checks (reserved or impossible area-code ranges) if real documents show false positives.
3. Add broader address validation if real documents need unlabeled address coverage.
4. Extend manual QA with a small browser automation harness for label-driven candidate highlighting.
