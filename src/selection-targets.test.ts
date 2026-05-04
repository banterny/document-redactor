import { describe, expect, it } from "vitest";

import type { Scope } from "./docx/types.js";
import {
  assertNoSelectionTargetIdCollisions,
  buildManualSelectionTarget,
  buildSelectionTargets,
  countSelectionTargets,
  findOriginalLiteralVariants,
  indexSelectionTargets,
  resolveSelectedTargets,
} from "./selection-targets.js";

function scope(kind: Scope["kind"], path: string): Scope {
  return { kind, path } as Scope;
}

describe("selection-targets", () => {
  it("groups repeated auto occurrences into one deterministic auto target", () => {
    const targets = buildSelectionTargets([
      {
        scope: scope("body", "word/document.xml"),
        text: "ABC Corp",
        normalizedText: "ABC Corp",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
      {
        scope: scope("header", "word/header1.xml"),
        text: "ABC Corp",
        normalizedText: "ABC Corp",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
      {
        scope: scope("body", "word/document.xml"),
        text: "ABC Corp",
        normalizedText: "ABC Corp",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
    ]);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      displayText: "ABC Corp",
      normalizedText: "ABC Corp",
      count: 3,
      literalVariants: ["ABC Corp"],
      sourceKinds: ["nonPii"],
    });
    expect(targets[0]!.id.startsWith("auto:")).toBe(true);
    expect(targets[0]!.scopes.map((entry: Scope) => entry.path)).toEqual([
      "word/document.xml",
      "word/header1.xml",
    ]);
    expect(countSelectionTargets(targets)).toBe(1);
  });

  it("preserves occurrence confidence for UI provenance", () => {
    const targets = buildSelectionTargets([
      {
        scope: scope("body", "word/document.xml"),
        text: "Project Falcon",
        normalizedText: "Project Falcon",
        ruleId: "heuristics.capitalization-cluster",
        sourceKind: "nonPii",
        reviewSection: "heuristics",
        confidence: 0.7,
      },
    ]);

    expect(targets[0]!.occurrences[0]!.confidence).toBe(0.7);
  });

  it("keeps manual and auto targets with the same display text in separate namespaces", () => {
    const targets = buildSelectionTargets([
      {
        scope: scope("body", "word/document.xml"),
        text: "Pearl Abyss",
        normalizedText: "Pearl Abyss",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
      {
        scope: null,
        text: "Pearl Abyss",
        normalizedText: "Pearl Abyss",
        ruleId: null,
        sourceKind: "manual",
      },
    ]);

    expect(targets.map((target: { id: string }) => target.id).sort()).toEqual([
      expect.stringMatching(/^auto:/),
      expect.stringMatching(/^manual:/),
    ]);
  });

  it("indexes targets by id and resolves only the selected ids", () => {
    const targets = buildSelectionTargets([
      {
        scope: scope("body", "word/document.xml"),
        text: "ABC",
        normalizedText: "ABC",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
      {
        scope: scope("body", "word/document.xml"),
        text: "ABC Corp",
        normalizedText: "ABC Corp",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
    ]);

    const index = indexSelectionTargets(targets);
    const selected = new Set([targets[1]!.id]);
    const resolved = resolveSelectedTargets(targets, selected);

    expect(index.get(targets[0]!.id)?.displayText).toBe("ABC");
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: targets[1]!.id,
      displayText: "ABC Corp",
      redactionLiterals: ["ABC Corp"],
      verificationLiterals: ["ABC Corp"],
    });
  });

  it("throws when selection resolution sees an unknown id", () => {
    const targets = buildSelectionTargets([
      {
        scope: scope("body", "word/document.xml"),
        text: "ABC Corp",
        normalizedText: "ABC Corp",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
    ]);

    expect(() =>
      resolveSelectedTargets(targets, new Set(["auto:does-not-exist"])),
    ).toThrow(/unknown/i);
  });

  it("preserves exact original literals instead of emitting normalized forms", () => {
    const targets = buildSelectionTargets([
      {
        scope: scope("body", "word/document.xml"),
        text: "０１０–1234–5678",
        normalizedText: "010-1234-5678",
        ruleId: "identifiers.phone-kr",
        sourceKind: "pii",
      },
      {
        scope: scope("body", "word/document.xml"),
        text: "“Pearl Abyss”",
        normalizedText: "\"Pearl Abyss\"",
        ruleId: "entities.en-corp-suffix",
        sourceKind: "nonPii",
      },
    ]);

    const resolved = resolveSelectedTargets(
      targets,
      new Set(targets.map((target: { id: string }) => target.id)),
    );

    expect(resolved[0]!.redactionLiterals).not.toContain("010-1234-5678");
    expect(resolved[0]!.redactionLiterals).toContain("０１０–1234–5678");
    expect(resolved[1]!.redactionLiterals).toContain("“Pearl Abyss”");
    expect(resolved[1]!.verificationLiterals).not.toContain("\"Pearl Abyss\"");
  });

  it("adds original document slices to manual targets matched by normalization", () => {
    const target = buildManualSelectionTarget(
      "010-1234-5678",
      "other",
      "Please call ０１０–1234–5678 before closing.",
    );

    const [resolved] = resolveSelectedTargets([target], new Set([target.id]));

    expect(target.literalVariants).toContain("010-1234-5678");
    expect(target.literalVariants).toContain("０１０–1234–5678");
    expect(resolved!.redactionLiterals).toContain("０１０–1234–5678");
    expect(resolved!.verificationLiterals).toContain("０１０–1234–5678");
  });

  it("adds smart-quote document slices to manual targets matched by normalization", () => {
    const target = buildManualSelectionTarget(
      "\"Pearl Abyss\"",
      "entities",
      "The agreement refers to “Pearl Abyss” throughout.",
    );

    const [resolved] = resolveSelectedTargets([target], new Set([target.id]));

    expect(target.literalVariants).toContain("\"Pearl Abyss\"");
    expect(target.literalVariants).toContain("“Pearl Abyss”");
    expect(resolved!.redactionLiterals).toContain("“Pearl Abyss”");
    expect(resolved!.verificationLiterals).toContain("“Pearl Abyss”");
  });

  it("keeps manual targets literal-only when no normalized corpus match exists", () => {
    const target = buildManualSelectionTarget(
      "010-1234-5678",
      "other",
      "No phone number in this corpus.",
    );

    expect(target.literalVariants).toEqual(["010-1234-5678"]);
  });

  it("recovers every unique original slice for a normalized manual string", () => {
    expect(
      findOriginalLiteralVariants(
        "010-1234-5678",
        "A 010-1234-5678 B ０１０–1234–5678 C 010‑1234‑5678",
      ),
    ).toEqual(["010-1234-5678", "０１０–1234–5678", "010‑1234‑5678"]);
  });

  it("throws if two different display strings share one selection id", () => {
    expect(() =>
      assertNoSelectionTargetIdCollisions([
        { id: "auto:deadbeef", displayText: "ABC Corp" },
        { id: "auto:deadbeef", displayText: "XYZ Corp" },
      ]),
    ).toThrow(/collision/i);
  });
});
