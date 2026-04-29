/**
 * Legal category — litigation case/docket identifiers.
 *
 * Two regex rules covering:
 *
 *   1. Korean case number (2024가합12345)
 *   2. Case/docket context scanner (사건번호: ..., Case No.: ...)
 *
 * Contract article/section references, public statute citations, court names,
 * and precedent citations are not redaction candidates by default. They are
 * document structure, venue context, or public legal authority.
 *
 * See:
 *   - docs/phases/phase-1-rulebook.md § 13 — authoritative rule specs
 *   - docs/RULES_GUIDE.md § 2.7 — legal category boundary
 *   - docs/RULES_GUIDE.md § 7 — ReDoS checklist
 */

import type { RegexRule } from "../_framework/types.js";

export const LEGAL = [
  {
    id: "legal.ko-case-number",
    category: "legal",
    subcategory: "ko-case-number",
    pattern: /(?<!\d)(?:19|20)\d{2}[가-힣]{1,3}\d{1,6}(?!\d)/g,
    levels: ["standard", "paranoid"],
    languages: ["ko"],
    description:
      "Korean court case number: 4-digit year + case-type syllables + docket digits (e.g., '2024가합12345')",
  },
  {
    id: "legal.legal-context",
    category: "legal",
    subcategory: "legal-context",
    pattern:
      /(?:(?<=사건번호:)|(?<=사건번호: )|(?<=사건번호：)|(?<=사건번호： )|(?<=사건:)|(?<=사건: )|(?<=사건：)|(?<=사건： )|(?<=Case No\.)|(?<=Case No\. )|(?<=Case No\.:)|(?<=Case No\.: )|(?<=Case No\.：)|(?<=Case No\.： )|(?<=Case No:)|(?<=Case No: )|(?<=Case No：)|(?<=Case No： )|(?<=Docket No\.)|(?<=Docket No\. )|(?<=Docket No\.:)|(?<=Docket No\.: )|(?<=Docket No\.：)|(?<=Docket No\.： )|(?<=Docket No:)|(?<=Docket No: )|(?<=Docket No：)|(?<=Docket No： ))[^\n;,]{3,60}(?=$|\n|[;,])/g,
    levels: ["standard", "paranoid"],
    languages: ["ko", "en"],
    description:
      "Value following a case/docket label (사건번호:/Case No.:/Docket No.:), captures up to first delimiter",
  },
] as const satisfies readonly RegexRule[];
