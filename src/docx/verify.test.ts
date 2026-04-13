import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import { verifyRedaction } from "./verify.js";
import type { Scope } from "./types.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

/** Build a tiny synthetic DOCX zip with the given body XML. */
async function syntheticDocx(parts: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  return zip;
}

function bodyWith(text: string): string {
  return `<w:document ${W_NS}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
}

describe("verifyRedaction", () => {
  it("returns clean for an empty target list", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("ABC Corporation"),
    });
    const result = await verifyRedaction(zip, []);
    expect(result.isClean).toBe(true);
    expect(result.survived).toEqual([]);
    expect(result.stringsTested).toBe(0);
  });

  it("returns clean when no sensitive strings are present", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED] world"),
    });
    const result = await verifyRedaction(zip, ["ABC Corporation"]);
    expect(result.isClean).toBe(true);
    expect(result.survived).toEqual([]);
  });

  it("flags a string that survived in the body", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("ABC Corporation is here"),
    });
    const result = await verifyRedaction(zip, ["ABC Corporation"]);
    expect(result.isClean).toBe(false);
    expect(result.survived).toHaveLength(1);
    expect(result.survived[0]!.text).toBe("ABC Corporation");
    expect(result.survived[0]!.count).toBe(1);
    expect(result.survived[0]!.scope.kind).toBe("body");
  });

  it("flags a string that survived in a header (the leak vector the spike documented)", async () => {
    // The spike's mock verify-fail screen shows exactly this case: "ABC Corp"
    // surviving in word/header1.xml because the redactor forgot the header scope.
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/header1.xml": `<w:hdr ${W_NS}><w:p><w:r><w:t>Confidential — ABC Corp internal</w:t></w:r></w:p></w:hdr>`,
    });
    const result = await verifyRedaction(zip, ["ABC Corp"]);
    expect(result.isClean).toBe(false);
    expect(result.survived).toHaveLength(1);
    expect(result.survived[0]!.scope.path).toBe("word/header1.xml");
  });

  it("counts multiple occurrences of the same string in the same scope", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("ABC ABC ABC and ABC again"),
    });
    const result = await verifyRedaction(zip, ["ABC"]);
    expect(result.isClean).toBe(false);
    expect(result.survived[0]!.count).toBe(4);
  });

  it("reports survivals separately per scope", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("ABC in body"),
      "word/header1.xml": `<w:hdr ${W_NS}><w:p><w:r><w:t>ABC in header</w:t></w:r></w:p></w:hdr>`,
      "word/footer1.xml": `<w:ftr ${W_NS}><w:p><w:r><w:t>ABC in footer</w:t></w:r></w:p></w:ftr>`,
    });
    const result = await verifyRedaction(zip, ["ABC"]);
    expect(result.isClean).toBe(false);
    expect(result.survived).toHaveLength(3);
    expect(result.survived.map((s) => s.scope.path).sort()).toEqual([
      "word/document.xml",
      "word/footer1.xml",
      "word/header1.xml",
    ]);
  });

  it("reports survivals separately per target string", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith(
        "ABC Corporation and Sunrise Ventures are here",
      ),
    });
    const result = await verifyRedaction(zip, [
      "ABC Corporation",
      "Sunrise Ventures",
    ]);
    expect(result.isClean).toBe(false);
    expect(result.survived).toHaveLength(2);
  });

  it("dedupes target strings", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("ABC"),
    });
    const result = await verifyRedaction(zip, ["ABC", "ABC", "ABC"]);
    expect(result.stringsTested).toBe(1);
    expect(result.survived).toHaveLength(1);
    expect(result.survived[0]!.count).toBe(1);
  });

  it("ignores empty target strings", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("hello"),
    });
    const result = await verifyRedaction(zip, ["", "ABC"]);
    expect(result.stringsTested).toBe(1);
    expect(result.isClean).toBe(true);
  });

  it("walks footnotes too", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/footnotes.xml": `<w:footnotes ${W_NS}><w:footnote><w:p><w:r><w:t>Note about ABC Corp</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    });
    const result = await verifyRedaction(zip, ["ABC Corp"]);
    expect(result.isClean).toBe(false);
    expect(result.survived[0]!.scope.kind).toBe("footnotes");
  });

  it("walks comments scope too (defensively, even though it should be dropped)", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/comments.xml": `<w:comments ${W_NS}><w:comment><w:p><w:r><w:t>kim@abc-corp.kr</w:t></w:r></w:p></w:comment></w:comments>`,
    });
    const result = await verifyRedaction(zip, ["kim@abc-corp.kr"]);
    expect(result.isClean).toBe(false);
    expect(result.survived[0]!.scope.kind).toBe("comments");
  });

  it("reports the right number of scopes checked", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("hello"),
      "word/header1.xml": `<w:hdr ${W_NS}/>`,
      "word/footer1.xml": `<w:ftr ${W_NS}/>`,
      "word/footnotes.xml": `<w:footnotes ${W_NS}/>`,
    });
    const result = await verifyRedaction(zip, ["x"]);
    expect(result.scopesChecked).toBe(4);
  });

  it("detects a survived URL in word/_rels/document.xml.rels", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="x"><Relationship Id="rId1" Type="hyperlink" Target="mailto:contact@pearlabyss.com" TargetMode="External"/></Relationships>`,
    });
    const result = await verifyRedaction(zip, ["contact@pearlabyss.com"]);
    expect(result.isClean).toBe(false);
    expect(result.survived).toHaveLength(1);
    expect((result.survived[0]!.scope as { kind: string }).kind).toBe("rels");
    expect(result.survived[0]!.scope.path).toBe("word/_rels/document.xml.rels");
  });

  it("returns clean when rels files do not contain sensitive strings", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="x"></Relationships>`,
    });
    const result = await verifyRedaction(zip, ["contact@pearlabyss.com"]);
    expect(result.isClean).toBe(true);
    expect(result.survived).toEqual([]);
  });

  it("enumerates multiple rels files in sorted path order", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/_rels/header2.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="mailto:header2@example.com"/></Relationships>`,
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="mailto:doc@example.com"/></Relationships>`,
      "word/_rels/footer1.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="mailto:footer@example.com"/></Relationships>`,
    });
    const result = await verifyRedaction(zip, [
      "header2@example.com",
      "doc@example.com",
      "footer@example.com",
    ]);
    expect(result.survived.map((entry) => entry.scope.path)).toEqual([
      "word/_rels/document.xml.rels",
      "word/_rels/footer1.xml.rels",
      "word/_rels/header2.xml.rels",
    ]);
  });

  it("scans root _rels/.rels too", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "_rels/.rels": `<?xml version="1.0"?><Relationships><Relationship Target="mailto:root@example.com"/></Relationships>`,
    });
    const result = await verifyRedaction(zip, ["root@example.com"]);
    expect(result.isClean).toBe(false);
    expect(result.survived[0]!.scope.path).toBe("_rels/.rels");
  });

  it("counts rels files in scopesChecked", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("hello"),
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships></Relationships>`,
      "_rels/.rels": `<?xml version="1.0"?><Relationships></Relationships>`,
    });
    const result = await verifyRedaction(zip, ["x"]);
    expect(result.scopesChecked).toBe(3);
  });

  it("handles Korean strings", async () => {
    const zip = await syntheticDocx({
      "word/document.xml": bodyWith("매수인은 김철수이다"),
    });
    const result = await verifyRedaction(zip, ["김철수"]);
    expect(result.isClean).toBe(false);
    expect(result.survived[0]!.text).toBe("김철수");
  });

  it("flags survivals across split <w:t> elements (the silent-leak case)", async () => {
    // This is the case the redactor's coalescer is supposed to catch.
    // Phase 8 hardens verifyRedaction so the visible-text verifier catches
    // a full string even when Word split it across multiple <w:t> runs.
    const zip = await syntheticDocx({
      "word/document.xml": `<w:document ${W_NS}><w:body><w:p><w:r><w:t>ABC Corpo</w:t></w:r><w:r><w:t>ration</w:t></w:r></w:p></w:body></w:document>`,
    });
    const targets = [
      {
        id: "auto:abc-corporation",
        displayText: "ABC Corporation",
        redactionLiterals: ["ABC Corporation"],
        verificationLiterals: ["ABC Corporation"],
        scopes: [{ kind: "body", path: "word/document.xml" } as Scope],
      },
    ];

    const result = await verifyRedaction(
      zip,
      targets as unknown as Parameters<typeof verifyRedaction>[1],
    );
    expect(result.isClean).toBe(false);
    expect(result.survived).toHaveLength(1);
    expect(result.survived[0]!.text).toBe("ABC Corporation");
    expect(result.survived[0]!.scope.path).toBe("word/document.xml");
  });
});
