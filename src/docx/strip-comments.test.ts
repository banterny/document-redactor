import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import {
  dropCommentsPart,
  hasCommentReferences,
  stripCommentReferences,
} from "./strip-comments.js";

describe("dropCommentsPart", () => {
  it("removes word/comments.xml from the zip", async () => {
    const zip = new JSZip();
    zip.file("word/comments.xml", "<w:comments/>");
    zip.file("word/document.xml", "<w:document/>");

    dropCommentsPart(zip);

    expect(zip.file("word/comments.xml")).toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
  });

  it("also removes adjacent comment companion parts", async () => {
    const zip = new JSZip();
    zip.file("word/comments.xml", "x");
    zip.file("word/commentsExtended.xml", "x");
    zip.file("word/commentsExtensible.xml", "x");
    zip.file("word/commentsIds.xml", "x");
    zip.file("word/people.xml", "x");
    zip.file("word/document.xml", "x");

    dropCommentsPart(zip);

    expect(zip.file("word/comments.xml")).toBeNull();
    expect(zip.file("word/commentsExtended.xml")).toBeNull();
    expect(zip.file("word/commentsExtensible.xml")).toBeNull();
    expect(zip.file("word/commentsIds.xml")).toBeNull();
    expect(zip.file("word/people.xml")).toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
  });

  it("is idempotent (running twice is safe)", async () => {
    const zip = new JSZip();
    zip.file("word/comments.xml", "x");
    dropCommentsPart(zip);
    dropCommentsPart(zip);
    expect(zip.file("word/comments.xml")).toBeNull();
  });
});

describe("stripCommentReferences", () => {
  it("strips commentRangeStart, commentRangeEnd, and commentReference", () => {
    const xml =
      `<w:p>` +
      `<w:commentRangeStart w:id="1"/>` +
      `<w:r><w:t>commented text</w:t></w:r>` +
      `<w:commentRangeEnd w:id="1"/>` +
      `<w:r><w:commentReference w:id="1"/></w:r>` +
      `</w:p>`;
    const out = stripCommentReferences(xml);
    expect(out).not.toContain("commentRangeStart");
    expect(out).not.toContain("commentRangeEnd");
    expect(out).not.toContain("commentReference");
    expect(out).toContain("commented text");
  });

  it("preserves the actual text inside the commented range", () => {
    const xml =
      `<w:commentRangeStart w:id="1"/>` +
      `<w:r><w:t>SECRET DATA</w:t></w:r>` +
      `<w:commentRangeEnd w:id="1"/>` +
      `<w:r><w:commentReference w:id="1"/></w:r>`;
    const out = stripCommentReferences(xml);
    expect(out).toContain("SECRET DATA");
  });

  it("is a no-op when no comment markers exist", () => {
    const xml = `<w:p><w:r><w:t>plain</w:t></w:r></w:p>`;
    expect(stripCommentReferences(xml)).toBe(xml);
  });

  it("is idempotent", () => {
    const xml = `<w:commentRangeStart w:id="1"/>plain<w:commentRangeEnd w:id="1"/>`;
    const once = stripCommentReferences(xml);
    const twice = stripCommentReferences(once);
    expect(twice).toBe(once);
  });

  it("handles attributes in any order on the markers", () => {
    const xml = `<w:commentReference w:displacedByCustomXml="next" w:id="42" />`;
    expect(stripCommentReferences(xml)).toBe("");
  });
});

describe("hasCommentReferences", () => {
  it("detects each marker type", () => {
    expect(hasCommentReferences(`<w:commentRangeStart w:id="1"/>`)).toBe(true);
    expect(hasCommentReferences(`<w:commentRangeEnd w:id="1"/>`)).toBe(true);
    expect(hasCommentReferences(`<w:commentReference w:id="1"/>`)).toBe(true);
  });

  it("returns false on plain XML", () => {
    expect(hasCommentReferences(`<w:p><w:r><w:t>x</w:t></w:r></w:p>`)).toBe(
      false,
    );
  });
});
