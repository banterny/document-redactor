import JSZip from "jszip";

import {
  finalizeRedaction,
  type FinalizeOptions,
  type FinalizedReport,
} from "./finalize.js";
import {
  applyRelsRepairsToZip,
  type PreflightExpansionSummary,
} from "./preflight-expansion.js";
import type { ResolvedRedactionTarget } from "../selection-targets.js";
import type { SurvivedString } from "../docx/verify.js";

export type FormatWarningReason =
  | "wordCount"
  | "preflightTouchedNonBodyScopes"
  | "preflightTouchedFieldOrRelsSurface"
  | "repairTouchedMultipleScopes"
  | "repairTouchedNonBodyScopes"
  | "repairTouchedFieldOrRelsSurface";

export interface RepairSummary {
  readonly attempted: boolean;
  readonly repairedSurvivorCount: number;
  readonly initialSurvivorCount: number;
  readonly finalSurvivorCount: number;
  readonly touchedScopePaths: readonly string[];
  readonly touchedNonBodyScope: boolean;
  readonly touchedFieldOrRelsSurface: boolean;
}

export interface GuidedFinalizeReport extends FinalizedReport {
  readonly preflight: PreflightExpansionSummary;
  readonly repair: RepairSummary;
  readonly warningReasons: readonly FormatWarningReason[];
  readonly residualRisk: ResidualRiskSummary;
}

export interface RepairPlan {
  readonly targets: readonly ResolvedRedactionTarget[];
  readonly touchedScopePaths: readonly string[];
  readonly touchedNonBodyScope: boolean;
  readonly touchedFieldOrRelsSurface: boolean;
  readonly relsRepairs: ReadonlyMap<string, readonly string[]>;
}

export type GuidedOutcomeKind =
  | "downloadReady"
  | "downloadRepaired"
  | "downloadWarning"
  | "downloadRisk";

export interface ResidualRiskSummary {
  readonly hasResidualSurvivors: boolean;
  readonly survivorCount: number;
  readonly requiresAcknowledgement: boolean;
}

export interface GuidedRecoveryOptions {
  readonly placeholder?: string;
  readonly wordCountThresholdPct?: number;
}

export interface GuidedRecoveryParams extends GuidedRecoveryOptions {
  readonly originalBytes: Uint8Array;
  readonly selectedTargets: readonly ResolvedRedactionTarget[];
  readonly pass1Report: FinalizedReport;
  readonly preflightSummary?: PreflightExpansionSummary;
}

export interface GuidedRecoveryDeps {
  readonly runRepairPass?: (
    bytes: Uint8Array,
    repairPlan: RepairPlan,
    options: GuidedRecoveryOptions,
  ) => Promise<FinalizedReport>;
}

export function classifyGuidedReport(
  report: GuidedFinalizeReport,
): GuidedOutcomeKind {
  if (!report.verify.isClean) return "downloadRisk";
  if (report.warningReasons.length > 0 || !report.wordCount.sane) {
    return "downloadWarning";
  }
  if (report.repair.attempted) return "downloadRepaired";
  return "downloadReady";
}

export function buildRepairPlan(
  selectedTargets: readonly ResolvedRedactionTarget[],
  survived: readonly SurvivedString[],
): RepairPlan {
  const byId = new Map(selectedTargets.map((target) => [target.id, target] as const));
  const extraLiterals = new Map<string, Set<string>>();
  const touchedScopePaths = new Set<string>();
  const relsRepairs = new Map<string, Set<string>>();
  let touchedNonBodyScope = false;
  let touchedFieldOrRelsSurface = false;

  for (const item of survived) {
    const target = byId.get(item.targetId);
    if (target === undefined) {
      throw new Error(
        `buildRepairPlan: unknown survived target id: ${item.targetId}`,
      );
    }

    const literal = item.matchedLiteral ?? item.text;
    const bucket = extraLiterals.get(target.id) ?? new Set(target.redactionLiterals);
    bucket.add(literal);
    extraLiterals.set(target.id, bucket);

    touchedScopePaths.add(item.scope.path);
    if (item.scope.kind !== "body") {
      touchedNonBodyScope = true;
    }
    if (item.surface === "field" || item.surface === "rels") {
      touchedFieldOrRelsSurface = true;
    }
    if (item.surface === "rels") {
      const relBucket = relsRepairs.get(item.scope.path) ?? new Set<string>();
      relBucket.add(literal);
      relsRepairs.set(item.scope.path, relBucket);
    }
  }

  const targets = selectedTargets.map((target) => {
    const nextLiterals = extraLiterals.get(target.id);
    if (nextLiterals === undefined) return target;
    const literals = sortLongestFirstUnique(nextLiterals);
    return {
      ...target,
      redactionLiterals: literals,
      verificationLiterals: literals,
    };
  });

  return {
    targets,
    touchedScopePaths: [...touchedScopePaths].sort(),
    touchedNonBodyScope,
    touchedFieldOrRelsSurface,
    relsRepairs: new Map(
      [...relsRepairs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, literals]) => [path, sortLongestFirstUnique(literals)]),
    ),
  };
}

export async function runGuidedRecovery(
  params: GuidedRecoveryParams,
  deps: GuidedRecoveryDeps = {},
): Promise<GuidedFinalizeReport> {
  if (params.pass1Report.verify.isClean) {
    return toGuidedReport(
      params.pass1Report,
      idleRepairSummary(),
      undefined,
      params.preflightSummary,
    );
  }

  const repairPlan = buildRepairPlan(
    params.selectedTargets,
    params.pass1Report.verify.survived,
  );

  const pass2 = await (deps.runRepairPass ?? defaultRepairPass)(
    params.originalBytes,
    repairPlan,
    params,
  );

  const repair: RepairSummary = {
    attempted: true,
    repairedSurvivorCount: Math.max(
      0,
      params.pass1Report.verify.survived.length - pass2.verify.survived.length,
    ),
    initialSurvivorCount: params.pass1Report.verify.survived.length,
    finalSurvivorCount: pass2.verify.survived.length,
    touchedScopePaths: repairPlan.touchedScopePaths,
    touchedNonBodyScope: repairPlan.touchedNonBodyScope,
    touchedFieldOrRelsSurface: repairPlan.touchedFieldOrRelsSurface,
  };

  return toGuidedReport(pass2, repair, undefined, params.preflightSummary);
}

export function toGuidedReport(
  report: FinalizedReport,
  repair: RepairSummary = idleRepairSummary(),
  warningReasons?: readonly FormatWarningReason[],
  preflight: PreflightExpansionSummary = idlePreflightSummary(),
): GuidedFinalizeReport {
  return {
    ...report,
    preflight,
    repair,
    warningReasons: warningReasons ?? buildWarningReasons(report, repair, preflight),
    residualRisk: buildResidualRiskSummary(report),
  };
}

function buildWarningReasons(
  report: FinalizedReport,
  repair: RepairSummary,
  preflight: PreflightExpansionSummary,
): FormatWarningReason[] {
  if (!report.verify.isClean) return [];

  const reasons = new Set<FormatWarningReason>();
  if (!report.wordCount.sane) {
    reasons.add("wordCount");
  }
  if (preflight.touchedNonBodyScope) {
    reasons.add("preflightTouchedNonBodyScopes");
  }
  if (preflight.touchedFieldSurface || preflight.touchedRelsSurface) {
    reasons.add("preflightTouchedFieldOrRelsSurface");
  }
  if (repair.attempted && repair.touchedScopePaths.length > 1) {
    reasons.add("repairTouchedMultipleScopes");
  }
  if (repair.attempted && repair.touchedNonBodyScope) {
    reasons.add("repairTouchedNonBodyScopes");
  }
  if (repair.attempted && repair.touchedFieldOrRelsSurface) {
    reasons.add("repairTouchedFieldOrRelsSurface");
  }
  return [...reasons];
}

function idlePreflightSummary(): PreflightExpansionSummary {
  return {
    touchedScopePaths: [],
    touchedNonBodyScope: false,
    touchedFieldSurface: false,
    touchedRelsSurface: false,
    expandedLiteralCount: 0,
  };
}

function idleRepairSummary(): RepairSummary {
  return {
    attempted: false,
    repairedSurvivorCount: 0,
    initialSurvivorCount: 0,
    finalSurvivorCount: 0,
    touchedScopePaths: [],
    touchedNonBodyScope: false,
    touchedFieldOrRelsSurface: false,
  };
}

async function defaultRepairPass(
  bytes: Uint8Array,
  repairPlan: RepairPlan,
  options: GuidedRecoveryOptions,
): Promise<FinalizedReport> {
  const zip = await JSZip.loadAsync(bytes.slice());
  await applyRelsRepairsToZip(
    zip,
    repairPlan.relsRepairs,
    options.placeholder,
  );

  const finalizeOptions: FinalizeOptions = {
    targets: repairPlan.targets,
    ...(options.placeholder !== undefined
      ? { placeholder: options.placeholder }
      : {}),
    ...(options.wordCountThresholdPct !== undefined
      ? { wordCountThresholdPct: options.wordCountThresholdPct }
      : {}),
  };
  return finalizeRedaction(zip, finalizeOptions);
}

function sortLongestFirstUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
}

function buildResidualRiskSummary(
  report: FinalizedReport,
): ResidualRiskSummary {
  return {
    hasResidualSurvivors: !report.verify.isClean,
    survivorCount: report.verify.survived.length,
    requiresAcknowledgement: !report.verify.isClean,
  };
}
