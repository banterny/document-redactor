import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { loadDocxZip } from "../docx/load.js";
import { collectVerifySurfaces } from "../docx/verify-surfaces.js";
import { buildResolvedTargetsFromStrings } from "../selection-targets.js";
import {
  applyRelsRepairsToZip,
  buildPreflightExpansionPlan,
  buildPreflightExpansionPlanFromSurfaces,
} from "./preflight-expansion.js";
import type { ResolvedRedactionTarget } from "../selection-targets.js";

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

async function syntheticDocx(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

function syntheticZip(parts: Record<string, string>): JSZip {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    zip.file(path, content);
  }
  return zip;
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

  it("can build the same plan from precomputed verify surfaces", async () => {
    const email = "contact@pearlabyss.com";
    const bytes = await syntheticDocx({
      "word/document.xml": bodyWith("[REDACTED]"),
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="x"><Relationship Id="rId5" Type="hyperlink" Target="mailto:${email}" TargetMode="External"/></Relationships>`,
    });
    const targets = buildResolvedTargetsFromStrings([email]);
    const zip = await loadDocxZip(bytes);
    const surfaces = await collectVerifySurfaces(zip);

    await expect(buildPreflightExpansionPlan(bytes, targets)).resolves.toEqual(
      buildPreflightExpansionPlanFromSurfaces(surfaces, targets),
    );
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
      "word/document.xml": bodyWith("[REDACTED]"),
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

  it("strips double-quoted http URLs from rels", async () => {
    const zip = syntheticZip({
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="http://evil.example/pixel"/></Relationships>`,
    });

    await applyRelsRepairsToZip(zip, new Map());

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(`Target=""`);
    expect(rels).not.toContain("http://evil.example/pixel");
  });

  it("strips double-quoted https URLs from rels", async () => {
    const zip = syntheticZip({
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="https://track.example/pixel"/></Relationships>`,
    });

    await applyRelsRepairsToZip(zip, new Map());

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(`Target=""`);
    expect(rels).not.toContain("https://track.example/pixel");
  });

  it("strips single-quoted https URLs from rels", async () => {
    const zip = syntheticZip({
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target='https://track.example/pixel'/></Relationships>`,
    });

    await applyRelsRepairsToZip(zip, new Map());

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(`Target=''`);
    expect(rels).not.toContain("https://track.example/pixel");
  });

  it("preserves mailto targets in rels", async () => {
    const zip = syntheticZip({
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="mailto:legal@example.com"/></Relationships>`,
    });

    await applyRelsRepairsToZip(zip, new Map());

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(`mailto:legal@example.com`);
  });

  it("preserves relative targets in rels", async () => {
    const zip = syntheticZip({
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="media/image1.png"/></Relationships>`,
    });

    await applyRelsRepairsToZip(zip, new Map());

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(`Target="media/image1.png"`);
  });

  it("strips only external URLs in mixed rels content", async () => {
    const zip = syntheticZip({
      "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Target="https://track.example/pixel"/><Relationship Target="media/image1.png"/><Relationship Target="mailto:legal@example.com"/></Relationships>`,
    });

    await applyRelsRepairsToZip(zip, new Map());

    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(`Target=""`);
    expect(rels).toContain(`Target="media/image1.png"`);
    expect(rels).toContain(`Target="mailto:legal@example.com"`);
  });
});
