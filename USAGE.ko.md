# 사용 가이드

실제 파일 하나를 가지고 `document-redactor` 를 돌려보는 단계별 안내입니다. 도구를 아직 다운로드하지 않았다면 [README 의 빠른 시작](README.ko.md)부터 확인하세요.

영문판은 [USAGE.md](USAGE.md) 를 참고하세요.

---

## 목차

1. [파일 받기](#1-파일-받기)
2. [다운로드 무결성 확인](#2-다운로드-무결성-확인)
3. [도구 열기](#3-도구-열기)
4. [첫 번째 redaction](#4-첫-번째-redaction)
5. [후보 패널 — 8개 카테고리 섹션 + 기타](#5-후보-패널--8개-카테고리-섹션--기타)
6. [인라인 문서 프리뷰](#6-인라인-문서-프리뷰)
7. [정의된 대리어 (D9 정책)](#7-정의된-대리어-d9-정책)
8. [Apply 후 네 가지 결과](#8-apply-후-네-가지-결과)
9. [계약서가 아닌 문서](#9-계약서가-아닌-문서)
10. [키보드 단축키](#10-키보드-단축키)
11. [출력 파일 검증](#11-출력-파일-검증)
12. [트러블슈팅](#12-트러블슈팅)
13. [이 도구가 하지 않는 것들](#13-이-도구가-하지-않는-것들)
14. [프라이버시 선언](#14-프라이버시-선언)

---

## 1. 파일 받기

[최신 릴리즈](https://github.com/kipeum86/document-redactor/releases/latest) 페이지에서 **두 파일을 모두** 받으세요:

- **`document-redactor.html`** — 도구 본체 (~281 KB / 288,133 bytes, HTML 한 파일)
- **`document-redactor.html.sha256`** — 무결성 sidecar (89 bytes)

카카오톡, 이메일, USB 등으로 다른 사람에게 받은 경우에도 괜찮습니다. 다음 섹션의 검증이 바로 그런 경우를 위해 있습니다. 보낸 사람을 신뢰하는 대신 **해시를 검증** 하면 됩니다.

---

## 2. 다운로드 무결성 확인

sidecar 파일은 지금 받은 HTML 이 게시된 원본과 **바이트 단위로 동일한지** 확인하게 해줍니다. 공식 릴리즈와 내 디스크 사이에서 다음 같은 일이 벌어질 수 있기 때문입니다:

- 변조된 미러
- 사내 프록시 / DLP 가 다운로드를 자동 재작성
- 악의적인 네트워크 중간자
- 선의의 발신자가 실수로 재압축 / 재내보냄

위 중 하나라도 일어나면 SHA-256 해시가 달라집니다. 검증은 한 줄이면 됩니다.

### macOS / Linux

```bash
cd /두-파일이-있는-폴더
sha256sum -c document-redactor.html.sha256
```

기대 출력:

```
document-redactor.html: OK
```

오래된 macOS 에는 `sha256sum` 이 없으니 다음을 쓰세요:

```bash
shasum -a 256 -c document-redactor.html.sha256
```

### Windows (PowerShell)

```powershell
cd C:\두-파일이-있는-폴더
$actual = (Get-FileHash -Algorithm SHA256 document-redactor.html).Hash.ToLower()
$expected = (Get-Content document-redactor.html.sha256).Split(' ')[0].ToLower()
if ($actual -eq $expected) { "OK" } else { "MISMATCH — 실행하지 마세요" }
```

### `OK` 가 안 뜨면

**멈추세요.** HTML 을 열지 마세요. 다음 중 하나를 하세요:

1. GitHub Releases 페이지에서 (링크로 받지 말고 주소창에 직접 입력해서) 두 파일을 다시 받습니다.
2. 다른 네트워크에서 검증합니다 (사내 프록시가 원인일 수 있음).
3. GitHub Issue 로 불일치를 제보합니다.

---

## 3. 도구 열기

`document-redactor.html` 을 더블클릭하세요. 기본 브라우저가 `file://` URL 로 엽니다. 설치 절차, 권한 프롬프트, 네트워크 호출 전혀 없음.

탭 제목은 `document-redactor · offline DOCX redactor` 입니다. 우측 상단 뱃지는 `0 network requests` — 말 그대로입니다.

### 동작하는 브라우저

- Chrome, Chromium, Brave, Edge (v120+) — 확인됨
- Firefox (v120+) — 확인됨
- Safari (16+) — 확인됨
- ES2022, Web Crypto SubtleCrypto, `file://` origin 을 지원하는 모든 최신 브라우저

### 안 되는 브라우저

- Internet Explorer (버전 무관)
- 아주 옛날 Safari (<16)
- 모바일 브라우저 — 기술적으로는 로드되지만 드롭존 UX 가 폰에선 불편합니다

---

## 4. 첫 번째 redaction

### 4.1 — 파일 드롭

드롭존에 `.docx` 를 끌어다 놓거나 "choose a file" 링크로 선택하세요. 도구는 **50 MB** 이하의 입력 파일만 받고, 압축 해제된 ZIP 내부 개별 항목은 **20 MB**까지만 읽습니다. 파일은 메모리에서 풀고 모든 텍스트 영역 (본문, 머리글, 바닥글, 각주, 미주, 메모) 을 훑습니다. 보통 계약서는 1 초 안에 파싱됩니다.

> **파일은 머신 밖으로 나가지 않습니다.** 브라우저 탭 안의 JavaScript 변수에만 있습니다. 서버가 없으므로 업로드할 곳이 없고, 디스크 캐시도 없고, 텔레메트리도 없습니다.

### 4.2 — 인라인 문서 프리뷰 읽기 (가운데)

가운데 패널은 **계약서 본문을 텍스트로 렌더링** 해서, 감지된 각 후보를 노란 `<mark>` 하이라이트로 감싸 보여줍니다. 이 화면에서:

- 문서를 스크롤하면서 후보를 맥락 안에서 볼 수 있음
- 하이라이트를 **클릭** 해서 선택 토글 (체크 ↔ 언체크)
- Tab / Enter / Space 키로 이동·토글

각 scope 는 자기 헤더 아래 그룹화됩니다: **본문**, **각주**, **미주**, **머리글 1**, **바닥글 1**, 등. 빈 문단도 시각적으로 공백 줄로 보입니다.

### 4.3 — 후보 섹션 검토 (오른쪽)

오른쪽 패널은 후보를 **8 개 카테고리 섹션** + 기타로 그룹화합니다. 각 섹션은 개수와 각 행의 출처를 표시. 행을 클릭하면 선택이 토글되고, 가운데 문서의 하이라이트도 즉시 반응.

각 행에는 **↓ 이동** 버튼. 클릭하면 해당 후보가 처음 나오는 위치로 문서가 스크롤되고 pulse 애니메이션이 잠깐 뜹니다.

**Export policy** 로 현재 수동 추가 항목과 선택/해제 기본값을 로컬 JSON 파일로 저장할 수 있습니다. **Import policy** 는 그 JSON을 다른 문서에 적용합니다. 정책 파일에는 문자열, 카테고리, 기본 선택값만 들어가며 DOCX 내용은 들어가지 않습니다.

섹션 전체 설명은 [§ 5](#5-후보-패널--8개-카테고리-섹션--기타) 참조.

### 4.4 — Apply

선택이 만족스러우면 오른쪽 아래 **Apply and verify** 클릭 (또는 페이지 어디서든 **⌘/Ctrl + Enter**).

도구가 전체 파이프라인을 실행합니다:

1. **track changes 평탄화** — 삭제된 hidden 텍스트 제거
2. **comments 제거** — `word/comments.xml` 및 marker 삭제
3. **필드 평탄화** — 하이퍼링크 unwrap, `<w:fldChar>` / `<w:instrText>` 제거
4. **redact** — 선택된 모든 문자열을 `[REDACTED]` 로 교체 (모든 scope)
5. **metadata scrub** — `docProps/*` 의 author, lastModifiedBy, company, title 비움
6. **relationship target 정리** — `.rels` 파일의 외부 `http://` / `https://` target을 제거하고, 선택된 민감 문자열이 relationship target에 있으면 함께 치환
7. **round-trip 검증** — 출력을 다시 파싱해서 생존 민감 문자열이 0 인지 확인 (`word/_rels/*.rels` relationship target 포함)
8. **word-count sanity** — 전후 단어 수 비교; 30% 이상 감소 시 경고

Apply 후 네 가지 결과 중 하나가 표시됩니다. [§ 8](#8-apply-후-네-가지-결과) 참조.

### 4.5 — 다운로드

**downloadReady** (녹색), **downloadRepaired** (녹색, 1회 내부 복구 후), 또는 **downloadWarning** (앰버) 에서 **Download** 클릭 → `{원본}.redacted.docx` 저장.

**downloadRisk** (빨강) 에서는 surviving item을 검토하거나 acknowledgement 체크 후 **Download anyway** 를 누를 수 있습니다. [§ 8.4](#84-downloadrisk-빨강--경고-후-override) 참조.

---

## 5. 후보 패널 — 8개 카테고리 섹션 + 기타

파싱 후 오른쪽 패널은 다음 순서로 섹션을 렌더합니다:

### 1. 당사자

구조 파서와 전파 레이어에서 추출한 엔티티 리터럴 — `ABC Corporation`, `XYZ Holdings`, `김철수` 및 자동 변형체. **기본 체크.**

### 2. 정의된 대리어

정의 조항에서 발견된 역할어 / 약칭: `the Buyer`, `the Discloser`, `매수인`, `갑`. **기본 언체크** — [§ 7](#7-정의된-대리어-d9-정책) 참조.

### 3. 식별번호 (PII)

결정론적 정규식 스윕이 감지한 ID:

- 주민등록번호 (`XXXXXX-Xxxxxxx`)
- 사업자등록번호 (`XXX-XX-XXXXX`)
- EIN (미국, `XX-XXXXXXX`)
- 국내 휴대전화 (010/011/016-019)
- **국내 유선전화** (02-, 031-069, 070, 080, 060, 050)
- 국제 번호 (`+` prefix)
- 이메일 (RFC 기반)
- 국내 계좌번호
- 신용카드 (Luhn 검증)

**전부 기본 체크.**

### 4. 금액

통화 값: `50,000원`, `1억`, `USD 100,000`, `₩50,000,000`, `€50,000`, 백분율 (`15%`), 한국식 분수 (`3분의 1`), 라벨 기반 금액 (`금액: 5,000,000`). confidence=1.0 정규식 매치 **전부 기본 체크**.

### 5. 날짜 / 기간

한국식 날짜 (`2024년 3월 15일`, `2024.3.15`), ISO 8601 (`2024-03-15`, 옵션 시간), 영문 날짜 (`March 15, 2024`), 한국식 기간 (`3년간`, `6개월`), 영문 기간 (`3 years`), 라벨 기반 날짜 (`계약일: 2024.3.15`). **기본 체크.**

### 6. 법인 / 인물

한국 법인 (`주식회사 ABC`, `(주)ABC`, `㈜ABC`), 기타 법적 형태 (`유한회사`, `사단법인`), 임원 직함+이름 (`대표이사 김철수`), 호칭 (`김철수 님`), 영문 법인 (`ABC Corp.`, `XYZ Inc.`), 국제 법적 형태 (`ABC GmbH`, `XYZ S.A.`, `DEF Pty Ltd`), 영문 직함 (`Mr. Smith`, `Dr. Jones`, `CEO John Smith`), **라벨 기반 주소** (`주소: 서울특별시 강남구 논현로 568` / `Address: 12345 Main St`), **라벨 기반 전화** (`전화: 02-3446-3727` / `Phone Number: +82-2-3446-3727`). **기본 체크.**

### 7. 법원 / 사건

한국 사건번호 (`2024가합12345`), 법원명 (`서울중앙지방법원`, `대법원`), 법령 (`민법 제750조`, `제15조 제2항`), 영문 판례 (`123 F.3d 456`), 법령 (`17 U.S.C. § 101`), 법적 문맥 스캐너. **기본 체크.**

### 8. 추측 (낮은 신뢰도)

confidence < 1.0 인 휴리스틱 — 대문자 클러스터 (`Acme Holdings`), 따옴표 안 용어 (`"Project Alpha"`), 반복되는 고유명사, 이메일 도메인 추론 법인명. 문서 프리뷰에서는 앰버 배경 + 점선 외곽선. **기본 언체크** — 사용자 검토 후 opt-in.

### 기타 (그 외)

맨 아래의 catch-all 섹션. 입력 필드가 **항상 열려** 있습니다. 규칙이 놓친 모든 것 — 특이 형식의 해외 주소, 내부 프로젝트 코드명, 비표준 전화번호, 자유 형식의 민감 문자열 — 을 여기에 직접 입력.

입력한 항목은:

- 체크박스가 이미 체크된 상태로 등장
- 문서 프리뷰에 인라인 하이라이트로 추가됨
- 재분석 (같은 파일 재드롭) 에도 유지
- 언체크 가능 (수동 리스트에는 유지, 이번 redaction 에선 제외)
- **×** 버튼으로 완전 삭제

---

## 6. 인라인 문서 프리뷰

가운데 패널이 **주요 검토 surface** 입니다. 계약서 본문을 plain text (볼드·이탤릭·표 없이) 로 렌더하고, 후보 하이라이트를 본문 안에 입힙니다.

### 시각적 상태

- **체크된 하이라이트**: 진한 노란 배경 + 앰버 ring — Apply 시 redact 됨
- **언체크된 하이라이트**: 점선 외곽선, 투명 배경 — 감지됐지만 제외됨
- **pulse 애니메이션**: 행의 **↓ 이동** 버튼 클릭 시 대상 주변에 잠깐 표시

### 인터랙션

- **하이라이트 클릭** → 선택 토글 (오른쪽 행 토글과 동일)
- **Tab** → 다음 하이라이트로 포커스
- **Enter / Space** (포커스된 하이라이트에서) → 토글
- **스크롤** 다중 scope 문서에서 자연스럽게 (본문 → 각주 → 머리글 → 바닥글)

### Scope 헤더

- **본문** — `word/document.xml`
- **각주** — `word/footnotes.xml`
- **미주** — `word/endnotes.xml`
- **머리글 1, 2, ...** — `word/header1.xml`, ...
- **바닥글 1, 2, ...** — `word/footer1.xml`, ...

빈 scope 도 `(비어 있음)` 으로 표기됩니다 — 도구가 확인했다는 사실이 보여야 하니까.

### 프리뷰가 렌더하지 **않는** 것

- 볼드·이탤릭·밑줄 (plain text)
- 표를 표로 (셀이 문단으로 flatten)
- 이미지
- 번호 매김·불릿
- 제목 레벨 구분

이건 Word 클론이 아니라 **검토용** surface 입니다.

---

## 7. 정의된 대리어 (D9 정책)

전형적 양당사자 계약서의 정의 조항:

> 본 계약은 ABC Corporation ("공개자") 과 XYZ Holdings ("수령자") 간에 체결된다.

이후 계약서는 "공개자" / "수령자" 로 부릅니다. 전체 이름 + 정의된 대리어 **둘 다** redact 하면:

> `[REDACTED] 은 [REDACTED] 이 [REDACTED] 직원들에게 정보를 공유할 수 있음에 동의한다…`

쓸모없죠. redact 의 목적은 다운스트림 독자가 **계약 구조를 이해할 수 있게** 하는 것. 역할 라벨을 유지하면 가독성:

> `공개자는 수령자가 수령자 직원들에게 정보를 공유할 수 있음에 동의한다…`

그래서 **정의된 대리어** 는 **기본 언체크** 입니다.

### 켜는 경우

1. **세 당사자 이상이 같은 역할 공유** — 소거법으로 누가 누군지 추론될 수 있으면 체크
2. **출력 독자가 적대적** — 외부 데이터와 교차 참조 가능성
3. **공공 기록 공유** — 당사자 이름은 감추지만 구조는 유지

### 끄는 경우 (기본)

사내 동료, 다른 변호사, 법률 AI 등 일반적 전달. 구조가 분명해 독자가 분석에 집중.

---

## 8. Apply 후 네 가지 결과

### 8.1 `downloadReady` (녹색) — verified clean

- `verify.isClean === true`
- `warningReasons.length === 0`
- `wordCount.sane === true`

배너에 출력 SHA-256 (앞 4 + 뒤 4) + **Download** 버튼이 표시됩니다.

### 8.2 `downloadRepaired` (녹색) — automatic repair 성공

- pass 1 은 dirty 였음
- 앱이 원본 bytes 기준으로 1회 재시도함
- 최종 verify 는 clean
- residual warning 없음

즉, 깨끗한 출력이지만 내부 복구를 한 번 거친 경우입니다.

### 8.3 `downloadWarning` (앰버) — clean 이지만 spot check 권장

- `verify.isClean === true`
- 하나 이상의 warning reason 이 남아 있음

대표 warning:

- word-count sanity threshold 초과
- preflight 가 field / hyperlink relationship surface 를 건드림
- repair 가 non-body 또는 formatting-sensitive surface 를 건드림

**surviving leak 는 없지만** 출력물을 한 번 더 보는 게 좋습니다. 선택지는:

1. **검토로 돌아가기** — 선택 유지, 과도한 항목 정리 후 다시 Apply
2. **Download anyway** — 경고를 이해하고 그대로 다운로드
3. **Start over** — 전부 버리고 처음부터

### 8.4 `downloadRisk` (빨강) — 경고 후 override

- `verify.isClean === false`
- 앱은 이미
  - preflight catch-up
  - pass 1 redaction
  - 원본 bytes 기준 1회 automatic retry
  를 모두 수행한 뒤입니다

배너에는 surviving string 별로 다음이 표시됩니다:

- 텍스트
- 개수
- 소스 경로 (`word/document.xml`, `word/_rels/document.xml.rels`, 등)
- surface (`text`, `field`, `hyperlink target`)
- 행마다 **Review this item** → 프리뷰에서 해당 문자열에 포커스

앱은 이 출력을 clean 이라고 부르지 않습니다. 선택지는:

1. **Review first survivor** — 첫 survivor 로 복귀
2. **Back to review** — 특정 항목 포커스 없이 복귀
3. **I understand that sensitive text may still remain in this output file.** 체크
4. **Download anyway** — acknowledgement 후 활성화

흔한 원인:

- `word/_rels/document.xml.rels` 의 하이퍼링크 Target
- 특이 scope 또는 transformed literal form
- zero-width / hyphen variant / split run 같은 정규화 edge case

---

## 9. 계약서가 아닌 문서

엔진은 텍스트 기반이라 어떤 DOCX 에든 동작합니다:

- **8개 카테고리 규칙은 자동 동작** (주소, 전화, 이메일, ID, 금액, 날짜, 법원, 법령)
- **정의된 대리어 섹션은 대부분 비어 있을 것** (D9 파서는 계약 패턴 전용)
- **기타 섹션 적극 활용** (판결문의 사건번호 / 판사명, 특허 명세서의 발명자 / 출원인, 메모의 코드명 등)

판결문 발췌 예:

1. 파일 드롭
2. 자동 감지 후보가 섹션 채움
3. **기타 (그 외)** 에 추가:
   ```
   김철수
   박영희
   ABC 법인
   서울중앙지방법원 2024가합12345
   ```
4. Apply → 검증 → 다운로드

---

## 10. 키보드 단축키

| 키 | 동작 |
|---|---|
| **⌘/Ctrl + Enter** | Apply and verify (어디서든) |
| **Tab** | 후보 간 포커스 이동 |
| **Enter** / **Space** | 포커스된 행·하이라이트 토글 |
| **Escape** | "+ 추가" 입력창 취소 (collapsible 섹션에서) |

v1.1 의 전체 단축키입니다.

---

## 11. 출력 파일 검증

```bash
shasum -a 256 NDA_2026_final.redacted.docx
```

앞 4 + 뒤 4 hex 가 배너와 일치해야 합니다.

### 해시 결정론

**동일 입력 + 동일 선택 → 동일 SHA-256.** 모든 ZIP 엔트리 타임스탬프를 Unix epoch 0 으로 고정해서 가능.

---

## 12. 트러블슈팅

### "드롭한 파일이 계속 spinner 만 뜬다"

1. DevTools (F12) → Console 확인
2. 파일이 실제로 `.docx` 인지 (`.doc`, `.pages` 거부)
3. 큰 파일 (>10 MB) 은 몇 초 걸림
4. 그래도 아니면: 콘솔 에러 + 최소 재현 `.docx` 로 버그 제보

### "예상한 이름이 하이라이트되지 않음"

1. 라벨 붙어 있는지 확인 (`상호: ...`, `법인명: ...`)
2. 없으면 **기타 (그 외)** 에 수동 추가

### "다 체크했는데도 survivor 가 남음"

이건 `downloadRisk` 상태입니다. preflight 와 1회 automatic retry 후에도 survivor 가 남았다는 뜻입니다. 흔한 원인:
- **rels 파일의 하이퍼링크 Target**
- **zero-width / hyphen variant**
- **특이 scope 또는 transformed literal form**

이 시점에서는 survivor 를 다시 검토해서 개선할 수도 있고, residual risk 를 인정하고 그대로 다운로드할 수도 있습니다.

### "도구가 느리다"

50 KB 계약서 기준 총 2초 이내. >10초면 DevTools Performance 로 profile → fixture 크기 포함 버그 제보.

### "큰 파일을 드롭했더니 거부됨"

입력 파일은 **50 MB**를 넘으면 거부되고, 압축 해제된 ZIP 내부 개별 항목도 **20 MB**를 넘으면 거부됩니다. 일반 법률 문서는 <5 MB입니다. 이미지가 많은 DOCX 는 OCR 불가로 어차피 효용이 낮습니다.

### "모바일 레이아웃이 답답하다"

데스크탑 전용 (≥1024 px). 모바일 다듬기는 v1.x 에 없음.

### "redaction 취소"

출력엔 `[REDACTED]` 박혀 있음. 재실행:
1. **검토로 돌아가기** (또는 **Start over**)
2. 선택 조정 → 다시 Apply

### "다운로드한 게 옛날 버전 같아"

- 브라우저 캐시: **Cmd+Shift+R** / 시크릿 창
- Downloads 의 옛날 사본: 지우고 Releases 에서 재다운로드
- GitHub 릴리즈 자체가 업데이트 안 됐을 수 있음 (최신 태그 날짜 확인)

---

## 13. 이 도구가 하지 않는 것들

- **OCR 없음** (이미지 텍스트 못 봄)
- **손글씨 서명 이미지 없음**
- **SmartArt / WordArt 없음**
- **임베디드 Excel / PowerPoint 없음** (Word 표는 지원)
- **`<w:sdt>` content control 전체 처리 없음**
- **매크로 / VBA / 암호화·비밀번호 보호 문서 없음** (`.docm` 과 비밀번호 보호 파일은 거부합니다. 일반 `.docx` 로 변환해 주세요.)
- **Undo / Redo 없음**
- **세션 간 상태 없음**
- **배치 처리 없음**
- **팀 공유 없음** (정책 파일 import/export는 로컬 JSON 파일 워크플로만 지원합니다.)
- **제한적인 rels Target 재작성** (`http://` / `https://` 외부 target은 제거하고, 선택된 민감 문자열이 relationship target에 있으면 치환합니다. 모든 비HTTP/opaque target을 일반적으로 정리하는 도구는 아닙니다.)
- **이미지 EXIF 스크럽 없음**
- **revision ID 스크럽 없음**
- **Hidden text (`<w:vanish>`) 드러내기 없음**

---

## 14. 프라이버시 선언

**우리가 아무것도 수집하지 않는 이유는 "우리" 가 없기 때문입니다.**

HTML 파일 하나입니다. 사용자의 브라우저 탭·컴퓨터·디스크에서 실행됩니다. 백엔드 없음. 데이터베이스·analytics·에러 리포팅·텔레메트리 전혀 없음. 도구가 외부와 통신할 수 없는 이유:

1. 소스에 네트워크 API 호출 0개
2. 빌드 단계에서 번들에 그런 토큰 스캔
3. 런타임 CSP (`default-src 'none'; connect-src 'none'`) 가 모두 차단
4. 실행 전 직접 검증 가능

redact 할 때: 드롭한 바이트, 토글한 선택, 입력한 수동 항목, 다운로드 출력 — 전부 브라우저 탭 메모리와 디스크에만 존재. 탭 닫으면 전부 사라짐.

이 선언에 배치되는 행동이 보이면 최우선 버그입니다. 즉시 이슈 제보 부탁드립니다.

---

_v1.1 전체 가이드입니다. 아키텍처는 [README](README.ko.md), 감지 규칙 내부는 [docs/RULES_GUIDE.md](docs/RULES_GUIDE.md), 버그·기능 요청은 [GitHub Issues](https://github.com/kipeum86/document-redactor/issues)._
