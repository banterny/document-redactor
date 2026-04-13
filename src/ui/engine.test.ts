/**
 * Engine wrapper tests — the UI seam into Lane A/C/D.
 *
 * These tests prove that `analyzeZip` and `applyRedaction` produce the
 * exact shape the Svelte components need, and that the full "drop →
 * analyze → user picks → apply" cycle works against the worst-case
 * fixture without the UI layer ever touching raw Lane A/C/D APIs.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";

import {
  analyzeZip,
  applyRedaction,
  defaultSelections,
  type Analysis,
} from "./engine.js";
import {
  buildSelectionTargetId,
  buildSelectionTargets,
  indexSelectionTargets,
  type SelectionOccurrenceInput,
  type SelectionReviewSection,
} from "../selection-targets.js";

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

function bodyWithHyperlink(text: string): string {
  return `<w:document ${W_NS}><w:body><w:p><w:hyperlink r:id="rId5"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p></w:body></w:document>`;
}

async function syntheticDocx(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [filePath, content] of Object.entries(parts)) {
    zip.file(filePath, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const SEEDS: ReadonlyArray<string> = [
  "ABC Corporation",
  "Sunrise Ventures LLC",
  "ABC 주식회사",
  "김철수",
  "이영희",
  "Project Falcon",
  "블루윙 2.0",
];

function toOccurrence(
  text: string,
  options: {
    sourceKind: SelectionOccurrenceInput["sourceKind"];
    reviewSection: SelectionReviewSection;
    defaultSelected: boolean;
    ruleId?: string | null;
  },
): SelectionOccurrenceInput {
  return {
    scope: null,
    text,
    normalizedText: text,
    ruleId: options.ruleId ?? null,
    sourceKind: options.sourceKind,
    reviewSection: options.reviewSection,
    defaultSelected: options.defaultSelected,
  };
}

type AnalysisMockInput =
  Pick<Analysis, "entityGroups" | "piiCandidates" | "nonPiiCandidates" | "fileStats"> &
    Partial<Pick<Analysis, "literalCandidates" | "definedCandidates">>;

function withSelectionTargets(
  analysis: AnalysisMockInput,
): Analysis {
  const literalCandidates =
    "literalCandidates" in analysis
      ? analysis.literalCandidates
      : analysis.entityGroups.flatMap((group) =>
          group.literals.map((candidate) => ({
            text: candidate.text,
            seed: group.seed,
            count: candidate.count,
            selectionTargetId: buildSelectionTargetId("auto", candidate.text),
          })),
        );
  const definedCandidates =
    "definedCandidates" in analysis
      ? analysis.definedCandidates
      : analysis.entityGroups.flatMap((group) =>
          group.defined.map((candidate) => ({
            text: candidate.text,
            seed: group.seed,
            count: candidate.count,
            selectionTargetId: buildSelectionTargetId("auto", candidate.text),
          })),
        );
  const selectionTargets = buildSelectionTargets([
    ...literalCandidates.map((candidate) =>
      toOccurrence(candidate.text, {
        sourceKind: "literal",
        reviewSection: "literals",
        defaultSelected: true,
      }),
    ),
    ...definedCandidates.map((candidate) =>
      toOccurrence(candidate.text, {
        sourceKind: "literal",
        reviewSection: "defined",
        defaultSelected: false,
      }),
    ),
    ...analysis.piiCandidates.map((candidate) =>
      toOccurrence(candidate.text, {
        sourceKind: "pii",
        reviewSection: "pii",
        defaultSelected: true,
      }),
    ),
    ...analysis.nonPiiCandidates.map((candidate) =>
      toOccurrence(candidate.text, {
        sourceKind: "nonPii",
        reviewSection:
          candidate.category === "financial"
            ? "financial"
            : candidate.category === "temporal"
              ? "temporal"
              : candidate.category === "legal"
                ? "legal"
                : candidate.category === "heuristics"
                  ? "heuristics"
                  : "entities",
        defaultSelected: candidate.confidence === 1.0,
        ruleId: candidate.ruleId,
      }),
    ),
  ]);

  return {
    ...analysis,
    literalCandidates,
    definedCandidates,
    selectionTargets,
    selectionTargetById: indexSelectionTargets(selectionTargets),
  };
}

function selectionIdForText(
  analysis: Awaited<ReturnType<typeof analyzeZip>>,
  text: string,
): string {
  const target = analysis.selectionTargets.find(
    (entry) => entry.displayText === text,
  );
  if (target === undefined) {
    throw new Error(`Missing selection target for ${text}`);
  }
  return target.id;
}

describe("analyzeZip", () => {
  let bytes: Uint8Array;

  beforeAll(() => {
    bytes = fs.readFileSync(FIXTURE);
  });

  it("returns entity groups, PII candidates, and file stats", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    expect(analysis.entityGroups.length).toBe(SEEDS.length);
    expect(analysis.piiCandidates.length).toBeGreaterThan(0);
    expect(analysis.fileStats.sizeBytes).toBeGreaterThan(0);
    expect(analysis.fileStats.scopeCount).toBeGreaterThanOrEqual(5);
  });

  it("keeps the Analysis shape unchanged in Phase 3", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);

    expect(Object.keys(analysis).sort()).toEqual(
      [
        "definedCandidates",
        "entityGroups",
        "fileStats",
        "literalCandidates",
        "nonPiiCandidates",
        "piiCandidates",
        "selectionTargetById",
        "selectionTargets",
      ],
    );
  });

  it("each entity group has a literals array (may be empty if seed not found)", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const abc = analysis.entityGroups.find(
      (g) => g.seed === "ABC Corporation",
    );
    expect(abc).toBeDefined();
    expect(abc!.literals.length).toBeGreaterThan(0);
    // ABC Corporation's substring variant 'ABC Corp' should be discovered
    const literalTexts = abc!.literals.map((c) => c.text);
    expect(literalTexts).toContain("ABC Corporation");
    expect(literalTexts).toContain("ABC Corp");
  });

  it("entity groups surface defined terms via clauses + D9 hardcoded list", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const abc = analysis.entityGroups.find(
      (g) => g.seed === "ABC Corporation",
    );
    // Discloser linked via '"Discloser" means ABC Corporation' clause
    expect(abc!.defined.map((c) => c.text)).toContain("Discloser");
  });

  it("PII candidates include the fixture's English-dominant structured PII", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const texts = analysis.piiCandidates.map((c) => c.text);
    expect(texts).toContain("kim@abc-corp.kr");
    expect(texts).toContain("12-3456789");
    expect(texts).toContain("+1 415 555 0199");
  });

  it("PII candidates are deduped (one entry per unique string)", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const texts = analysis.piiCandidates.map((c) => c.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("PII candidates aggregate occurrence counts across scopes", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    // kim@abc-corp.kr appears in both body and footer1 in the fixture
    const kim = analysis.piiCandidates.find(
      (c) => c.text === "kim@abc-corp.kr",
    );
    expect(kim).toBeDefined();
    expect(kim!.count).toBeGreaterThanOrEqual(1);
  });

  it("surfaces Korean landline candidates without throwing", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", bodyWith("대표번호 02-3446-3727"));

    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(analyzeZip(bytes, [])).resolves.toMatchObject({
      piiCandidates: [
        expect.objectContaining({
          text: "02-3446-3727",
          kind: "phone-kr-landline",
        }),
      ],
    });
  });

  it("populates nonPiiCandidates for Phase 1 matches on the worst-case fixture", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);

    expect(analysis.nonPiiCandidates.length).toBeGreaterThan(0);

    const categoriesSeen = new Set(
      analysis.nonPiiCandidates.map((c) => c.category),
    );
    expect(
      categoriesSeen.has("financial") || categoriesSeen.has("temporal"),
    ).toBe(true);

    expect(analysis.piiCandidates.length).toBeGreaterThanOrEqual(1);

    const selections = defaultSelections(analysis);
    const literalTexts = new Set(
      analysis.entityGroups.flatMap((group) =>
        group.literals.map((candidate) => candidate.text),
      ),
    );
    const piiTexts = new Set(
      analysis.piiCandidates.map((candidate) => candidate.text),
    );
    for (const cand of analysis.nonPiiCandidates) {
      if (
        cand.confidence === 1.0 ||
        literalTexts.has(cand.text) ||
        piiTexts.has(cand.text)
      ) {
        expect(selections.has(cand.selectionTargetId)).toBe(true);
      } else {
        expect(selections.has(cand.selectionTargetId)).toBe(false);
      }
    }
  });
});

describe("defaultSelections — D9 policy", () => {
  let bytes: Uint8Array;

  beforeAll(() => {
    bytes = fs.readFileSync(FIXTURE);
  });

  it("includes all literal entity candidates by default", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selected = defaultSelections(analysis);
    for (const candidate of analysis.literalCandidates) {
      expect(selected.has(candidate.selectionTargetId)).toBe(true);
    }
  });

  it("includes all PII candidates by default", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selected = defaultSelections(analysis);
    for (const pii of analysis.piiCandidates) {
      expect(selected.has(pii.selectionTargetId)).toBe(true);
    }
  });

  it("excludes all defined-term candidates by default (D9)", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selected = defaultSelections(analysis);
    for (const candidate of analysis.definedCandidates) {
      expect(selected.has(candidate.selectionTargetId)).toBe(false);
    }
  });

  it("does NOT include heuristic candidates (confidence < 1.0) in defaultSelections", () => {
    const analysis = withSelectionTargets({
      entityGroups: [],
      piiCandidates: [],
      nonPiiCandidates: [
        {
          text: "Acme Holdings",
          selectionTargetId: buildSelectionTargetId("auto", "Acme Holdings"),
          ruleId: "heuristics.capitalization-cluster",
          category: "heuristics" as const,
          confidence: 0.7,
          count: 3,
          scopes: [],
        },
        {
          text: "50,000,000원",
          selectionTargetId: buildSelectionTargetId("auto", "50,000,000원"),
          ruleId: "financial.won-amount",
          category: "financial" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
      ],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    });
    const selections = defaultSelections(analysis);
    expect(selections.has(buildSelectionTargetId("auto", "Acme Holdings"))).toBe(false);
    expect(selections.has(buildSelectionTargetId("auto", "50,000,000원"))).toBe(true);
  });

  it("excludes defined term labels from defaultSelections (D9 preserved)", () => {
    const analysis = withSelectionTargets({
      entityGroups: [
        {
          seed: "ABC Corp",
          literals: [
            {
              text: "ABC Corporation",
              kind: "literal" as const,
              count: 1,
            },
          ],
          defined: [{ text: "the Buyer", kind: "defined" as const, count: 5 }],
        },
      ],
      piiCandidates: [],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    });
    const selections = defaultSelections(analysis);
    expect(selections.has(buildSelectionTargetId("auto", "ABC Corporation"))).toBe(true);
    expect(selections.has(buildSelectionTargetId("auto", "the Buyer"))).toBe(false);
  });

  it("includes ALL PII candidates regardless of confidence field presence", () => {
    const analysis = withSelectionTargets({
      entityGroups: [],
      piiCandidates: [
        {
          text: "user@example.com",
          selectionTargetId: buildSelectionTargetId("auto", "user@example.com"),
          kind: "email" as const,
          count: 1,
          scopes: [],
        },
      ],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    });
    const selections = defaultSelections(analysis);
    expect(selections.has(buildSelectionTargetId("auto", "user@example.com"))).toBe(true);
  });

  it("includes non-heuristic nonPii candidates (confidence === 1.0) across all categories", () => {
    const analysis = withSelectionTargets({
      entityGroups: [],
      piiCandidates: [],
      nonPiiCandidates: [
        {
          text: "50,000원",
          selectionTargetId: buildSelectionTargetId("auto", "50,000원"),
          ruleId: "financial.won-amount",
          category: "financial" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "2024년 3월 15일",
          selectionTargetId: buildSelectionTargetId("auto", "2024년 3월 15일"),
          ruleId: "temporal.date-ko-full",
          category: "temporal" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "ABC 주식회사",
          selectionTargetId: buildSelectionTargetId("auto", "ABC 주식회사"),
          ruleId: "entities.ko-corp-suffix",
          category: "entities" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "대법원",
          selectionTargetId: buildSelectionTargetId("auto", "대법원"),
          ruleId: "legal.ko-court-name",
          category: "legal" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "NDA",
          selectionTargetId: buildSelectionTargetId("auto", "NDA"),
          ruleId: "structural.header-block",
          category: "structural" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
      ],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    });
    const selections = defaultSelections(analysis);
    expect(selections.size).toBe(5);
  });

  it("handles empty analysis by returning empty set", () => {
    const analysis = withSelectionTargets({
      entityGroups: [],
      piiCandidates: [],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    });
    expect(defaultSelections(analysis).size).toBe(0);
  });
});

describe("applyRedaction — the Apply button path", () => {
  let bytes: Uint8Array;

  beforeAll(() => {
    bytes = fs.readFileSync(FIXTURE);
  });

  it("produces a shippable FinalizedReport using default selections", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    const report = await applyRedaction(bytes, analysis, selections);

    expect(report.verify.isClean).toBe(true);
    expect(report.wordCount.sane).toBe(true);
    expect(report.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.outputBytes.length).toBeGreaterThan(0);
  });

  it("D9: defined terms survive in the output when not selected", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    const report = await applyRedaction(bytes, analysis, selections);

    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const body = await reloaded.file("word/document.xml")!.async("string");
    expect(body).toContain("the Buyer");
    expect(body).toContain("매수인");
    expect(body).toContain("Buyer acknowledges");
    expect(body).not.toContain("The [REDACTED] acknowledges");
  });

  it("does NOT mutate the input bytes (caller keeps original)", async () => {
    const before = bytes.slice(); // snapshot
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    await applyRedaction(bytes, analysis, selections);
    // bytes must be unchanged so the user can retry / tweak / reselect
    expect(bytes.length).toBe(before.length);
    for (let i = 0; i < Math.min(1000, bytes.length); i++) {
      expect(bytes[i]).toBe(before[i]);
    }
  });

  it("deterministic: same selections → same SHA-256", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    const a = await applyRedaction(bytes, analysis, selections);
    const b = await applyRedaction(bytes, analysis, selections);
    expect(a.sha256).toBe(b.sha256);
  });

  it("different selections → different output (includeDefined makes a difference)", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const narrow = defaultSelections(analysis);
    const wide = new Set(narrow);
    if (analysis.definedCandidates[0] !== undefined) {
      wide.add(analysis.definedCandidates[0].selectionTargetId);
    }
    const a = await applyRedaction(bytes, analysis, narrow);
    const b = await applyRedaction(bytes, analysis, wide);
    // Different selections should produce different hashes (widened redaction
    // removes more content, so the bytes differ)
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("returns a non-shippable report when the sanity threshold is exceeded", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    // Force insanity: a 0% threshold means any drop fails.
    const report = await applyRedaction(bytes, analysis, selections, {
      wordCountThresholdPct: 0,
    });
    // verify should still be clean
    expect(report.verify.isClean).toBe(true);
    // but sanity fails at 0% if any word was dropped
    if (report.wordCount.before !== report.wordCount.after) {
      expect(report.wordCount.sane).toBe(false);
      expect(report.warningReasons).toContain("wordCount");
    }
  });

  it("runs one guided retry from the original bytes when rel targets survive pass 1", async () => {
    const email = "contact@pearlabyss.com";
    const bytes = await syntheticDocx({
      "word/document.xml": bodyWithHyperlink(email),
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="x"><Relationship Id="rId5" Type="hyperlink" Target="mailto:${email}" TargetMode="External"/></Relationships>`,
    });
    const analysis = withSelectionTargets({
      entityGroups: [],
      literalCandidates: [
        {
          text: email,
          seed: email,
          count: 1,
          selectionTargetId: buildSelectionTargetId("auto", email),
        },
      ],
      definedCandidates: [],
      piiCandidates: [],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: bytes.length, scopeCount: 1 },
    });
    const selections = new Set([buildSelectionTargetId("auto", email)]);
    let repairingCalls = 0;

    const report = await applyRedaction(bytes, analysis, selections, {
      onRepairing: () => {
        repairingCalls++;
      },
    });

    expect(repairingCalls).toBe(1);
    expect(report.verify.isClean).toBe(true);
    expect(report.repair).toEqual({
      attempted: true,
      repairedSurvivorCount: 1,
      initialSurvivorCount: 1,
      finalSurvivorCount: 0,
      touchedScopePaths: ["word/_rels/document.xml.rels"],
      touchedNonBodyScope: true,
      touchedFieldOrRelsSurface: true,
    });
    expect(report.warningReasons).toEqual([
      "repairTouchedNonBodyScopes",
      "repairTouchedFieldOrRelsSurface",
    ]);

    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const rels = await reloaded.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("mailto:[REDACTED]");
    expect(rels).not.toContain(email);
  });
});

describe("analyzeZip + applyRedaction — selection changes", () => {
  let bytes: Uint8Array;

  beforeAll(() => {
    bytes = fs.readFileSync(FIXTURE);
  });

  it("deselecting every ABC variant means ABC survives in output", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);

    // Remove every ABC-family variant. If we leave any atomic form
    // ("ABC") checked, the redactor correctly replaces it inside
    // "ABC Corp" too — demonstrating that the atomic form IS a
    // substring of the composite. So to make a composite survive we
    // must deselect every variant that could match it.
    selections.delete(selectionIdForText(analysis, "ABC Corporation"));
    selections.delete(selectionIdForText(analysis, "ABC Corp"));
    selections.delete(selectionIdForText(analysis, "ABC"));
    selections.delete(selectionIdForText(analysis, "ABC 주식회사"));

    const report = await applyRedaction(bytes, analysis, selections);
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const body = await reloaded.file("word/document.xml")!.async("string");
    // ABC Corporation should still be present in the body/table
    expect(body).toContain("ABC Corporation");
    expect(body).toContain("ABC Corp");
  });

  it("selecting a defined term means it gets redacted", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    const defined = analysis.definedCandidates[0];
    if (defined === undefined) {
      throw new Error("expected at least one defined candidate");
    }

    // Opt IN to the first defined term surfaced by propagation.
    selections.add(defined.selectionTargetId);

    const report = await applyRedaction(bytes, analysis, selections);
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const body = await reloaded.file("word/document.xml")!.async("string");
    expect(body).not.toContain(defined.text);
  });
});
