import { describe, it, expect } from "vitest";
import JSZip from "jszip";

import {
  countWords,
  snapshotWordCount,
  evaluateWordCountSanity,
  DEFAULT_DROP_THRESHOLD_PCT,
} from "./word-count.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

function bodyWith(text: string): string {
  return `<w:document ${W_NS}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
}

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts simple English words", () => {
    expect(countWords("Hello world")).toBe(2);
    expect(countWords("The quick brown fox")).toBe(4);
  });

  it("counts words separated by newlines", () => {
    expect(countWords("line one\nline two\nline three")).toBe(6);
  });

  it("counts words separated by multiple whitespace", () => {
    expect(countWords("one   two\t\tthree")).toBe(3);
  });

  it("counts Korean words (particles are not separated)", () => {
    // Korean: '매수인은 계약을 체결했다' → 3 words
    expect(countWords("매수인은 계약을 체결했다")).toBe(3);
  });

  it("counts mixed Korean + English", () => {
    expect(countWords("ABC 주식회사는 Sunrise Ventures LLC와 계약했다")).toBe(
      6,
    );
  });

  it("treats [REDACTED] as a single token", () => {
    expect(countWords("[REDACTED] signed with [REDACTED]")).toBe(4);
  });

  it("counts punctuation-attached tokens as one word", () => {
    expect(countWords("Hello, world.")).toBe(2);
    expect(countWords("yes; no; maybe")).toBe(3);
  });
});

describe("snapshotWordCount", () => {
  it("returns 0 for an empty zip", async () => {
    const zip = new JSZip();
    expect(await snapshotWordCount(zip)).toBe(0);
  });

  it("counts words in the body scope", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("Hello world foo bar"));
    expect(await snapshotWordCount(zip)).toBe(4);
  });

  it("sums word counts across body + header + footer", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("body text here"));
    zip.file(
      "word/header1.xml",
      `<w:hdr ${W_NS}><w:p><w:r><w:t>header text</w:t></w:r></w:p></w:hdr>`,
    );
    zip.file(
      "word/footer1.xml",
      `<w:ftr ${W_NS}><w:p><w:r><w:t>footer</w:t></w:r></w:p></w:ftr>`,
    );
    // 3 + 2 + 1 = 6
    expect(await snapshotWordCount(zip)).toBe(6);
  });

  it("is stable across repeated calls", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("one two three"));
    const a = await snapshotWordCount(zip);
    const b = await snapshotWordCount(zip);
    expect(a).toBe(b);
  });
});

describe("evaluateWordCountSanity", () => {
  it("is sane when nothing was redacted", () => {
    const result = evaluateWordCountSanity(100, 100);
    expect(result.before).toBe(100);
    expect(result.after).toBe(100);
    expect(result.droppedPct).toBe(0);
    expect(result.sane).toBe(true);
  });

  it("computes the correct drop percentage", () => {
    // 100 → 85 = 15% drop
    const result = evaluateWordCountSanity(100, 85);
    expect(result.droppedPct).toBe(15);
    expect(result.sane).toBe(true);
  });

  it("is sane at exactly the default threshold", () => {
    // 30% drop is the edge case — should be considered sane (<=, not <)
    const result = evaluateWordCountSanity(100, 70);
    expect(result.droppedPct).toBe(30);
    expect(result.sane).toBe(true);
  });

  it("is NOT sane just over the default threshold", () => {
    // 100 → 69 = 31% drop
    const result = evaluateWordCountSanity(100, 69);
    expect(result.droppedPct).toBe(31);
    expect(result.sane).toBe(false);
  });

  it("accepts a custom threshold", () => {
    // 20% drop with threshold=15 → not sane
    const strict = evaluateWordCountSanity(100, 80, 15);
    expect(strict.sane).toBe(false);
    // Same input with threshold=25 → sane
    const relaxed = evaluateWordCountSanity(100, 80, 25);
    expect(relaxed.sane).toBe(true);
  });

  it("clamps droppedPct to 0 when after > before", () => {
    // Should never happen in practice, but guard against it
    const result = evaluateWordCountSanity(100, 150);
    expect(result.droppedPct).toBe(0);
    expect(result.sane).toBe(true);
  });

  it("is sane when before = 0 and after = 0", () => {
    // Degenerate case: empty document. Don't divide by zero.
    const result = evaluateWordCountSanity(0, 0);
    expect(result.droppedPct).toBe(0);
    expect(result.sane).toBe(true);
  });

  it("is NOT sane when before > 0 and after = 0 (100% drop)", () => {
    const result = evaluateWordCountSanity(100, 0);
    expect(result.droppedPct).toBe(100);
    expect(result.sane).toBe(false);
  });

  it("exposes the threshold used in the result", () => {
    const result = evaluateWordCountSanity(100, 80, 25);
    expect(result.thresholdPct).toBe(25);
  });

  it("defaults to DEFAULT_DROP_THRESHOLD_PCT = 30", () => {
    expect(DEFAULT_DROP_THRESHOLD_PCT).toBe(30);
    const result = evaluateWordCountSanity(100, 80);
    expect(result.thresholdPct).toBe(30);
  });

  it("rounds droppedPct to an integer for display stability", () => {
    // 100 → 83 = 17.0% (integer)
    expect(evaluateWordCountSanity(100, 83).droppedPct).toBe(17);
    // 1000 → 833 = 16.7% → rounds to 17
    expect(evaluateWordCountSanity(1000, 833).droppedPct).toBe(17);
    // 1000 → 836 = 16.4% → rounds to 16
    expect(evaluateWordCountSanity(1000, 836).droppedPct).toBe(16);
  });
});
