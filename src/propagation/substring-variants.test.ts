import { describe, it, expect } from "vitest";

import {
  findSubstringVariants,
  countWordBoundedOccurrences,
} from "./substring-variants.js";

describe("findSubstringVariants — prefix shortening", () => {
  it("finds the shorter 2-word form when it appears in text", () => {
    const text =
      "Sunrise Ventures LLC is a VC firm. Earlier in the doc, Sunrise Ventures signed.";
    const out = findSubstringVariants("Sunrise Ventures LLC", text);
    expect(out).toContain("Sunrise Ventures");
  });

  it("finds the bare first-word form when it appears standalone", () => {
    // "Sunrise" appears on its own in the text — should be surfaced
    const text =
      "Sunrise Ventures LLC is a VC firm. Sunrise reviewed the NDA.";
    const out = findSubstringVariants("Sunrise Ventures LLC", text);
    expect(out).toContain("Sunrise");
  });

  it("does NOT include the first-word form when it never appears alone", () => {
    // "Sunrise" only appears as part of "Sunrise Ventures LLC" → not standalone
    const text =
      "Sunrise Ventures LLC is a VC firm. Earlier in the doc, Sunrise Ventures LLC signed.";
    const out = findSubstringVariants("Sunrise Ventures LLC", text);
    expect(out).not.toContain("Sunrise");
  });

  it("finds 'ABC Corp' abbreviation when it appears in text", () => {
    const text =
      "ABC Corporation is a Korean company. See also ABC Corp in the footnote.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).toContain("ABC Corp");
  });

  it("finds 'ABC Inc' variant when it appears in text", () => {
    const text = "ABC Corporation signed the deal. ABC Inc later ratified.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).toContain("ABC Inc");
  });

  it("finds 'ABC' bare token when it appears standalone", () => {
    const text =
      "ABC Corporation is the party. ABC, acting through its counsel, agreed.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).toContain("ABC");
  });

  it("does not include the seed itself in the variants (seed is the input)", () => {
    const text = "ABC Corporation is the party. ABC Corp did the deal.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).not.toContain("ABC Corporation");
  });

  it("returns empty for a single-word seed (nothing to shorten)", () => {
    const text = "김철수 said yes. 김철수 signed.";
    const out = findSubstringVariants("김철수", text);
    expect(out).toEqual([]);
  });

  it("returns empty when no variants appear in text", () => {
    const text = "Totally unrelated prose with no company names at all.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).toEqual([]);
  });

  it("dedupes when the same variant is reachable via multiple shortenings", () => {
    const text =
      "Sunrise Ventures LLC did the deal. Sunrise agreed to the terms.";
    const out = findSubstringVariants("Sunrise Ventures LLC", text);
    // "Sunrise" reachable via both 1-word shortening and Sunrise Ventures (2-word)
    expect(out.filter((v) => v === "Sunrise")).toHaveLength(1);
  });

  it("handles a Korean entity like ABC 주식회사", () => {
    const text = "ABC 주식회사는 한국 회사이다. ABC가 계약을 체결했다.";
    const out = findSubstringVariants("ABC 주식회사", text);
    expect(out).toContain("ABC");
  });
});

describe("findSubstringVariants — word boundary safety", () => {
  it("rejects 'ABC' when it only appears inside 'ABC123' (digit suffix)", () => {
    const text = "ABC Corporation signed. Reference: ABC123 is the code.";
    const out = findSubstringVariants("ABC Corporation", text);
    // "ABC" must NOT be surfaced because every occurrence is inside ABC123
    // (the ABC in 'ABC Corporation' counts as attached to ' Corporation').
    expect(out).not.toContain("ABC");
  });

  it("rejects 'ABC' when it only appears inside 'XABC' (letter prefix)", () => {
    const text = "ABC Corporation signed. XABC code.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).not.toContain("ABC");
  });

  it("accepts 'ABC' when at least one occurrence is word-bounded", () => {
    const text =
      "ABC Corporation signed. Reference: ABC123 is the code. Then ABC agreed.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).toContain("ABC"); // the "Then ABC agreed" occurrence
  });

  it("treats punctuation as a boundary", () => {
    const text = "ABC Corporation signed, and ABC, Inc. later added.";
    const out = findSubstringVariants("ABC Corporation", text);
    // "ABC" is word-bounded in "ABC, Inc." (comma is boundary)
    expect(out).toContain("ABC");
  });

  it("treats start-of-string as a boundary", () => {
    const text = "ABC said yes. ABC Corporation is the party.";
    const out = findSubstringVariants("ABC Corporation", text);
    expect(out).toContain("ABC");
  });
});

describe("countWordBoundedOccurrences", () => {
  it("counts standalone occurrences", () => {
    expect(countWordBoundedOccurrences("ABC is here. ABC again.", "ABC")).toBe(
      2,
    );
  });

  it("does not count substring occurrences inside longer alphanumeric runs", () => {
    expect(countWordBoundedOccurrences("ABC123 is here. XABC.", "ABC")).toBe(0);
  });

  it("counts punctuation-bounded occurrences", () => {
    expect(countWordBoundedOccurrences("(ABC) says ABC, right?", "ABC")).toBe(
      2,
    );
  });

  it("returns 0 for empty needle", () => {
    expect(countWordBoundedOccurrences("ABC here", "")).toBe(0);
  });

  it("treats CJK-attached particles as a boundary (redactor-friendly)", () => {
    // Korean particles (은/는/이/가/을/를/의/...) attach directly to nouns
    // without a space. For redaction purposes, '김철수는' is still a valid
    // match for the name '김철수' — replacing it yields '[REDACTED]는' which
    // is what the user wants. The rule: boundary checks only apply WITHIN
    // Latin script (to catch ABC inside ABC123); cross-script transitions
    // and CJK-to-CJK transitions are always boundaries.
    expect(
      countWordBoundedOccurrences(
        "김철수는 말했다. 김철수, 오늘 회의. 이영희.",
        "김철수",
      ),
    ).toBe(2);
  });

  it("applies boundary only within Latin script (ABC inside ABC123 is blocked)", () => {
    // The specific case the boundary heuristic exists for: Latin substring
    // inside a longer Latin token. Still rejected.
    expect(countWordBoundedOccurrences("ABC123 ABC456", "ABC")).toBe(0);
    expect(countWordBoundedOccurrences("ABC123 and ABC", "ABC")).toBe(1);
  });
});
