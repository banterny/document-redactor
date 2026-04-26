import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function readDoc(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("documentation stale guards", () => {
  it("documents the current DOCX size limits in user-facing guides", () => {
    for (const doc of ["README.md", "README.ko.md", "USAGE.md", "USAGE.ko.md"]) {
      const text = readDoc(doc);
      expect(text, doc).toContain("50 MB");
      expect(text, doc).toContain("20 MB");
    }
  });

  it("does not describe relationship target rewriting as absent", () => {
    const usage = readDoc("USAGE.md");
    const usageKo = readDoc("USAGE.ko.md");

    expect(usage).not.toMatch(/no explicit size cap/i);
    expect(usage).not.toContain("No `word/_rels/*.rels` Target rewriting");
    expect(usageKo).not.toContain("rels Target 재작성 없음");
  });

  it("keeps the project review brief on the current runtime state names", () => {
    const brief = readDoc("docs/review/project-review-brief.md");

    expect(brief).toContain("downloadRisk");
    expect(brief).not.toContain("verifyFail");
  });

  it("keeps agent and rule-authoring docs aligned with current names", () => {
    const claude = readDoc("CLAUDE.md");
    const rulesGuide = readDoc("docs/RULES_GUIDE.md");

    expect(claude).not.toContain("ALWAYS invoke");
    expect(rulesGuide).toContain("context.structuralDefinitions");
    expect(rulesGuide).not.toContain("context.definedTerms");
    expect(rulesGuide).not.toContain("DefinedTerm");
  });

  it("keeps external review prompts model-agnostic and schema-based", () => {
    for (const doc of [
      "docs/review/project-review-brief.md",
      "docs/review/rule-engine-review-brief.md",
    ]) {
      const text = readDoc(doc);
      expect(text, doc).not.toContain("ChatGPT 5.4");
      for (const field of [
        "severity: P0 | P1 | P2",
        "dimension: correctness | safety | architecture | performance | prompt | docs",
        "evidence: file:line",
        "proposed_fix",
        "tests_to_add",
      ]) {
        expect(text, `${doc} missing ${field}`).toContain(field);
      }
    }
  });

  it("keeps seed propagation out of the public UI surface", () => {
    const hiddenSeedSetter = "appState." + "set" + "Seeds";
    const seedSetter = "set" + "Seeds";
    const defaultSeeds = "DEFAULT_" + "SEEDS";

    for (const doc of [
      "src/ui/Sidebar.svelte",
      "src/ui/state.svelte.ts",
      "docs/RULES_GUIDE.md",
      "docs/review/project-review-brief.md",
      "CLAUDE.md",
    ]) {
      const text = readDoc(doc);

      expect(text, doc).not.toContain(hiddenSeedSetter);
      expect(text, doc).not.toMatch(/seed\s+editor/i);
    }

    const state = readDoc("src/ui/state.svelte.ts");
    expect(state).not.toContain(seedSetter);
    expect(state).not.toContain(defaultSeeds);
    expect(state).not.toMatch(/\bseeds\s*=\s*\$state/);
  });

  it("keeps analysis-session documentation aligned with the UI path", () => {
    const compact = readDoc("docs/review/agent-context.compact.md");
    const projectBrief = readDoc("docs/review/project-review-brief.md");
    const preview = readDoc("src/ui/DocumentPreview.svelte");
    const state = readDoc("src/ui/state.svelte.ts");

    expect(compact).toContain("read-only analysis session");
    expect(projectBrief).toContain("engine.analyzeDocumentSession");
    expect(preview).not.toContain("loadDocxZip");
    expect(state).toContain("preflightSurfaces: analysisSession.verifySurfaces");
  });

  it("keeps local policy import/export documented as supported", () => {
    const usage = readDoc("USAGE.md");
    const compact = readDoc("docs/review/agent-context.compact.md");
    const projectBrief = readDoc("docs/review/project-review-brief.md");

    expect(usage).toContain("Export policy");
    expect(usage).not.toContain("No policy files / team sharing");
    expect(compact).toContain("local policy JSON import/export");
    expect(projectBrief).toContain("src/ui/policy-file.ts");
  });
});
