/**
 * Lane C integration test — Lane A + Lane C → Lane B end-to-end.
 *
 * This is the first test in the whole project that exercises the complete
 * "drop a file in, get a redacted file out" path using ONLY the seed
 * entities a user would actually know (their client's name, the
 * counterparty's name, a few manual product names). The PII sweep (Lane A)
 * catches the structured stuff, Lane C's propagation handles the
 * entity-name + alias + defined-term layer, and Lane B does the
 * rewrite. The verifier is the ship gate.
 *
 * The most important assertion in this file is the D9 one at the bottom:
 * after the full pipeline, the fixture's defined-term phrases ("the
 * Buyer", "매수인", "Discloser") must STILL be present in the output.
 * Removing them would mean we regressed on D9 — a bug the user already
 * caught once and shouldn't ever see again.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";

import {
  buildTargetsFromZip as buildPiiTargets,
} from "../detection/detect-pii.js";
import { extractTextFromZip } from "../detection/extract-text.js";
import { redactDocx } from "../docx/redact-docx.js";
import { listScopes, readScopeXml } from "../docx/scopes.js";
import { verifyRedaction } from "../docx/verify.js";
import { parseDefinitionClauses } from "./definition-clauses.js";
import { buildRedactionTargets, propagateVariants } from "./propagate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

/** Entity seeds a lawyer would plausibly provide via the UI. */
const ENTITY_SEEDS: ReadonlyArray<string> = [
  "ABC Corporation",
  "ABC 주식회사",
  "Sunrise Ventures LLC",
  "김철수",
  "이영희",
  "Project Falcon",
  "블루윙 2.0",
];

/** Strings that MUST survive (D9 defined-term policy + Unicode probes). */
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

describe("Lane A + Lane C → Lane B integration (worst-case bilingual fixture)", () => {
  let piiTargets: string[];
  let entityTargets: string[];
  let allTargets: string[];
  let reportZip: JSZip;

  beforeAll(async () => {
    const buf = fs.readFileSync(FIXTURE);

    // Pre-flight: build the targets list on a fresh zip (so beforeAll
    // doesn't mutate it).
    const probeZip = await JSZip.loadAsync(buf);
    piiTargets = await buildPiiTargets(probeZip);

    const corpus = await joinCorpusText(probeZip);
    const clauses = parseDefinitionClauses(corpus);
    const groups = ENTITY_SEEDS.map((seed) =>
      propagateVariants(seed, corpus, clauses),
    );
    entityTargets = buildRedactionTargets(groups);

    // Combine Lane A + Lane C targets. Dedupe preserved by the Set.
    allTargets = [...new Set([...piiTargets, ...entityTargets])];

    // Now actually run the full pipeline on a fresh zip.
    reportZip = await JSZip.loadAsync(buf);
    await redactDocx(reportZip, { targets: allTargets });
  });

  it("Lane A produces non-empty PII targets", () => {
    expect(piiTargets.length).toBeGreaterThan(0);
    // Sanity check: at least the emails and phones we know are in the fixture
    expect(piiTargets).toContain("kim@abc-corp.kr");
    expect(piiTargets).toContain("010-1234-5678");
  });

  it("Lane C's propagateVariants finds substring variants of the entity seeds", () => {
    // ABC Corporation should have ABC Corp as a substring variant
    const entitySet = new Set(entityTargets);
    expect(entitySet.has("ABC Corp")).toBe(true);
    // Sunrise Ventures LLC should have Sunrise Ventures as a prefix shortening
    expect(entitySet.has("Sunrise Ventures")).toBe(true);
  });

  it("Lane C's parseDefinitionClauses finds the fixture's definition clauses", async () => {
    const buf = fs.readFileSync(FIXTURE);
    const zip = await JSZip.loadAsync(buf);
    const corpus = await joinCorpusText(zip);
    const clauses = parseDefinitionClauses(corpus);
    // The fixture has:
    //   1. "Discloser" means ABC Corporation, including ...  (English)
    //   2. "매수인"이라 함은 ABC 주식회사를 말한다           (Korean)
    const defined = clauses.map((c) => c.defined);
    expect(defined).toContain("Discloser");
    expect(defined).toContain("매수인");
  });

  it("Lane C tags 'Discloser' as defined (via the D9 hardcoded list)", async () => {
    const buf = fs.readFileSync(FIXTURE);
    const zip = await JSZip.loadAsync(buf);
    const corpus = await joinCorpusText(zip);
    const clauses = parseDefinitionClauses(corpus);
    const abc = propagateVariants("ABC Corporation", corpus, clauses);
    const discloserEntry = abc.defined.find((c) => c.text === "Discloser");
    expect(discloserEntry).toBeDefined();
    expect(discloserEntry?.kind).toBe("defined");
  });

  it("Lane C tags '매수인' as defined (via the D9 Korean list)", async () => {
    const buf = fs.readFileSync(FIXTURE);
    const zip = await JSZip.loadAsync(buf);
    const corpus = await joinCorpusText(zip);
    const clauses = parseDefinitionClauses(corpus);
    const abcKr = propagateVariants("ABC 주식회사", corpus, clauses);
    const entry = abcKr.defined.find((c) => c.text === "매수인");
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("defined");
  });

  it("the combined target list does NOT include defined terms by default (D9)", () => {
    expect(allTargets).not.toContain("Discloser");
    expect(allTargets).not.toContain("매수인");
    expect(allTargets).not.toContain("the Buyer");
    expect(allTargets).not.toContain("Recipient");
  });

  it("end-to-end: the pipeline produces a clean verify against the combined target list", async () => {
    const v = await verifyRedaction(reportZip, allTargets);
    expect(v.isClean).toBe(true);
    expect(v.survived).toEqual([]);
  });

  it("end-to-end: every entity seed + its substring variants are gone from the output", async () => {
    const scopes = listScopes(reportZip);
    for (const scope of scopes) {
      const xml = await readScopeXml(reportZip, scope);
      for (const seed of ENTITY_SEEDS) {
        expect(xml).not.toContain(seed);
      }
      // And the known substring variant forms
      expect(xml).not.toContain("ABC Corp");
      expect(xml).not.toContain("Sunrise Ventures");
    }
  });

  it("end-to-end: every PII string is gone from the output", async () => {
    const knownPii = [
      "kim@abc-corp.kr",
      "legal@sunrise.com",
      "010-1234-5678",
      "+1 415 555 0199",
      "123-45-67890",
      "12-3456789",
    ];
    const v = await verifyRedaction(reportZip, knownPii);
    expect(v.isClean).toBe(true);
  });

  it("D9: defined-term phrases MUST still be present in the redacted output", async () => {
    // The single most important assertion in this file. If this fails,
    // it means Lane C regressed on D9 and downstream AI would lose the
    // ability to parse "the Buyer shall disclose ..." into "which party
    // must disclose what".
    const body = await readScopeXml(reportZip, {
      kind: "body",
      path: "word/document.xml",
    });
    for (const survivor of MUST_SURVIVE) {
      expect(body).toContain(survivor);
    }
  });

  it("D9: the iconic 'The Buyer acknowledges that [REDACTED]' sentence is intact", async () => {
    // Section 3.1 of the fixture reads:
    //   'The Buyer acknowledges that ABC Corporation may disclose certain
    //    proprietary information...'
    // After redaction it should be:
    //   'The Buyer acknowledges that [REDACTED] may disclose ...'
    // NOT: 'The [REDACTED] acknowledges that [REDACTED] ...'
    const body = await readScopeXml(reportZip, {
      kind: "body",
      path: "word/document.xml",
    });
    expect(body).toContain("Buyer");
    expect(body).not.toContain("The [REDACTED] acknowledges");
    expect(body).toContain("Buyer acknowledges");
  });
});
