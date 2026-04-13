import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { buildResolvedTargetsFromStrings } from "../selection-targets.js";
import { buildPreflightExpansionPlan } from "./preflight-expansion.js";
import type { ResolvedRedactionTarget } from "../selection-targets.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;

async function syntheticDocx(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

function bodyWith(text: string): string {
  return `<w:document ${W_NS}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
}

function makeTarget(
  text: string,
  overrides: Partial<ResolvedRedactionTarget> = {},
): ResolvedRedactionTarget {
  return {
    id: `auto:${text}`,
    displayText: text,
    redactionLiterals: [text],
    verificationLiterals: [text],
    scopes: [{ kind: "body", path: "word/document.xml" }],
    ...overrides,
  };
}

describe("preflight-expansion", () => {
  it("returns an empty plan when no selected targets exist", async () => {
    const bytes = await syntheticDocx({
      "word/document.xml": bodyWith("hello world"),
    });

    const plan = await buildPreflightExpansionPlan(bytes, []);

    expect(plan.targets).toEqual([]);
    expect(plan.relsRepairs.size).toBe(0);
    expect(plan.summary).toEqual({
      touchedScopePaths: [],
      touchedNonBodyScope: false,
      touchedFieldSurface: false,
      touchedRelsSurface: false,
      expandedLiteralCount: 0,
    });
  });

  it("pre-computes rel-target repairs for selected survivors before pass 1", async () => {
    const email = "contact@pearlabyss.com";
    const bytes = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="x"><Relationship Id="rId5" Type="hyperlink" Target="mailto:${email}" TargetMode="External"/></Relationships>`,
    });

    const plan = await buildPreflightExpansionPlan(
      bytes,
      buildResolvedTargetsFromStrings([email]),
    );

    expect(plan.targets).toEqual(buildResolvedTargetsFromStrings([email]));
    expect(plan.relsRepairs).toEqual(
      new Map([["word/_rels/document.xml.rels", [email]]]),
    );
    expect(plan.summary).toEqual({
      touchedScopePaths: ["word/_rels/document.xml.rels"],
      touchedNonBodyScope: true,
      touchedFieldSurface: false,
      touchedRelsSurface: true,
      expandedLiteralCount: 0,
    });
  });

  it("records field-surface matches for selected targets without inventing new ones", async () => {
    const selected = "contact@pearlabyss.com";
    const unselected = "legal@sunrise.com";
    const bytes = await syntheticDocx({
      "word/document.xml": `<w:document ${W_NS}><w:body><w:p><w:fldSimple w:instr=" HYPERLINK &quot;mailto:${selected}&quot; ">` +
        `<w:r><w:t>${selected}</w:t></w:r></w:fldSimple>` +
        `<w:r><w:t>${unselected}</w:t></w:r></w:p></w:body></w:document>`,
    });

    const plan = await buildPreflightExpansionPlan(
      bytes,
      buildResolvedTargetsFromStrings([selected]),
    );

    expect(plan.targets).toEqual(buildResolvedTargetsFromStrings([selected]));
    expect(plan.relsRepairs.size).toBe(0);
    expect(plan.summary).toEqual({
      touchedScopePaths: ["word/document.xml"],
      touchedNonBodyScope: false,
      touchedFieldSurface: true,
      touchedRelsSurface: false,
      expandedLiteralCount: 0,
    });
  });

  it("deduplicates and sorts merged literals deterministically per target", async () => {
    const text = "ABC Corporation";
    const bytes = await syntheticDocx({
      "word/document.xml": bodyWith(text),
    });

    const plan = await buildPreflightExpansionPlan(bytes, [
      makeTarget(text, {
        redactionLiterals: ["ABC", text, "ABC", text],
        verificationLiterals: ["ABC", text],
      }),
    ]);

    expect(plan.targets).toEqual([
      {
        ...makeTarget(text),
        redactionLiterals: [text, "ABC"],
        verificationLiterals: [text, "ABC"],
      },
    ]);
  });

  it("tracks mixed non-body and rels touches in the preflight summary", async () => {
    const email = "contact@pearlabyss.com";
    const bytes = await syntheticDocx({
      "word/header1.xml": `<w:hdr ${W_NS}><w:p><w:fldSimple w:instr=" HYPERLINK &quot;mailto:${email}&quot; "><w:r><w:t>${email}</w:t></w:r></w:fldSimple></w:p></w:hdr>`,
      "word/_rels/header1.xml.rels": `<?xml version="1.0"?><Relationships xmlns="x"><Relationship Id="rId1" Type="hyperlink" Target="mailto:${email}" TargetMode="External"/></Relationships>`,
    });

    const plan = await buildPreflightExpansionPlan(
      bytes,
      buildResolvedTargetsFromStrings([email]),
    );

    expect(plan.summary).toEqual({
      touchedScopePaths: ["word/_rels/header1.xml.rels", "word/header1.xml"],
      touchedNonBodyScope: true,
      touchedFieldSurface: true,
      touchedRelsSurface: true,
      expandedLiteralCount: 0,
    });
  });
});
