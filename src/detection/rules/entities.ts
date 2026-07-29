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
    pattern:
      /(?<![가-힣A-Za-z])(?:[A-Za-z0-9][A-Za-z0-9&.\-]*|[가-힣][가-힣A-Za-z0-9]*)\s+주식회사(?![가-힣A-Za-z])/g,
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
