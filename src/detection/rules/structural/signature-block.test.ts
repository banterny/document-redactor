import { describe, expect, it } from "vitest";

import type { StructuralDefinition } from "../../_framework/types.js";

import { SIGNATURE_BLOCK } from "./signature-block.js";

function parseOne(text: string): readonly StructuralDefinition[] {
  return SIGNATURE_BLOCK.parse(text);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void parseOne(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("structural.signature-block", () => {
  it.each([
    [
      "extracts English name and title pairs from the signature tail",
      `${"x".repeat(220)}\nName: John Smith;\nTitle: CEO;`,
      [
        { label: "Signatory", referent: "John Smith", source: "party-declaration" },
        { label: "Title", referent: "CEO", source: "party-declaration" },
      ],
    ],
    [
      "extracts Korean title-name pairs from the signature tail",
      `${"x".repeat(220)}\n대표이사 김철수 (서명)`,
      [{ label: "대표이사", referent: "김철수", source: "party-declaration" }],
    ],
    [
      "extracts Korean 이름 labels from the signature tail",
      `${"x".repeat(220)}\n이름: 박영희`,
      [{ label: "이름", referent: "박영희", source: "party-declaration" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it.each([
    [
      "extracts long English titles",
      `${"x".repeat(220)}\nTitle: Chief Executive Officer.`,
      [{ label: "Title", referent: "Chief Executive Officer.", source: "party-declaration" }],
    ],
    [
      "extracts three-word English names",
      `${"x".repeat(220)}\nName: John Paul Smith`,
      [{ label: "Signatory", referent: "John Paul Smith", source: "party-declaration" }],
    ],
    [
      "extracts alternate Korean titles",
      `${"x".repeat(220)}\n본부장 김민수`,
      [{ label: "본부장", referent: "김민수", source: "party-declaration" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it("ignores signature-shaped content outside the last 20% of the document", () => {
    const text = `${"x".repeat(40)}Name: John Smith${"y".repeat(300)}`;
    expect(parseOne(text)).toEqual([]);
  });

  it("matches a signature that begins exactly at the tail boundary", () => {
    const phrase = "Name: John Smith;";
    const text = `${"x".repeat(400)}${phrase}${"y".repeat(83)}`;
    expect(parseOne(text)).toEqual([
      { label: "Signatory", referent: "John Smith", source: "party-declaration" },
    ]);
  });

  it("rejects a signature that begins one character before the tail boundary", () => {
    const phrase = "Name: John Smith;";
    const text = `${"x".repeat(399)}${phrase}${"y".repeat(84)}`;
    expect(parseOne(text)).toEqual([]);
  });

  it.each([
    ["rejects short texts below the scan threshold", `${"x".repeat(180)}\nName: John Smith`],
    ["rejects lowercase English names", `${"x".repeat(220)}\nName: john smith`],
    ["rejects documents without signature markers", `${"x".repeat(350)}\nThis paragraph only discusses signatures conceptually.`],
  ])("%s", (_name, text) => {
    expect(parseOne(text)).toEqual([]);
  });

  it("emits party-declaration source for every extracted definition", () => {
    const result = parseOne(`${"x".repeat(220)}\nName: John Smith;\nTitle: CEO;`);
    expect(result).not.toHaveLength(0);
    for (const definition of result) {
      expect(definition.source).toBe("party-declaration");
    }
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`${"x".repeat(9000)}Name: ${"A".repeat(1000)}`);
  });
});
