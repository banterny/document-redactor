/**
 * Tests for the cross-run redactor.
 *
 * This module solves the silent-leak failure mode the spike documented:
 * Word splits "ABC Corporation" across multiple <w:t> elements when there's
 * any formatting boundary (style change, spell-check, hyperlink, etc.). A
 * naive string replace on the raw XML misses split-run matches. The redactor
 * uses the coalescer to build a logical text view, find matches there, and
 * surgically write them back into the right runs.
 */

import { describe, it, expect } from "vitest";

import {
  findRedactionMatches,
  redactParagraph,
  redactInstrText,
  redactScopeXml,
  DEFAULT_PLACEHOLDER,
} from "./redact.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

/** Build a paragraph from a list of plain text run fragments. */
function p(...runs: string[]): string {
  const inner = runs
    .map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`)
    .join("");
  return `<w:p ${W_NS}>${inner}</w:p>`;
}

function runXml(text: string): string {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}

/** Build a paragraph with explicit rPr per run (to test formatting preservation). */
function pWithRpr(
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

/** Extract just the visible text from a paragraph (concatenated <w:t> contents). */
function visibleText(paragraphXml: string): string {
  const out: string[] = [];
  const re = /<w:t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraphXml)) !== null) {
    out.push(m[1] ?? "");
  }
  return out.join("");
}

// ────────────────────────────────────────────────────────────────────────
// findRedactionMatches
// ────────────────────────────────────────────────────────────────────────

describe("findRedactionMatches", () => {
  it("returns empty array for empty target list", () => {
    expect(findRedactionMatches("ABC", [])).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(findRedactionMatches("", ["ABC"])).toEqual([]);
  });

  it("finds a single match", () => {
    const matches = findRedactionMatches("hello ABC world", ["ABC"]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ start: 6, end: 9, matched: "ABC" });
  });

  it("finds multiple non-overlapping matches", () => {
    const matches = findRedactionMatches("ABC and ABC again", ["ABC"]);
    expect(matches).toHaveLength(2);
    expect(matches[0]!.start).toBe(0);
    expect(matches[1]!.start).toBe(8);
  });

  it("prefers the longest target when multiple could match (sort)", () => {
    // Both "ABC" and "ABC Corp" are targets; "ABC Corporation" appears in text.
    // The longer "ABC Corp" should win at position 0.
    const matches = findRedactionMatches("ABC Corporation here", [
      "ABC",
      "ABC Corp",
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matched).toBe("ABC Corp");
  });

  it("handles regex special characters in targets safely", () => {
    const matches = findRedactionMatches("contact: kim@abc-corp.kr today", [
      "kim@abc-corp.kr",
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matched).toBe("kim@abc-corp.kr");
  });

  it("ignores empty-string targets", () => {
    const matches = findRedactionMatches("hello", ["", "hello"]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matched).toBe("hello");
  });

  it("returns empty when no targets match", () => {
    expect(findRedactionMatches("foo bar", ["XYZ"])).toEqual([]);
  });

  it("handles Korean targets", () => {
    const matches = findRedactionMatches(
      "본 계약의 매수인은 김철수이다.",
      ["김철수"],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matched).toBe("김철수");
  });
});

// ────────────────────────────────────────────────────────────────────────
// redactParagraph — single-run cases
// ────────────────────────────────────────────────────────────────────────

describe("redactParagraph — single run", () => {
  it("returns the paragraph unchanged when there are no matches", () => {
    const xml = p("hello world");
    expect(redactParagraph(xml, ["XYZ"])).toBe(xml);
  });

  it("returns the paragraph unchanged when target list is empty", () => {
    const xml = p("hello world");
    expect(redactParagraph(xml, [])).toBe(xml);
  });

  it("returns the paragraph unchanged for an empty paragraph", () => {
    const xml = `<w:p ${W_NS}></w:p>`;
    expect(redactParagraph(xml, ["X"])).toBe(xml);
  });

  it("replaces a match within a single run", () => {
    const xml = p("hello ABC world");
    const out = redactParagraph(xml, ["ABC"]);
    expect(visibleText(out)).toBe("hello [REDACTED] world");
  });

  it("replaces a match at the start of a run", () => {
    const xml = p("ABC world");
    const out = redactParagraph(xml, ["ABC"]);
    expect(visibleText(out)).toBe("[REDACTED] world");
  });

  it("replaces a match at the end of a run", () => {
    const xml = p("hello ABC");
    const out = redactParagraph(xml, ["ABC"]);
    expect(visibleText(out)).toBe("hello [REDACTED]");
  });

  it("replaces a match that fills the entire run", () => {
    const xml = p("ABC");
    const out = redactParagraph(xml, ["ABC"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("replaces multiple non-overlapping matches in one run", () => {
    const xml = p("ABC and DEF and ABC");
    const out = redactParagraph(xml, ["ABC", "DEF"]);
    expect(visibleText(out)).toBe("[REDACTED] and [REDACTED] and [REDACTED]");
  });

  it("uses a custom placeholder when provided", () => {
    const xml = p("hello ABC world");
    const out = redactParagraph(xml, ["ABC"], "***");
    expect(visibleText(out)).toBe("hello *** world");
  });
});

// ────────────────────────────────────────────────────────────────────────
// redactParagraph — cross-run cases (THE CRITICAL ONES)
// ────────────────────────────────────────────────────────────────────────

describe("redactParagraph — cross-run (the critical bug fix)", () => {
  it("redacts a target split across two runs", () => {
    // This is the bug the spike's plain string replace would silently miss.
    const xml = p("ABC Corpo", "ration");
    const out = redactParagraph(xml, ["ABC Corporation"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("redacts a target split across three runs", () => {
    const xml = p("ABC ", "Corpo", "ration");
    const out = redactParagraph(xml, ["ABC Corporation"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("preserves text in runs not touched by the match", () => {
    const xml = p("Hello, ", "ABC Corpo", "ration", " is here.");
    const out = redactParagraph(xml, ["ABC Corporation"]);
    expect(visibleText(out)).toBe("Hello, [REDACTED] is here.");
  });

  it("redacts when the match starts mid-run and ends mid-run across boundaries", () => {
    // Logical text: "before ABC Corporation after"
    // Runs:         "before AB" | "C Corp" | "oration after"
    const xml = p("before AB", "C Corp", "oration after");
    const out = redactParagraph(xml, ["ABC Corporation"]);
    expect(visibleText(out)).toBe("before [REDACTED] after");
  });

  it("preserves rPr formatting on runs that survive", () => {
    // Bold "ABC", plain " more text" — redact "ABC"
    const xml = pWithRpr([
      { text: "ABC", rpr: "<w:b/>" },
      { text: " more text", rpr: "" },
    ]);
    const out = redactParagraph(xml, ["ABC"]);
    expect(out).toContain("<w:b/>");
    expect(visibleText(out)).toBe("[REDACTED] more text");
  });

  it("handles Korean text split across runs", () => {
    // "ABC 주식회사" split as "ABC 주" | "식회사"
    const xml = p("ABC 주", "식회사");
    const out = redactParagraph(xml, ["ABC 주식회사"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("handles a single Korean character split (worst case for Word's run splitter)", () => {
    // "매수인" split mid-character in 3 runs
    const xml = p("매", "수", "인");
    const out = redactParagraph(xml, ["매수인"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("redacts only the matching portion when multiple targets overlap surroundings", () => {
    // Logical: "Sunrise Ventures LLC ("Recipient")"
    // Runs:    "Sunrise " | "Ventures LLC" | " (\"Recipient\")"
    // Targets: "Sunrise Ventures LLC", "Sunrise Ventures"
    // Longest wins: "Sunrise Ventures LLC"
    const xml = p("Sunrise ", "Ventures LLC", ` ("Recipient")`);
    const out = redactParagraph(xml, [
      "Sunrise Ventures",
      "Sunrise Ventures LLC",
    ]);
    expect(visibleText(out)).toBe(`[REDACTED] ("Recipient")`);
  });

  it("applies multiple cross-run matches in a single paragraph", () => {
    // Logical: "ABC Corp and Sunrise Ventures sign."
    // Runs:    "ABC Co" | "rp and Sunrise Ven" | "tures sign."
    const xml = p("ABC Co", "rp and Sunrise Ven", "tures sign.");
    const out = redactParagraph(xml, ["ABC Corp", "Sunrise Ventures"]);
    expect(visibleText(out)).toBe("[REDACTED] and [REDACTED] sign.");
  });
});

// ────────────────────────────────────────────────────────────────────────
// redactParagraph — exotic structures
// ────────────────────────────────────────────────────────────────────────

describe("redactParagraph — exotic run structures", () => {
  it("ignores self-closing <w:r/> elements", () => {
    // The self-closing run carries no text and is unaffected.
    const xml = `<w:p ${W_NS}><w:r><w:t>ABC</w:t></w:r><w:r/><w:r><w:t> Corp</w:t></w:r></w:p>`;
    const out = redactParagraph(xml, ["ABC Corp"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("handles a run with multiple <w:t> elements (rare but legal)", () => {
    // A run with two <w:t> elements should coalesce into one logical string.
    // After redaction, the FIRST <w:t> carries the new text and the rest are emptied.
    const xml = `<w:p ${W_NS}><w:r><w:t>ABC </w:t><w:t>Corp</w:t></w:r></w:p>`;
    const out = redactParagraph(xml, ["ABC Corp"]);
    expect(visibleText(out)).toBe("[REDACTED]");
  });

  it("handles a run with no <w:t> at all (control-only run)", () => {
    // A run that contains only <w:tab/> has no text. We don't crash on it.
    const xml = `<w:p ${W_NS}><w:r><w:t>before</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>after ABC</w:t></w:r></w:p>`;
    const out = redactParagraph(xml, ["ABC"]);
    expect(visibleText(out)).toBe("beforeafter [REDACTED]");
  });

  it("encodes XML entities in the placeholder if it contains special chars", () => {
    // Defensive: if a future caller passes "<X>" as the placeholder, we should
    // emit "&lt;X&gt;" so the resulting XML stays well-formed.
    const xml = p("hello SECRET world");
    const out = redactParagraph(xml, ["SECRET"], "<X>");
    expect(out).toContain("&lt;X&gt;");
    expect(out).not.toContain("<X>"); // raw form must NOT be present
  });
});

// ────────────────────────────────────────────────────────────────────────
// redactScopeXml
// ────────────────────────────────────────────────────────────────────────

describe("redactScopeXml", () => {
  it("walks every <w:p> in the scope and redacts each", () => {
    const xml = `<w:body>${p("hello ABC")}${p("world ABC")}</w:body>`;
    const out = redactScopeXml(xml, ["ABC"]);
    // Both paragraphs got redacted
    const visibleParts = [...out.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(
      (m) => m[1],
    );
    expect(visibleParts.join("|")).toBe("hello [REDACTED]|world [REDACTED]");
  });

  it("leaves self-closing <w:p/> alone", () => {
    const xml = `<w:body><w:p/></w:body>`;
    expect(redactScopeXml(xml, ["X"])).toBe(xml);
  });

  it("does not match <w:pPr> as a paragraph (regex specificity)", () => {
    // <w:pPr> is paragraph properties, not a paragraph. We must not redact inside it.
    const xml = `<w:body><w:p><w:pPr><w:rStyle w:val="ABC"/></w:pPr><w:r><w:t>ABC text</w:t></w:r></w:p></w:body>`;
    const out = redactScopeXml(xml, ["ABC"]);
    // The visible text "ABC text" got redacted
    expect(out).toContain("[REDACTED] text");
    // The <w:rStyle w:val="ABC"/> attribute is left alone
    expect(out).toContain('w:val="ABC"');
  });

  it("handles paragraphs inside table cells", () => {
    // Tables are <w:tbl><w:tr><w:tc><w:p>...</w:p></w:tc>...</w:tbl>
    const xml = `<w:body><w:tbl><w:tr><w:tc>${p("cell ABC")}</w:tc></w:tr></w:tbl></w:body>`;
    const out = redactScopeXml(xml, ["ABC"]);
    expect(out).toContain("cell [REDACTED]");
  });

  it("preserves the surrounding scope structure", () => {
    const xml = `<w:body><w:sectPr/>${p("ABC")}<w:sectPr/></w:body>`;
    const out = redactScopeXml(xml, ["ABC"]);
    // Both <w:sectPr/> markers survive
    expect((out.match(/<w:sectPr\/>/g) ?? [])).toHaveLength(2);
    expect(out).toContain("[REDACTED]");
  });

  it("runs the instrText safety net after paragraph redaction", () => {
    const xml = `<w:body>${p("contact@pearlabyss.com")}<w:instrText xml:space="preserve"> HYPERLINK "mailto:contact@pearlabyss.com" </w:instrText></w:body>`;
    const out = redactScopeXml(xml, ["contact@pearlabyss.com"]);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("contact@pearlabyss.com");
  });

  it("is idempotent with the instrText safety net enabled", () => {
    const xml = `<w:body>${p("secret")}<w:instrText> secret </w:instrText></w:body>`;
    const once = redactScopeXml(xml, ["secret"]);
    const twice = redactScopeXml(once, ["secret"]);
    expect(twice).toBe(once);
  });
});

describe("redactInstrText", () => {
  it("returns the XML unchanged when targets are empty", () => {
    const xml = `<w:instrText>secret</w:instrText>`;
    expect(redactInstrText(xml, [])).toBe(xml);
  });

  it("scrubs a single sensitive string from instrText content", () => {
    const xml = `<w:instrText xml:space="preserve"> HYPERLINK "mailto:contact@pearlabyss.com" </w:instrText>`;
    const out = redactInstrText(xml, ["contact@pearlabyss.com"]);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("contact@pearlabyss.com");
  });

  it("scrubs multiple sensitive strings from the same instrText node", () => {
    const xml = `<w:instrText> mailto:a@b.com cc c@d.com </w:instrText>`;
    const out = redactInstrText(xml, ["a@b.com", "c@d.com"]);
    expect(out).not.toContain("a@b.com");
    expect(out).not.toContain("c@d.com");
    expect((out.match(/\[REDACTED\]/g) ?? [])).toHaveLength(2);
  });

  it("uses longest-first replacement when targets overlap", () => {
    const xml = `<w:instrText> HYPERLINK "mailto:ABC Corporation" </w:instrText>`;
    const out = redactInstrText(xml, ["ABC", "ABC Corporation"]);
    expect(out).toContain(`mailto:${DEFAULT_PLACEHOLDER}`);
    expect(out).not.toContain("ABC Corporation");
  });

  it("preserves the XML unchanged when no target matches instrText", () => {
    const xml = `<w:instrText> AUTHOR </w:instrText>`;
    expect(redactInstrText(xml, ["contact@pearlabyss.com"])).toBe(xml);
  });

  it("scrubs a fldSimple w:instr attribute with a plain sensitive string", () => {
    const xml = `<w:fldSimple w:instr=" HYPERLINK mailto:contact@pearlabyss.com ">${runXml("contact@pearlabyss.com")}</w:fldSimple>`;
    const out = redactInstrText(xml, ["contact@pearlabyss.com"]);
    expect(out).toContain(`w:instr=" HYPERLINK mailto:${DEFAULT_PLACEHOLDER} "`);
    expect(out).toContain("contact@pearlabyss.com");
  });

  it("scrubs an entity-encoded fldSimple w:instr attribute", () => {
    const xml = `<w:fldSimple w:instr=" HYPERLINK &quot;mailto:contact@pearlabyss.com&quot; ">${runXml("contact@pearlabyss.com")}</w:fldSimple>`;
    const out = redactInstrText(xml, [`"mailto:contact@pearlabyss.com"`]);
    expect(out).toContain(`w:instr=" HYPERLINK ${DEFAULT_PLACEHOLDER} "`);
    expect(out).toContain("contact@pearlabyss.com");
  });

  it("scrubs multiple fldSimple instruction attributes in one scope", () => {
    const xml = `<w:body><w:fldSimple w:instr=" mailto:a@b.com ">${runXml("A")}</w:fldSimple><w:fldSimple w:instr=" mailto:c@d.com ">${runXml("B")}</w:fldSimple></w:body>`;
    const out = redactInstrText(xml, ["a@b.com", "c@d.com"]);
    expect(out).not.toContain("a@b.com");
    expect(out).not.toContain("c@d.com");
    expect((out.match(/\[REDACTED\]/g) ?? [])).toHaveLength(2);
  });

  it("is idempotent when applied twice", () => {
    const xml = `<w:instrText> secret </w:instrText>`;
    const once = redactInstrText(xml, ["secret"]);
    const twice = redactInstrText(once, ["secret"]);
    expect(twice).toBe(once);
  });
});

// ────────────────────────────────────────────────────────────────────────
// DEFAULT_PLACEHOLDER export
// ────────────────────────────────────────────────────────────────────────

describe("DEFAULT_PLACEHOLDER", () => {
  it("is the literal string '[REDACTED]' (D8.4)", () => {
    expect(DEFAULT_PLACEHOLDER).toBe("[REDACTED]");
  });
});
