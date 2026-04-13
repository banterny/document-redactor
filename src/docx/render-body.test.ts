import { readFileSync } from "node:fs";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { renderDocumentBody } from "./render-body.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

function bodyWithXml(inner: string): string {
  return `<w:document ${W_NS}><w:body>${inner}</w:body></w:document>`;
}

function paragraphsXml(...paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`)
    .join("");
}

async function loadFixtureZip(): Promise<JSZip> {
  const bytes = readFileSync("tests/fixtures/bilingual_nda_worst_case.docx");
  return await JSZip.loadAsync(bytes);
}

describe("renderDocumentBody", () => {
  it("returns a RenderedDocument with scopes in listScopes order", async () => {
    const zip = await loadFixtureZip();
    const doc = await renderDocumentBody(zip);

    expect(doc.scopes.length).toBeGreaterThan(0);
    expect(doc.scopes[0]?.scope.kind).toBe("body");
  });

  it("preserves scope entries even when a scope has zero paragraphs", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWithXml(paragraphsXml("body")));
    zip.file("word/header1.xml", `<w:hdr ${W_NS}></w:hdr>`);

    const doc = await renderDocumentBody(zip);
    const header = doc.scopes.find((scope) => scope.scope.kind === "header");

    expect(header).toBeDefined();
    expect(header?.paragraphs).toEqual([]);
  });

  it("assigns scopeIndex to match each paragraph position within its scope", async () => {
    const zip = await loadFixtureZip();
    const doc = await renderDocumentBody(zip);

    for (const scope of doc.scopes) {
      expect(scope.paragraphs.map((paragraph) => paragraph.scopeIndex)).toEqual(
        scope.paragraphs.map((_paragraph, index) => index),
      );
    }
  });

  it("renders body text from the worst-case fixture", async () => {
    const zip = await loadFixtureZip();
    const doc = await renderDocumentBody(zip);
    const body = doc.scopes.find((scope) => scope.scope.kind === "body");

    expect(body).toBeDefined();
    expect(body?.paragraphs.map((paragraph) => paragraph.text).join("\n")).toContain(
      "ABC Corporation",
    );
  });

  it("preserves Korean text from the worst-case fixture", async () => {
    const zip = await loadFixtureZip();
    const doc = await renderDocumentBody(zip);
    const body = doc.scopes.find((scope) => scope.scope.kind === "body");

    expect(body?.paragraphs.some((paragraph) => /[\uAC00-\uD7A3]/.test(paragraph.text))).toBe(
      true,
    );
  });

  it("preserves empty paragraphs as empty strings instead of skipping them", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWithXml(`<w:p/><w:p><w:r><w:t>hello</w:t></w:r></w:p>`),
    );

    const doc = await renderDocumentBody(zip);
    const body = doc.scopes.find((scope) => scope.scope.kind === "body");

    expect(body?.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      "",
      "hello",
    ]);
  });

  it("flattens table cell paragraphs into the ordinary paragraph flow", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWithXml(
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
      ),
    );

    const doc = await renderDocumentBody(zip);
    const body = doc.scopes.find((scope) => scope.scope.kind === "body");

    expect(body?.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      "cell A",
      "cell B",
    ]);
  });

  it("coalesces runs split across formatting boundaries", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWithXml(
        `<w:p><w:r><w:t>ABC Corpo</w:t></w:r><w:r><w:t>ration</w:t></w:r></w:p>`,
      ),
    );

    const doc = await renderDocumentBody(zip);
    const body = doc.scopes.find((scope) => scope.scope.kind === "body");

    expect(body?.paragraphs[0]?.text).toBe("ABC Corporation");
  });

  it("orders headers and footers numerically after singleton scopes", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWithXml(paragraphsXml("body")));
    zip.file("word/comments.xml", `<w:comments ${W_NS}></w:comments>`);
    zip.file("word/header10.xml", `<w:hdr ${W_NS}>${paragraphsXml("h10")}</w:hdr>`);
    zip.file("word/header2.xml", `<w:hdr ${W_NS}>${paragraphsXml("h2")}</w:hdr>`);
    zip.file("word/footer10.xml", `<w:ftr ${W_NS}>${paragraphsXml("f10")}</w:ftr>`);
    zip.file("word/footer1.xml", `<w:ftr ${W_NS}>${paragraphsXml("f1")}</w:ftr>`);

    const doc = await renderDocumentBody(zip);

    expect(doc.scopes.map((scope) => scope.scope.path)).toEqual([
      "word/document.xml",
      "word/comments.xml",
      "word/header2.xml",
      "word/header10.xml",
      "word/footer1.xml",
      "word/footer10.xml",
    ]);
  });

  it("produces deterministic output for the same input zip", async () => {
    const zip = await loadFixtureZip();

    const first = await renderDocumentBody(zip);
    const second = await renderDocumentBody(zip);

    expect(first).toEqual(second);
  });

  it("completes within 1000ms on the worst-case fixture (perf budget)", async () => {
    const zip = await loadFixtureZip();

    const start = Date.now();
    await renderDocumentBody(zip);

    expect(Date.now() - start).toBeLessThan(1000);
  });
});
