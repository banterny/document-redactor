import { describe, expect, it } from "vitest";

import type { StructuralDefinition } from "../../_framework/types.js";

import { RECITALS } from "./recitals.js";

function parseOne(text: string): readonly StructuralDefinition[] {
  return RECITALS.parse(text);
}

function expectFast(input: string, budgetMs = 100): void {
  const start = performance.now();
  void parseOne(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(budgetMs);
}

describe("structural.recitals", () => {
  it.each([
    [
      "extracts English WHEREAS recital entities",
      "WHEREAS, ABC Corporation is engaged in manufacturing;",
      [{ label: "", referent: "ABC Corporation", source: "recitals" }],
    ],
    [
      "extracts multiple English WHEREAS recital entities",
      "WHEREAS, ABC Corporation is engaged in manufacturing; WHEREAS, XYZ Inc. is a distributor;",
      [
        { label: "", referent: "ABC Corporation", source: "recitals" },
        { label: "", referent: "XYZ Inc.", source: "recitals" },
      ],
    ],
    [
      "extracts Korean 전문 recital entities",
      "전문\n본 계약은 삼성 주식회사와 협력 관계에 관한 것이다.",
      [{ label: "", referent: "삼성 주식회사", source: "recitals" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it.each([
    [
      "extracts Korean 배경 recital entities",
      "배경\n본 거래는 삼성 주식회사와 협력 관계를 전제로 한다.",
      [{ label: "", referent: "삼성 주식회사", source: "recitals" }],
    ],
    [
      "extracts English entities with punctuation inside the name",
      "WHEREAS, A.B.C. Holdings Inc. intends to license technology;",
      [{ label: "", referent: "A.B.C. Holdings Inc.", source: "recitals" }],
    ],
    [
      "emits empty labels for recital-only entity mentions",
      "WHEREAS, ABC Corporation is engaged in manufacturing;",
      [{ label: "", referent: "ABC Corporation", source: "recitals" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(parseOne(text)).toEqual(expected);
  });

  it("matches recitals fully contained inside the first 5000 characters", () => {
    const phrase = "WHEREAS, ABC Corporation is engaged in manufacturing;";
    const text = `${"x".repeat(4900 - phrase.length)}${phrase}${"y".repeat(200)}`;
    expect(parseOne(text)).toEqual([
      { label: "", referent: "ABC Corporation", source: "recitals" },
    ]);
  });

  it("rejects recitals that begin at character 5000", () => {
    const phrase = "WHEREAS, ABC Corporation is engaged in manufacturing;";
    const text = `${"x".repeat(5000)}${phrase}`;
    expect(parseOne(text)).toEqual([]);
  });

  it("rejects recitals that start one character before the scan boundary and are truncated", () => {
    const phrase = "WHEREAS, ABC Corporation is engaged in manufacturing;";
    const text = `${"x".repeat(4999)}${phrase}`;
    expect(parseOne(text)).toEqual([]);
  });

  it.each([
    ["rejects empty text", ""],
    ["rejects bare WHEREAS without an entity", "WHEREAS, ;"],
    ["rejects prose without recital markers", "ABC Corporation is engaged in manufacturing."],
  ])("%s", (_name, text) => {
    expect(parseOne(text)).toEqual([]);
  });

  it("is ReDoS-safe on a 10KB pathological input", () => {
    expectFast(`전문${"가".repeat(5000)}${"주식회사".repeat(1000)}`);
  });
});
