import JSZip from "jszip";

import { collectVerifySurfaces } from "../docx/verify-surfaces.js";
import type { ResolvedRedactionTarget } from "../selection-targets.js";

export interface PreflightExpansionSummary {
  readonly touchedScopePaths: readonly string[];
  readonly touchedNonBodyScope: boolean;
  readonly touchedFieldSurface: boolean;
  readonly touchedRelsSurface: boolean;
  readonly expandedLiteralCount: number;
}

export interface PreflightExpansionPlan {
  readonly targets: readonly ResolvedRedactionTarget[];
  readonly relsRepairs: ReadonlyMap<string, readonly string[]>;
  readonly summary: PreflightExpansionSummary;
}

export async function buildPreflightExpansionPlan(
  bytes: Uint8Array,
  selectedTargets: readonly ResolvedRedactionTarget[],
): Promise<PreflightExpansionPlan> {
  if (selectedTargets.length === 0) {
    return {
      targets: [],
      relsRepairs: new Map(),
      summary: idleSummary(),
    };
  }

  const zip = await JSZip.loadAsync(bytes.slice());
  const surfaces = await collectVerifySurfaces(zip);
  const extraLiterals = new Map<string, Set<string>>();
  const relsRepairs = new Map<string, Set<string>>();
  const touchedScopePaths = new Set<string>();
  let touchedNonBodyScope = false;
  let touchedFieldSurface = false;
  let touchedRelsSurface = false;

  for (const target of selectedTargets) {
    extraLiterals.set(target.id, new Set(target.redactionLiterals));
  }

  for (const surface of surfaces.scopeTextSurfaces) {
    for (const target of selectedTargets) {
      for (const literal of target.verificationLiterals) {
        if (!surface.text.includes(literal)) continue;
        const bucket = extraLiterals.get(target.id)!;
        bucket.add(literal);
        touchedScopePaths.add(surface.scope.path);
        if (surface.scope.kind !== "body") {
          touchedNonBodyScope = true;
        }
      }
    }
  }

  for (const surface of surfaces.scopeInstrSurfaces) {
    for (const target of selectedTargets) {
      for (const literal of target.verificationLiterals) {
        if (!surface.text.includes(literal)) continue;
        const bucket = extraLiterals.get(target.id)!;
        bucket.add(literal);
        touchedScopePaths.add(surface.scope.path);
        touchedFieldSurface = true;
        if (surface.scope.kind !== "body") {
          touchedNonBodyScope = true;
        }
      }
    }
  }

  for (const surface of surfaces.relsTargetSurfaces) {
    for (const target of selectedTargets) {
      for (const literal of target.verificationLiterals) {
        if (!surface.text.includes(literal)) continue;
        const bucket = extraLiterals.get(target.id)!;
        bucket.add(literal);
        const relBucket = relsRepairs.get(surface.path) ?? new Set<string>();
        relBucket.add(literal);
        relsRepairs.set(surface.path, relBucket);
        touchedScopePaths.add(surface.path);
        touchedNonBodyScope = true;
        touchedRelsSurface = true;
      }
    }
  }

  let expandedLiteralCount = 0;
  const targets = selectedTargets.map((target) => {
    const merged = sortLongestFirstUnique(extraLiterals.get(target.id) ?? []);
    expandedLiteralCount += Math.max(0, merged.length - target.redactionLiterals.length);
    return {
      ...target,
      redactionLiterals: merged,
      verificationLiterals: merged,
    };
  });

  return {
    targets,
    relsRepairs: new Map(
      [...relsRepairs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, literals]) => [path, sortLongestFirstUnique(literals)]),
    ),
    summary: {
      touchedScopePaths: [...touchedScopePaths].sort(),
      touchedNonBodyScope,
      touchedFieldSurface,
      touchedRelsSurface,
      expandedLiteralCount,
    },
  };
}

export async function applyRelsRepairsToZip(
  zip: JSZip,
  relsRepairs: ReadonlyMap<string, readonly string[]>,
  placeholder = "[REDACTED]",
): Promise<void> {
  for (const [path, literals] of relsRepairs) {
    const file = zip.file(path);
    if (file === null) continue;
    const xml = await file.async("string");
    const repaired = repairRelationshipTargets(xml, literals, placeholder);
    zip.file(path, repaired);
  }
}

function repairRelationshipTargets(
  relsXml: string,
  literals: readonly string[],
  placeholder: string,
): string {
  if (literals.length === 0) return relsXml;
  const sorted = sortLongestFirstUnique(literals);

  return relsXml.replace(
    /(<Relationship\b[^>]*\bTarget=")([^"]*)(")/g,
    (_full, open: string, rawTarget: string, close: string) => {
      const decoded = decodeXml(rawTarget);
      let repaired = decoded;
      for (const literal of sorted) {
        repaired = repaired.split(literal).join(placeholder);
      }
      if (repaired === decoded) {
        return `${open}${rawTarget}${close}`;
      }
      return `${open}${encodeXmlAttr(repaired)}${close}`;
    },
  );
}

function idleSummary(): PreflightExpansionSummary {
  return {
    touchedScopePaths: [],
    touchedNonBodyScope: false,
    touchedFieldSurface: false,
    touchedRelsSurface: false,
    expandedLiteralCount: 0,
  };
}

function sortLongestFirstUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
}

function encodeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    );
}
