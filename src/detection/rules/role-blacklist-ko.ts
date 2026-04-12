/**
 * Korean role-word blacklist — 50 tokens that appear heavily in legal
 * documents but are NOT sensitive entity names.
 *
 * Consumed by every Korean-language heuristic via
 * `ROLE_BLACKLIST_KO.has(token)`. Heuristics MUST check this blacklist
 * before emitting a candidate.
 *
 * Maintenance: add words observed as false positives during heuristic
 * tuning (RULES_GUIDE § 6.4). Do NOT add entity names (Samsung, 삼성) —
 * that would be the § 12.2 anti-pattern.
 */

export const ROLE_BLACKLIST_KO: ReadonlySet<string> = new Set([
  "당사자", "갑", "을", "병", "정", "본인", "상대방",
  "원고", "피고", "신청인", "피신청인", "항소인", "피항소인",
  "의뢰인", "고객", "회사", "법인", "개인", "대리인",
  "위임자", "수임자", "임차인", "임대인", "매수인", "매도인",
  "채권자", "채무자", "보증인", "피보증인", "수탁자", "위탁자",
  "양도인", "양수인", "발주자", "수급인", "하도급인",
  "사용자", "근로자", "피용자", "고용주",
  "저작권자", "이용자", "실시권자", "특허권자",
  "대표", "대표이사", "이사", "감사", "주주",
  "당사",
]) as ReadonlySet<string>;
