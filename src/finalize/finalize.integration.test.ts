/**
 * Lane A + Lane C + Lane D integration — the full pipeline against the
 * worst-case bilingual fixture, producing a ship-ready artifact with
 * a SHA-256 hash and a word-count sanity report.
 *
 * This is the first test that exercises the complete "lawyer drops
 * file → lawyer downloads file" path end-to-end:
 *
 *   load zip
 *     → Lane A: regex sweep for PII
 *     → Lane C: variant propagation for entity seeds (D9 defaults)
 *     → Lane D: finalize = redact + verify + word-count + sha256 + bytes
 *     → assert isShippable
 *     → reload bytes → re-verify → re-assert clean
 *
 * The last step is the cross-check: the SHA-256 we emit should be the
 * hash of bytes that, when reloaded, still pass verification. If the
 * finalize step is buggy (e.g., wrong byte order, broken zip, stray
 * metadata), this test catches it before the UI ever calls it.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";

import { buildTargetsFromZip as buildPiiTargets } from "../detection/detect-pii.js";
import { extractTextFromZip } from "../detection/extract-text.js";
import { verifyRedaction } from "../docx/verify.js";
import { parseDefinitionClauses } from "../propagation/definition-clauses.js";
import {
  buildRedactionTargets,
  propagateVariants,
} from "../propagation/propagate.js";
import { finalizeRedaction, isShippable } from "./finalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

const ENTITY_SEEDS: ReadonlyArray<string> = [
  "ABC Corporation",
  "ABC 주식회사",
  "Sunrise Ventures LLC",
  "김철수",
  "이영희",
  "Project Falcon",
  "블루윙 2.0",
];

const MUST_SURVIVE: ReadonlyArray<string> = [
  "the Buyer",
  "매수인",
  "Discloser",
  "Recipient",
  "甲",
  "乙",
  "📼",
  "대한민국",
];

async function joinCorpusText(zip: JSZip): Promise<string> {
  const scopes = await extractTextFromZip(zip);
  return scopes.map((s) => s.text).join("\n");
}

async function buildFullTargets(zip: JSZip): Promise<string[]> {
  const pii = await buildPiiTargets(zip);
  const corpus = await joinCorpusText(zip);
  const clauses = parseDefinitionClauses(corpus);
  const groups = ENTITY_SEEDS.map((seed) =>
    propagateVariants(seed, corpus, clauses),
  );
  const entity = buildRedactionTargets(groups);
  return [...new Set([...pii, ...entity])];
}

describe("Lane A + C + D end-to-end against worst-case bilingual fixture", () => {
  let report: Awaited<ReturnType<typeof finalizeRedaction>>;
  let targets: string[];

  beforeAll(async () => {
    const buf = fs.readFileSync(FIXTURE);

    // Build targets on a probe zip so `zip` stays pristine for the real run.
    const probeZip = await JSZip.loadAsync(buf);
    targets = await buildFullTargets(probeZip);

    // Real run.
    const zip = await JSZip.loadAsync(buf);
    report = await finalizeRedaction(zip, { targets });
  });

  it("the report is shippable (verify clean + word-count sane)", () => {
    expect(report.verify.isClean).toBe(true);
    expect(report.verify.survived).toEqual([]);
    expect(report.wordCount.sane).toBe(true);
    expect(isShippable(report)).toBe(true);
  });

  it("produces a non-trivial SHA-256 hash of the output bytes", () => {
    expect(report.sha256).toHaveLength(64);
    expect(report.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Not the empty-input hash
    expect(report.sha256).not.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produces deterministic bytes across runs (same SHA for identical inputs)", async () => {
    // Run the whole pipeline again on a fresh zip — the hash must match.
    const buf = fs.readFileSync(FIXTURE);
    const zip = await JSZip.loadAsync(buf);
    const again = await finalizeRedaction(zip, { targets });
    expect(again.sha256).toBe(report.sha256);
  });

  it("the outputBytes are a valid DOCX zip when reloaded", async () => {
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    expect(reloaded.file("word/document.xml")).not.toBeNull();
    expect(reloaded.file("[Content_Types].xml")).not.toBeNull();
  });

  it("reloaded bytes pass verification against the SAME target list", async () => {
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const v = await verifyRedaction(reloaded, targets);
    expect(v.isClean).toBe(true);
    expect(v.survived).toEqual([]);
  });

  it("reloaded bytes still preserve every D9 defined-term survivor", async () => {
    const reloaded = await JSZip.loadAsync(report.outputBytes);
    const body = await reloaded
      .file("word/document.xml")!
      .async("string");
    for (const survivor of MUST_SURVIVE) {
      expect(body).toContain(survivor);
    }
  });

  it("reports a reasonable word-count drop (well under 30%)", () => {
    // Realistic NDA redaction removes <5% of tokens. If this suddenly
    // spikes, either the fixture changed or the pipeline is over-matching.
    expect(report.wordCount.before).toBeGreaterThan(0);
    expect(report.wordCount.after).toBeGreaterThan(0);
    expect(report.wordCount.droppedPct).toBeLessThan(30);
  });

  it("reports a non-empty scope mutation list", () => {
    // Body + headers + footers should all have been touched (they all
    // contain PII or entity seeds in the fixture).
    expect(report.scopeMutations.length).toBeGreaterThanOrEqual(5);
  });

  it("the SHA-256 matches the hash of the reported outputBytes", async () => {
    // Cross-check: hash the bytes independently and confirm they match.
    // `.slice()` copies into a plain-ArrayBuffer-backed view so
    // crypto.subtle.digest accepts it under strict TS5 BufferSource typing.
    const check = await crypto.subtle.digest(
      "SHA-256",
      report.outputBytes.slice(),
    );
    const hex = Array.from(new Uint8Array(check))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe(report.sha256);
  });
});
