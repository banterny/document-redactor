/**
 * Entities category — corporate forms, executive titles, honorifics, labels.
 *
 * Twelve regex rules covering:
 *
 *   1. Korean corporation with 주식회사 prefix
 *   2. Korean corporation with 주식회사 suffix
 *   3. Korean corporation abbreviation ((주) or ㈜)
 *   4. Korean legal forms other than 주식회사 (유한회사 / 사단법인 / ...)
 *   5. Korean executive title + person name
 *   6. Korean person name + honorific
 *   7. English corporation with Corp/Inc/LLC/Ltd/Co suffix
 *   8. English international legal form (GmbH/S.A./PLC/Pty Ltd/...)
 *   9. English personal title (Mr./Mrs./Dr./Prof.) + name
 *  10. English executive title (CEO/President/Director/...) + name
 *  11. Korean label-driven identity context (대표자:/법인명:/...)
 *  12. English label-driven identity context (Name:/Company:/...)
 *
 * No post-filters in this category. Entity detection is inherently fuzzy and
 * context-aware suppression is deferred to the heuristic phase (see § 14 of
 * phase-1-rulebook.md for the role blacklist design).
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 11 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.4 — entities category boundary
 *   - docs/RULES_GUIDE.md § 12.1 — \b in CJK anti-pattern (avoided below)
 *   - docs/RULES_GUIDE.md § 12.2 — hardcoded entity names anti-pattern
 *
 * NORMALIZATION: this file assumes `normalizeForMatching` has already folded
 * fullwidth ASCII, CJK space, and hyphen variants. See § 11.2 of the phase-1
 * brief and src/detection/normalize.ts for the authoritative list.
 */

import type { RegexRule } from "../_framework/types.js";

export const ENTITIES = [
  {
    id: "entities.ko-corp-prefix",
    category: "entities",
    subcategory: "ko-corp-prefix",
    pattern:
      /(?<![가-힣A-Za-z])주식회사\s+(?:[A-Za-z0-9][A-Za-z0-9&.\-]*|[가-힣][가-힣A-Za-z0-9]*)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean corporation with 주식회사 prefix followed by a single-token company name",
  },
  {
    id: "entities.ko-corp-suffix",
    category: "entities",
    subcategory: "ko-corp-suffix",
    // ReDoS: this rule is a different bug class to the context-gated rules in
    // legal-uk.ts / identifiers-uk.ts, and the `(?![ \t])` guard those use is
    // measurably useless here (753.5ms -> 726.2ms). There is no positive
    // lookbehind to short-circuit. The cost is a greedy run before a literal:
    // `[A-Za-z0-9][A-Za-z0-9&.\-]*` consumes to end of input, `\s+` fails, and
    // the engine backtracks through every shorter length -- and because
    // `(?<![가-힣A-Za-z])` admits every position when the input is digits or
    // `-`, that O(n) walk is retried at O(n) positions. Quadratic, and it
    // bites on digits and `a-` repeats rather than on whitespace. Measured on
    // JavaScriptCore at 10,000 chars: 764.6ms and 411.0ms against a 50ms
    // budget.
    //
    // Atomic-group emulation alone does NOT fix it: measured 4.4x better but
    // still quadratic (2.7 / 10.8 / 43.0 / 168.2ms at n = 1250 / 2500 / 5000 /
    // 10000), i.e. still 3.4x over budget. Committing to the maximal run
    // removes the backtracking but not the O(n) rescan at O(n) start
    // positions. Something has to bound one of the two factors.
    //
    // So the START POSITIONS are split in two, and only the cheap half is
    // bounded:
    //
    //   BRANCH 1 -- HARD BOUNDARY, run stays UNBOUNDED, exact.
    //     `(?<![0-9&.\-])` on top of the outer `(?<![가-힣A-Za-z])` means the
    //     preceding character is outside the run's own character class, so
    //     this is a true token start. This branch is provably LINEAR: the
    //     combined exclusion set `[가-힣A-Za-z0-9&.\-]` is a superset of both
    //     run classes, so the maximal run from one hard boundary must stop
    //     before the next one begins. The runs are disjoint, and their lengths
    //     sum to at most n however the input is shaped. A real company name --
    //     however long -- starts at a hard boundary, so it is matched in full.
    //
    //   BRANCH 2 -- MID-TOKEN, run bounded to `{0,255}`.
    //     The only characters the outer lookbehind admits that are ALSO in a
    //     run class are `[0-9&.\-]`, and those are exactly the positions that
    //     make the rule quadratic. They are still matchable (`"&abc 주식회사"`
    //     matches `"abc 주식회사"`, and that behaviour is preserved), but the
    //     run is capped here so the per-position cost is a constant.
    //
    // Both branches use atomic-group emulation `(?=(X))\1`, JavaScript having
    // no atomic groups. That is exact HERE by a specific argument: any shorter
    // run leaves the next character inside the run's class, which is disjoint
    // from `\s`, so only the maximal run can ever be followed by `\s+` and
    // committing to it cannot lose a match. GROUP NUMBERING IS LOAD-BEARING --
    // \1 hard-boundary ASCII, \2 hard-boundary Hangul, \3 mid-token ASCII,
    // \4 mid-token Hangul. Inserting an alternative renumbers everything after
    // it; entities.test.ts asserts each of the four branches independently so
    // that breaks a named test rather than silently degrading. The runner only
    // ever reads `m[0]` (runner.ts) and this rule has no postFilter, so the
    // added groups are invisible downstream.
    //
    // KNOWN, DELIBERATE LIMIT (see the matching note on legal.uk-legal-context
    // in legal-uk.ts -- same class of accepted, pinned cliff): a match taken by
    // BRANCH 2, i.e. one starting immediately after one of `[0-9&.\-]`, is
    // missed once its token exceeds 256 characters. In practice the reachable
    // trigger is a leading `&`, `.` or `-` -- those are inside the run's class
    // but cannot begin a run, so they leave no hard boundary for branch 1 to
    // use. `"&" + "a".repeat(257) + " 주식회사"` is the minimal case.
    //
    // Confirmed by binary search, not estimated: for every predecessor context
    // that reaches branch 2 (`&`, `.`, `-`, `가.`, `&&`, `가.&`) the two
    // patterns agree at token length 256 and diverge at 257, and across 40,960
    // cases with token length <= 256 there are zero divergences. A hard
    // boundary anywhere before the token removes the limit entirely, which is
    // why `"a".repeat(10_000) + " 주식회사"` still matches in full.
    //
    // Company names are single tokens by construction here (the rule requires
    // `\s+` before 주식회사) and no real one approaches 256 characters, so this
    // is accepted as a real, bounded limitation rather than chased further.
    // The boundary is pinned on both sides in entities.test.ts so a future
    // change cannot move it inwards without a failing test.
    //
    // On JavaScriptCore, for the two gate inputs this rule was quarantined on:
    //
    //   "1".repeat(10_000)   672-1159ms  ->  15.8-24.6ms
    //   "a-".repeat(5_000)   411-826ms   ->   8.6-14.2ms
    //
    // Ranges rather than single figures because the before case is slow enough
    // to exceed the gate's own 20s subprocess timeout at its 200-run count, so
    // it has to be measured with the reduced counts the exception entries used
    // (they recorded 764.6ms and 411.0ms), and because CPU time still inflates
    // under machine load. The order of magnitude is the claim; both are now an
    // order of magnitude inside the 50ms budget, and KNOWN_ENGINE_EXCEPTIONS
    // is empty.
    //
    // On V8 this rule measures 0.00ms before AND after. That is not a
    // reassurance, it is the entire reason a single-engine gate never saw
    // this: see RULES_GUIDE § 7.1. Behaviour verified identical over 48,755
    // cases including exhaustive tokens of length <= 3 over every character
    // class the pattern distinguishes, in 14 predecessor contexts.
    pattern:
      /(?<![가-힣A-Za-z])(?:(?<![0-9&.\-])(?:[A-Za-z0-9](?=([A-Za-z0-9&.\-]*))\1|[가-힣](?=([가-힣A-Za-z0-9]*))\2)|[A-Za-z0-9](?=([A-Za-z0-9&.\-]{0,255}))\3|[가-힣](?=([가-힣A-Za-z0-9]{0,255}))\4)\s+주식회사(?![가-힣A-Za-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean corporation with single-token company name followed by 주식회사",
  },
  {
    id: "entities.ko-corp-abbrev",
    category: "entities",
    subcategory: "ko-corp-abbrev",
    pattern:
      /(?:\(주\)|㈜)\s*(?:[A-Za-z0-9][A-Za-z0-9&.\-]*|[가-힣][가-힣A-Za-z0-9]*)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean corporation with (주) or ㈜ abbreviation prefix and single-token company name",
  },
  {
    id: "entities.ko-legal-other",
    category: "entities",
    subcategory: "ko-legal-other",
    pattern:
      /(?<![가-힣A-Za-z])(?:유한회사|유한책임회사|합자회사|합명회사|사단법인|재단법인|협동조합)\s+(?:[A-Za-z0-9][A-Za-z0-9&.\-]*|[가-힣][가-힣A-Za-z0-9]*)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean legal form other than 주식회사 (유한회사/사단법인/재단법인/협동조합/...) with prefixed name",
  },
  {
    id: "entities.ko-title-name",
    category: "entities",
    subcategory: "ko-title-name",
    pattern:
      /(?<![가-힣A-Za-z])(?:대표이사|부사장|본부장|대표|부장|차장|과장|팀장|실장|사장|전무|상무|이사|감사|대리|주임)\s+[가-힣]{2,4}(?![가-힣])/g,
    levels: ["paranoid"],
    languages: ["ko"],
    description:
      "Korean executive or management title followed by a 2-4 syllable Korean name",
  },
  {
    id: "entities.ko-honorific",
    category: "entities",
    subcategory: "ko-honorific",
    pattern:
      /(?<![가-힣])[가-힣]{2,4}\s*(?:사장님|선생님|교수님|대표님|이사님|귀하|님|씨)(?![가-힣])/g,
    levels: ["paranoid"],
    languages: ["ko"],
    description:
      "Korean 2-4 syllable name followed by honorific (님/씨/귀하/사장님/선생님/...)",
  },
  {
    id: "entities.en-corp-suffix",
    category: "entities",
    subcategory: "en-corp-suffix",
    pattern:
      /(?<![A-Za-z])[A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z][A-Za-z0-9&\-]*){0,3}\s+(?:Corporation|Incorporated|Limited|Company|Corp\.?|Inc\.?|LLC\.?|Ltd\.?|Co\.?)(?![A-Za-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English corporation: 1-4 capitalized words followed by Corp/Inc/LLC/Ltd/Co/Corporation/Incorporated/Limited/Company",
  },
  {
    id: "entities.en-legal-form",
    category: "entities",
    subcategory: "en-legal-form",
    pattern:
      /(?<![A-Za-z])[A-Z][A-Za-z0-9&\-]*(?:\s+[A-Z][A-Za-z0-9&\-]*){0,3}\s+(?:GmbH|AG|S\.p\.A\.|S\.r\.l\.|S\.A\.S|S\.A\.|SARL|SAS|PLC|LLP|Pty\s+Ltd|Pty|NV|BV|AB|OY|KG|OHG)(?![A-Za-z])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English international legal form (GmbH/AG/S.A./SARL/PLC/Pty Ltd/NV/BV/AB/OY/KG/OHG) with preceding capitalized name",
  },
  {
    id: "entities.en-title-person",
    category: "entities",
    subcategory: "en-title-person",
    pattern:
      /(?<![A-Za-z])(?:Mr|Mrs|Ms|Miss|Dr|Prof|Rev|Sir)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?![A-Za-z])/g,
    levels: ["paranoid"],
    languages: ["en"],
    description:
      "English personal title (Mr./Mrs./Ms./Miss/Dr./Prof./Rev./Sir) with 1-3 capitalized name words",
  },
  {
    id: "entities.en-exec-title",
    category: "entities",
    subcategory: "en-exec-title",
    pattern:
      /(?<![A-Za-z])(?:Vice\s+President|CEO|CFO|COO|CTO|CIO|CMO|CHRO|President|Chairman|Chairwoman|Director|Founder|Partner|Secretary|Treasurer)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?![A-Za-z])/g,
    levels: ["paranoid"],
    languages: ["en"],
    description:
      "English executive title (CEO/CFO/President/Chairman/Director/Founder/...) with 1-3 capitalized name words",
  },
  {
    id: "entities.ko-identity-context",
    category: "entities",
    subcategory: "ko-identity-context",
    pattern:
      /(?![ \t])(?<=(?:대표자|성명|이름|법인명|회사명|상호|소속|직함|직위)\s*[:：]?\s*)(?:[A-Za-z][A-Za-z0-9&.\-]*|[가-힣]{2,6})/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean identity value (name or company token) preceded by a label (대표자/성명/법인명/...)",
  },
  {
    id: "entities.en-identity-context",
    category: "entities",
    subcategory: "en-identity-context",
    pattern:
      /(?![ \t])(?<=(?:Full\s+Name|Company\s+Name|Name|Company|Representative|Contact|Signatory|Client|Counterparty)\s*:\s*)[A-Z][A-Za-z.\-]*(?:\s+[A-Z][A-Za-z.\-]*){0,3}/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "English identity value (1-4 capitalized words) preceded by a label (Name:/Company:/Representative:/...)",
  },
  {
    id: "entities.ko-address-context",
    category: "entities",
    subcategory: "ko-address-context",
    pattern:
      /(?![ \t])(?<=(?:주소|소재지|거주지|본점\s*주소|본사\s*주소|지점\s*주소|사업장\s*주소|연락지|주민등록지|등록기준지)\s*[:：]?\s*)[^\s:：].{4,99}?(?=$|\n|;)/g,
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
      /(?:(?<=Registered Address: )|(?<=Registered Address:)|(?<=Mailing Address: )|(?<=Mailing Address:)|(?<=Street Address: )|(?<=Street Address:)|(?<=Business Address: )|(?<=Business Address:)|(?<=Residence: )|(?<=Residence:)|(?<=Domicile: )|(?<=Domicile:)|(?<=Location: )|(?<=Location:)|(?<=Address: )|(?<=Address:))[0-9A-Z][^\n;]{4,99}?(?=$|\n|;)/g,
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
      /(?![ \t])(?<=(?:전화번호|전화|연락처|휴대전화|휴대폰|핸드폰|팩스번호|팩스|Fax|Tel)\s*[:：]?\s*)[+\d(][+\d .()\-]{6,24}(?=$|\n|;|[^\d+ .()\-])/g,
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
      /(?![ \t])(?<=(?:Phone Number|Telephone|Phone|Mobile|Cell|Tel|Fax) *: *)[+\d(][+\d .()\-]{6,24}(?=$|\n|;|[^\d+ .()\-])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Phone number value following an English label (Phone/Phone Number/Mobile/Cell/Tel/Fax)",
  },
] as const satisfies readonly RegexRule[];
