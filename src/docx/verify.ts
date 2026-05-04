/**
 * Round-trip verifier.
 *
 * Contract:
 * - trust only the output DOCX and selected literal payloads;
 * - scan visible text, field instructions, and relationship targets;
 * - use literal string checks only: no regex, no normalization;
 * - report every survivor with target id, scope, surface, and count.
 */

import type JSZip from "jszip";

import type {
  ResolvedRedactionTarget,
  SelectionTargetId,
} from "../selection-targets.js";
import { collectVerifySurfaces } from "./verify-surfaces.js";
import type { Scope } from "./types.js";

export type VerifySurfaceKind = "text" | "field" | "rels";
const EXTERNAL_URL_TARGET_ID = "security:external-url";

/** One sensitive string that survived in one scope. */
export interface SurvivedString {
  /** Which reviewed target this survival corresponds to. */
  readonly targetId: SelectionTargetId;
  /** The literal sensitive string that should not have been present. */
  readonly text: string;
  /** Which exact literal variant matched, if different from `text`. */
  readonly matchedLiteral?: string;
  /** Which scope the survival was found in. */
  readonly scope: Scope;
  /** Which parsed surface the survival came from. */
  readonly surface: VerifySurfaceKind;
  /** How many times the string appeared in this scope. */
  readonly count: number;
}

/** Outcome of one verification pass. */
export interface VerifyResult {
  /** True iff zero sensitive strings survived. The ship gate. */
  readonly isClean: boolean;
  /** Every survival, grouped by (string, scope). Empty when isClean is true. */
  readonly survived: ReadonlyArray<SurvivedString>;
  /** How many text-bearing scopes were walked. */
  readonly scopesChecked: number;
  /** How many sensitive strings were tested. */
  readonly stringsTested: number;
}

/**
 * Verify that none of the given sensitive strings appear in any text-bearing
 * scope of the given DOCX zip. Uses extracted visible text for ordinary Word
 * scopes, explicit field-instruction surfaces for field code leak vectors,
 * and explicit relationship targets for hyperlink leak vectors.
 *
 * Still deliberately simple: no regex, no Unicode normalization, and no
 * dependency on detection rules. The verifier trusts only the selected target
 * payload plus parsed output surfaces.
 */
export async function verifyRedaction(
  zip: JSZip,
  targets: ReadonlyArray<ResolvedRedactionTarget>,
): Promise<VerifyResult> {
  const activeTargets = targets.filter(
    (target) => target.verificationLiterals.some((literal) => literal.length > 0),
  );
  const surfaces = await collectVerifySurfaces(zip);
  const survivedByKey = new Map<string, SurvivedString>();

  for (const surface of surfaces.scopeTextSurfaces) {
    for (const target of activeTargets) {
      for (const literal of target.verificationLiterals) {
        const count = countOccurrences(surface.text, literal);
        if (count === 0) continue;
        mergeSurvival(
          survivedByKey,
          target,
          surface.scope,
          "text",
          count,
          literal,
        );
      }
    }
  }

  for (const surface of surfaces.scopeInstrSurfaces) {
    for (const target of activeTargets) {
      for (const literal of target.verificationLiterals) {
        const count = countOccurrences(surface.text, literal);
        if (count === 0) continue;
        mergeSurvival(
          survivedByKey,
          target,
          surface.scope,
          "field",
          count,
          literal,
        );
      }
    }
  }

  for (const surface of surfaces.relsTargetSurfaces) {
    const scope = { kind: "rels", path: surface.path } as unknown as Scope;
    if (isExternalHttpUrl(surface.text)) {
      mergeSurvival(
        survivedByKey,
        {
          id: `${EXTERNAL_URL_TARGET_ID}:${surface.text}`,
          displayText: surface.text,
          redactionLiterals: [surface.text],
          verificationLiterals: [surface.text],
          scopes: [scope],
        },
        scope,
        "rels",
        1,
        surface.text,
      );
    }
    for (const target of activeTargets) {
      for (const literal of target.verificationLiterals) {
        const count = countOccurrences(surface.text, literal);
        if (count === 0) continue;
        mergeSurvival(
          survivedByKey,
          target,
          scope,
          "rels",
          count,
          literal,
        );
      }
    }
  }

  const survived = [...survivedByKey.values()];

  return {
    isClean: survived.length === 0,
    survived,
    scopesChecked: surfaces.scopesChecked,
    stringsTested: activeTargets.reduce(
      (sum, target) =>
        sum + target.verificationLiterals.filter((literal) => literal.length > 0).length,
      0,
    ),
  };
}

/**
 * Count non-overlapping occurrences of `needle` in `haystack` using a
 * simple indexOf walk. Faster and more predictable than `RegExp` for
 * literal substring counting.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count++;
    from = idx + needle.length;
  }
}

function mergeSurvival(
  survivedByKey: Map<string, SurvivedString>,
  target: ResolvedRedactionTarget,
  scope: Scope,
  surface: VerifySurfaceKind,
  count: number,
  matchedLiteral: string,
): void {
  const key = `${target.id}\0${scope.path}\0${surface}`;
  const existing = survivedByKey.get(key);
  if (existing === undefined) {
    survivedByKey.set(
      key,
      matchedLiteral === target.displayText
        ? {
            targetId: target.id,
            text: target.displayText,
            scope,
            surface,
            count,
          }
        : {
            targetId: target.id,
            text: target.displayText,
            matchedLiteral,
            scope,
            surface,
            count,
          },
    );
    return;
  }

  survivedByKey.set(key, {
    ...existing,
    count: existing.count + count,
    matchedLiteral: existing.matchedLiteral ?? matchedLiteral,
  });
}

function isExternalHttpUrl(text: string): boolean {
  return text.startsWith("http://") || text.startsWith("https://");
}
