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
});
