import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import { scrubMetadataXml, scrubDocxMetadata } from "./scrub-metadata.js";
import { METADATA_SENSITIVE_FIELDS } from "./types.js";

const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>ABC Corp NDA — DRAFT</dc:title>
  <dc:subject>Acquisition of Sunrise</dc:subject>
  <dc:creator>Kim Chul-Soo</dc:creator>
  <cp:keywords>confidential, m&amp;a, acquisition</cp:keywords>
  <dc:description>Final draft for partner review</dc:description>
  <cp:lastModifiedBy>Choi Partner</cp:lastModifiedBy>
  <cp:revision>7</cp:revision>
  <dcterms:created xmlns:dcterms="http://purl.org/dc/terms/" xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">2026-03-15T09:00:00Z</dcterms:created>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Template>Normal.dotm</Template>
  <Company>ABC Corporation</Company>
  <Manager>Kim Chul-Soo</Manager>
  <Application>Microsoft Word</Application>
</Properties>`;

describe("scrubMetadataXml", () => {
  it("zeroes out dc:creator", () => {
    const out = scrubMetadataXml(CORE_XML, ["creator"]);
    expect(out).not.toContain("Kim Chul-Soo");
    expect(out).toContain("<dc:creator></dc:creator>");
  });

  it("zeroes out cp:lastModifiedBy", () => {
    const out = scrubMetadataXml(CORE_XML, ["lastModifiedBy"]);
    expect(out).not.toContain("Choi Partner");
    expect(out).toContain("<cp:lastModifiedBy></cp:lastModifiedBy>");
  });

  it("zeroes out dc:title and dc:subject", () => {
    const out = scrubMetadataXml(CORE_XML, ["title", "subject"]);
    expect(out).not.toContain("ABC Corp NDA");
    expect(out).not.toContain("Acquisition of Sunrise");
    expect(out).toContain("<dc:title></dc:title>");
    expect(out).toContain("<dc:subject></dc:subject>");
  });

  it("zeroes out unprefixed Company in app.xml", () => {
    const out = scrubMetadataXml(APP_XML, ["Company"]);
    expect(out).not.toContain("ABC Corporation");
    expect(out).toContain("<Company></Company>");
  });

  it("preserves fields not in the scrub list", () => {
    const out = scrubMetadataXml(CORE_XML, ["creator"]);
    expect(out).toContain("ABC Corp NDA");
    expect(out).toContain("Choi Partner");
  });

  it("scrubs every field in METADATA_SENSITIVE_FIELDS at once", () => {
    const out = scrubMetadataXml(CORE_XML, METADATA_SENSITIVE_FIELDS);
    expect(out).not.toContain("Kim Chul-Soo");
    expect(out).not.toContain("Choi Partner");
    expect(out).not.toContain("ABC Corp NDA");
    expect(out).not.toContain("Acquisition of Sunrise");
    expect(out).not.toContain("Final draft");
  });

  it("is idempotent", () => {
    const once = scrubMetadataXml(CORE_XML, METADATA_SENSITIVE_FIELDS);
    const twice = scrubMetadataXml(once, METADATA_SENSITIVE_FIELDS);
    expect(twice).toBe(once);
  });

  it("does not match elements whose name only happens to start with the field name", () => {
    // <Manager> should match the field "Manager", but <ManagerOfManagers> should NOT.
    const xml = `<Properties><Manager>Alice</Manager><ManagerOfManagers>Bob</ManagerOfManagers></Properties>`;
    const out = scrubMetadataXml(xml, ["Manager"]);
    expect(out).toContain("<Manager></Manager>");
    expect(out).toContain("<ManagerOfManagers>Bob</ManagerOfManagers>");
  });
});

describe("scrubDocxMetadata", () => {
  it("scrubs both core.xml and app.xml in a zip", async () => {
    const zip = new JSZip();
    zip.file("docProps/core.xml", CORE_XML);
    zip.file("docProps/app.xml", APP_XML);
    zip.file("word/document.xml", "<w:document/>");

    await scrubDocxMetadata(zip);

    const newCore = await zip.file("docProps/core.xml")!.async("string");
    const newApp = await zip.file("docProps/app.xml")!.async("string");

    expect(newCore).not.toContain("Kim Chul-Soo");
    expect(newCore).not.toContain("Choi Partner");
    expect(newCore).not.toContain("ABC Corp NDA");
    expect(newApp).not.toContain("ABC Corporation");
    expect(newApp).not.toContain("Kim Chul-Soo");

    // word/document.xml is unaffected
    const body = await zip.file("word/document.xml")!.async("string");
    expect(body).toBe("<w:document/>");
  });

  it("is a no-op when neither metadata part exists", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document/>");
    await expect(scrubDocxMetadata(zip)).resolves.toBeUndefined();
  });

  it("handles a zip with only core.xml", async () => {
    const zip = new JSZip();
    zip.file("docProps/core.xml", CORE_XML);
    await scrubDocxMetadata(zip);
    const newCore = await zip.file("docProps/core.xml")!.async("string");
    expect(newCore).not.toContain("Kim Chul-Soo");
  });
});
