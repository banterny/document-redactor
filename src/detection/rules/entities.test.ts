import { describe, expect, it } from "vitest";

import { runRegexPhase } from "../_framework/runner.js";
import type { RegexRule } from "../_framework/types.js";

import { ENTITIES } from "./entities.js";

import { expectWithinBudget } from "../../../tests/helpers/redos-budget.js";

function findRule(subcategory: string): RegexRule {
  const rule = ENTITIES.find((r) => r.subcategory === subcategory);
  if (!rule) throw new Error(`Rule not found: ${subcategory}`);
  return rule;
}

function matchOne(subcategory: string, text: string): string[] {
  const rule = findRule(subcategory);
  return runRegexPhase(text, "paranoid", [rule]).map((c) => c.text);
}

function expectFast(subcategory: string, input: string, budgetMs = 50): void {
  expectWithinBudget(() => void matchOne(subcategory, input), budgetMs);
}

describe("ENTITIES registry", () => {
  it("exports exactly 16 rules", () => {
    expect(ENTITIES).toHaveLength(16);
  });

  it("every rule id starts with 'entities.'", () => {
    for (const rule of ENTITIES) {
      expect(rule.id.startsWith("entities.")).toBe(true);
    }
  });

  it("every rule pattern has the 'g' flag", () => {
    for (const rule of ENTITIES) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  it("every rule has a non-empty description", () => {
    for (const rule of ENTITIES) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe("entities.ko-corp-prefix", () => {
  it.each([
    ["matches ASCII company names", "주식회사 LG", ["주식회사 LG"]],
    ["matches Korean company names", "주식회사 삼성전자", ["주식회사 삼성전자"]],
    ["matches digit-leading company names", "주식회사 3M", ["주식회사 3M"]],
    ["matches at the start of the string", "주식회사 ABC 계약", ["주식회사 ABC"]],
    ["matches at the end of the string", "상대방은 주식회사 ABC", ["주식회사 ABC"]],
    ["matches inside punctuation", "(주식회사 ABC)", ["주식회사 ABC"]],
    ["matches mixed alphanumeric names", "주식회사 A1Tech", ["주식회사 A1Tech"]],
    ["matches hyphenated ASCII names", "주식회사 A-Tech", ["주식회사 A-Tech"]],
    ["matches ampersand ASCII names", "주식회사 A&B", ["주식회사 A&B"]],
    ["rejects the bare legal form", "주식회사", []],
    ["rejects suffix-shaped forms", "홍길동 주식회사", []],
    ["rejects abbreviation forms", "㈜LG", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-corp-prefix", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long prefix-like input", () => {
    expectFast("ko-corp-prefix", "주식회사 " + "A".repeat(10000));
  });
});

describe("entities.ko-corp-suffix", () => {
  it.each([
    ["matches ASCII company names", "LG 주식회사", ["LG 주식회사"]],
    ["matches Korean company names", "삼성전자 주식회사", ["삼성전자 주식회사"]],
    ["matches digit-leading names", "3M 주식회사", ["3M 주식회사"]],
    ["matches at the start of the string", "ABC 주식회사 계약", ["ABC 주식회사"]],
    ["matches at the end of the string", "상대방은 ABC 주식회사", ["ABC 주식회사"]],
    ["matches inside punctuation", "(ABC 주식회사)", ["ABC 주식회사"]],
    ["matches hyphenated names", "A-Tech 주식회사", ["A-Tech 주식회사"]],
    ["matches ampersand names", "A&B 주식회사", ["A&B 주식회사"]],
    ["matches Korean alphanumeric names", "가나다123 주식회사", ["가나다123 주식회사"]],
    ["rejects prefix-shaped forms", "주식회사 LG", []],
    ["rejects the bare legal form", "주식회사", []],
    ["rejects trailing Hangul after the suffix", "ABC 주식회사법인", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-corp-suffix", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long suffix-like input", () => {
    expectFast("ko-corp-suffix", "A".repeat(10000) + " 주식회사");
  });

  // The pattern splits its start positions into a hard-boundary branch (run
  // unbounded, backreference \1 for ASCII and \2 for Hangul) and a mid-token
  // branch (run bounded to {0,255}, \3 for ASCII and \4 for Hangul). Those
  // backreference numbers are positional: inserting an alternative renumbers
  // every group after it, and a backreference to an unmatched group matches
  // the EMPTY STRING in JavaScript rather than failing -- so a renumbering
  // degrades silently into "single-character company names only" instead of
  // throwing. Each branch is therefore exercised here with a multi-character
  // token, which is what makes the degradation visible. See entities.ts.
  describe("start-position branches (backreference numbering is load-bearing)", () => {
    it.each([
      ["branch 1 — hard boundary, ASCII", "ACME 주식회사", ["ACME 주식회사"]],
      ["branch 2 — hard boundary, Hangul", "가나다 주식회사", ["가나다 주식회사"]],
      ["branch 3 — mid-token, ASCII after punctuation", "&abc 주식회사", ["abc 주식회사"]],
      ["branch 4 — mid-token, Hangul after punctuation", ".가나 주식회사", ["가나 주식회사"]],
    ])("%s", (_name, text, expected) => {
      expect(matchOne("ko-corp-suffix", text)).toEqual(expected);
    });

    it("keeps the hard-boundary branch unbounded", () => {
      const name = "A".repeat(10000);
      expect(matchOne("ko-corp-suffix", `${name} 주식회사`)).toEqual([`${name} 주식회사`]);
    });
  });

  // See the KNOWN, DELIBERATE LIMIT note in entities.ts. The mid-token branch
  // caps its run at 256 characters so the per-position cost is a constant
  // rather than growing with attacker-controlled input length. These pin the
  // exact boundary -- confirmed by binary search, not estimated -- so that a
  // future change to this pattern cannot silently move it inwards.
  describe("known limit: mid-token starts with a token longer than 256 chars", () => {
    it("still matches a 256-character token after a leading '&'", () => {
      const name = "a".repeat(256);
      expect(matchOne("ko-corp-suffix", `&${name} 주식회사`)).toEqual([`${name} 주식회사`]);
    });

    it("misses a 257-character token after a leading '&' (the accepted cliff)", () => {
      expect(matchOne("ko-corp-suffix", `&${"a".repeat(257)} 주식회사`)).toEqual([]);
    });

    it.each([".", "-", "가."])(
      "the same boundary holds after %s",
      (prefix) => {
        expect(matchOne("ko-corp-suffix", `${prefix}${"a".repeat(256)} 주식회사`)).toEqual([
          `${"a".repeat(256)} 주식회사`,
        ]);
        expect(matchOne("ko-corp-suffix", `${prefix}${"a".repeat(257)} 주식회사`)).toEqual([]);
      },
    );

    it("a hard boundary anywhere before the token removes the limit", () => {
      const name = "a".repeat(5000);
      // No leading punctuation, so branch 1 takes it and the run is unbounded.
      expect(matchOne("ko-corp-suffix", `${name} 주식회사`)).toEqual([`${name} 주식회사`]);
      // A space before the punctuation does NOT help: the token still starts
      // immediately after `&`, so branch 2 still owns it.
      expect(matchOne("ko-corp-suffix", ` &${name} 주식회사`)).toEqual([]);
    });
  });

  // These run under vitest, i.e. V8, where this rule measured 0.00ms both
  // before and after the fix even while it was catastrophic in Safari. They
  // guard against a V8-visible regression only, and would have passed happily
  // throughout the period this rule was quarantined. The JavaScriptCore
  // evidence -- roughly 700-1200ms down to 9-25ms on the two inputs that were
  // quarantined -- comes from `bun run test:redos:deep`, which is the gate
  // that carried them as exceptions. See RULES_GUIDE § 7.1: never judge a
  // pattern safe from one engine's numbers.
  it.each([
    ["a run of digits", "1".repeat(10000)],
    ["an alternating a- run", "a-".repeat(5000)],
    // Many hard boundaries, each followed by a run reaching to end of input.
    // This is the shape that would defeat an unbounded-everywhere design.
    ["an alternating &1 run", "&1".repeat(5000)],
    ["a run of digits followed by the suffix", "1".repeat(10000) + " 주식회사"],
  ])("is ReDoS-safe on %s", (_name, input) => {
    expectFast("ko-corp-suffix", input);
  });
});

describe("entities.ko-corp-abbrev", () => {
  it.each([
    ["matches (주) without a space", "(주)LG", ["(주)LG"]],
    ["matches ㈜ without a space", "㈜LG", ["㈜LG"]],
    ["matches (주) with a space", "(주) 삼성전자", ["(주) 삼성전자"]],
    ["matches ㈜ with Korean names", "㈜삼성전자", ["㈜삼성전자"]],
    ["matches digit-leading names", "(주)3M", ["(주)3M"]],
    ["matches hyphenated ASCII names", "(주)A-Tech", ["(주)A-Tech"]],
    ["matches ampersand ASCII names", "㈜A&B", ["㈜A&B"]],
    ["matches at the start of the string", "(주)ABC 계약", ["(주)ABC"]],
    ["matches inside punctuation", "[(주)ABC]", ["(주)ABC"]],
    ["rejects the bare abbreviation", "(주)", []],
    ["rejects non-abbreviation forms", "(주식)LG", []],
    ["rejects missing company names after ㈜", "㈜ ", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-corp-abbrev", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long abbreviation input", () => {
    expectFast("ko-corp-abbrev", "(주)" + "A".repeat(10000));
  });
});

describe("entities.ko-legal-other", () => {
  it.each([
    ["matches 유한회사", "유한회사 홍길동", ["유한회사 홍길동"]],
    ["matches 유한책임회사", "유한책임회사 ABC", ["유한책임회사 ABC"]],
    ["matches 사단법인", "사단법인 한국언어학회", ["사단법인 한국언어학회"]],
    ["matches 재단법인", "재단법인 ABC", ["재단법인 ABC"]],
    ["matches 협동조합", "협동조합 새마을", ["협동조합 새마을"]],
    ["matches 합자회사", "합자회사 A1", ["합자회사 A1"]],
    ["matches 합명회사", "합명회사 가나다", ["합명회사 가나다"]],
    ["matches at the start of the string", "유한회사 ABC 계약", ["유한회사 ABC"]],
    ["matches inside punctuation", "(유한회사 ABC)", ["유한회사 ABC"]],
    ["rejects the bare legal form", "유한회사", []],
    ["rejects incomplete legal forms", "사단법", []],
    ["rejects missing names after legal forms", "재단법인 ", []],
    ["prefers 유한책임회사 over 유한회사 when both could match", "유한책임회사 ABC", ["유한책임회사 ABC"]],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-legal-other", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long legal-form input", () => {
    expectFast("ko-legal-other", "유한책임회사 " + "A".repeat(10000));
  });
});

describe("entities.ko-title-name", () => {
  it.each([
    ["matches 대표이사 plus name", "대표이사 김철수", ["대표이사 김철수"]],
    ["matches 이사 plus name", "이사 박영희", ["이사 박영희"]],
    ["matches 팀장 plus name", "팀장 이지훈", ["팀장 이지훈"]],
    ["matches 과장 plus name", "과장 홍길동", ["과장 홍길동"]],
    ["matches 부사장 plus name", "부사장 김민수", ["부사장 김민수"]],
    ["matches at the start of the string", "대표이사 김철수 참석", ["대표이사 김철수"]],
    ["matches at the end of the string", "서명자 대표이사 김철수", ["대표이사 김철수"]],
    ["matches inside punctuation", "(대표이사 김철수)", ["대표이사 김철수"]],
    ["matches 4-syllable names", "대표이사 선우재덕", ["대표이사 선우재덕"]],
    ["rejects the bare title", "대표이사", []],
    ["rejects one-syllable names", "대표이사 김", []],
    ["rejects 5-syllable names", "대표이사 김철수민준", []],
    ["prefers 대표이사 over 대표 when both could match", "대표이사 김철수", ["대표이사 김철수"]],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-title-name", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long title-name input", () => {
    expectFast("ko-title-name", "대표이사 " + "가".repeat(10000));
  });
});

describe("entities.ko-honorific", () => {
  it.each([
    ["matches spaced 님 form", "김철수 님", ["김철수 님"]],
    ["matches unspaced 님 form", "김철수님", ["김철수님"]],
    ["matches 씨 form", "박영희 씨", ["박영희 씨"]],
    ["matches 귀하 form", "홍길동 귀하", ["홍길동 귀하"]],
    ["matches embedded title honorifics", "김대표 사장님", ["김대표 사장님"]],
    ["matches 선생님 form", "이민수 선생님", ["이민수 선생님"]],
    ["matches 교수님 form", "박지훈 교수님", ["박지훈 교수님"]],
    ["matches at the start of the string", "김철수 님 참석", ["김철수 님"]],
    ["matches inside punctuation", "(김철수님)", ["김철수님"]],
    ["rejects the bare honorific", "님", []],
    ["rejects one-syllable names", "김 님", []],
    ["matches common-word false positives as regex-layer candidates", "오늘 씨", ["오늘 씨"]],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-honorific", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long honorific input", () => {
    expectFast("ko-honorific", "가".repeat(10000) + "님");
  });
});

describe("entities.en-corp-suffix", () => {
  it.each([
    ["matches Corp suffixes", "ABC Corp", ["ABC Corp"]],
    ["matches Inc. suffixes", "ABC Inc.", ["ABC Inc."]],
    ["matches LLC suffixes", "Acme Holdings LLC", ["Acme Holdings LLC"]],
    ["matches full Corporation suffixes", "ABC Corporation", ["ABC Corporation"]],
    ["matches full Limited suffixes", "ABC Limited", ["ABC Limited"]],
    ["matches Co. suffixes", "ABC Co.", ["ABC Co."]],
    ["matches 4-word company names", "International Business Machines Corp", ["International Business Machines Corp"]],
    ["matches at the start of the string", "Apple Inc. signed", ["Apple Inc."]],
    ["matches inside punctuation", "(ABC Corp)", ["ABC Corp"]],
    ["matches known false positives in title-case prose", "The Supreme Court Inc", ["The Supreme Court Inc"]],
    ["rejects lowercase company names", "abc corp", []],
    ["rejects bare suffixes", "Corp", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-corp-suffix", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long corp-suffix input", () => {
    expectFast("en-corp-suffix", "Alpha ".repeat(3000) + "Corp");
  });
});

describe("entities.en-legal-form", () => {
  it.each([
    ["matches GmbH", "ABC GmbH", ["ABC GmbH"]],
    ["matches AG", "Deutsche Bank AG", ["Deutsche Bank AG"]],
    ["matches S.A.", "Alpha S.A.", ["Alpha S.A."]],
    ["matches Pty Ltd", "Beta Pty Ltd", ["Beta Pty Ltd"]],
    ["matches PLC", "Gamma PLC", ["Gamma PLC"]],
    ["matches NV", "Delta Holdings NV", ["Delta Holdings NV"]],
    ["matches BV", "Omega BV", ["Omega BV"]],
    ["matches SAS", "Alpha SAS", ["Alpha SAS"]],
    ["matches inside punctuation", "(ABC GmbH)", ["ABC GmbH"]],
    ["rejects bare legal forms", "PLC", []],
    ["rejects lowercase company names", "abc gmbh", []],
    ["rejects missing company names before legal forms", " GmbH", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-legal-form", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long legal-form input", () => {
    expectFast("en-legal-form", "Alpha ".repeat(3000) + "GmbH");
  });
});

describe("entities.en-title-person", () => {
  it.each([
    ["matches Mr. titles", "Mr. Smith", ["Mr. Smith"]],
    ["matches Mr without a period", "Mr Smith", ["Mr Smith"]],
    ["matches Dr. with two names", "Dr. Jane Doe", ["Dr. Jane Doe"]],
    ["matches Prof. with one name", "Prof. Anderson", ["Prof. Anderson"]],
    ["matches Rev. with three names", "Rev. John Paul Smith", ["Rev. John Paul Smith"]],
    ["matches Sir", "Sir Arthur", ["Sir Arthur"]],
    ["matches at the start of the string", "Mr. Smith arrived", ["Mr. Smith"]],
    ["matches inside punctuation", "(Dr. Jane Doe)", ["Dr. Jane Doe"]],
    ["matches Miss", "Miss Holmes", ["Miss Holmes"]],
    ["rejects bare titles", "Mr.", []],
    ["rejects lowercase names", "Mr. smith", []],
    ["rejects all-caps names", "MR. SMITH", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-title-person", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long title-person input", () => {
    expectFast("en-title-person", "Mr. " + "A".repeat(10000));
  });
});

describe("entities.en-exec-title", () => {
  it.each([
    ["matches CEO names", "CEO John Smith", ["CEO John Smith"]],
    ["matches President names", "President Jane Doe", ["President Jane Doe"]],
    ["matches Vice President names", "Vice President Kamala Harris", ["Vice President Kamala Harris"]],
    ["matches Director names", "Director Kim Park", ["Director Kim Park"]],
    ["matches Founder names", "Founder Marc Zuckerberg", ["Founder Marc Zuckerberg"]],
    ["matches Chairman names", "Chairman Jack Ma", ["Chairman Jack Ma"]],
    ["matches Partner names", "Partner Jane Roe", ["Partner Jane Roe"]],
    ["matches at the start of the string", "CEO John Smith signed", ["CEO John Smith"]],
    ["matches inside punctuation", "(Director Kim Park)", ["Director Kim Park"]],
    ["rejects bare titles", "CEO", []],
    ["rejects lowercase prose after titles", "Director of Sales", []],
    ["matches single-word surnames", "President Obama", ["President Obama"]],
    ["prefers Vice President over President when both could match", "Vice President Kamala Harris", ["Vice President Kamala Harris"]],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-exec-title", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long executive-title input", () => {
    expectFast("en-exec-title", "CEO " + "A".repeat(10000));
  });
});

describe("entities.ko-identity-context", () => {
  it.each([
    ["matches 대표자 labels", "대표자: 김철수", ["김철수"]],
    ["matches 법인명 labels", "법인명: 삼성전자", ["삼성전자"]],
    ["matches 회사명 labels", "회사명 ABC", ["ABC"]],
    ["matches 상호 labels with plain values", "상호: 홍길동", ["홍길동"]],
    ["matches 성명 labels", "성명: 박영희", ["박영희"]],
    ["matches 이름 labels", "이름 김민수", ["김민수"]],
    ["matches 소속 labels with ASCII values", "소속: OpenAI", ["OpenAI"]],
    ["matches 직함 labels", "직함: 팀장", ["팀장"]],
    ["matches 직위 labels", "직위 김철수", ["김철수"]],
    ["rejects bare labels", "대표자", []],
    ["rejects honorific tails beyond the captured value", "이름 홍길동 씨", ["홍길동"]],
    ["rejects (주)-prefixed values that start with punctuation", "상호: (주)홍길동", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-identity-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long Korean identity-context input", () => {
    expectFast("ko-identity-context", "대표자: " + "가".repeat(10000));
  });
});

describe("entities.en-identity-context", () => {
  it.each([
    ["matches Name labels", "Name: John Smith", ["John Smith"]],
    ["matches Full Name labels", "Full Name: Jane Doe", ["Jane Doe"]],
    ["matches Company labels", "Company: Acme Corp", ["Acme Corp"]],
    ["matches Company Name labels", "Company Name: OpenAI Research", ["OpenAI Research"]],
    ["matches Signatory labels", "Signatory: J.P. Morgan", ["J.P. Morgan"]],
    ["matches Client labels", "Client: Alpha Beta Gamma Delta", ["Alpha Beta Gamma Delta"]],
    ["matches Contact labels", "Contact: Jean-Paul Sartre", ["Jean-Paul Sartre"]],
    ["matches Representative labels", "Representative: Jane Roe", ["Jane Roe"]],
    ["matches Counterparty labels", "Counterparty: Acme Inc", ["Acme Inc"]],
    ["rejects bare labels", "Name", []],
    ["rejects lowercase values", "Name: john smith", []],
    ["rejects missing colons", "Name John Smith", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-identity-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long English identity-context input", () => {
    expectFast("en-identity-context", "Name: " + "Alpha ".repeat(3000));
  });
});

describe("entities.ko-address-context", () => {
  it.each([
    [
      "matches 주소 labels",
      "주소: 서울특별시 강남구 논현로 568 15층",
      ["서울특별시 강남구 논현로 568 15층"],
    ],
    [
      "matches 소재지 labels",
      "소재지: 경기도 성남시 분당구 판교로 235",
      ["경기도 성남시 분당구 판교로 235"],
    ],
    [
      "matches 본점 주소 with spaced colon",
      "본점 주소 : 서울시 중구 을지로 100",
      ["서울시 중구 을지로 100"],
    ],
    [
      "matches 사업장 주소 labels",
      "사업장 주소: 부산광역시 해운대구 APEC로 55",
      ["부산광역시 해운대구 APEC로 55"],
    ],
    [
      "matches 연락지 labels and keeps commas inside the address",
      "연락지: 서울시 서초구 반포대로 108, 101호",
      ["서울시 서초구 반포대로 108, 101호"],
    ],
    [
      "matches fullwidth colons",
      "주민등록지：서울특별시 서초구 반포대로 108",
      ["서울특별시 서초구 반포대로 108"],
    ],
    [
      "matches at the start of the string",
      "주소: 서울특별시 강남구 논현로 568\n다음줄",
      ["서울특별시 강남구 논현로 568"],
    ],
    [
      "matches at the end of the string",
      "소재지: 경기도 성남시 분당구 판교로 235",
      ["경기도 성남시 분당구 판교로 235"],
    ],
    [
      "stops at semicolon terminators",
      "주소: 서울시 강남구 테헤란로 12; 비고",
      ["서울시 강남구 테헤란로 12"],
    ],
    ["rejects bare labels", "주소", []],
    ["rejects too-short values", "주소: 서", []],
    ["rejects labels outside the approved list", "거래처: 서울특별시 강남구 논현로 568", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-address-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long Korean address-context input", () => {
    expectFast("ko-address-context", "주소: " + "가".repeat(10000));
  });
});

describe("entities.en-address-context", () => {
  it.each([
    [
      "matches Address labels",
      "Address: 12345 Main St, Anytown, CA 12345",
      ["12345 Main St, Anytown, CA 12345"],
    ],
    [
      "matches Mailing Address labels",
      "Mailing Address: P.O. Box 1234, New York, NY 10001",
      ["P.O. Box 1234, New York, NY 10001"],
    ],
    [
      "matches Registered Address labels",
      "Registered Address: 100 Wall Street, 5th Floor",
      ["100 Wall Street, 5th Floor"],
    ],
    [
      "matches Street Address labels",
      "Street Address: 456 Oak Avenue, Apt 3B",
      ["456 Oak Avenue, Apt 3B"],
    ],
    [
      "matches Business Address labels",
      "Business Address: 100 Market Street, Suite 400",
      ["100 Market Street, Suite 400"],
    ],
    [
      "matches Residence labels",
      "Residence: 456 Oak Avenue, Apt 3B",
      ["456 Oak Avenue, Apt 3B"],
    ],
    [
      "prefers Mailing Address over Address when both labels could fit",
      "Mailing Address: 456 Oak Ave",
      ["456 Oak Ave"],
    ],
    [
      "stops at semicolon terminators",
      "Domicile: 500 Elm Street; Notes follow",
      ["500 Elm Street"],
    ],
    [
      "matches at the end of the string",
      "Location: 12 Bridge Road",
      ["12 Bridge Road"],
    ],
    ["rejects lowercase labels", "address: foo", []],
    ["rejects bare labels", "Address:", []],
    ["rejects too-short values", "Address: 1234", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-address-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long English address-context input", () => {
    expectFast("en-address-context", "Address: " + "A".repeat(10000));
  });
});

describe("entities.ko-phone-context", () => {
  it.each([
    ["matches 전화 labels", "전화: 02-3446-3727", ["02-3446-3727"]],
    ["matches 전화번호 labels", "전화번호: 010-1234-5678", ["010-1234-5678"]],
    ["matches 연락처 labels", "연락처: +82-2-3446-3727", ["+82-2-3446-3727"]],
    ["matches 팩스 labels", "팩스: (02) 3446-3728", ["(02) 3446-3728"]],
    ["matches Tel labels", "Tel: 02.3446.3727", ["02.3446.3727"]],
    ["matches 휴대폰 labels", "휴대폰: 010 1234 5678", ["010 1234 5678"]],
    [
      "prefers 전화번호 over 전화 when both labels could fit",
      "전화번호: 010-1234-5678",
      ["010-1234-5678"],
    ],
    [
      "prefers 팩스번호 over 팩스 when both labels could fit",
      "팩스번호: 02-3446-3728",
      ["02-3446-3728"],
    ],
    [
      "matches at the start of the string",
      "전화: 02-3446-3727\n다음줄",
      ["02-3446-3727"],
    ],
    ["rejects bare labels", "전화", []],
    ["rejects non-digit values", "전화: abc", []],
    ["rejects too-short values", "전화: 123456", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("ko-phone-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long Korean phone-context input", () => {
    expectFast("ko-phone-context", "전화: " + "0-".repeat(5000));
  });
});

describe("entities.en-phone-context", () => {
  it.each([
    ["matches Phone Number labels", "Phone Number: 02-3446-3727", ["02-3446-3727"]],
    ["matches Phone labels", "Phone: +1 (555) 123-4567", ["+1 (555) 123-4567"]],
    ["matches Mobile labels", "Mobile: 010-1234-5678", ["010-1234-5678"]],
    ["matches Fax labels", "Fax: 02 345 6789", ["02 345 6789"]],
    ["matches Tel labels", "Tel: +82.2.3446.3727", ["+82.2.3446.3727"]],
    ["matches Telephone labels", "Telephone: 02-3446-3727", ["02-3446-3727"]],
    [
      "prefers Phone Number over Phone when both labels could fit",
      "Phone Number: 02-3446-3727",
      ["02-3446-3727"],
    ],
    [
      "matches at the start of the string",
      "Phone Number: 02-3446-3727\nNext line",
      ["02-3446-3727"],
    ],
    [
      "matches at the end of the string",
      "Cell: 010-1234-5678",
      ["010-1234-5678"],
    ],
    ["rejects lowercase labels", "phone: foo", []],
    ["rejects bare labels", "Phone Number:", []],
    ["rejects too-short values", "Phone: 123456", []],
  ])("%s", (_name, text, expected) => {
    expect(matchOne("en-phone-context", text)).toEqual(expected);
  });

  it("is ReDoS-safe on long English phone-context input", () => {
    expectFast("en-phone-context", "Phone: " + "1-".repeat(5000));
  });
});
