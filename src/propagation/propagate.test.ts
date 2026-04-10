import { describe, it, expect } from "vitest";

import {
  propagateVariants,
  buildRedactionTargets,
  type VariantGroup,
} from "./propagate.js";
import { parseDefinitionClauses } from "./definition-clauses.js";

describe("propagateVariants — single seed, simple text", () => {
  it("returns the seed as a literal when it appears in text", () => {
    const text = "ABC Corporation signed the deal.";
    const group = propagateVariants("ABC Corporation", text, []);
    expect(group.seed).toBe("ABC Corporation");
    expect(group.literals.map((c) => c.text)).toContain("ABC Corporation");
  });

  it("adds substring variants found in text as literals", () => {
    const text =
      "ABC Corporation is a Korean firm. See also ABC Corp in the footnote.";
    const group = propagateVariants("ABC Corporation", text, []);
    const literalTexts = group.literals.map((c) => c.text);
    expect(literalTexts).toContain("ABC Corporation");
    expect(literalTexts).toContain("ABC Corp");
  });

  it("includes occurrence counts for each variant", () => {
    const text =
      "ABC Corporation is a Korean firm. ABC Corp did the deal. ABC Corp again.";
    const group = propagateVariants("ABC Corporation", text, []);
    const corp = group.literals.find((c) => c.text === "ABC Corp");
    expect(corp?.count).toBe(2);
    const full = group.literals.find((c) => c.text === "ABC Corporation");
    expect(full?.count).toBe(1);
  });

  it("returns an empty variant group when the seed does not appear in text", () => {
    const text = "Totally unrelated prose.";
    const group = propagateVariants("ABC Corporation", text, []);
    expect(group.literals).toEqual([]);
    expect(group.defined).toEqual([]);
  });
});

describe("propagateVariants — definition clause integration", () => {
  it("pulls in defined terms when a clause links them to the seed literal", () => {
    const text =
      '"Discloser" means ABC Corporation. ABC Corporation signed. The Discloser agreed.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("ABC Corporation", text, clauses);
    const definedTexts = group.defined.map((c) => c.text);
    expect(definedTexts).toContain("Discloser");
  });

  it("pulls in Korean defined terms linked to the seed literal", () => {
    const text =
      '"매수인"이라 함은 ABC 주식회사를 말한다. ABC 주식회사는 한국 회사이다. 매수인은 계약을 체결했다.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("ABC 주식회사", text, clauses);
    const definedTexts = group.defined.map((c) => c.text);
    expect(definedTexts).toContain("매수인");
  });

  it("does not cross-link an unrelated definition clause", () => {
    const text =
      '"Discloser" means ABC Corporation. "Recipient" means Sunrise Ventures LLC. Both signed.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("ABC Corporation", text, clauses);
    const definedTexts = group.defined.map((c) => c.text);
    expect(definedTexts).toContain("Discloser");
    expect(definedTexts).not.toContain("Recipient");
  });
});

describe("propagateVariants — hardcoded defined-term fallback", () => {
  it("classifies a generic role word as defined even without a clause", () => {
    // The text has 'the Buyer' but no explicit 'means' clause linking it
    // to ABC Corporation. The hardcoded defined-term list (D9) should
    // still classify 'Buyer' as defined, so it appears in the defined group
    // — but ONLY when it's also in the user's seed list or reachable from
    // the seed. Here, since there's no link, Buyer should NOT appear in
    // the variants of ABC Corporation. It only appears if the user clicked
    // on the Buyer separately.
    const text =
      "ABC Corporation signed the deal. The Buyer will review the terms.";
    const group = propagateVariants("ABC Corporation", text, []);
    // No link → Buyer is NOT in ABC Corporation's variants
    const definedTexts = group.defined.map((c) => c.text);
    expect(definedTexts).not.toContain("the Buyer");
  });

  it("tags a linked generic-role alias as defined (not literal)", () => {
    const text =
      '"Buyer" means ABC Corporation. ABC Corporation signed. The Buyer reviewed.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("ABC Corporation", text, clauses);
    const buyerEntry = group.defined.find((c) => c.text === "Buyer");
    expect(buyerEntry).toBeDefined();
    expect(buyerEntry?.kind).toBe("defined");
    // And it should NOT appear in literals
    expect(group.literals.map((c) => c.text)).not.toContain("Buyer");
  });

  it("tags a proper-noun alias from a clause as literal", () => {
    const text =
      '"Purchaser" means Big Bank Holdings. Big Bank Holdings has approved.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("Big Bank Holdings", text, clauses);
    // Purchaser is a generic role → defined
    const definedTexts = group.defined.map((c) => c.text);
    expect(definedTexts).toContain("Purchaser");
    // Big Bank Holdings is the seed itself → literal
    expect(group.literals.map((c) => c.text)).toContain("Big Bank Holdings");
  });
});

describe("buildRedactionTargets — D9 default behavior", () => {
  it("includes only literal variants by default (defined excluded)", () => {
    const text =
      '"Discloser" means ABC Corporation. ABC Corporation signed. ABC Corp later. The Discloser reviewed.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("ABC Corporation", text, clauses);
    const targets = buildRedactionTargets([group]);
    // Literals in
    expect(targets).toContain("ABC Corporation");
    expect(targets).toContain("ABC Corp");
    // Defined out
    expect(targets).not.toContain("Discloser");
    expect(targets).not.toContain("the Discloser");
  });

  it("includes defined terms when explicitly opted in", () => {
    const text =
      '"Discloser" means ABC Corporation. ABC Corporation signed. The Discloser reviewed.';
    const clauses = parseDefinitionClauses(text);
    const group = propagateVariants("ABC Corporation", text, clauses);
    const targets = buildRedactionTargets([group], {
      includeDefined: new Set(["Discloser"]),
    });
    expect(targets).toContain("Discloser");
  });

  it("dedupes across multiple seed groups", () => {
    // Both ABC and Sunrise share the defined term "Party" via clauses
    const text =
      '"Party" means ABC Corporation. ABC Corporation signed. Sunrise Ventures LLC agreed.';
    const clauses = parseDefinitionClauses(text);
    const g1 = propagateVariants("ABC Corporation", text, clauses);
    const g2 = propagateVariants("Sunrise Ventures LLC", text, clauses);
    const targets = buildRedactionTargets([g1, g2]);
    // ABC and Sunrise in targets
    expect(targets).toContain("ABC Corporation");
    expect(targets).toContain("Sunrise Ventures LLC");
    // No duplicates
    expect(targets.length).toBe(new Set(targets).size);
  });

  it("returns an empty array when no groups have any literals", () => {
    const group: VariantGroup = {
      seed: "ABC Corporation",
      literals: [],
      defined: [],
    };
    expect(buildRedactionTargets([group])).toEqual([]);
  });

  it("sorts targets longest-first for correct greedy matching", () => {
    // The redactor's longest-first rule: "ABC Corporation" must come before
    // "ABC Corp" so that the regex tries the longer match first.
    const text =
      "ABC Corporation signed. ABC Corp did the deal. ABC alone also.";
    const group = propagateVariants("ABC Corporation", text, []);
    const targets = buildRedactionTargets([group]);
    // Longest first
    for (let i = 0; i < targets.length - 1; i++) {
      expect(targets[i]!.length).toBeGreaterThanOrEqual(
        targets[i + 1]!.length,
      );
    }
  });
});

describe("propagateVariants — edge cases", () => {
  it("handles an empty text corpus", () => {
    const group = propagateVariants("ABC Corporation", "", []);
    expect(group.literals).toEqual([]);
    expect(group.defined).toEqual([]);
  });

  it("handles a seed that is itself a defined term (edge case — user fault)", () => {
    // If the user somehow seeds with a generic role word, we respect that
    // seed as literal (fail-closed rule: err on the side of redacting).
    // The seed is case-sensitive because that's what the redactor expects.
    const text = "the Buyer reviewed the terms. the Buyer signed.";
    const group = propagateVariants("the Buyer", text, []);
    expect(group.literals.map((c) => c.text)).toContain("the Buyer");
  });
});
