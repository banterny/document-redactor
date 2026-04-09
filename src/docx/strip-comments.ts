/**
 * Strip comments from a WordprocessingML document.
 *
 * Eng review lock-in #1 leak vector #2: `word/comments.xml` carries
 * draft notes, reviewer remarks, and other text the author probably forgot
 * exists. Level 2 Standard policy is to strip the entire comments part and
 * remove every comment range marker / reference inside the body XML so Word
 * doesn't complain about dangling pointers.
 */

import type JSZip from "jszip";

/**
 * Remove the comments part itself from the zip. Idempotent.
 */
export function dropCommentsPart(zip: JSZip): void {
  zip.remove("word/comments.xml");
  // Word also tolerates these adjacent parts being absent.
  zip.remove("word/commentsExtended.xml");
  zip.remove("word/commentsExtensible.xml");
  zip.remove("word/commentsIds.xml");
  zip.remove("word/people.xml");
}

/**
 * Strip comment range markers and references from a single XML scope.
 * Removes:
 *   - `<w:commentRangeStart .../>`
 *   - `<w:commentRangeEnd .../>`
 *   - `<w:commentReference .../>`
 *
 * Returns the cleaned XML. Idempotent.
 */
export function stripCommentReferences(xml: string): string {
  let out = xml;
  out = out.replace(/<w:commentRangeStart\b[^>]*\/>/g, "");
  out = out.replace(/<w:commentRangeEnd\b[^>]*\/>/g, "");
  out = out.replace(/<w:commentReference\b[^>]*\/>/g, "");
  return out;
}

/**
 * Predicate used by tests and the round-trip verifier — does the XML still
 * contain any comment-related markers?
 */
export function hasCommentReferences(xml: string): boolean {
  return (
    /<w:commentRangeStart\b/.test(xml) ||
    /<w:commentRangeEnd\b/.test(xml) ||
    /<w:commentReference\b/.test(xml)
  );
}
