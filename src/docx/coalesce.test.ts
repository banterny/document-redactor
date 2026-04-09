/**
 * Tests for the text run coalescer.
 *
 * The problem this module solves: WordprocessingML splits paragraphs of text
 * across many `<w:r>` (run) elements whenever formatting changes, a spell-check
 * marker is inserted, a hyperlink starts, etc. A search-and-replace pass that
 * naively scans the raw XML will MISS strings that span run boundaries:
 *
 *     <w:r><w:t>ABC Corpo</w:t></w:r><w:r><w:t>ration</w:t></w:r>
 *      └────── plain string match for "ABC Corporation" fails ──────┘
 *
 * For a legal redactor, missing a string is a confidentiality breach. So before
 * any redaction or pattern search, we run a coalescer pass that produces a
 * "logical text view" — the concatenated visible text of every run inside a
 * paragraph — along with a mapping back to the original (run index, character
 * offset within run) positions, so the redactor can apply the substitution
 * surgically without disturbing untouched runs.
 */

import { describe, it, expect } from "vitest";

import { coalesceParagraphRuns, type CoalescedParagraph } from "./coalesce.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

/** Build a minimal `<w:p>` containing the given run text fragments. */
function paragraph(...runs: string[]): string {
  const inner = runs
    .map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`)
    .join("");
  return `<w:p ${W_NS}>${inner}</w:p>`;
}

/** Build a `<w:p>` where each run carries an explicit `<w:rPr>` block. */
function paragraphWithRpr(
  runs: ReadonlyArray<{ text: string; rpr: string }>,
): string {
  const inner = runs
    .map(
      (r) =>
        `<w:r><w:rPr>${r.rpr}</w:rPr><w:t xml:space="preserve">${r.text}</w:t></w:r>`,
    )
    .join("");
  return `<w:p ${W_NS}>${inner}</w:p>`;
}

describe("coalesceParagraphRuns", () => {
  it("returns empty result for a paragraph with zero runs", () => {
    const xml = `<w:p ${W_NS}></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("");
    expect(result.runs).toHaveLength(0);
  });

  it("coalesces a single run into a single logical string", () => {
    const xml = paragraph("Hello world");
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("Hello world");
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ index: 0, start: 0, length: 11 });
  });

  it("coalesces TWO runs into one logical string (the critical case)", () => {
    // This is the case the spike's plain string replace would miss.
    const xml = paragraph("ABC Corpo", "ration");
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("ABC Corporation");
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toEqual({ index: 0, start: 0, length: 9 });
    expect(result.runs[1]).toEqual({ index: 1, start: 9, length: 6 });
  });

  it("coalesces THREE+ runs", () => {
    const xml = paragraph("ABC", " Corpo", "ration");
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("ABC Corporation");
    expect(result.runs).toHaveLength(3);
    expect(result.runs[0]!.length).toBe(3);
    expect(result.runs[1]!.length).toBe(6);
    expect(result.runs[2]!.length).toBe(6);
  });

  it("preserves runs with different rPr formatting", () => {
    // Bold "ABC" + plain " Corporation" — both should still be coalesced.
    const xml = paragraphWithRpr([
      { text: "ABC", rpr: "<w:b/>" },
      { text: " Corporation", rpr: "" },
    ]);
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("ABC Corporation");
    expect(result.runs).toHaveLength(2);
  });

  it("preserves Korean + emoji + 한자 across run boundaries", () => {
    const xml = paragraph("ABC 주식", "회사 甲", " 📼");
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("ABC 주식회사 甲 📼");
  });

  it("decodes XML entities inside <w:t>", () => {
    // & < > and numeric entities all need to be decoded so the matcher sees
    // the actual characters the user authored.
    const xml = `<w:p ${W_NS}><w:r><w:t>foo &amp; bar &lt;x&gt;</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("foo & bar <x>");
  });

  it("decodes &quot; and &apos;", () => {
    const xml = `<w:p ${W_NS}><w:r><w:t>&quot;hello&quot; &apos;world&apos;</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe(`"hello" 'world'`);
  });

  it("decodes decimal numeric character references", () => {
    // &#65; → A, &#54616; → 하 (Korean Hangul)
    const xml = `<w:p ${W_NS}><w:r><w:t>&#65;BC &#54616;나</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("ABC 하나");
  });

  it("decodes hexadecimal numeric character references", () => {
    // &#x41; → A, &#x1F4FC; → 📼
    const xml = `<w:p ${W_NS}><w:r><w:t>&#x41;BC &#x1F4FC;</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("ABC 📼");
  });

  it("leaves unrecognized & sequences alone", () => {
    // A literal `&foo;` that isn't one of the five named entities or a
    // numeric ref shouldn't be replaced — leave it untouched. (Real Word
    // files don't produce these but defensive coverage matters.)
    const xml = `<w:p ${W_NS}><w:r><w:t>price &eur; 100</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("price &eur; 100");
  });

  it("fast-path returns the input unchanged when there's no '&'", () => {
    // Cover the early-return branch in decodeXmlEntities.
    const xml = `<w:p ${W_NS}><w:r><w:t>plain ASCII</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("plain ASCII");
  });

  it("ignores empty <w:t/> elements (which Word sometimes emits)", () => {
    const xml = `<w:p ${W_NS}><w:r><w:t>hello</w:t></w:r><w:r><w:t></w:t></w:r><w:r><w:t> world</w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("hello world");
    // The empty run is still recorded so offsets stay consistent
    expect(result.runs).toHaveLength(3);
    expect(result.runs[1]!.length).toBe(0);
  });

  it("handles self-closing <w:t/> as zero-length", () => {
    const xml = `<w:p ${W_NS}><w:r><w:t>x</w:t></w:r><w:r><w:t/></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("x");
    expect(result.runs).toHaveLength(2);
    expect(result.runs[1]!.length).toBe(0);
  });

  it("preserves leading/trailing whitespace when xml:space=preserve is set", () => {
    const xml = `<w:p ${W_NS}><w:r><w:t xml:space="preserve">  hello  </w:t></w:r></w:p>`;
    const result = coalesceParagraphRuns(xml);
    expect(result.text).toBe("  hello  ");
  });

  it("provides byte offsets that map back to the original XML positions", () => {
    // This is the property that lets the redactor write substitutions back
    // into the right runs without rewriting the rest of the paragraph.
    const xml = paragraph("ABC ", "Corpo", "ration");
    const result: CoalescedParagraph = coalesceParagraphRuns(xml);

    // "ABC Corporation" — find "Corporation" in the logical text
    const idx = result.text.indexOf("Corporation");
    expect(idx).toBe(4);

    // Map idx → which run it falls in. "ABC " is run 0 (length 4), so idx 4
    // is the very start of run 1 ("Corpo").
    const startRun = result.runs.findIndex(
      (r) => idx >= r.start && idx < r.start + r.length,
    );
    expect(startRun).toBe(1);

    // The end of "Corporation" (idx + 11 = 15) is the END of run 2.
    const endIdx = idx + "Corporation".length;
    const endRun = result.runs.findIndex(
      (r) => endIdx > r.start && endIdx <= r.start + r.length,
    );
    expect(endRun).toBe(2);
  });
});
