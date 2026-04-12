import { describe, expect, it } from "vitest";

import type { StructuralDefinition } from "../../_framework/types.js";

import { HEADER_BLOCK } from "./header-block.js";

function parseOne(text: string): readonly StructuralDefinition[] {
  return HEADER_BLOCK.parse(text);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void parseOne(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("structural.header-block", () => {
  it.each([
    [
      "extracts English AGREEMENT titles",
      "NON-DISCLOSURE AGREEMENT\n\nThis Agreement follows.",
      [
        {
          label: "document-title",
          referent: "NON-DISCLOSURE AGREEMENT",
          source: "definition-section",
        },
      ],
    ],
    [
      "extracts English CONTRACT titles",
      "MASTER SERVICES CONTRACT\n\nBody text.",
      [
        {
          label: "document-title",
          referent: "MASTER SERVICES CONTRACT",
          source: "definition-section",
        },
      ],
    ],
    [
      "extracts Korean 계약서 titles",
      "비밀유지계약서\n본 계약은 다음과 같다.",
      [
        {
          label: "document-title",
          referent: "비밀유지계약서",
          source: "definition-section",
        },
      ],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it.each([
    [
      "extracts English MOU titles",
      "STRATEGIC PARTNERSHIP MOU\nAdditional body text.",
      [
        {
          label: "document-title",
          referent: "STRATEGIC PARTNERSHIP MOU",
          source: "definition-section",
        },
      ],
    ],
    [
      "extracts Korean 합의서 titles",
      "영업협력합의서\n본문.",
      [
        {
          label: "document-title",
          referent: "영업협력합의서",
          source: "definition-section",
        },
      ],
    ],
    [
      "extracts both English and Korean titles when both appear in the header",
      "NON-DISCLOSURE AGREEMENT\n비밀유지계약서\nBody.",
      [
        {
          label: "document-title",
          referent: "NON-DISCLOSURE AGREEMENT",
          source: "definition-section",
        },
        {
          label: "document-title",
          referent: "비밀유지계약서",
          source: "definition-section",
        },
      ],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it("matches titles fully contained inside the first 500 characters", () => {
    const phrase = "NON-DISCLOSURE AGREEMENT";
    const text = `${" ".repeat(500 - phrase.length)}${phrase}${"y".repeat(50)}`;
    expect(parseOne(text)).toEqual([
      {
        label: "document-title",
        referent: "NON-DISCLOSURE AGREEMENT",
        source: "definition-section",
      },
    ]);
  });

  it("rejects titles that begin at character 500", () => {
    const phrase = "NON-DISCLOSURE AGREEMENT";
    const text = `${" ".repeat(500)}${phrase}`;
    expect(parseOne(text)).toEqual([]);
  });

  it("rejects titles that start one character before the scan boundary and are truncated", () => {
    const phrase = "NON-DISCLOSURE AGREEMENT";
    const text = `${" ".repeat(499)}${phrase}`;
    expect(parseOne(text)).toEqual([]);
  });

  it.each([
    ["rejects empty text", ""],
    ["rejects non-all-caps English prose", "This Agreement is effective as of today."],
    ["rejects Korean prose without a title suffix", "계약이 체결되었다."],
  ])("%s", (_name, text) => {
    expect(parseOne(text)).toEqual([]);
  });

  it("emits definition-section source for extracted titles", () => {
    const result = parseOne("NON-DISCLOSURE AGREEMENT\n\nThis Agreement follows.");
    expect(result).toEqual([
      {
        label: "document-title",
        referent: "NON-DISCLOSURE AGREEMENT",
        source: "definition-section",
      },
    ]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`${"A".repeat(10000)} AGREEMENT`);
  });
});
