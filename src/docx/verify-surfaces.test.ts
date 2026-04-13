import { describe, expect, it } from "vitest";

// @ts-expect-error Phase 8 red test: helper lands in implementation step 9.
import {
  extractFldSimpleInstrValues,
  extractInstrTexts,
  extractRelationshipTargets,
} from "./verify-surfaces.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

describe("verify-surfaces", () => {
  it("extracts instrText bodies", () => {
    const xml = `<w:document ${W_NS}><w:body><w:p><w:r><w:instrText xml:space="preserve">HYPERLINK "mailto:legal@example.com"</w:instrText></w:r></w:p></w:body></w:document>`;

    expect(extractInstrTexts(xml)).toEqual([
      `HYPERLINK "mailto:legal@example.com"`,
    ]);
  });

  it("extracts fldSimple instruction attribute values", () => {
    const xml = `<w:document ${W_NS}><w:body><w:p><w:fldSimple w:instr="HYPERLINK &quot;mailto:ceo@example.com&quot;"><w:r><w:t>CEO</w:t></w:r></w:fldSimple></w:p></w:body></w:document>`;

    expect(extractFldSimpleInstrValues(xml)).toEqual([
      `HYPERLINK &quot;mailto:ceo@example.com&quot;`,
    ]);
  });

  it("extracts relationship Target values in document order", () => {
    const rels = `<?xml version="1.0"?><Relationships xmlns="x"><Relationship Id="rId1" Target="mailto:first@example.com"/><Relationship Id="rId2" Target="https://example.com/second"/></Relationships>`;

    expect(extractRelationshipTargets(rels)).toEqual([
      "mailto:first@example.com",
      "https://example.com/second",
    ]);
  });
});
