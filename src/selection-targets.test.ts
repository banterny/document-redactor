import { describe, expect, it } from "vitest";

import type { Scope } from "./docx/types.js";

// @ts-expect-error Phase 8 red test: module lands in implementation step 6.
import {
  buildSelectionTargets,
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
});
