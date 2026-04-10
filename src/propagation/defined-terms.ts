/**
 * D9 defined-term registry — the multilingual list of generic role words
 * that identify parties by role, not by name.
 *
 * Lane C's alias classifier uses this list as a fail-safe: any alias that
 * matches one of these words exactly (or with an English definite-article
 * prefix like "the Buyer") is tagged as `defined`, regardless of how it
 * was discovered. The D9 policy then excludes defined-tagged strings from
 * the default redaction target list so the downstream AI can still parse
 * the contract's structure.
 *
 * The list is curated from:
 *   - The D9 section of design-v1.md (the canonical multilingual list)
 *   - Common contract role words not yet in the design but equally generic
 *     (Supplier, Lessor, Lessee, etc.) — additive only, no substitutions
 *
 * Match rules:
 *  - **Exact match, case-sensitive.** Contracts use Title Case for English
 *    role words. Lowercased forms like `buyer` in the middle of a sentence
 *    are not defined terms — they are noun instances of the word.
 *  - **English prefix tolerance.** `the Buyer` / `The Buyer` both resolve
 *    to `Buyer` via a prefix strip, because contracts conventionally use
 *    the definite article in prose ("the Buyer shall ...").
 *  - **No substring logic.** `ABC Company` contains `Company` but is NOT
 *    a defined term — it's an entity name. Exact match only. The Korean
 *    particle form `매수인은` (매수인 + 은 particle) is also rejected for
 *    the same reason: only the bare form is considered a defined term.
 *
 * Not in scope here (other Lane C modules handle these):
 *  - Linking defined terms back to the literal entity they represent —
 *    `definition-clauses.ts` does that via "X" means Y and 이라 함은 Y
 *    parsing.
 *  - Substring variants of literal entity names (ABC Corporation →
 *    ABC Corp) — `substring-variants.ts`.
 *  - Final target list assembly — `propagate.ts`.
 */

/**
 * Canonical generic role words that identify parties by role, not by name.
 * The order is cosmetic (English first, Korean second, 한자 last) and has
 * no behavioral significance — lookups go through a Set.
 */
export const GENERIC_ROLE_WORDS: ReadonlyArray<string> = [
  // English — core D9 list
  "Buyer",
  "Seller",
  "Purchaser",
  "Vendor",
  "Licensor",
  "Licensee",
  "Discloser",
  "Recipient",
  "Company",
  "Client",
  "Customer",
  "Employer",
  "Employee",
  "Contractor",
  "Agent",
  "Principal",
  "Party",
  "Parties",
  "Project",
  // English — additional common role words not in D9 but equally generic
  "Supplier",
  "Distributor",
  "Manufacturer",
  "Lessor",
  "Lessee",
  "Landlord",
  "Tenant",
  "Investor",
  "Issuer",
  "Borrower",
  "Lender",
  "Subcontractor",
  "Guarantor",
  "Grantor",
  "Grantee",
  "Assignor",
  "Assignee",
  // Korean — core D9 list
  "매수인",
  "매도인",
  "갑",
  "을",
  "병",
  "정",
  "공급자",
  "수급자",
  "도급인",
  "수급인",
  "발주자",
  "수주자",
  // Korean — additional common role words not in D9 but equally generic
  "임대인",
  "임차인",
  "대여자",
  "차용자",
  "위탁자",
  "수탁자",
  "양도인",
  "양수인",
  "채권자",
  "채무자",
  // 한자 single-character party markers (used in older Korean contracts)
  "甲",
  "乙",
  "丙",
  "丁",
];

/** Pre-built Set so `isDefinedTerm` is O(1). */
const ROLE_SET = new Set<string>(GENERIC_ROLE_WORDS);

/**
 * English definite-article prefixes that convert a bare role word into
 * the canonical "the Buyer" contract form. When checking membership we
 * strip one of these first and retry against the bare role set.
 */
const ENGLISH_PREFIXES = ["the ", "The "];

/**
 * Return true iff `phrase` is a defined-term role label (case-sensitive,
 * exact match after optional "the" prefix strip). Used by the alias
 * classifier as a fail-safe tag: anything this returns true for is
 * classified as `defined` and excluded from the default redaction target
 * list, regardless of how it was discovered.
 */
export function isDefinedTerm(phrase: string): boolean {
  if (phrase.length === 0) return false;
  if (ROLE_SET.has(phrase)) return true;
  for (const pfx of ENGLISH_PREFIXES) {
    if (phrase.startsWith(pfx) && ROLE_SET.has(phrase.slice(pfx.length))) {
      return true;
    }
  }
  return false;
}
