import { describe, it, expect } from "vitest";

import { parseDefinitionClauses } from "./definition-clauses.js";

describe("parseDefinitionClauses — English 'X means Y' form", () => {
  it("parses a bare means clause", () => {
    const out = parseDefinitionClauses(
      '"Discloser" means ABC Corporation.',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      defined: "Discloser",
      literal: "ABC Corporation",
      source: "english-means",
    });
  });

  it("parses a means clause with trailing qualifier after a comma", () => {
    // D9 fixture form: the literal ends at the first comma so trailing
    // qualifiers like "including its affiliates" don't pollute it.
    const out = parseDefinitionClauses(
      '"Discloser" means ABC Corporation, including its affiliates.',
    );
    expect(out[0]?.literal).toBe("ABC Corporation");
    expect(out[0]?.defined).toBe("Discloser");
  });

  it("parses a means clause with smart quotes", () => {
    const out = parseDefinitionClauses(
      "\u201CDiscloser\u201D means ABC Corporation.",
    );
    expect(out[0]?.defined).toBe("Discloser");
    expect(out[0]?.literal).toBe("ABC Corporation");
  });

  it("parses multiple means clauses in one document", () => {
    const text =
      '"Discloser" means ABC Corporation. "Recipient" means Sunrise Ventures LLC.';
    const out = parseDefinitionClauses(text);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.defined)).toEqual(["Discloser", "Recipient"]);
    expect(out.map((c) => c.literal)).toEqual([
      "ABC Corporation",
      "Sunrise Ventures LLC",
    ]);
  });

  it("ignores quoted phrases that are not followed by 'means'", () => {
    const out = parseDefinitionClauses(
      '"Project Falcon" is the codename for the acquisition.',
    );
    expect(out).toEqual([]);
  });

  it("handles the 'shall mean' variant", () => {
    const out = parseDefinitionClauses(
      '"Buyer" shall mean ABC Corporation.',
    );
    expect(out[0]?.defined).toBe("Buyer");
    expect(out[0]?.literal).toBe("ABC Corporation");
  });
});

describe("parseDefinitionClauses — Korean '이라 함은 Y' form", () => {
  it("parses the canonical Korean definition form", () => {
    const out = parseDefinitionClauses(
      '"매수인"이라 함은 ABC 주식회사를 말한다.',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      defined: "매수인",
      literal: "ABC 주식회사",
      source: "korean-이라-함은",
    });
  });

  it("accepts the slightly different spacing 이라 함은", () => {
    const out = parseDefinitionClauses(
      '"매도인" 이라 함은 Sunrise Ventures를 말한다.',
    );
    expect(out[0]?.defined).toBe("매도인");
    expect(out[0]?.literal).toBe("Sunrise Ventures");
  });

  it("accepts smart quote variants around the defined term", () => {
    const out = parseDefinitionClauses(
      "\u201C매수인\u201D이라 함은 ABC 주식회사를 말한다.",
    );
    expect(out[0]?.defined).toBe("매수인");
    expect(out[0]?.literal).toBe("ABC 주식회사");
  });

  it("accepts the variant '란' instead of '이라 함은'", () => {
    const out = parseDefinitionClauses('"매수인"이란 ABC 주식회사를 말한다.');
    expect(out[0]?.defined).toBe("매수인");
    expect(out[0]?.literal).toBe("ABC 주식회사");
  });

  it("parses multiple Korean clauses in one document", () => {
    const text =
      '"매수인"이라 함은 ABC 주식회사를 말한다. "매도인"이라 함은 Sunrise Ventures를 말한다.';
    const out = parseDefinitionClauses(text);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.defined)).toEqual(["매수인", "매도인"]);
  });
});

describe("parseDefinitionClauses — mixed English + Korean", () => {
  it("parses both forms in the same document", () => {
    const text =
      '"Discloser" means ABC Corporation. "매수인"이라 함은 ABC 주식회사를 말한다.';
    const out = parseDefinitionClauses(text);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.source).sort()).toEqual([
      "english-means",
      "korean-이라-함은",
    ]);
  });
});

describe("parseDefinitionClauses — robustness", () => {
  it("returns an empty array for empty input", () => {
    expect(parseDefinitionClauses("")).toEqual([]);
  });

  it("returns an empty array for text with no definition clauses", () => {
    expect(
      parseDefinitionClauses("This is just regular prose with no clauses."),
    ).toEqual([]);
  });

  it("does not match incomplete clauses (quote without means)", () => {
    expect(parseDefinitionClauses('"Buyer" blah blah')).toEqual([]);
  });

  it("trims leading/trailing whitespace from captured literals", () => {
    const out = parseDefinitionClauses('"Buyer" means   ABC Corporation   .');
    expect(out[0]?.literal).toBe("ABC Corporation");
  });

  it("does not match an unterminated quoted defined term", () => {
    expect(parseDefinitionClauses('"Buyer means ABC Corporation.')).toEqual(
      [],
    );
  });

  it("preserves the order of appearance", () => {
    const text =
      '"Recipient" means Sunrise Ventures. "Discloser" means ABC Corporation.';
    const out = parseDefinitionClauses(text);
    expect(out[0]?.defined).toBe("Recipient");
    expect(out[1]?.defined).toBe("Discloser");
  });
});
