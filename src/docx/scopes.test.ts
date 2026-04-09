/**
 * Tests for the scope walker.
 *
 * Uses the worst-case fixture from Gate 0 (which has body, comments, headers,
 * footers across two sections) plus a few synthetic mini-zips for the
 * edge-case ordering checks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import { listScopes, readScopeXml, scopesOfKind } from "./scopes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

async function loadFixture(): Promise<JSZip> {
  const buf = fs.readFileSync(FIXTURE);
  return JSZip.loadAsync(buf);
}

/** Build a tiny synthetic DOCX-like zip with arbitrary entries for ordering tests. */
async function syntheticZip(entries: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [p, content] of Object.entries(entries)) {
    zip.file(p, content);
  }
  return zip;
}

describe("listScopes — against the worst-case fixture", () => {
  it("finds all expected scopes in the right order", async () => {
    const zip = await loadFixture();
    const scopes = listScopes(zip);

    // The fixture has body + 2 headers + 2 footers + comments. No footnotes/endnotes.
    expect(scopes.map((s) => s.path)).toEqual([
      "word/document.xml",
      "word/comments.xml",
      "word/header1.xml",
      "word/header2.xml",
      "word/footer1.xml",
      "word/footer2.xml",
    ]);
  });

  it("tags each scope with the correct kind", async () => {
    const zip = await loadFixture();
    const scopes = listScopes(zip);

    expect(scopes.find((s) => s.path === "word/document.xml")?.kind).toBe(
      "body",
    );
    expect(scopes.find((s) => s.path === "word/comments.xml")?.kind).toBe(
      "comments",
    );
    expect(scopes.find((s) => s.path === "word/header1.xml")?.kind).toBe(
      "header",
    );
    expect(scopes.find((s) => s.path === "word/footer2.xml")?.kind).toBe(
      "footer",
    );
  });

  it("scopesOfKind narrows the list", async () => {
    const zip = await loadFixture();
    const scopes = listScopes(zip);
    const headers = scopesOfKind(scopes, "header");
    expect(headers).toHaveLength(2);
    expect(headers.every((s) => s.kind === "header")).toBe(true);
  });

  it("scopesOfKind accepts multiple kinds", async () => {
    const zip = await loadFixture();
    const scopes = listScopes(zip);
    const text = scopesOfKind(scopes, "body", "header", "footer");
    expect(text.map((s) => s.path)).toEqual([
      "word/document.xml",
      "word/header1.xml",
      "word/header2.xml",
      "word/footer1.xml",
      "word/footer2.xml",
    ]);
  });
});

describe("listScopes — synthetic edge cases", () => {
  it("returns an empty list for an empty zip", async () => {
    const zip = await syntheticZip({});
    expect(listScopes(zip)).toEqual([]);
  });

  it("ignores irrelevant zip entries", async () => {
    const zip = await syntheticZip({
      "[Content_Types].xml": "<x/>",
      "_rels/.rels": "<x/>",
      "docProps/core.xml": "<x/>",
      "word/styles.xml": "<x/>",
    });
    expect(listScopes(zip)).toEqual([]);
  });

  it("orders headers numerically, not lexicographically (header10 after header2)", async () => {
    const zip = await syntheticZip({
      "word/document.xml": "<x/>",
      "word/header2.xml": "<x/>",
      "word/header10.xml": "<x/>",
      "word/header1.xml": "<x/>",
    });
    const scopes = listScopes(zip);
    const headers = scopesOfKind(scopes, "header");
    expect(headers.map((s) => s.path)).toEqual([
      "word/header1.xml",
      "word/header2.xml",
      "word/header10.xml",
    ]);
  });

  it("does not match header.xml without a numeric suffix as a footer", async () => {
    // Word usually emits headerN.xml; we accept both.
    const zip = await syntheticZip({
      "word/document.xml": "<x/>",
      "word/header.xml": "<x/>",
      "word/footer.xml": "<x/>",
    });
    const scopes = listScopes(zip);
    expect(scopesOfKind(scopes, "header")).toHaveLength(1);
    expect(scopesOfKind(scopes, "footer")).toHaveLength(1);
  });

  it("sorts header.xml (no suffix) before header1.xml (suffix 1)", async () => {
    // numericSuffix returns 0 for the no-suffix form, so header.xml sorts first.
    // This exercises the `m === null` branch of numericSuffix.
    const zip = await syntheticZip({
      "word/document.xml": "<x/>",
      "word/header2.xml": "<x/>",
      "word/header.xml": "<x/>",
      "word/header1.xml": "<x/>",
    });
    const scopes = listScopes(zip);
    const headers = scopesOfKind(scopes, "header");
    expect(headers.map((s) => s.path)).toEqual([
      "word/header.xml",
      "word/header1.xml",
      "word/header2.xml",
    ]);
  });

  it("excludes directory entries from header/footer scanning", async () => {
    // Confirm the dir-skip branch in listScopes handles a directory entry.
    const zip = new JSZip();
    zip.folder("word/header_subfolder/");
    zip.file("word/document.xml", "<x/>");
    const scopes = listScopes(zip);
    expect(scopes.map((s) => s.path)).toEqual(["word/document.xml"]);
  });

  it("includes footnotes.xml and endnotes.xml when present", async () => {
    const zip = await syntheticZip({
      "word/document.xml": "<x/>",
      "word/footnotes.xml": "<x/>",
      "word/endnotes.xml": "<x/>",
    });
    const scopes = listScopes(zip);
    expect(scopes.map((s) => s.path)).toEqual([
      "word/document.xml",
      "word/footnotes.xml",
      "word/endnotes.xml",
    ]);
  });

  it("places singletons before headers/footers in the canonical order", async () => {
    const zip = await syntheticZip({
      "word/header1.xml": "<x/>",
      "word/footer1.xml": "<x/>",
      "word/document.xml": "<x/>",
      "word/footnotes.xml": "<x/>",
      "word/endnotes.xml": "<x/>",
      "word/comments.xml": "<x/>",
    });
    const scopes = listScopes(zip);
    expect(scopes.map((s) => s.kind)).toEqual([
      "body",
      "footnotes",
      "endnotes",
      "comments",
      "header",
      "footer",
    ]);
  });
});

describe("readScopeXml", () => {
  it("returns the XML content of a scope", async () => {
    const zip = await loadFixture();
    const scopes = listScopes(zip);
    const body = scopes.find((s) => s.kind === "body")!;
    const xml = await readScopeXml(zip, body);
    expect(xml).toContain("<w:document");
    expect(xml).toContain("ABC Corporation");
  });

  it("throws if the scope is missing from the zip", async () => {
    const zip = await syntheticZip({});
    await expect(
      readScopeXml(zip, { kind: "body", path: "word/document.xml" }),
    ).rejects.toThrow(/not found/);
  });
});
