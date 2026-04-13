import { describe, expect, it } from "vitest";

import type { FinalizedReport } from "./finalize.js";
import type { ResolvedRedactionTarget } from "../selection-targets.js";
import {
  buildRepairPlan,
  classifyGuidedReport,
  runGuidedRecovery,
} from "./guided-recovery.js";

function makeResolvedTarget(
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

function makeReport(
  opts: {
    verifyIsClean: boolean;
    wordCountSane?: boolean;
    survived?: FinalizedReport["verify"]["survived"];
  },
): FinalizedReport {
  return {
    verify: {
      isClean: opts.verifyIsClean,
      scopesChecked: 1,
      stringsTested: 1,
      survived: opts.survived ?? [],
    },
    scopeMutations: [],
    wordCount: {
      before: 100,
      after: opts.wordCountSane === false ? 40 : 82,
      droppedPct: opts.wordCountSane === false ? 60 : 18,
      thresholdPct: 30,
      sane: opts.wordCountSane ?? true,
    },
    sha256: "a".repeat(64),
    outputBytes: new Uint8Array([1, 2, 3]),
  };
}

describe("guided-recovery", () => {
  it("does not attempt a repair pass when pass-1 verify is already clean", async () => {
    let calls = 0;
    const originalBytes = new Uint8Array([9, 9, 9]);
    const selectedTargets = [makeResolvedTarget("ABC Corporation")];

    const result = await runGuidedRecovery(
      {
        originalBytes,
        selectedTargets,
        pass1Report: makeReport({ verifyIsClean: true }),
      },
      {
        runRepairPass: async () => {
          calls++;
          return makeReport({ verifyIsClean: true });
        },
      },
    );

    expect(calls).toBe(0);
    expect(result.repair).toEqual({
      attempted: false,
      repairedSurvivorCount: 0,
      initialSurvivorCount: 0,
      finalSurvivorCount: 0,
      touchedScopePaths: [],
      touchedNonBodyScope: false,
      touchedFieldOrRelsSurface: false,
    });
    expect(classifyGuidedReport(result)).toBe("downloadReady");
  });

  it("retries exactly once from the original bytes and can classify a repaired success", async () => {
    const originalBytes = new Uint8Array([1, 2, 3, 4]);
    const selectedTargets = [makeResolvedTarget("ABC Corporation")];
    const pass1 = makeReport({
      verifyIsClean: false,
      survived: [
        {
          targetId: "auto:ABC Corporation",
          text: "ABC Corporation",
          matchedLiteral: "ABC Corp",
          scope: { kind: "header", path: "word/header1.xml" },
          count: 1,
          surface: "text",
        },
      ],
    });

    let calls = 0;
    const result = await runGuidedRecovery(
      {
        originalBytes,
        selectedTargets,
        pass1Report: pass1,
      },
      {
        runRepairPass: async (bytes, repairPlan) => {
          calls++;
          expect(bytes).toEqual(originalBytes);
          expect(repairPlan.targets).toEqual([
            {
              ...selectedTargets[0],
              redactionLiterals: ["ABC Corporation", "ABC Corp"],
              verificationLiterals: ["ABC Corporation", "ABC Corp"],
            },
          ]);
          return makeReport({ verifyIsClean: true });
        },
      },
    );

    expect(calls).toBe(1);
    expect(result.repair).toEqual({
      attempted: true,
      repairedSurvivorCount: 1,
      initialSurvivorCount: 1,
      finalSurvivorCount: 0,
      touchedScopePaths: ["word/header1.xml"],
      touchedNonBodyScope: true,
      touchedFieldOrRelsSurface: false,
    });
    expect(result.warningReasons).toEqual(["repairTouchedNonBodyScopes"]);
    expect(classifyGuidedReport(result)).toBe("downloadWarning");
  });

  it("classifies repaired leaks in rel targets as a clean warning state", async () => {
    const originalBytes = new Uint8Array([7, 7, 7]);
    const selectedTargets = [makeResolvedTarget("contact@pearlabyss.com")];
    const pass1 = makeReport({
      verifyIsClean: false,
      survived: [
        {
          targetId: "auto:contact@pearlabyss.com",
          text: "contact@pearlabyss.com",
          scope: {
            kind: "rels",
            path: "word/_rels/document.xml.rels",
          } as never,
          count: 1,
          surface: "rels",
        },
      ],
    });

    const result = await runGuidedRecovery(
      {
        originalBytes,
        selectedTargets,
        pass1Report: pass1,
      },
      {
        runRepairPass: async () => makeReport({ verifyIsClean: true }),
      },
    );

    expect(result.warningReasons).toEqual([
      "repairTouchedNonBodyScopes",
      "repairTouchedFieldOrRelsSurface",
    ]);
    expect(classifyGuidedReport(result)).toBe("downloadWarning");
  });

  it("keeps the report blocking when the one repair retry still leaves survivors", async () => {
    const originalBytes = new Uint8Array([5, 5, 5]);
    const selectedTargets = [makeResolvedTarget("ABC Corporation")];
    const pass1 = makeReport({
      verifyIsClean: false,
      survived: [
        {
          targetId: "auto:ABC Corporation",
          text: "ABC Corporation",
          scope: { kind: "body", path: "word/document.xml" },
          count: 1,
          surface: "text",
        },
      ],
    });

    const pass2 = makeReport({
      verifyIsClean: false,
      survived: [
        {
          targetId: "auto:ABC Corporation",
          text: "ABC Corporation",
          scope: { kind: "body", path: "word/document.xml" },
          count: 1,
          surface: "text",
        },
      ],
    });

    const result = await runGuidedRecovery(
      {
        originalBytes,
        selectedTargets,
        pass1Report: pass1,
      },
      {
        runRepairPass: async () => pass2,
      },
    );

    expect(result.repair.finalSurvivorCount).toBe(1);
    expect(result.warningReasons).toEqual([]);
    expect(result.residualRisk).toEqual({
      hasResidualSurvivors: true,
      survivorCount: 1,
      requiresAcknowledgement: true,
    });
    expect(classifyGuidedReport(result)).toBe("downloadRisk");
  });

  it("derives a deterministic exact-literal repair plan from pass-1 survivors", () => {
    const plan = buildRepairPlan(
      [makeResolvedTarget("ABC Corporation")],
      [
        {
          targetId: "auto:ABC Corporation",
          text: "ABC Corporation",
          matchedLiteral: "ABC Corp",
          scope: { kind: "rels", path: "word/_rels/document.xml.rels" } as never,
          count: 1,
          surface: "rels",
        },
      ],
    );

    expect(plan.targets).toEqual([
      {
        ...makeResolvedTarget("ABC Corporation"),
        redactionLiterals: ["ABC Corporation", "ABC Corp"],
        verificationLiterals: ["ABC Corporation", "ABC Corp"],
      },
    ]);
    expect(plan.touchedScopePaths).toEqual(["word/_rels/document.xml.rels"]);
  });
});
