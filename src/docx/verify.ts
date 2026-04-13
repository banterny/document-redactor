/**
 * Round-trip verifier — the zero-miss safety net.
 *
 * Eng review lock-in #2: after every redaction pipeline run, the OUTPUT
 * DOCX is re-parsed, every text-bearing scope is walked, and every string
 * in the original sensitive list is searched for. If even one survived,
 * the download is BLOCKED and the user is shown which strings, in which
 * scopes, escaped the redactor.
 *
 * This is the mechanism that converts the redactor's regex imperfection
 * into a *detectable* error instead of a silent leak. It is the single
 * most important non-invariant safety mechanism in the entire product.
 *
 * Critical property: this verifier intentionally does NOT trust the redactor
 * that produced the output. It re-loads the bytes from scratch, walks the
 * scopes via the same scope walker the redactor uses, and searches with
 * plain string indexOf — no regex, no normalization, no clever tricks. It
 * is the dumbest, most direct check we can possibly run, and that is the
 * point: if anything in the redactor pipeline is wrong (a regex bug, a
 * coalescer bug, a missed scope), this verifier catches it.
 *
 * Public API:
 *   - verifyRedaction(zip, sensitiveStrings) → VerifyResult
 *     Walks every text-bearing scope and reports any sensitive string that
 *     survived. Empty `survived` array means a clean output.
 *   - VerifyResult.isClean — convenience boolean for the ship gate.
 */

import type JSZip from "jszip";

import type {
  ResolvedRedactionTarget,
  SelectionTargetId,
} from "../selection-targets.js";
import { collectVerifySurfaces } from "./verify-surfaces.js";
import type { Scope } from "./types.js";

export type VerifySurfaceKind = "text" | "field" | "rels";

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
