import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi, afterEach } from "vitest";
import JSZip from "jszip";

import {
  buildAllTargetsFromZip,
  detectAll,
  detectAllInZip,
} from "./detect-all.js";
import { buildTargetsFromZip, detectPii } from "./detect-pii.js";
import * as runner from "./_framework/runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);
const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

function bodyWith(text: string): string {
  return `<w:document ${W_NS}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
}

function emptyBody(): string {
  return `<w:document ${W_NS}><w:body><w:p/></w:body></w:document>`;
}

function headerWith(text: string): string {
  return `<w:hdr ${W_NS}><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:hdr>`;
}

function footerWith(text: string): string {
  return `<w:ftr ${W_NS}><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:ftr>`;
}

function footnotesWith(text: string): string {
  return `<w:footnotes ${W_NS}><w:footnote><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:footnote></w:footnotes>`;
}

function commentsWith(text: string): string {
  return `<w:comments ${W_NS}><w:comment><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:comment></w:comments>`;
}

async function loadFixtureZip(): Promise<JSZip> {
  const bytes = fs.readFileSync(FIXTURE);
  return JSZip.loadAsync(bytes);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectAll", () => {
  it("returns an empty result for empty text", () => {
    expect(detectAll("")).toEqual({
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    });
  });

  it("returns an empty result for whitespace-only text", () => {
    expect(detectAll("   \n\t")).toEqual({
      candidates: [],
      structuralDefinitions: [],
      documentLanguage: "en",
    });
  });

  it("detects a Korean RRN", () => {
    const result = detectAll("주민번호 900101-1234567");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.ruleId).toBe("identifiers.korean-rrn");
  });

  it("detects an email", () => {
    const result = detectAll("Contact kim@abc-corp.kr for details.");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.ruleId).toBe("identifiers.email");
  });

  it("detects both identifier and financial matches in one text", () => {
    const result = detectAll("주민번호 900101-1234567, 금액 50,000원");
    expect(result.candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.korean-rrn",
      "financial.won-amount",
      "financial.amount-context-ko",
    ]);
  });

  it("returns regex candidates before heuristic candidates", () => {
    const result = detectAll("12-3456789 John Smith");
    expect(result.candidates.map((c) => c.ruleId)).toEqual([
      "identifiers.us-ein",
      "heuristics.capitalization-cluster",
    ]);
  });

  it("filters paranoid-only rules out at the conservative level", () => {
    const result = detectAll("지분은 3분의 1이다.", { level: "conservative" });
    expect(result.candidates).toEqual([]);
  });

  it("language override ko excludes English-only identifiers", () => {
    const result = detectAll("EIN 12-3456789", { language: "ko" });
    expect(result.candidates).toEqual([]);
    expect(result.documentLanguage).toBe("ko");
  });

  it("language override en excludes Korean-only identifiers", () => {
    const result = detectAll("주민번호 900101-1234567", { language: "en" });
    expect(result.candidates).toEqual([]);
    expect(result.documentLanguage).toBe("en");
  });

  it("language override mixed runs both language tracks", () => {
    const result = detectAll("주민번호 900101-1234567 EIN 12-3456789", {
      language: "mixed",
    });
    expect(new Set(result.candidates.map((c) => c.ruleId))).toEqual(
      new Set(["identifiers.korean-rrn", "identifiers.us-ein"]),
    );
  });

  it("auto-detects Korean text as ko", () => {
    expect(detectAll("본 계약의 금액은 50,000원이다.").documentLanguage).toBe(
      "ko",
    );
  });

  it("auto-detects English text as en", () => {
    expect(detectAll("The amount is USD 50,000.").documentLanguage).toBe("en");
  });

  it("auto-detects balanced bilingual text as mixed", () => {
    expect(detectAll("ABC 계약 DEF 합의").documentLanguage).toBe("mixed");
  });

  it("explicit language override wins over auto-detect", () => {
    const result = detectAll("EIN 12-3456789", { language: "ko" });
    expect(result.documentLanguage).toBe("ko");
    expect(result.candidates).toEqual([]);
  });

  it("auto-detected Korean text suppresses English-only rules", () => {
    const result = detectAll("주민번호 900101-1234567 및 참고번호 12-3456789");
    expect(result.documentLanguage).toBe("ko");
    expect(result.candidates.map((c) => c.ruleId)).toContain(
      "identifiers.korean-rrn",
    );
    expect(result.candidates.map((c) => c.ruleId)).not.toContain(
      "identifiers.us-ein",
    );
  });

  it("auto-detected English text suppresses Korean-only rules", () => {
    const result = detectAll(
      "Tax ID 12-3456789 and reference 900101-1234567 shall remain internal.",
    );
    expect(result.documentLanguage).toBe("en");
    expect(result.candidates.map((c) => c.ruleId)).toContain(
      "identifiers.us-ein",
    );
    expect(result.candidates.map((c) => c.ruleId)).not.toContain(
      "identifiers.korean-rrn",
    );
  });

  it("populates structuralDefinitions from party declarations", () => {
    const result = detectAll("ABC Corporation (hereinafter as 'Buyer')");
    expect(result.structuralDefinitions).toEqual([
      {
        label: "Buyer",
        referent: "ABC Corporation",
        source: "party-declaration",
      },
    ]);
  });

  it("preserves heuristic confidence end-to-end", () => {
    const result = detectAll("John Smith signed the agreement.");
    expect(result.candidates).toEqual([
      {
        text: "John Smith",
        ruleId: "heuristics.capitalization-cluster",
        confidence: 0.7,
      },
    ]);
  });

  it("preserves regex confidence as exactly 1.0", () => {
    const result = detectAll("kim@abc.kr");
    expect(result.candidates).toEqual([
      {
        text: "kim@abc.kr",
        ruleId: "identifiers.email",
        confidence: 1.0,
      },
    ]);
  });

  it("preserves original bytes when normalization fires", () => {
    const fullwidth = "Cell: \uFF10\uFF11\uFF10-\uFF11\uFF12\uFF13\uFF14-\uFF15\uFF16\uFF17\uFF18";
    const result = detectAll(fullwidth);
    expect(result.candidates).toEqual([
      {
        text: "\uFF10\uFF11\uFF10-\uFF11\uFF12\uFF13\uFF14-\uFF15\uFF16\uFF17\uFF18",
        ruleId: "identifiers.phone-kr",
        confidence: 1.0,
      },
      {
        text: "\uFF10\uFF11\uFF10-\uFF11\uFF12\uFF13\uFF14-\uFF15\uFF16\uFF17\uFF18",
        ruleId: "entities.en-phone-context",
        confidence: 1.0,
      },
    ]);
  });

  it("returns within 1 second on a 50KB input", () => {
    const text = "Acme Corp ".repeat(5000);
    const start = performance.now();
    void detectAll(text);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("detects quoted-term heuristics at standard level", () => {
    const result = detectAll('"alpha-beta" shall survive.');
    expect(result.candidates).toEqual([
      {
        text: "alpha-beta",
        ruleId: "heuristics.quoted-term",
        confidence: 0.6,
      },
    ]);
  });
});

describe("detectAllInZip", () => {
  it("returns empty arrays for an empty zip", async () => {
    const zip = new JSZip();
    expect(await detectAllInZip(zip)).toEqual({
      candidates: [],
      structuralDefinitions: [],
    });
  });

  it("walks the body scope", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("Body: kim@abc.kr"));
    const result = await detectAllInZip(zip);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.scope.kind).toBe("body");
  });

  it("walks body, header, footer, and footnote scopes", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("body@a.io"));
    zip.file("word/header1.xml", headerWith("12-3456789"));
    zip.file("word/footer1.xml", footerWith("Footer: 010-1234-5678"));
    zip.file("word/footnotes.xml", footnotesWith("50,000원"));
    const kinds = new Set((await detectAllInZip(zip)).candidates.map((c) => c.scope.kind));
    expect(kinds).toEqual(new Set(["body", "header", "footer", "footnotes"]));
  });

  it("runs language detection per scope", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith("주민번호 900101-1234567 및 참고번호 12-3456789"),
    );
    zip.file(
      "word/header1.xml",
      headerWith("Tax ID 12-3456789 and reference 900101-1234567"),
    );
    const result = await detectAllInZip(zip);
    const bodyRuleIds = result.candidates
      .filter((entry) => entry.scope.kind === "body")
      .map((entry) => entry.candidate.ruleId);
    const headerRuleIds = result.candidates
      .filter((entry) => entry.scope.kind === "header")
      .map((entry) => entry.candidate.ruleId);

    expect(bodyRuleIds).toContain("identifiers.korean-rrn");
    expect(bodyRuleIds).not.toContain("identifiers.us-ein");
    expect(headerRuleIds).toContain("identifiers.us-ein");
    expect(headerRuleIds).not.toContain("identifiers.korean-rrn");
  });

  it("attaches the exact footnotes scope path", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("plain text"));
    zip.file("word/footnotes.xml", footnotesWith("kim@abc.kr"));
    const result = await detectAllInZip(zip);
    const footnote = result.candidates.find(
      (entry) => entry.scope.kind === "footnotes",
    );
    expect(footnote?.scope.path).toBe("word/footnotes.xml");
  });

  it("preserves walker order", async () => {
    const zip = new JSZip();
    zip.file("word/footer1.xml", footerWith("010-1234-5678"));
    zip.file("word/header1.xml", headerWith("12-3456789"));
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    zip.file("word/comments.xml", commentsWith("50,000원"));
    zip.file("word/footnotes.xml", footnotesWith("3분의 1"));
    const result = await detectAllInZip(zip, { level: "paranoid" });
    expect(
      [...new Set(result.candidates.map((entry) => entry.scope.kind))],
    ).toEqual([
      "body",
      "footnotes",
      "comments",
      "header",
      "footer",
    ]);
  });

  it("preserves duplicates across scopes", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    zip.file("word/header1.xml", headerWith("kim@abc.kr"));
    const result = await detectAllInZip(zip);
    expect(
      result.candidates.filter((entry) => entry.candidate.text === "kim@abc.kr"),
    ).toHaveLength(2);
  });

  it("passes the conservative level to each scope", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("3분의 1"));
    zip.file("word/header1.xml", headerWith("3분의 1"));
    const result = await detectAllInZip(zip, { level: "conservative" });
    expect(result.candidates).toEqual([]);
  });

  it("passes language overrides through each scope", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("주민번호 900101-1234567"));
    zip.file("word/header1.xml", headerWith("12-3456789"));
    const result = await detectAllInZip(zip, { language: "en" });
    expect(result.candidates).toEqual([
      {
        scope: { kind: "header", path: "word/header1.xml" },
        candidate: {
          text: "12-3456789",
          ruleId: "identifiers.us-ein",
          confidence: 1.0,
        },
      },
    ]);
  });

  it("attaches structural definitions to their source scope", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith("ABC Corporation (hereinafter as 'Buyer')"),
    );
    const result = await detectAllInZip(zip);
    expect(result.structuralDefinitions).toEqual([
      {
        scope: { kind: "body", path: "word/document.xml" },
        definition: {
          label: "Buyer",
          referent: "ABC Corporation",
          source: "party-declaration",
        },
      },
    ]);
  });

  it("does not leak structural definitions across scopes", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith("ABC Corporation (hereinafter as 'Acme')"),
    );
    zip.file("word/footnotes.xml", footnotesWith('"Acme" shall survive.'));
    const result = await detectAllInZip(zip);
    const footnoteQuoted = result.candidates.find(
      (entry) =>
        entry.scope.kind === "footnotes" &&
        entry.candidate.ruleId === "heuristics.quoted-term",
    );
    expect(footnoteQuoted?.candidate.text).toBe("Acme");
  });

  it("skips empty scopes", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", emptyBody());
    zip.file("word/header1.xml", headerWith("kim@abc.kr"));
    const result = await detectAllInZip(zip);
    expect(result.candidates).toEqual([
      {
        scope: { kind: "header", path: "word/header1.xml" },
        candidate: {
          text: "kim@abc.kr",
          ruleId: "identifiers.email",
          confidence: 1.0,
        },
      },
    ]);
  });

  it("bubbles up runner failures as a rejected promise", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    vi.spyOn(runner, "runAllPhases").mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(detectAllInZip(zip)).rejects.toThrow("boom");
  });

  it("returns plain arrays, not iterators", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    const result = await detectAllInZip(zip);
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(Array.isArray(result.structuralDefinitions)).toBe(true);
  });

  it("does not expose fileStats", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    const result = await detectAllInZip(zip);
    expect("fileStats" in result).toBe(false);
  });
});

describe("buildAllTargetsFromZip", () => {
  it("returns targets longest-first", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith("ABC Corporation (hereinafter as 'Buyer') kim@abc.kr"),
    );
    const targets = await buildAllTargetsFromZip(zip);
    expect(targets).toEqual(["ABC Corporation", "kim@abc.kr"]);
  });

  it("dedupes targets across scopes", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    zip.file("word/footer1.xml", footerWith("kim@abc.kr"));
    const targets = await buildAllTargetsFromZip(zip);
    expect(targets).toEqual(["kim@abc.kr"]);
  });

  it("includes structural referents", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith("ABC Corporation (hereinafter as 'Buyer')"),
    );
    const targets = await buildAllTargetsFromZip(zip);
    expect(targets).toContain("ABC Corporation");
  });

  it("does not include structural labels", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith("ABC Corporation (hereinafter as 'Buyer')"),
    );
    const targets = await buildAllTargetsFromZip(zip);
    expect(targets).not.toContain("Buyer");
  });

  it("includes heuristic-emitted candidates by default", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("John Smith signed."));
    const targets = await buildAllTargetsFromZip(zip);
    expect(targets).toContain("John Smith");
  });

  it("paranoid targets are a superset of standard targets", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr and 지분은 3분의 1이다."));
    const standard = await buildAllTargetsFromZip(zip, { level: "standard" });
    const paranoid = await buildAllTargetsFromZip(zip, { level: "paranoid" });
    expect(paranoid).toEqual(expect.arrayContaining([...standard]));
    expect(paranoid).toContain("3분의 1");
  });

  it("conservative targets are a subset of standard targets", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr 보증금 500만원"));
    const conservative = await buildAllTargetsFromZip(zip, {
      level: "conservative",
    });
    const standard = await buildAllTargetsFromZip(zip, { level: "standard" });
    for (const target of conservative) {
      expect(standard).toContain(target);
    }
    expect(standard).toContain("500만원");
    expect(conservative).not.toContain("500만원");
  });

  it("returns an empty array for an empty zip", async () => {
    expect(await buildAllTargetsFromZip(new JSZip())).toEqual([]);
  });

  it("returns one target for a single-scope email zip", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("kim@abc.kr"));
    expect(await buildAllTargetsFromZip(zip)).toEqual(["kim@abc.kr"]);
  });

  it("skips empty structural referents", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      bodyWith('ABC Corporation (hereinafter referred to as "Buyer")'),
    );
    const targets = await buildAllTargetsFromZip(zip);
    expect(targets).not.toContain("");
  });
});

describe("Phase 0 parity", () => {
  it("matches legacy targets on a pure-identifier zip", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("Contact kim@abc.kr for details."));
    const legacy = await buildTargetsFromZip(zip);
    const next = await buildAllTargetsFromZip(zip);
    expect(next).toEqual(legacy);
  });

  it("is a superset of legacy targets on the worst-case fixture", async () => {
    const zip = await loadFixtureZip();
    const legacy = await buildTargetsFromZip(zip);
    const fresh = await loadFixtureZip();
    const next = await buildAllTargetsFromZip(fresh);
    for (const target of legacy) {
      expect(next).toContain(target);
    }
  });

  it("overlaps detectPii on identifier candidates", () => {
    const text = "Contact kim@abc.kr at 010-1234-5678 and use tax ID 123-45-67890.";
    const legacy = new Set(detectPii(text).map((m) => m.original));
    const next = new Set(
      detectAll(text)
        .candidates.filter((c) => c.ruleId.startsWith("identifiers."))
        .map((c) => c.text),
    );
    for (const match of legacy) {
      expect(next).toContain(match);
    }
  });

  it("does not import the legacy buildTargetsFromZip implementation", () => {
    const file = fs.readFileSync(path.join(REPO_ROOT, "src/detection/detect-all.ts"), "utf8");
    expect(file.includes('from "./detect-pii.js"')).toBe(false);
    expect(file.includes("buildTargetsFromZip(")).toBe(false);
  });

  it("does not call legacy detectPii", () => {
    const file = fs.readFileSync(path.join(REPO_ROOT, "src/detection/detect-all.ts"), "utf8");
    expect(file.includes("detectPii(")).toBe(false);
    expect(file.includes("detectPiiInZip(")).toBe(false);
  });
});
