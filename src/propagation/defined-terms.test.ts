import { describe, it, expect } from "vitest";

import { GENERIC_ROLE_WORDS, isDefinedTerm } from "./defined-terms.js";

describe("GENERIC_ROLE_WORDS", () => {
  it("contains every canonical English role word from D9", () => {
    for (const w of [
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
    ]) {
      expect(GENERIC_ROLE_WORDS).toContain(w);
    }
  });

  it("contains every canonical Korean role word from D9", () => {
    for (const w of [
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
    ]) {
      expect(GENERIC_ROLE_WORDS).toContain(w);
    }
  });

  it("contains the 한자 single-character party markers", () => {
    expect(GENERIC_ROLE_WORDS).toContain("甲");
    expect(GENERIC_ROLE_WORDS).toContain("乙");
  });

  it("has no duplicates", () => {
    const set = new Set(GENERIC_ROLE_WORDS);
    expect(set.size).toBe(GENERIC_ROLE_WORDS.length);
  });
});

describe("isDefinedTerm", () => {
  it("returns true for bare English role words", () => {
    expect(isDefinedTerm("Buyer")).toBe(true);
    expect(isDefinedTerm("Seller")).toBe(true);
    expect(isDefinedTerm("Discloser")).toBe(true);
    expect(isDefinedTerm("Recipient")).toBe(true);
  });

  it("returns true for bare Korean role words", () => {
    expect(isDefinedTerm("매수인")).toBe(true);
    expect(isDefinedTerm("매도인")).toBe(true);
    expect(isDefinedTerm("갑")).toBe(true);
    expect(isDefinedTerm("을")).toBe(true);
  });

  it("returns true for the 한자 party markers", () => {
    expect(isDefinedTerm("甲")).toBe(true);
    expect(isDefinedTerm("乙")).toBe(true);
  });

  it("returns true for the 'the X' English convention", () => {
    expect(isDefinedTerm("the Buyer")).toBe(true);
    expect(isDefinedTerm("the Discloser")).toBe(true);
    expect(isDefinedTerm("the Recipient")).toBe(true);
  });

  it("returns true for the 'The X' sentence-start form", () => {
    expect(isDefinedTerm("The Buyer")).toBe(true);
    expect(isDefinedTerm("The Company")).toBe(true);
  });

  it("returns false for proper nouns (real entity names)", () => {
    expect(isDefinedTerm("ABC Corporation")).toBe(false);
    expect(isDefinedTerm("Sunrise Ventures")).toBe(false);
    expect(isDefinedTerm("ABC 주식회사")).toBe(false);
    expect(isDefinedTerm("김철수")).toBe(false);
    expect(isDefinedTerm("Project Falcon")).toBe(false);
  });

  it("returns false for substrings that merely contain a role word", () => {
    // 'ABC Company' contains 'Company' but is not itself a defined term
    expect(isDefinedTerm("ABC Company")).toBe(false);
    // '매수인은' has '매수인' + particle — not an exact match
    expect(isDefinedTerm("매수인은")).toBe(false);
    // '갑자기' starts with '갑' but is an adverb, not a party marker
    expect(isDefinedTerm("갑자기")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDefinedTerm("")).toBe(false);
  });

  it("is case-sensitive on the role word itself", () => {
    // Lowercase 'buyer' is not the canonical contract form
    expect(isDefinedTerm("buyer")).toBe(false);
    expect(isDefinedTerm("BUYER")).toBe(false);
  });

  it("rejects trailing whitespace / punctuation", () => {
    expect(isDefinedTerm("Buyer ")).toBe(false);
    expect(isDefinedTerm("Buyer,")).toBe(false);
  });
});
