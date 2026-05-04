/**
 * Finalization orchestrator.
 *
 * Contract:
 * - mutate only the fresh zip passed by the caller;
 * - verify selected literals after redaction;
 * - evaluate word-count sanity separately from verification;
 * - serialize deterministic bytes and hash the exact download payload;
 * - treat `isStrictlyCleanReport` as stricter than UI download policy.
 */

import type JSZip from "jszip";

import { redactDocx, type RedactionReport } from "../docx/redact-docx.js";
import type { ResolvedRedactionTarget } from "../selection-targets.js";
import { computeSha256 } from "./sha256.js";
import {
  evaluateWordCountSanity,
  snapshotWordCount,
  type WordCountSanity,
} from "./word-count.js";

/** Options for `finalizeRedaction`. Passes through to `redactDocx`. */
export interface FinalizeOptions {
  /** Structured selected targets to redact + verify. Required. */
  readonly targets: ReadonlyArray<ResolvedRedactionTarget>;
  /** Override the placeholder. Defaults to `[REDACTED]` per D8.4. */
  readonly placeholder?: string;
  /**
   * Word-count drop threshold for sanity evaluation. Defaults to 30%
   * per D7. Level 3 Paranoid mode uses this as a ship gate; Standard
   * mode uses it informationally.
   */
  readonly wordCountThresholdPct?: number;
}

/**
 * The full finalization result. All the data the UI needs in one place:
 * verify (ship gate #1), wordCount (ship gate #2), sha256 (trust badge),
 * outputBytes (the actual download), and scopeMutations (audit log).
 */
export interface FinalizedReport {
  /** Round-trip verification result. `verify.isClean` is ship gate #1. */
  readonly verify: RedactionReport["verify"];
  /** Per-scope byte-delta list, for audit logging. */
  readonly scopeMutations: RedactionReport["scopeMutations"];
  /** Word-count sanity report. `wordCount.sane` is ship gate #2. */
  readonly wordCount: WordCountSanity;
  /** Lowercase 64-char hex SHA-256 of `outputBytes`. */
  readonly sha256: string;
  /**
   * The serialized output DOCX, ready to wrap in a Blob and download.
   * Byte-stable: identical input + identical options always produces
   * identical bytes (see the `date: new Date(0)` note in the impl).
   */
  readonly outputBytes: Uint8Array;
}

/**
 * Run the full pipeline: word count before → redact → word count after
 * → generate bytes → hash → return the finalized report. This is the
 * one function Lane E (UI) should call to process a dropped DOCX.
 */
export async function finalizeRedaction(
  zip: JSZip,
  options: FinalizeOptions,
): Promise<FinalizedReport> {
  // 1. Snapshot word count BEFORE mutation.
  const wordCountBefore = await snapshotWordCount(zip);

  // 2. Apply the redaction pipeline (Lane B). This mutates `zip` in place.
  const redactOptions: {
    targets: ReadonlyArray<string>;
    verifyTargets: ReadonlyArray<ResolvedRedactionTarget>;
    placeholder?: string;
  } = {
    targets: flattenRedactionLiterals(options.targets),
    verifyTargets: options.targets,
  };
  if (options.placeholder !== undefined) {
    redactOptions.placeholder = options.placeholder;
  }
  const report = await redactDocx(zip, redactOptions);

  // 3. Snapshot word count AFTER mutation.
  const wordCountAfter = await snapshotWordCount(zip);

  // 4. Evaluate the sanity check.
  const wordCount = evaluateWordCountSanity(
    wordCountBefore,
    wordCountAfter,
    options.wordCountThresholdPct,
  );

  // 5. Pin every zip entry's date to the Unix epoch BEFORE generating
  //    bytes, so the SHA-256 is deterministic: identical input and
  //    options produce byte-identical output. Without this, JSZip
  //    embeds the entry's original timestamp (from `loadAsync`) or the
  //    current time (from `zip.file(...)` calls made during redaction),
  //    and the hash changes across process runs. JSZipObject exposes
  //    `date` as readonly in its public TS type but it is a plain
  //    mutable field at runtime — see JSZip's docs for JSZipObject.
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry !== undefined) {
      (entry as unknown as { date: Date }).date = new Date(0);
    }
  }

  const outputBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // 6. Hash the bytes.
  const sha256 = await computeSha256(outputBytes);

  return {
    verify: report.verify,
    scopeMutations: report.scopeMutations,
    wordCount,
    sha256,
    outputBytes,
  };
}

/**
 * Strict clean gate: true iff the finalized report passes BOTH the round-trip
 * verify (no sensitive strings survived) AND the word-count sanity
 * check (didn't remove more than `thresholdPct` of the document).
 */
export function isStrictlyCleanReport(report: FinalizedReport): boolean {
  return report.verify.isClean && report.wordCount.sane;
}

function flattenRedactionLiterals(
  targets: readonly ResolvedRedactionTarget[],
): string[] {
  const literals = new Set<string>();
  for (const target of targets) {
    for (const literal of target.redactionLiterals) {
      if (literal.length > 0) {
        literals.add(literal);
      }
    }
  }
  return [...literals].sort((a, b) => b.length - a.length || a.localeCompare(b));
}
