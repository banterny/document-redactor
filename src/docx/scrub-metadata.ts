/**
 * Scrub DOCX metadata.
 *
 * Eng review lock-in #1 leak vector #3: `docProps/core.xml` and
 * `docProps/app.xml` carry author name, last-modified-by, company, document
 * title, subject, and other identifying fields. None of these are visible in
 * Word's normal view but Word ships them as part of the file. A redactor that
 * leaves them alone has just leaked the author's identity to ChatGPT.
 *
 * Level 2 Standard policy: replace every sensitive field's text content with
 * an empty string. We KEEP the elements (so the file structure stays valid)
 * but ZERO the values.
 */

import type JSZip from "jszip";

import { METADATA_SENSITIVE_FIELDS } from "./types.js";

/**
 * Replace each named field's inner text with an empty string. The element is
 * preserved so Word still finds the structure it expects. Self-closing
 * elements (e.g. `<dc:title/>`) are left alone — they already carry no value.
 *
 * Pure function. Returns the rewritten XML.
 */
export function scrubMetadataXml(xml: string, fields: ReadonlyArray<string>): string {
  let out = xml;
  for (const field of fields) {
    // Match elements like `<dc:creator>...</dc:creator>` or `<Company>...</Company>`.
    // The OOXML namespace prefix varies per field (`dc:`, `cp:`, none, etc.) so
    // we accept any prefix and require the same closing tag form.
    const re = new RegExp(
      `(<(?:[a-zA-Z][a-zA-Z0-9]*:)?${escapeRegex(field)}\\b[^>]*>)([^<]*)(</(?:[a-zA-Z][a-zA-Z0-9]*:)?${escapeRegex(field)}>)`,
      "g",
    );
    // Keep the open and close tags; drop the content in between.
    out = out.replace(re, "$1$3");
  }
  return out;
}

/**
 * Apply the standard scrub policy to a DOCX zip in place. Reads
 * `docProps/core.xml` and `docProps/app.xml`, scrubs each, and writes them
 * back. Idempotent.
 */
export async function scrubDocxMetadata(zip: JSZip): Promise<void> {
  const targets = ["docProps/core.xml", "docProps/app.xml"];
  for (const path of targets) {
    const file = zip.file(path);
    if (file === null) continue;
    const xml = await file.async("string");
    const cleaned = scrubMetadataXml(xml, METADATA_SENSITIVE_FIELDS);
    zip.file(path, cleaned);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
