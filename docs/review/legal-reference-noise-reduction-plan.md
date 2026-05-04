# Legal Reference Noise Reduction Plan

## 배경

긴 계약서에서 `Section N`, `제N조`, `제N항`, 실제 법령 조문이 redact 후보로 많이 올라오는 문제가 확인됐다. 이들은 대부분 민감정보가 아니라 계약서의 구조 또는 공개 법령 인용이다. 기본 후보로 올리면 사용자가 검토해야 하는 노이즈가 급증하고, 선택된 상태로 적용되면 downstream AI가 계약 구조와 법적 근거를 이해하기 어려워진다.

검증 결과, `Article`, `Clause`, `Schedule`, `Exhibit`, `별표`, `부속서` 형태는 현재 redaction 후보 파이프라인에서 자동 후보로 생성되지 않는다. 이들은 "삭제할 현행 후보"가 아니라 "앞으로도 후보로 만들지 말아야 할 regression guard"로 다룬다.

기존 구현은 `src/detection/rules/legal.ts`의 legal 규칙이 다음을 모두 후보로 만들었다.

- 한국 사건번호: `2024가합12345`
- 한국 법원명: `서울중앙지방법원`, `대법원`
- 한국 법령/조문: `제15조`, `제15조 제2항`, `민법 제750조`
- 영문 판례 인용: `123 F.3d 456`
- 영문 법령/조문: `Section 230`, `17 U.S.C. § 101`
- legal label context: `Case No.: ...`, `Court: ...`, `Docket No.: ...`

또한 `src/ui/engine.ts`는 confidence가 `1.0`인 non-PII 후보를 기본 선택한다. 따라서 legal regex 후보는 대부분 자동 체크되어 실제 redaction 대상이 된다.

## 핵심 판단

계약서 기본 모드에서 계약 조문 번호와 공개 법령 인용은 redact 대상이 아니다.

이 기능은 "법률 문서에 나오는 모든 legal-looking string을 보호"하는 도구가 아니라, 공유 전에 숨겨야 하는 식별자와 민감 문자열을 줄이는 도구다. 따라서 legal category는 "법적 문맥"이라는 넓은 의미가 아니라 "문서를 특정 사건/도켓에 직접 연결할 수 있는 case/docket identifier" 중심으로 좁혀야 한다.

## 정책

### 1. statute-ref 규칙이 잡는 계약 구조/법령형 참조를 후보에서 제거한다

현재 실제 제거 대상은 `legal.ko-statute-ref`와 `legal.en-statute-ref`가 매칭하는 형태다.

- `Section 10.1`
- `Section 10.1(a)`
- `제1조`
- `제1조 제2항`
- `제3호`
- `제15조의2`
- `법률 제1234호`
- `민법 제750조`
- `17 U.S.C. § 101`
- `42 U.S.C. § 1983`

이들은 기본 후보, 자동 선택 후보, low-confidence 후보 어디에도 올리지 않는다. 예외적으로 사용자가 특정 조문 번호나 법령 인용 자체를 숨기고 싶다면 catch-all 수동 추가로 처리한다.

### 2. 다른 계약서 구조 표시는 regression guard로 고정한다

다음 형태는 현재 코드에서도 자동 후보로 확인되지 않았다.

- `Article 5`
- `Article V`
- `Clause 3.2`
- `Schedule A`
- `Exhibit B`
- `별표 1`
- `부속서 2`

이번 작업은 이들을 "제거"하지 않는다. 대신 `detectAll` regression test로 앞으로도 후보가 되지 않도록 고정한다.

### 3. 공개 법령 인용은 후보로 만들지 않는다

다음 형태도 기본 redact 후보가 아니다.

- `민법 제750조`
- `개인정보 보호법 제17조`
- `상법 제398조`
- `17 U.S.C. § 101`
- `42 U.S.C. § 1983`

법령 인용은 보통 공개 정보이고, 계약 검토에서 중요한 근거다. 이를 숨기면 분석 품질이 떨어진다. 사용자가 특정 법령 인용을 숨겨야 하는 특수 상황은 수동 추가로 대응한다.

### 4. 사건/도켓 식별자는 유지하되 기본 선택하지 않는다

다음은 공개 문서나 소송 문서에서는 실제 사건을 특정할 수 있으므로 후보로 보여줄 가치는 있다.

- `2024가합12345`
- `Case No.: 24-CV-1234`
- `Docket No.: 1:24-cv-00001`

다만 계약서에서 기본 자동 redaction 대상은 아니다. 남은 legal 후보는 "검토용 opt-in"으로 표시하고 기본 체크를 끈다.

### 5. 법원명과 판례 인용도 후보로 만들지 않는다

`대법원`, `서울중앙지방법원`, `123 F.3d 456` 같은 값은 보통 민감정보가 아니라 관할/장소 맥락 또는 공개 법적 근거다. 단독으로 사건을 직접 특정하기도 어렵고, redact하면 문서 이해와 법리 검토 품질이 떨어질 수 있다.

따라서 이번 구현에서는 `legal.ko-court-name`, `legal.en-case-citation`도 제거하고, `legal.legal-context`에서 `Court:` / `법원:` 라벨 캡처도 제외한다.

## 구현 범위

### In Scope

- `ko-statute-ref`, `en-statute-ref` 규칙 제거 또는 registry 제외
- `ko-court-name`, `en-case-citation` 규칙 제거
- `legal-context`에서 `Court:` / `법원:` 라벨 캡처 제거
- `Section N`, `제N조`, 법령 인용이 `detectAll` 기본 결과에 나오지 않도록 테스트 추가
- 법원명과 판례 인용이 `detectAll` 기본 결과에 나오지 않도록 테스트 추가
- `Article`, `Clause`, `Schedule`, `Exhibit`, `별표`, `부속서` 계열은 현행 non-candidate 상태를 regression test로 고정
- 남은 `legal.*` 후보의 기본 선택 해제
- UI/문서 표현을 "Legal checked by default"에서 "Case/docket identifiers, unchecked by default"로 변경
- README, USAGE, RULES_GUIDE, docs-stale guard의 정책 설명 갱신

### Out Of Scope

- 새 "litigation mode" 토글 구현
- OCR 또는 이미지 내부 법령/사건번호 처리
- 법령명 전체 데이터베이스 기반 파싱
- 사건번호 민감도 자동 판단
- user-specific policy preset UI

## 상세 구현 계획

### 1. Detection 규칙 정리

파일:

- `src/detection/rules/legal.ts`
- `src/detection/rules/legal.test.ts`
- `src/detection/_framework/registry.ts`는 가능하면 그대로 둔다.

변경:

- `LEGAL` 배열에서 `legal.ko-statute-ref` 제거
- `LEGAL` 배열에서 `legal.en-statute-ref` 제거
- `LEGAL` 배열에서 `legal.ko-court-name` 제거
- `LEGAL` 배열에서 `legal.en-case-citation` 제거
- `legal.legal-context`에서 `Court:` / `법원:` lookbehind 제거
- 파일 상단 주석을 "case/docket identifiers" 중심으로 갱신
- "Six regex rules"를 2개 규칙 기준으로 수정
- `src/detection/rules/legal.test.ts`의 `expect(LEGAL).toHaveLength(6)`를 `2`로 갱신
- `src/detection/rules/legal.test.ts`의 `describe("legal.ko-statute-ref", ...)` 블록 삭제
- `src/detection/rules/legal.test.ts`의 `describe("legal.en-statute-ref", ...)` 블록 삭제
- `src/detection/rules/legal.test.ts`의 `describe("legal.ko-court-name", ...)` 블록 삭제
- `src/detection/rules/legal.test.ts`의 `describe("legal.en-case-citation", ...)` 블록 삭제

기대 결과:

- `runRegexPhase("민법 제750조", "standard", LEGAL, { language: "ko" })`는 빈 배열
- `runRegexPhase("Section 10.1", "standard", LEGAL, { language: "en" })`는 빈 배열
- `runRegexPhase("서울중앙지방법원", "standard", LEGAL, { language: "ko" })`는 빈 배열
- `runRegexPhase("123 F.3d 456", "standard", LEGAL, { language: "en" })`는 빈 배열
- `runRegexPhase("Court:Seoul Central District Court", "standard", LEGAL, { language: "en" })`는 빈 배열
- `runRegexPhase("2024가합12345", "standard", LEGAL, { language: "ko" })`는 사건번호 후보 유지

### 2. Contract/article negative 테스트 추가

테스트 케이스:

- 제거 대상 regression:
  - `제1조`
  - `제1조 제2항`
  - `제3호`
  - `민법 제750조`
  - `개인정보 보호법 제17조`
  - `Section 10.1`
  - `17 U.S.C. § 101`
  - `42 U.S.C. § 1983`
- 현행 non-candidate guard:
  - `Article V`
  - `Clause 3.2`
  - `Schedule A`
  - `Exhibit B`
  - `별표 1`
  - `부속서 2`
  - `서울중앙지방법원`
  - `대법원`
  - `123 F.3d 456`
  - `Court:Seoul Central District Court`
  - `법원:서울중앙지방법원`

테스트 위치:

- `src/detection/rules/legal.test.ts`: legal 규칙 단위 negative 테스트
- `src/detection/detect-all.test.ts`: 전체 detection 결과에 위 항목이 후보로 나오지 않는 end-to-end 테스트

### 3. UI 기본 선택 정책 변경

파일:

- `src/ui/engine.ts`
- `src/ui/engine.test.ts`

현재 로직:

```ts
defaultSelected: candidate.confidence === 1.0
```

변경 방향:

```ts
defaultSelected:
  candidate.confidence === 1.0 && candidate.category !== "legal"
```

의미:

- financial, temporal, entities의 deterministic regex 후보는 기존처럼 기본 체크
- legal 후보는 deterministic이어도 검토용 opt-in
- heuristics는 기존처럼 unchecked

테스트:

- `legal.ko-case-number` 후보가 selection target에는 존재하지만 `defaultSelections()`에는 포함되지 않는다.
- 기존 financial/entities/PII 기본 선택 정책은 유지된다.
- defined terms unchecked 정책은 유지된다.
- 기존 `src/ui/engine.test.ts`의 "includes non-heuristic nonPii candidates (confidence === 1.0) across all categories" 테스트는 legal 후보가 빠지는 것을 명시하도록 갱신한다. 기존 `selections.size === 5` 단언은 `4`로 바꾸거나, legal 후보를 별도 `expect(...).toBe(false)` 단언으로 분리한다.

### 4. UI 카피와 섹션명 조정

파일 후보:

- `src/ui/CandidatesPanel.svelte`
- `src/ui/CategorySection.svelte`
- `src/ui/policy-file.ts`
- `src/selection-targets.ts`

권장:

- 내부 category key는 `legal` 유지
- 사용자 노출 라벨만 `Case / docket refs` 계열로 변경
- 설명 문구는 "case numbers and docket labels, unchecked by default" 계열로 수정

이유:

- policy JSON과 selection target 정렬 순서를 깨지 않는다.
- 마이그레이션 비용 없이 사용자에게 더 정확한 의미를 보여준다.

### 5. 문서 갱신

파일:

- `README.md`
- `README.ko.md`
- `USAGE.md`
- `USAGE.ko.md`
- `docs/RULES_GUIDE.md`
- `src/docs-stale.test.ts`
- 필요하면 `release-notes/`에 다음 릴리즈 노트 추가

변경 내용:

- "legal references checked by default" 문구 제거
- README의 "legal references" 후보 그룹 라벨을 "case/docket references" 계열로 변경
- 계약 조문, 법령 인용, 법원명, 판례 인용은 보존한다고 명시
- 사건번호/도켓번호는 후보로 보이지만 기본 미체크라고 설명
- catch-all 수동 추가로 예외 케이스를 처리할 수 있음을 안내
- `USAGE.ko.md`의 "8개 카테고리 규칙은 자동 동작 ... 법원, 법령" 문구에서 법령 자동 동작 설명 제거
- `docs/RULES_GUIDE.md` § 2.7의 legal boundary에서 statute references, court names, precedent citations를 제거하고, "case/docket identifiers only"로 재정의
- `docs/RULES_GUIDE.md` § 13.4의 statute-reference / court-name 행 삭제
- `docs/RULES_GUIDE.md` § 13.4의 기존 rule ID drift를 실제 ID(`legal.ko-case-number`)로 교정

주의:

- `docs-stale.test.ts`에 "legal candidates checked by default" 및 "법령 기본 체크/자동 동작" 회귀를 막는 새 guard를 추가한다.

## Acceptance Criteria

기능 기준:

- 계약서 조문 번호가 자동 후보로 나타나지 않는다.
- 실제 법령 인용이 자동 후보로 나타나지 않는다.
- 법원명과 판례 인용이 자동 후보로 나타나지 않는다.
- `Court:` / `법원:` 라벨 값이 자동 후보로 나타나지 않는다.
- 사건번호/도켓번호 후보는 필요한 경우 검토 목록에 남길 수 있다.
- 남은 legal 후보는 기본 선택되지 않는다.
- PII, financial, temporal, entities의 기존 기본 선택 정책은 의도치 않게 바뀌지 않는다.
- 사용자는 catch-all로 법령/조문 문자열을 수동 추가할 수 있다.

테스트 기준:

- `src/detection/rules/legal.test.ts` 통과
- `src/detection/detect-all.test.ts` 통과
- `src/detection/rules/legal.test.ts`에서 `LEGAL` 길이는 2개이고 statute-ref / court-name / case-citation describe 블록은 삭제되어 있다.
- `src/detection/detect-all.test.ts`에 statute/article negative E2E 테스트가 있다.
- `src/ui/engine.test.ts` 통과
- `src/ui/engine.test.ts`에서 legal 후보가 selection target에는 남지만 `defaultSelections()`에서 제외됨을 단언한다.
- `src/docs-stale.test.ts`가 public docs에서 legal 자동 체크/법령 자동 동작 문구의 재발을 막는다.
- 가능하면 전체 `bun test` 통과
- 가능하면 `bunx eslint .`, `bunx tsc --noEmit`, `bunx svelte-check`, `bun run build` 통과

수동 검증 기준:

- 샘플 계약서 본문:
  - `제1조 목적`
  - `제2조 제1항`
  - `Section 10.1`
  - `민법 제750조`
  - `17 U.S.C. § 101`
  - `서울중앙지방법원`
  - `123 F.3d 456`
  - `Court:Seoul Central District Court`
- 위 항목들이 하이라이트/후보 목록에 뜨지 않아야 한다.
- `2024가합12345` 또는 `Docket No.: 1:24-cv-00001`은 case/docket 섹션에 뜨되 체크되어 있지 않아야 한다.

## Migration Notes

기존 policy JSON에 `category: "legal"` 항목이 있어도 계속 import 가능해야 한다. 이번 변경은 category key 제거가 아니라 detection/default policy 변경이므로 backward compatibility를 유지할 수 있다.

이미 사용자가 수동으로 저장한 legal policy entry는 그대로 수동 항목으로 취급한다. 자동 detection에서 법령 조문이 빠져도, policy import를 통해 명시된 항목은 계속 적용된다.

## Risks

### 사건번호 false negative

법령/조문 제거 과정에서 사건번호 regex까지 약해지면 소송 문서에서 필요한 후보를 놓칠 수 있다. `2024가합12345`, `Case No.: ...`, `Docket No.: ...` positive 테스트를 유지한다.

### 문서와 UI 불일치

현재 public docs는 legal category를 checked by default로 설명한다. 코드만 바꾸면 사용자 기대와 UI 동작이 어긋난다. docs-stale guard에 새 정책 문구를 추가한다.

### 사용자가 법령 인용을 숨기고 싶은 예외

드물게 법령 인용 자체가 전략 정보를 드러낼 수 있다. 자동 후보에서는 제외하되 catch-all 수동 추가 경로를 명확히 안내한다.

## Suggested Commit Breakdown

1. `legal.ko-statute-ref` / `legal.en-statute-ref` / `legal.ko-court-name` / `legal.en-case-citation` 제거 및 detection 테스트 갱신
2. `Article` / `Clause` / `Schedule` / `Exhibit` / `별표` / `부속서` / 법원명 / 판례 인용 현행 non-candidate guard 추가
3. legal 기본 선택 해제 및 UI 엔진 테스트 갱신
4. UI label/copy 갱신
5. README/USAGE/RULES_GUIDE/docs-stale/release notes 갱신

## Open Questions

- 다음 버전에서 내부 category key `legal`을 `caseDocket` 같은 이름으로 바꿀 것인가? 지금은 policy JSON 호환을 위해 내부 key는 유지하고 사용자 노출 라벨만 바꾼다.
