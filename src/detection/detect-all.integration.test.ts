import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  buildAllTargetsFromZip,
  detectAll,
  detectAllInZip,
} from "./detect-all.js";
import { buildTargetsFromZip } from "./detect-pii.js";
import { extractTextFromZip } from "./extract-text.js";
import { listScopes } from "../docx/scopes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);

const MIN_FIXTURE_CANDIDATE_COUNT = 39;

describe("detect-all integration — bilingual worst-case fixture", () => {
  let zip: JSZip;

  beforeAll(async () => {
    const bytes = fs.readFileSync(FIXTURE);
    zip = await JSZip.loadAsync(bytes);
  });

  it("finds at least the frozen baseline number of candidates", async () => {
    const result = await detectAllInZip(zip);
    expect(result.candidates.length).toBeGreaterThanOrEqual(
      MIN_FIXTURE_CANDIDATE_COUNT,
    );
  });

  it("documents the walked scopes that are empty of matches", async () => {
    const result = await detectAllInZip(zip);
    const represented = new Set(
      [...result.candidates.map((e) => e.scope.path), ...result.structuralDefinitions.map((e) => e.scope.path)],
    );
    const missing = listScopes(zip).map((scope) => scope.path).filter((path) => !represented.has(path));
    // The current worst-case fixture has two scopes present but empty of
    // Phase 1 matches: comments.xml and footer2.xml.
    expect(missing).toEqual(["word/comments.xml", "word/footer2.xml"]);
  });

  it("finds structural definitions on the fixture", async () => {
    const result = await detectAllInZip(zip);
    expect(
      result.structuralDefinitions.some(
        (entry) => entry.definition.source === "definition-section",
      ),
    ).toBe(true);
  });

  it("finds at least one financial candidate on the fixture", async () => {
    const result = await detectAllInZip(zip);
    expect(
      result.candidates.some(
        (entry) => entry.candidate.ruleId.startsWith("financial."),
      ),
    ).toBe(true);
  });

  it("finds at least one temporal candidate on the fixture", async () => {
    const result = await detectAllInZip(zip);
    expect(
      result.candidates.some(
        (entry) => entry.candidate.ruleId.startsWith("temporal."),
      ),
    ).toBe(true);
  });

  it("produces a superset of legacy targets on the fixture", async () => {
    const legacy = await buildTargetsFromZip(zip);
    const fresh = await JSZip.loadAsync(fs.readFileSync(FIXTURE));
    const next = await buildAllTargetsFromZip(fresh);
    for (const target of legacy) {
      expect(next).toContain(target);
    }
  });

  it("buildAllTargetsFromZip completes within 2 seconds", async () => {
    const fresh = await JSZip.loadAsync(fs.readFileSync(FIXTURE));
    const start = performance.now();
    await buildAllTargetsFromZip(fresh);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("produces no duplicate targets", async () => {
    const fresh = await JSZip.loadAsync(fs.readFileSync(FIXTURE));
    const targets = await buildAllTargetsFromZip(fresh);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("returns targets in longest-first order", async () => {
    const fresh = await JSZip.loadAsync(fs.readFileSync(FIXTURE));
    const targets = await buildAllTargetsFromZip(fresh);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i - 1]!.length).toBeGreaterThanOrEqual(targets[i]!.length);
    }
  });

  it("detects the fixture corpus as English-dominant", async () => {
    const scoped = await extractTextFromZip(zip);
    const corpus = scoped.map((entry) => entry.text).join("\n");
    expect(detectAll(corpus).documentLanguage).toBe("en");
  });
});
