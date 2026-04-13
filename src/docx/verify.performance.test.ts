import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { verifyRedaction } from "./verify.js";

// @ts-expect-error Phase 8 red test: module lands in implementation step 6.
import {
  buildSelectionTargets,
  resolveSelectedTargets,
} from "../selection-targets.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

function splitRunParagraph(text: string): string {
  const midpoint = Math.max(1, Math.floor(text.length / 2));
  return `<w:p><w:r><w:t>${text.slice(0, midpoint)}</w:t></w:r><w:r><w:t>${text.slice(midpoint)}</w:t></w:r></w:p>`;
}

async function syntheticDocx(parts: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  return zip;
}

describe("phase-8 performance smoke", () => {
  it("resolves 2,000 grouped occurrences within 50ms", () => {
    const occurrences = Array.from({ length: 2_000 }, (_, idx) => ({
      scope: { kind: "body", path: "word/document.xml" } as const,
      text: `Entity ${idx % 100}`,
      normalizedText: `Entity ${idx % 100}`,
      ruleId: "entities.en-corp-suffix",
      sourceKind: "nonPii" as const,
    }));

    const targets = buildSelectionTargets(occurrences);
    const selected = new Set(targets.map((target: { id: string }) => target.id));

    const started = performance.now();
    const resolved = resolveSelectedTargets(targets, selected);
    const elapsed = performance.now() - started;

    expect(resolved).toHaveLength(100);
    expect(elapsed).toBeLessThan(50);
  });

  it("verifies 100 structured targets against a 50KB split-run scope within 750ms", async () => {
    const repeatedSecrets = Array.from({ length: 100 }, (_, idx) => `Secret ${idx}`);
    const paragraphs = repeatedSecrets
      .map((text) => splitRunParagraph(`${text} `.repeat(32)))
      .join("");
    const filler = splitRunParagraph("filler ".repeat(8_000));
    const zip = await syntheticDocx({
      "word/document.xml": `<w:document ${W_NS}><w:body>${paragraphs}${filler}</w:body></w:document>`,
    });

    const targets = repeatedSecrets.map((text, idx) => ({
      id: `auto:${idx}`,
      displayText: text,
      redactionLiterals: [text],
      verificationLiterals: [text],
      scopes: [{ kind: "body", path: "word/document.xml" } as const],
    }));

    const started = performance.now();
    const result = await verifyRedaction(
      zip,
      targets as unknown as Parameters<typeof verifyRedaction>[1],
    );
    const elapsed = performance.now() - started;

    expect(result.stringsTested).toBe(100);
    expect(elapsed).toBeLessThan(750);
  });
});
