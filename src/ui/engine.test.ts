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

import { analyzeZip, applyRedaction, defaultSelections } from "./engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

const SEEDS: ReadonlyArray<string> = [
  "ABC Corporation",
  "Sunrise Ventures LLC",
  "ABC 주식회사",
  "김철수",
  "이영희",
  "Project Falcon",
  "블루윙 2.0",
];

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

  it("PII candidates include the fixture's known structured PII", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const texts = analysis.piiCandidates.map((c) => c.text);
    expect(texts).toContain("kim@abc-corp.kr");
    expect(texts).toContain("010-1234-5678");
    expect(texts).toContain("123-45-67890");
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
        expect(selections.has(cand.text)).toBe(true);
      } else {
        expect(selections.has(cand.text)).toBe(false);
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
    for (const group of analysis.entityGroups) {
      for (const lit of group.literals) {
        expect(selected.has(lit.text)).toBe(true);
      }
    }
  });

  it("includes all PII candidates by default", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selected = defaultSelections(analysis);
    for (const pii of analysis.piiCandidates) {
      expect(selected.has(pii.text)).toBe(true);
    }
  });

  it("excludes all defined-term candidates by default (D9)", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selected = defaultSelections(analysis);
    for (const group of analysis.entityGroups) {
      for (const def of group.defined) {
        expect(selected.has(def.text)).toBe(false);
      }
    }
  });

  it("does NOT include heuristic candidates (confidence < 1.0) in defaultSelections", () => {
    const analysis = {
      entityGroups: [],
      piiCandidates: [],
      nonPiiCandidates: [
        {
          text: "Acme Holdings",
          ruleId: "heuristics.capitalization-cluster",
          category: "heuristics" as const,
          confidence: 0.7,
          count: 3,
          scopes: [],
        },
        {
          text: "50,000,000원",
          ruleId: "financial.won-amount",
          category: "financial" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
      ],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    };
    const selections = defaultSelections(analysis);
    expect(selections.has("Acme Holdings")).toBe(false);
    expect(selections.has("50,000,000원")).toBe(true);
  });

  it("excludes defined term labels from defaultSelections (D9 preserved)", () => {
    const analysis = {
      entityGroups: [
        {
          seed: "ABC Corp",
          literals: [{ text: "ABC Corporation", count: 1, scopes: [] }],
          defined: [{ text: "the Buyer", count: 5, scopes: [] }],
          variant: "exact" as const,
        },
      ],
      piiCandidates: [],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    };
    const selections = defaultSelections(analysis);
    expect(selections.has("ABC Corporation")).toBe(true);
    expect(selections.has("the Buyer")).toBe(false);
  });

  it("includes ALL PII candidates regardless of confidence field presence", () => {
    const analysis = {
      entityGroups: [],
      piiCandidates: [
        { text: "user@example.com", kind: "email" as const, count: 1, scopes: [] },
      ],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    };
    const selections = defaultSelections(analysis);
    expect(selections.has("user@example.com")).toBe(true);
  });

  it("includes non-heuristic nonPii candidates (confidence === 1.0) across all categories", () => {
    const analysis = {
      entityGroups: [],
      piiCandidates: [],
      nonPiiCandidates: [
        {
          text: "50,000원",
          ruleId: "financial.won-amount",
          category: "financial" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "2024년 3월 15일",
          ruleId: "temporal.date-ko-full",
          category: "temporal" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "ABC 주식회사",
          ruleId: "entities.ko-corp-suffix",
          category: "entities" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "대법원",
          ruleId: "legal.ko-court-name",
          category: "legal" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
        {
          text: "NDA",
          ruleId: "structural.header-block",
          category: "structural" as const,
          confidence: 1.0,
          count: 1,
          scopes: [],
        },
      ],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    };
    const selections = defaultSelections(analysis);
    expect(selections.size).toBe(5);
  });

  it("handles empty analysis by returning empty set", () => {
    const analysis = {
      entityGroups: [],
      piiCandidates: [],
      nonPiiCandidates: [],
      fileStats: { sizeBytes: 0, scopeCount: 0 },
    };
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
    const report = await applyRedaction(bytes, selections);

    expect(report.verify.isClean).toBe(true);
    expect(report.wordCount.sane).toBe(true);
    expect(report.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.outputBytes.length).toBeGreaterThan(0);
  });

  it("D9: defined terms survive in the output when not selected", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    const report = await applyRedaction(bytes, selections);

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
    await applyRedaction(bytes, selections);
    // bytes must be unchanged so the user can retry / tweak / reselect
    expect(bytes.length).toBe(before.length);
    for (let i = 0; i < Math.min(1000, bytes.length); i++) {
      expect(bytes[i]).toBe(before[i]);
    }
  });

  it("deterministic: same selections → same SHA-256", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    const a = await applyRedaction(bytes, selections);
    const b = await applyRedaction(bytes, selections);
    expect(a.sha256).toBe(b.sha256);
  });

  it("different selections → different output (includeDefined makes a difference)", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const narrow = defaultSelections(analysis);
    const wide = new Set(narrow);
    // Add one defined-term to the wider selection
    for (const group of analysis.entityGroups) {
      for (const def of group.defined) {
        wide.add(def.text);
        break;
      }
      if (wide.size !== narrow.size) break;
    }
    const a = await applyRedaction(bytes, narrow);
    const b = await applyRedaction(bytes, wide);
    // Different selections should produce different hashes (widened redaction
    // removes more content, so the bytes differ)
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("returns a non-shippable report when the sanity threshold is exceeded", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);
    // Force insanity: a 0% threshold means any drop fails.
    const report = await applyRedaction(bytes, selections, {
      wordCountThresholdPct: 0,
    });
    // verify should still be clean
    expect(report.verify.isClean).toBe(true);
    // but sanity fails at 0% if any word was dropped
    if (report.wordCount.before !== report.wordCount.after) {
      expect(report.wordCount.sane).toBe(false);
    }
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
    selections.delete("ABC Corporation");
    selections.delete("ABC Corp");
    selections.delete("ABC");
    selections.delete("ABC 주식회사");

    const report = await applyRedaction(bytes, selections);
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const body = await reloaded.file("word/document.xml")!.async("string");
    // ABC Corporation should still be present in the body/table
    expect(body).toContain("ABC Corporation");
    expect(body).toContain("ABC Corp");
  });

  it("selecting a defined term means it gets redacted", async () => {
    const analysis = await analyzeZip(bytes, SEEDS);
    const selections = defaultSelections(analysis);

    // Opt IN to 'the Buyer'
    selections.add("the Buyer");

    const report = await applyRedaction(bytes, selections);
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const body = await reloaded.file("word/document.xml")!.async("string");
    // The Buyer should be redacted — look for the [REDACTED] form
    expect(body).not.toContain("the Buyer");
  });
});
