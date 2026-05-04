# document-redactor 업데이트 기획서

작성일: 2026-04-25
최종 수정: 2026-04-26
언어: 한국어
대상 버전: v1.1.x 이후
목적: 최근 엔지니어링/디자인 감사와 후속 피드백을 실제 업데이트 로드맵으로 전환한다.

## 1. 목표

이 업데이트의 목표는 기능을 많이 추가하는 것이 아니라, redaction 결과의 신뢰성과 리뷰 워크플로의 정확도를 높이는 것이다. 특히 사용자가 "선택했고, 미리보기에서도 보였고, 검증도 통과했다"고 믿었는데 실제 DOCX에는 민감 문자열이 남는 종류의 실패를 우선 제거한다.

핵심 목표:

1. 미리보기, 선택 상태, 실제 redaction, verification 사이의 불일치를 제거한다.
2. 검증 실패 또는 residual risk 상태의 출력물을 성공 출력물과 명확히 분리한다.
3. 외부 리뷰/에이전트 작업에 들어가는 문서 컨텍스트를 줄이고 정확도를 높인다.
4. 반복 사용자가 실제로 시간을 줄일 수 있는 정책/선택 세트 저장 경로를 제공한다.
5. 규칙 엔진 증가에 대비해 CI와 문서 검증을 강화한다.

이번 개정에서 반영한 피드백:

- residual risk 다운로드 정책은 이미 acknowledgement gate, disabled button, warning copy, survivor list, 테스트가 있으므로 P0에서 P1로 내린다. 남은 문제는 기본 보안 모델 붕괴가 아니라 파일명, 문구, 정책 함수 일관성이다.
- `CLAUDE.md`의 skill routing 강제와 `RULES_GUIDE.md`의 타입 drift는 외부 에이전트 구현 품질을 바로 떨어뜨릴 수 있으므로 P2에서 P1로 올린다.
- 수동 후보의 정규화 preview/redaction 불일치는 실제 clean false positive를 만들 수 있으므로 P0로 유지한다. 자동 탐지 경로가 아니라 manual source kind 회귀 테스트가 핵심이다.
- PR 순서는 충돌을 줄이도록 안전성 패치, 문서/상태명 동기화, 정책 함수, 후보 모델, 에이전트 문서 순으로 재배치한다.

## 2. 비목표

이번 업데이트에서 하지 않을 일:

- PDF redaction 지원
- ODT/RTF redaction 지원
- OCR, 이미지 내부 텍스트 redaction
- 원격 모델 또는 ML 기반 탐지 도입
- 백엔드, 계정, 동기화 서버 도입
- cloud policy sync 또는 조직 단위 정책 공유
- Word 레이아웃을 픽셀 단위로 복원하는 preview renderer 구현
- 전체 디자인 시스템 재작성

## 3. 우선순위 체계

| 우선순위 | 의미 | 릴리즈 기준 |
|---|---|---|
| P0 | 검증 신뢰성 또는 보안 모델에 직접 영향 | 다음 패치 릴리즈 전에 처리 |
| P1 | 사용자 판단 품질, 정책 일관성, 외부 구현 품질, 유지보수성에 큰 영향 | 다음 마이너 릴리즈에 포함 |
| P2 | 에이전트 작업 효율, 문서 위생, 장기 유지보수 개선 | 독립 PR로 순차 반영 |

## 4. P0 업데이트

### P0-1. 수동 후보의 정규화 미리보기와 실제 redaction 불일치 수정

문제:

사용자가 수동으로 입력한 문자열은 preview에서 `normalizeForMatching` fallback으로 하이라이트될 수 있다. 하지만 실제 redaction과 verification은 `redactionLiterals`와 `verificationLiterals`에 들어간 원문 literal만 대상으로 한다. 예를 들어 사용자가 `010-1234-5678`을 입력했고 문서에는 `010–1234–5678`처럼 en dash가 있으면 preview는 맞은 것처럼 보일 수 있지만, 실제 redaction은 ASCII hyphen 문자열만 찾는다.

현재 자동 탐지 경로는 원문에서 발견된 literal을 기반으로 `literalVariants`를 구성하므로 상대적으로 안전하다. 위험한 경로는 사용자가 직접 입력한 manual source kind다. 기존 `selection-targets.test.ts`의 "preserves exact original literals" 성격 테스트는 PII/자동 탐지 path를 다루며, manual normalized source kind를 보장하지 않는다.

실패 흐름:

```text
manual input: "010-1234-5678"
        |
        v
manual target 생성: literalVariants = ["010-1234-5678"]
        |
        v
preview: normalizeForMatching("010-1234-5678")
     == normalizeForMatching("010–1234–5678")
        |
        v
UI 하이라이트 표시
        |
        v
applyRedaction / verify: literal-only search
        |
        v
"010–1234–5678" 미삭제
        |
        v
dirty DOCX가 clean처럼 보일 수 있음
```

왜 중요한가:

이 문제는 "사용자가 선택했다고 믿은 문자열이 clean 상태로 통과할 수 있는" 가장 위험한 출력 품질 결함이다. 미리보기와 검증의 의미가 달라지면 제품의 핵심 신뢰 모델이 흔들린다.

수정안:

1. `SelectionTarget`에 새 병렬 필드인 `matchedOriginalLiterals`를 만들지 않는다. 이미 존재하는 `literalVariants`를 단일 literal carrier로 유지한다.
2. manual target builder가 document corpus 또는 scoped rendered text를 받을 수 있게 한다.
3. manual 입력값을 정규화해 corpus에서 후보 위치를 찾고, 매칭된 원문 slice를 기존 `literalVariants`에 추가한다.
4. `redactionLiterals`와 `verificationLiterals`는 확장된 `literalVariants`만 사용하게 유지한다.
5. 정규화 매칭은 성공했지만 실제 원문 slice를 안정적으로 복원하지 못하면 UI에서 "exact match 없음" 또는 동등한 risk 상태를 표시한다.
6. exact match가 없는 수동 후보는 기본 선택을 막거나, 적용 전 명확한 경고를 띄운다.
7. manual source kind 전용 회귀 테스트를 추가한다. 자동 탐지/PII literal 보존 테스트로 이 결함을 대체하지 않는다.

구현 후보 파일:

- `src/selection-targets.ts`
- `src/ui/state.svelte.ts`
- `src/ui/engine.ts`
- `src/ui/preview-segments.ts`
- `src/ui/AddCandidateInput.svelte`

수용 기준:

- 문서에 en dash, fullwidth digit, smart quote가 포함된 경우 수동 입력이 실제 원문 literal로 redaction된다.
- preview에서 하이라이트된 수동 후보는 반드시 `literalVariants`, redaction literal, verification literal에도 포함된다.
- preview에만 보이고 redaction에는 포함되지 않는 상태가 없어야 한다.
- exact match가 없는 수동 후보는 사용자가 확인할 수 있는 UI 상태를 가진다.

필수 테스트:

- manual `010-1234-5678` 입력, 문서 원문 `010–1234–5678` redaction 확인
- manual fullwidth digit 입력/원문 혼합 케이스
- manual smart quote/straight quote 혼합 케이스
- exact match 실패 시 selection/apply 정책 테스트

### P0-2. residual risk 다운로드 정책은 P1-0으로 재분류

문제:

초기 기획은 `downloadRisk`에서 acknowledgement 후 다운로드 가능한 상태를 P0로 보았다. 후속 확인 결과 현재 구현은 이미 명시적 acknowledgement gate, disabled button, warning copy, survivor list, 관련 테스트를 갖고 있다.

결정:

이 항목은 P0가 아니라 P1 정책 정리로 다룬다. 남은 위험은 "기본 UI가 무검증 파일을 조용히 배포한다"가 아니라, override 후 파일명과 문구가 검증 완료 출력물과 충분히 분리되는지다. 구체 작업은 `P1-0`과 `P1-5`에서 처리한다.

### P0-3. 문서와 코드의 현재 동작 불일치 제거

문제:

문서에는 "size cap 없음", "rels rewriting 없음" 같은 오래된 설명이 남아 있다. 코드는 `MAX_INPUT_BYTES = 50 MB`, `MAX_ENTRY_BYTES = 20 MB`, `.rels` URL stripping/repair를 이미 구현한다. `README.md`와 `README.ko.md`는 제한사항을 충분히 말하지 않는 silent drift에 가깝고, `USAGE.md`와 `USAGE.ko.md`는 현재 구현과 반대되는 설명을 포함해 실제 모순이 크다. review brief에는 실제 state union에 없는 `verifyFail` 같은 stale state name도 남아 있다.

왜 중요한가:

문서가 코드와 다르면 사용자뿐 아니라 외부 리뷰 모델도 잘못된 전제를 바탕으로 평가한다. 특히 stale state name은 에이전트가 존재하지 않는 상태를 구현하거나 테스트하게 만드는 직접적인 품질 저하다.

수정안:

1. `USAGE.md`, `USAGE.ko.md`의 제한사항을 현재 코드 기준으로 바로잡는다.
2. `README.md`, `README.ko.md`에는 size cap과 `.rels` 동작을 짧게라도 명시한다.
3. size cap 값은 `src/docx/limits.ts`와 같은 값을 문서에 반영한다.
4. `.rels` 동작은 "external URL stripping 및 selected literal repair 수행"으로 설명한다.
5. docs/review 문서의 stale state name을 실제 `AppPhase` kind와 맞춘다. `verifyFail`은 `downloadRisk` 등 실제 상태명으로 교체한다.
6. 문서 stale check를 추가한다. 최소한 README/USAGE/review docs에 `50 MB`, `20 MB`, `external URL`, 실제 state name 관련 핵심 token이 있는지 검사한다.

구현 후보 파일:

- `README.md`
- `README.ko.md`
- `USAGE.md`
- `USAGE.ko.md`
- `docs/review/*.md`
- `src/docx/limits.ts`
- 신규 테스트 또는 문서 검증 스크립트

수용 기준:

- 사용자 문서에 현재 파일 크기 제한이 명시된다.
- `.rels` 제한사항이 더 이상 구현과 반대로 쓰이지 않는다.
- docs/review에 실제 state union에 없는 `verifyFail` 같은 상태명이 남지 않는다.
- release 전 문서 stale check가 실패할 수 있다.

## 5. P1 업데이트

### P1-0. residual risk 다운로드 정책 정리와 `UNVERIFIED` 파일명

문제:

`downloadRisk`에서 acknowledgement 후 출력물을 받을 수 있는 정책 자체는 이미 명시적 gate로 보호된다. 하지만 override 출력물의 파일명, CTA copy, report badge가 검증 완료 파일과 충분히 분리되지 않으면 사용자가 나중에 파일을 혼동할 수 있다.

왜 중요한가:

제품은 "검증된 redacted DOCX"를 핵심 가치로 내세운다. residual survivor가 있는 파일을 동일한 성공 어휘와 비슷한 파일명으로 제공하면 운영 환경에서 잘못 배포될 가능성이 있다.

수정안:

1. 현재 acknowledgement gate는 유지한다. 완전 다운로드 제거는 별도 제품 정책 결정이 있을 때만 한다.
2. `downloadRisk` override 파일명은 `{stem}.UNVERIFIED.redacted.{ext}`로 강제한다.
3. override 화면의 copy는 "verified clean", "ready", "safe" 같은 성공 표현을 쓰지 않는다.
4. SHA/hash badge가 있다면 success style이 아니라 warning/risk style로 분리한다.
5. 다운로드 가능 여부는 `P1-5`의 정책 helper에서 단일하게 판정한다.

구현 후보 파일:

- `src/ui/DocumentPreview.svelte`
- `src/ui/state.svelte.ts`
- `src/finalize/guided-recovery.ts`
- `src/ui/ship-gate.test.ts`

수용 기준:

- `downloadRisk` 상태에서는 acknowledgement 전 다운로드가 불가능하다.
- acknowledgement 후 다운로드가 허용되더라도 파일명에 `UNVERIFIED`가 들어간다.
- residual survivor가 있는 report는 success copy를 렌더링하지 않는다.
- 기존 acknowledgement gate 테스트와 파일명 테스트가 모두 통과한다.

### P1-1. 후보 provenance 병합 표시

문제:

후보 패널은 `seen` set으로 동일 텍스트를 전역 dedupe한다. 동일 문자열이 여러 규칙 또는 여러 섹션에서 잡혀도 첫 번째 섹션에만 보인다.

왜 중요한가:

사용자가 "왜 이 문자열이 잡혔는지" 판단할 증거가 줄어든다. 법률 문서에서는 같은 문자열이 금액, 날짜, 사건번호, entity context에 동시에 걸리는 경우가 있어 provenance가 검토 품질에 직접 영향을 준다.

수정안:

1. `Analysis.selectionTargets`를 후보 패널 렌더링의 단일 source of truth로 사용한다.
2. `buildSelectionTargets`가 동일 display text를 병합할 때 `ruleIds`, `sourceKinds`, `reviewSections`, `scopes`를 보존한다.
3. row meta는 `primary section + additional rule badges + scope count` 형태로 바꾼다.
4. manual로 추가된 auto target은 manual badge를 붙이되 원래 provenance를 유지한다.
5. panel component는 후보를 다시 dedupe하지 않고 `selectionTargets`를 표시만 한다.

구현 후보 파일:

- `src/selection-targets.ts`
- `src/ui/CandidatesPanel.svelte`
- `src/ui/CategorySection.svelte`
- `src/ui/CandidateRow.svelte`

수용 기준:

- 동일 텍스트가 여러 규칙에서 잡히면 row 하나에 모든 provenance가 보인다.
- 후보 총합과 선택 총합이 같은 데이터 모델에서 계산된다.
- manual badge가 auto provenance를 덮어쓰지 않는다.

### P1-2. candidate count 계산 통일

문제:

메인 화면의 candidates found 계산이 entity group과 PII만 포함하고 non-PII 후보를 누락한다.

왜 중요한가:

사용자는 실제 검토해야 할 후보보다 적은 숫자를 보고 검토량을 오해할 수 있다.

수정안:

1. 기본 count source는 `analysis.selectionTargets.length`로 통일한다.
2. `selectedCount`, `totalCount`, header count가 같은 기준을 쓰게 만든다.
3. count helper가 필요하면 새 모듈을 만들기보다 먼저 `src/selection-targets.ts`에 작은 helper로 둔다.
4. UI 쪽에서 후보를 재계산하지 않는다.

구현 후보 파일:

- `src/selection-targets.ts`
- `src/ui/DocumentPreview.svelte`
- `src/ui/CandidatesPanel.svelte`
- `src/ui/engine.ts`

수용 기준:

- 메인 header count와 우측 panel total이 일치한다.
- heuristics와 non-PII 후보가 count에 포함된다.
- count 테스트가 entity, PII, heuristic, manual 추가 후보를 모두 포함한다.

### P1-3. `DocumentAnalysisSession` 도입으로 반복 load/extract 제거

문제:

분석, preview, preflight, finalize, repair 과정에서 같은 DOCX bytes를 여러 번 load하고 scope text를 다시 만든다.

왜 중요한가:

큰 파일에서 성능 비용이 커지고, 동일 문서를 서로 다른 방식으로 본다는 hidden coupling이 생긴다. 단, session cache가 mutation path에 섞이면 stale zip이나 stale XML을 쓰는 더 큰 안전성 문제가 생긴다.

수정안:

1. 분석 단계에서 `DocumentAnalysisSession`을 만든다.
2. session에는 read-only 데이터만 저장한다.
   - `bytes`
   - `fileStats`
   - `scopedText`
   - `renderedDoc`
   - `verifySurfaces`
   - `analysis`
3. mutation용 zip은 기존처럼 fresh load를 유지한다.
4. preview는 `phase.analysisSession.renderedDoc`을 우선 사용하고 없을 때만 lazy load한다.
5. preflight는 이미 계산된 `verifySurfaces`를 재사용할 수 있게 overload를 제공한다.

mutation safety 표:

| Path | Type | Session 사용 |
|---|---|---|
| analyzeZip | read-only | 작성 |
| renderDocumentBody | read-only | 사용 |
| preflight-expansion | read-only | 사용 |
| applyRedaction | mutation | 사용 금지, fresh load |
| guidedRecovery | mutation | 사용 금지, fresh load |

구현 후보 파일:

- 신규 `src/ui/analysis-session.ts`
- `src/ui/engine.ts`
- `src/ui/DocumentPreview.svelte`
- `src/finalize/preflight-expansion.ts`

수용 기준:

- postParse 진입 후 preview 렌더링이 별도 `loadDocxZip`을 호출하지 않는다.
- preflight가 선택된 target 검사에 기존 verify surfaces를 재사용한다.
- mutation 결과는 fresh zip 기반이라는 기존 안전 속성을 유지한다.
- 코드 레벨에서 mutation path가 session zip/XML을 받을 수 없게 타입 또는 함수 경계로 막는다.

### P1-4. seed propagation의 제품 내 역할 결정

문제:

seed 기반 propagation은 여전히 코드와 테스트에 존재하지만 public UI는 seed editor를 중심에 두지 않는다.

왜 중요한가:

structural definitions, entity regex, manual additions와 책임이 겹쳐 유지보수 비용이 늘어난다.

결정안:

Option A - 다시 핵심 기능화:

- "Known parties" 입력 영역을 UI에 복원한다.
- seed를 넣으면 alias propagation 결과가 별도 section에 표시된다.
- manual additions와 seed propagation의 차이를 명확히 한다.

Option B - shipping path에서 격리:

- public UI에서 seed state를 제거한다.
- propagation은 experimental/internal module로 남긴다.
- 테스트도 integration path가 아니라 module-level로 축소한다.
- `appState.setSeeds()` 같은 hidden public API, engine 호출, integration test 의존을 제거하거나 내부 전용으로 격리한다.

권장:

v1.2에서는 Option B를 권장한다. 현재 제품은 자동 탐지 + manual catch-all 흐름으로 이미 설명되고 있으며, seed editor 부활은 UI 복잡도를 다시 높인다. 다만 `src/propagation/` 삭제 또는 격리는 테스트 영향이 넓을 수 있으므로 별도 PR로 분리한다.

수용 기준:

- README/USAGE의 workflow와 코드 path가 일치한다.
- propagation이 남는다면 "왜 남는지"가 문서화된다.
- 제거한다면 `appState.setSeeds()` 같은 hidden public API가 사라진다.

### P1-5. ship gate 정책 함수 정리

문제:

`isShippable()`은 `verify.isClean && wordCount.sane`을 요구하지만 UI는 `downloadWarning` 또는 acknowledgement를 거친 `downloadRisk`도 다운로드 가능하게 한다.

왜 중요한가:

동일한 report에 대해 "ship 가능"의 의미가 모듈마다 다르면 나중에 정책 변경 시 버그가 생긴다. P1-0의 `UNVERIFIED` 파일명 정책도 같은 helper에 묶어야 한다.

수정안:

1. `isShippable()`을 실제 의미에 맞게 `isStrictlyCleanReport()`로 rename한다.
2. UI 다운로드 정책은 `canDownloadReport(report, acknowledgement)` 같은 별도 함수로 분리한다.
3. 출력 파일명 정책은 `getDownloadFilename(report, originalName, acknowledgement)` 또는 동등 helper로 모은다.
4. `downloadWarning`은 "verified clean but warning"이라는 정책으로 명확히 둔다.
5. `downloadRisk`는 acknowledgement 전 차단, acknowledgement 후 `UNVERIFIED` 파일명 강제를 적용한다.

구현 후보 파일:

- `src/finalize/finalize.ts`
- `src/finalize/guided-recovery.ts`
- `src/ui/state.svelte.ts`
- `src/ui/ship-gate.test.ts`

수용 기준:

- strict clean, warning, risk override가 각각 이름이 다른 helper에서 명확히 표현된다.
- UI copy, disabled state, 파일명이 같은 helper 결과와 일치한다.
- 기존 P0로 분류했던 residual risk 정책은 이 PR에서 P1로 처리된다.

### P1-6. selection id 충돌 감지

문제:

selection id가 32-bit FNV hash 기반이다. 충돌 가능성은 낮지만, 보안 도구에서 서로 다른 문자열이 같은 selection id를 공유하는 것은 허용하기 어렵다.

왜 중요한가:

충돌 시 사용자가 A를 선택했는데 B가 같은 toggle state를 공유하거나 반대로 누락될 수 있다.

충돌 규모 감각:

| 서로 다른 target 수 | FNV-1a 32-bit 충돌 근사 |
|---:|---:|
| 100 | 약 1.16e-6 |
| 500 | 약 2.9e-5 |
| 1,000 | 약 1.16e-4 |
| 10,000 | 약 0.0116 |

수정안:

1. SHA-256/Web Crypto 비동기 경로는 이번 변경에 넣지 않는다.
2. base64url full text 기반 id처럼 큰 포맷 변경도 우선 피한다.
3. `buildSelectionTargets` 단계에서 같은 id가 다른 `displayText`에 매핑되면 throw하거나 deterministic suffix를 붙인다.
4. id에 사람이 읽을 수 있는 짧은 prefix를 붙이는 것은 선택 사항이다.
5. 충돌 fixture 또는 mocked hash 테스트를 추가한다.

권장:

현재 동기 id 경로는 유지하되, registry build 단계에 "same hash + different displayText" assertion을 넣는다. 실제 충돌이 발견되면 id 생성 규칙을 바꾸기보다 해당 build에서 즉시 실패시키는 것이 가장 작고 안전한 수정이다.

### P1-7. `CLAUDE.md` skill routing 조건화

문제:

`CLAUDE.md`는 존재하지 않을 수 있는 skill 이름을 "ALWAYS invoke"로 강제한다.

왜 중요한가:

다른 에이전트 환경에서는 첫 행동이 실패하거나 불필요한 라우팅 시도에 시간을 쓴다. 이 문서는 사람이 아니라 다른 agent가 곧바로 소비하므로 stale routing 지시가 구현 품질을 직접 낮춘다.

수정안:

1. "해당 skill이 설치된 경우"로 조건화한다.
2. skill이 없을 때의 fallback 명령 경로를 명시한다.
3. local-only/security invariants는 유지한다.
4. `CLAUDE.md`가 git에 포함될 문서인지, 로컬 편의 문서인지 위치와 책임을 분명히 한다.

수용 기준:

- skill이 없는 Codex/Claude 환경에서도 문서 지시가 모순되지 않는다.
- 에이전트가 missing skill을 이유로 첫 단계를 실패하지 않는다.

### P1-8. `RULES_GUIDE.md` HeuristicContext API drift 수정

문제:

`RULES_GUIDE.md`에는 오래된 `context.definedTerms` 예시가 남아 있지만 실제 타입은 `structuralDefinitions`다.

왜 중요한가:

규칙 작성 문서는 곧 코드 생성 prompt 역할을 한다. 타입이 틀린 예시는 새 규칙 추가 시 컴파일 실패 또는 잘못된 adapter 구현을 유도한다.

수정안:

1. 문서의 TS code block을 실제 타입 기준으로 갱신한다.
2. `definedTerms` 표현은 `structuralDefinitions` 또는 현재 타입의 정확한 필드명으로 교체한다.
3. 가능하면 `docs/examples/*.ts`로 추출하고 문서에서는 include/link한다.
4. `bunx tsc --noEmit` 또는 프로젝트 typecheck 대상에 docs examples를 포함한다.

수용 기준:

- 문서 예시가 현재 TypeScript 타입과 불일치하지 않는다.
- 새 heuristic 작성자가 문서 예시를 붙여 넣었을 때 타입 오류가 나지 않는다.

## 6. P2 업데이트

### P2-1. 외부 리뷰 컨텍스트 compact 문서 생성

문제:

외부 리뷰용 문서가 크고 중복된다. 긴 README, USAGE, project brief, rule-engine brief, RULES_GUIDE를 모두 넣으면 실제 코드 감사 토큰이 줄어든다.

수정안:

1. `docs/review/agent-context.compact.md`를 만든다.
2. 150-200줄 이내로 제한한다.
3. 포함할 내용:
   - 제품 목적
   - trust boundaries
   - 핵심 pipeline
   - high-risk files
   - known limitations
   - "do not summarize, find defects" 지시
4. 긴 문서는 링크만 둔다.

수용 기준:

- 외부 리뷰 프롬프트의 첫 번째 컨텍스트는 compact 문서만 사용한다.
- 상세 문서는 필요 시 추가로 열람하게 한다.

### P2-2. 소스 파일 상단 장문 주석 축소

문제:

핵심 파일의 상단 주석이 같은 아키텍처 설명을 반복한다. 에이전트가 파일을 읽을 때 코드보다 내러티브가 먼저 컨텍스트를 차지한다.

수정안:

1. 파일 헤더는 10줄 내외로 줄인다.
2. 남길 항목:
   - public contract
   - invariants
   - gotchas
3. 긴 배경 설명은 `docs/architecture/*.md`로 이동한다.
4. 특히 다음 파일부터 시작한다.
   - `src/detection/_framework/runner.ts`
   - `src/docx/redact.ts`
   - `src/docx/verify.ts`
   - `src/finalize/finalize.ts`

수용 기준:

- 파일을 열었을 때 첫 화면에 실제 코드가 보인다.
- 장문 설명은 문서 링크로 대체된다.

### P2-3. 리뷰 프롬프트 출력 스키마 강화

문제:

현재 외부 리뷰 프롬프트는 "concrete findings"를 요구하지만 출력 schema를 강제하지 않는다.

수정안:

`docs/review/codex-chat-prompts.md` 또는 각 review brief의 suggested prompt를 다음 형식으로 바꾼다.

```text
각 finding은 반드시 다음 필드를 포함한다:
- severity: P0 | P1 | P2
- dimension: correctness | safety | architecture | performance | prompt | docs
- evidence: file:line
- problem
- impact
- proposed_fix
- tests_to_add

칭찬, 요약, 일반론은 금지한다.
근거 파일/라인이 없는 finding은 별도 "assumption"으로 분리한다.
```

수용 기준:

- 외부 모델 리뷰 결과가 바로 GitHub issue/PR checklist로 전환 가능하다.

### P2-4. 하드코딩된 모델명 제거

문제:

review brief에 특정 모델명 `ChatGPT 5.4 Pro`가 하드코딩되어 있다.

수정안:

1. 모델명 대신 "frontier reasoning model"이라고 쓴다.
2. 필요한 능력을 명시한다.
   - long-context code audit
   - security-sensitive reasoning
   - Korean/English legal text awareness
   - TypeScript/Svelte familiarity

수용 기준:

- 시간이 지나도 프롬프트가 특정 모델명 때문에 낡지 않는다.

## 7. 신규 기능 후보

### 기능 1. 로컬 정책/선택 세트 import/export

문제:

manual additions는 같은 브라우저 세션 안에서만 유지된다. 반복적으로 같은 거래 상대방, 고객명, 프로젝트명을 redaction하는 법률 사용자는 매번 수동 입력해야 한다.

기능 설명:

- 사용자가 현재 manual additions와 선택 정책을 JSON으로 export한다.
- 이후 다른 문서에서 JSON을 import하면 같은 후보가 자동 추가되고 기본 선택된다.
- 네트워크, 계정, 서버는 없다.

데이터 구조 초안:

```json
{
  "schemaVersion": 1,
  "createdAt": "2026-04-25T00:00:00.000Z",
  "name": "Acme NDA redaction policy",
  "entries": [
    { "text": "Acme Corporation", "category": "entities", "defaultSelected": true },
    { "text": "Project Falcon", "category": "other", "defaultSelected": true }
  ]
}
```

구현 후보 파일:

- 신규 `src/ui/policy-file.ts`
- `src/ui/state.svelte.ts`
- `src/ui/CandidatesPanel.svelte`
- `src/ui/Topbar.svelte` 또는 `Sidebar.svelte`

수용 기준:

- export한 JSON을 다시 import하면 같은 manual candidates가 복원된다.
- invalid schema는 친절한 오류로 거부한다.
- JSON import/export는 브라우저 로컬 파일 API만 사용한다.

### 기능 2. DOCX 구조 preflight validation

문제:

ZIP 크기 제한은 있지만 DOCX 구조 검증은 별도 단계로 분리되어 있지 않다. 손상 파일 또는 임의 ZIP은 늦은 단계에서 애매한 오류를 낼 수 있다.

기능 설명:

`loadDocxZip` 이후 `validateDocxZip(zip)`을 실행해 최소 DOCX 조건을 확인한다.

검증 항목:

- `[Content_Types].xml` 존재
- `word/document.xml` 존재
- `_rels/.rels` 또는 `word/_rels/document.xml.rels` 존재 여부 확인
- `.docm` 또는 macro-related part 발견 시 명확히 거부 또는 warning
- encrypted/protected package로 보이는 경우 명확한 오류

수용 기준:

- 일반 ZIP 파일을 drop하면 "valid DOCX가 아님" 오류가 나온다.
- corrupt DOCX와 unsupported DOCX를 구분한다.
- 기존 정상 fixture는 통과한다.

## 8. CI와 품질 게이트 업데이트

### 게이트 1. ReDoS guard CI 복원

현재 문제:

ReDoS guard가 CI에서 skip된다. 로컬 실행 관습만으로는 regex regression을 막기 어렵다.

수정안:

1. subprocess 기반 benchmark를 in-process benchmark로 바꾼다.
2. 또는 rule 파일 변경 시에만 실행되는 GitHub Actions job을 만든다.
3. 최소 smoke budget과 nightly deep budget을 분리한다.

권장 구조:

| 게이트 | 실행 시점 | 범위 |
|---|---|---|
| ReDoS smoke | 모든 PR | 모든 regex에 짧은 adversarial input |
| ReDoS deep | rule 변경 PR 또는 nightly | 긴 adversarial input, parser/heuristic 포함 |

### 게이트 2. 문서 상태명 검증

현재 문제:

review brief에는 `verifyFail`이 남아 있지만 실제 state union은 `downloadRisk`다.

수정안:

1. `src/ui/state.svelte.ts`의 `AppPhase` kind 목록을 추출하는 스크립트를 작성한다.
2. docs/review와 README/USAGE의 상태명 목록이 실제 union과 일치하는지 검사한다.
3. `verifyFail` 같은 stale state가 발견되면 CI 실패.
4. 이 게이트는 P0-3 문서 동기화 PR에 포함한다.

### 게이트 3. 문서 제한사항 검증

검증할 항목:

- `MAX_INPUT_BYTES` 값이 사용자 문서에 반영되어 있는지
- `MAX_ENTRY_BYTES` 값이 개발자 문서에 반영되어 있는지
- `.rels` rewrite/strip 동작 설명이 현재 코드와 모순되지 않는지
- `Standard only` 설명이 UI와 일치하는지

## 9. 제안 PR 순서

### PR 1. P0-1 manual normalized target safety

범위:

- 수동 후보 exact/original literal 연결
- 기존 `literalVariants`에 manual 원문 slice 추가
- manual source kind 회귀 테스트 추가

완료 조건:

- `bun run test`
- `bun run typecheck`
- manual normalized 케이스 fixture 테스트 green

### PR 2. P0-3 + Gate 2 docs/state name sync

범위:

- README/README.ko silent drift 보완
- USAGE/USAGE.ko의 size cap, `.rels` 모순 수정
- docs/review의 `verifyFail` 등 stale state name 제거
- 문서 상태명 검증 스크립트 또는 테스트 추가

완료 조건:

- stale state name 제거
- size cap, rels behavior 최신화
- 문서 검증 gate green

### PR 3. P1-5 + P1-0 ship gate와 download policy

범위:

- `isShippable()` rename
- download policy helper 정리
- `downloadRisk` acknowledgement 유지
- override 파일명 `UNVERIFIED` 강제

완료 조건:

- strict clean, warning, risk override 정책 테스트 green
- residual risk 출력물에 success copy 없음
- acknowledgement 후 다운로드 파일명에 `UNVERIFIED` 포함

### PR 4. P1-1 + P1-2 provenance와 count

의존성:

- PR 1 이후 진행한다. manual target literal 보강과 같은 데이터 모델을 건드리므로 충돌을 줄인다.

범위:

- `selectionTargets`를 후보 패널과 count의 단일 source of truth로 사용
- provenance 병합 표시
- `analysis.selectionTargets.length` 기반 count 통일

완료 조건:

- main count와 panel total 일치
- 중복 후보 provenance 병합 표시
- entity, PII, heuristic, manual 후보 count 테스트 green

### PR 5. P1-6 selection id collision detection

의존성:

- PR 1과 PR 4 이후 진행한다.

범위:

- `buildSelectionTargets` registry collision assertion
- same hash/different displayText 테스트
- 필요 시 readable prefix 추가

완료 조건:

- selection id 충돌 시 조용히 toggle state를 공유하지 않는다.
- SHA-256/Web Crypto 같은 큰 비동기 변경 없이 동기 경로를 유지한다.

### PR 6. P1-7 + P1-8 doc invariant alignment

범위:

- `CLAUDE.md` skill routing 조건화
- missing skill fallback 명시
- `RULES_GUIDE.md`의 `definedTerms`/`structuralDefinitions` drift 수정
- 가능하면 docs example typecheck 추가

완료 조건:

- skill이 없는 환경에서도 지시가 모순되지 않는다.
- RULES_GUIDE 예시가 실제 타입과 맞는다.

### PR 7. P2-1 + P2-2 + P2-3 + P2-4 agent/docs efficiency

범위:

- compact review context 문서
- 소스 파일 상단 장문 주석 축소
- review prompt schema 강화
- 하드코딩된 모델명 제거

완료 조건:

- 외부 리뷰용 compact 문서 200줄 이하
- suggested prompt가 schema 기반
- 특정 모델명 없이 필요한 능력 기준으로 작성됨

### PR 8. P1-4 seed propagation 격리

범위:

- public UI path에서 seed state 제거 또는 internal module로 격리
- `appState.setSeeds()` 등 hidden public API 정리
- 관련 integration test 축소 또는 module-level 이전

완료 조건:

- README/USAGE workflow와 코드 path가 일치한다.
- propagation이 남는다면 internal/experimental 책임이 명확하다.

### PR 9. P1-3 `DocumentAnalysisSession`

범위:

- read-only analysis session 도입
- preview/preflight 재사용
- mutation path fresh load invariant 유지

완료 조건:

- read-only path만 session을 사용한다.
- apply/finalize/guided recovery는 session zip/XML을 받지 않는다.
- 큰 파일 분석/preview 반복 load가 줄어든다.

### PR 10. 기능 1 policy import/export

범위:

- 로컬 JSON export/import
- schema validation
- manual candidates와 selection 복원

완료 조건:

- invalid policy error state
- import 후 manual candidates와 selections 복원
- 네트워크 또는 계정 의존 없음

### PR 11. 기능 2 + Gate 1 DOCX validation과 ReDoS CI

범위:

- DOCX 구조 preflight validation
- non-DOCX ZIP 오류 개선
- ReDoS smoke CI 복원

완료 조건:

- corrupt DOCX와 unsupported DOCX 오류 구분
- 정상 fixture 통과
- ReDoS smoke가 CI에서 실행

## 10. 릴리즈 컷 제안

### v1.1.2 patch

포함:

- PR 1: P0-1 manual normalized target safety
- PR 2: P0-3 docs/state name sync
- 선택 사항: 구현 리스크가 낮으면 PR 3 중 `UNVERIFIED` 파일명 최소 변경만 포함

이유:

검증 신뢰성과 사용자/리뷰어 오해 가능성을 바로 줄인다. residual risk 다운로드 정책은 더 이상 P0로 보지 않으므로 patch release의 필수 범위에서 제외한다.

### v1.2.0 minor

포함:

- PR 3: ship gate와 download policy
- PR 4: provenance와 count
- PR 5: selection id collision detection
- PR 6: doc invariant alignment
- 가능하면 PR 8: seed propagation 격리

이유:

사용자 리뷰 품질, 정책 일관성, 에이전트 구현 품질을 개선한다.

### v1.3.0 minor

포함:

- PR 9: `DocumentAnalysisSession`
- PR 10: policy import/export
- PR 11: DOCX validation과 ReDoS CI
- v1.2에서 밀린 PR 8

이유:

반복 업무 효율, 큰 파일 안정성, 규칙 엔진 안전성을 강화한다.

## 11. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| manual normalized literal 확장이 over-redaction을 만들 수 있음 | 원하지 않는 문자열까지 지워질 수 있음 | exact original slice만 추가하고, fuzzy 확장은 하지 않음 |
| residual risk override 파일을 사용자가 성공 파일로 오해할 수 있음 | 미검증 파일 배포 가능 | acknowledgement 유지, `UNVERIFIED` 파일명 강제, success copy 금지 |
| provenance 병합 UI가 복잡해짐 | 후보 row 가독성 저하 | 기본은 간결하게, details popover 또는 expandable meta 사용 |
| `DocumentAnalysisSession`이 mutation path에 섞임 | stale data 사용 또는 redaction 누락 | mutation zip은 계속 fresh load, cache는 analysis/preview/preflight only, 타입 경계로 차단 |
| compact agent context가 낡음 | 외부 리뷰가 오래된 전제로 진행 | compact 문서에 source links와 "last verified"를 넣고 docs stale check에 포함 |
| seed propagation 격리가 넓은 테스트 변경을 부름 | 작은 PR이 커져 merge risk 증가 | 독립 PR로 분리하고 public API 제거와 module-level test 유지부터 수행 |
| docs 검증 스크립트가 brittle할 수 있음 | 문구 변경마다 실패 | 정확한 문장 대신 핵심 token/value 기반 검사 |

## 12. 완료 정의

이번 업데이트는 다음 조건을 만족하면 완료로 본다.

1. preview에서 보이는 selected manual candidate는 실제 redaction/verification literal에 포함된다.
2. README/USAGE/review brief의 size cap, rels behavior, runtime state 설명이 코드와 일치한다.
3. residual survivor가 있는 출력물은 acknowledgement 전 다운로드할 수 없고, override가 남는 경우 파일명과 copy가 명확히 `UNVERIFIED`/risk로 분리된다.
4. 후보 count와 후보 패널 total이 `selectionTargets`를 같은 source of truth로 사용한다.
5. `CLAUDE.md`와 `RULES_GUIDE.md`가 존재하지 않는 skill 또는 오래된 TypeScript API를 전제로 하지 않는다.
6. 외부 리뷰 프롬프트가 schema 기반 finding을 요구한다.
7. ReDoS guard가 적어도 smoke 수준으로 CI에서 실행된다.
8. 반복 사용자용 policy import/export의 설계 또는 구현이 확정된다.
