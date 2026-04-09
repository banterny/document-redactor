import { describe, it, expect } from "vitest";

import {
  flattenTrackChanges,
  hasTrackChanges,
} from "./flatten-track-changes.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

const ATTRS = `w:id="1" w:author="Reviewer A" w:date="2026-04-09T12:00:00Z"`;

describe("flattenTrackChanges", () => {
  it("is a no-op on XML with no tracked changes", () => {
    const xml = `<w:p ${W_NS}><w:r><w:t>plain</w:t></w:r></w:p>`;
    expect(flattenTrackChanges(xml)).toBe(xml);
  });

  it("unwraps a single <w:ins>...</w:ins> and keeps the inner runs", () => {
    const xml = `<w:p><w:ins ${ATTRS}><w:r><w:t>inserted</w:t></w:r></w:ins></w:p>`;
    const out = flattenTrackChanges(xml);
    expect(out).toBe(`<w:p><w:r><w:t>inserted</w:t></w:r></w:p>`);
  });

  it("drops a single <w:del>...</w:del> entirely", () => {
    const xml = `<w:p><w:del ${ATTRS}><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>`;
    const out = flattenTrackChanges(xml);
    expect(out).toBe(`<w:p></w:p>`);
  });

  it("handles intermixed ins/del/normal runs", () => {
    const xml =
      `<w:p>` +
      `<w:r><w:t>before </w:t></w:r>` +
      `<w:ins ${ATTRS}><w:r><w:t>added </w:t></w:r></w:ins>` +
      `<w:r><w:t>middle </w:t></w:r>` +
      `<w:del ${ATTRS}><w:r><w:delText>SECRET</w:delText></w:r></w:del>` +
      `<w:r><w:t> after</w:t></w:r>` +
      `</w:p>`;
    const out = flattenTrackChanges(xml);
    // The deleted "SECRET" must be GONE.
    expect(out).not.toContain("SECRET");
    // The inserted "added " stays.
    expect(out).toContain("added ");
    // The non-tracked text is untouched.
    expect(out).toContain("before ");
    expect(out).toContain("middle ");
    expect(out).toContain(" after");
    // No track-change wrappers remain.
    expect(hasTrackChanges(out)).toBe(false);
  });

  it("drops self-closing <w:del/> and <w:ins/>", () => {
    const xml = `<w:p><w:ins ${ATTRS}/><w:del ${ATTRS}/><w:r><w:t>text</w:t></w:r></w:p>`;
    const out = flattenTrackChanges(xml);
    expect(out).toBe(`<w:p><w:r><w:t>text</w:t></w:r></w:p>`);
  });

  it("is idempotent (running twice = running once)", () => {
    const xml =
      `<w:p>` +
      `<w:ins ${ATTRS}><w:r><w:t>x</w:t></w:r></w:ins>` +
      `<w:del ${ATTRS}><w:r><w:delText>y</w:delText></w:r></w:del>` +
      `</w:p>`;
    const once = flattenTrackChanges(xml);
    const twice = flattenTrackChanges(once);
    expect(twice).toBe(once);
  });

  it("removes a deletion that contains the sensitive substring (the leak case)", () => {
    // This is the eng-review #1 leak vector #1 in concrete form.
    const xml = `<w:p><w:del ${ATTRS}><w:r><w:delText>kim@abc-corp.kr</w:delText></w:r></w:del></w:p>`;
    const out = flattenTrackChanges(xml);
    expect(out).not.toContain("kim@abc-corp.kr");
  });

  it("preserves Korean text inside an unwrapped insertion", () => {
    const xml = `<w:p><w:ins ${ATTRS}><w:r><w:t>매수인</w:t></w:r></w:ins></w:p>`;
    const out = flattenTrackChanges(xml);
    expect(out).toContain("매수인");
    expect(hasTrackChanges(out)).toBe(false);
  });

  it("does not eat across sibling track-change blocks (non-greedy)", () => {
    const xml =
      `<w:p>` +
      `<w:del ${ATTRS}><w:r><w:delText>A</w:delText></w:r></w:del>` +
      `<w:r><w:t>middle</w:t></w:r>` +
      `<w:del ${ATTRS}><w:r><w:delText>B</w:delText></w:r></w:del>` +
      `</w:p>`;
    const out = flattenTrackChanges(xml);
    expect(out).toContain("middle");
    expect(out).not.toContain("A");
    expect(out).not.toContain("B");
  });
});

describe("hasTrackChanges", () => {
  it("returns true when w:ins is present", () => {
    expect(hasTrackChanges(`<w:p><w:ins/></w:p>`)).toBe(true);
  });

  it("returns true when w:del is present", () => {
    expect(hasTrackChanges(`<w:p><w:del/></w:p>`)).toBe(true);
  });

  it("returns false on plain XML", () => {
    expect(hasTrackChanges(`<w:p><w:r><w:t>x</w:t></w:r></w:p>`)).toBe(false);
  });

  it("does not match unrelated tags that contain 'ins' or 'del'", () => {
    // Make sure we have word-boundary matching, not substring.
    expect(hasTrackChanges(`<w:instrText>x</w:instrText>`)).toBe(false);
    expect(hasTrackChanges(`<w:deleteThing/>`)).toBe(false);
  });
});
