/**
 * UK legal category -- claim numbers, coroner's references, and
 * context-driven legal identifiers.
 *
 * Three rules only. Neutral citations, law report citations, statute
 * references, and CPR references are deliberately excluded -- they are
 * public legal knowledge, not identifying data. The question for each
 * rule is: "Does this string identify a specific case, person, or
 * place?" If not, it does not belong here.
 *
 * See:
 *   - docs/RULES_GUIDE.md SS 7 -- ReDoS checklist
 */

import type { RegexRule } from "../_framework/types.js";

export const LEGAL_UK = [
  // -- 1. Court Claim Number ------------------------------------------------------
  {
    id: "legal.uk-claim-number",
    category: "legal",
    subcategory: "uk-claim-number",
    pattern:
      /(?<![A-Za-z\d])(?:(?:QB|KB|KBD|QBD|CL|HQ|TLQ|PT|BL|HP|BR|CR|IL|IP|CH|IF|FL|FD|AP)-?(?:19|20)\d{2}-?\d{3,6}|[A-Z]\d{2}[A-Z]{2}\d{3,6}|(?:Claim|Case)\s+(?:No\.?|Number)\s*:?\s*[A-Z0-9\-]{4,15})(?![A-Za-z\d])/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK court claim number -- King's Bench (KB-2024-001234), county court " +
      "(A12YX123), legacy Queen's Bench (QB/HQ), Chancery (CH/BL), " +
      "Family (FL/FD), and labelled patterns (Claim No: xxx)",
  },

  // -- 2. Coroner's Reference (context-gated) ------------------------------------
  {
    id: "legal.uk-coroner-ref",
    category: "legal",
    subcategory: "uk-coroner-ref",
    pattern:
      /(?<=(?:Coroner'?s?\s+(?:Ref|Reference|Case|Inquest)|Inquest\s+(?:No|Number|Ref)|Regulation\s+28)[.:]?\s*)(?:\d{2,4}[-/]\d{2,6}|[A-Z]{1,3}[-/]?\d{4,8})/gi,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "UK coroner's reference / inquest reference, context-gated. " +
      "Formats vary by coroner's area (2024-0123, ABC/12345)",
  },

  // -- 3. UK Legal Context Scanner ------------------------------------------------
  {
    id: "legal.uk-legal-context",
    category: "legal",
    subcategory: "uk-legal-context",
    pattern:
      /(?:(?<=Claim No\.?\s*:?\s*)|(?<=Case No\.?\s*:?\s*)|(?<=Ref(?:erence)?\.?\s*:?\s*)|(?<=Inquest\s+(?:touching|into)\s+the\s+death\s+of\s*))[^\n;,]{3,80}(?=$|\n|[;,])/g,
    levels: ["standard", "paranoid"],
    languages: ["en"],
    description:
      "Value following a UK legal label (Claim No:/Case No:/Ref:/" +
      "Inquest touching the death of). Captures up to the first delimiter",
  },
] as const satisfies readonly RegexRule[];
