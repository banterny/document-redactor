/**
 * Word count sanity check — Lane D Paranoid-mode ship gate.
 *
 * Catches the "the regex went nuclear" class of failure: a broken alias,
 * a too-greedy pattern, or a seed entity that happened to be a common
 * word ("Company", "Group") — anything that causes the redactor to
 * replace so much text that the output is useless. The mechanism is
 * intentionally dumb: count words before, count words after, flag if
 * the drop exceeds a threshold (default 30% per the D7 Paranoid row).
 *
 * Why 30%? A realistic redaction of a 30-page NDA removes maybe 50-150
 * tokens (party names, aliases, emails, phones, some product names).
 * Against ~8000 words in the document, that's 1-2%. A 30% drop means
 * something is wrong — the regex is over-matching, the seed is too
 * broad, a definition clause linked the wrong entity, etc. Better to
 * show a warning and let the user review than to silently ship garbage.
 *
 * The check is **informational** in Standard level (shown in the report
 * but doesn't block download) and a **ship gate** in Paranoid level
 * (blocks download, same semantics as round-trip verify failure). Lane D
 * just computes the numbers; the caller decides the policy.
 *
 * Public API:
 *   - `countWords(text)` — pure, returns whitespace-separated token count.
 *   - `snapshotWordCount(zip)` — async, sums `countWords` across every
 *     text-bearing scope in the DOCX zip.
 *   - `evaluateWordCountSanity(before, after, thresholdPct?)` — returns
 *     `{ before, after, droppedPct, thresholdPct, sane }`.
 *   - `DEFAULT_DROP_THRESHOLD_PCT` — the D7 Paranoid threshold (30).
 *
 * Intentional simplifications:
 *   - "Word" = whitespace-separated token. This over-counts Korean
 *     (particles are attached, so '매수인은' and '매수인' count as one)
 *     and under-counts English with heavy punctuation, but the ratio
 *     is stable across before/after so the *delta* is accurate, which
 *     is all the sanity check cares about.
 *   - No tokenization library, no language detection. Adding either
 *     would push the bundle over the 3MB cap. The simpler check catches
 *     the one error class that matters.
 */

import type JSZip from "jszip";

import { extractTextFromZip } from "../detection/extract-text.js";

/**
 * Default drop-percent threshold for sanity evaluation. Per the D7
 * matrix row for Paranoid level: "word count sanity check (±30%)."
 */
export const DEFAULT_DROP_THRESHOLD_PCT = 30;

/**
 * Result of one sanity evaluation. `sane` is the single-bit ship-gate
 * flag; the rest are there so the UI can render the "words before/after"
 * number and the threshold used.
 */
export interface WordCountSanity {
  readonly before: number;
  readonly after: number;
  /** Percentage drop, integer, clamped to [0, 100]. */
  readonly droppedPct: number;
  /** Threshold that was used (echoed from the input). */
  readonly thresholdPct: number;
  /** True iff `droppedPct <= thresholdPct`. */
  readonly sane: boolean;
}

/**
 * Count whitespace-separated tokens in `text`. Trimmed, so leading and
 * trailing whitespace don't produce phantom empty tokens. An empty or
 * whitespace-only string returns 0.
 *
 * Deliberately simple. See the module comment for why this is the right
 * trade-off against full Unicode tokenization.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  // Split on ANY whitespace (ASCII + Unicode) via the \s class, so
  // tabs, newlines, and ideographic spaces all count.
  return trimmed.split(/\s+/u).length;
}

/**
 * Walk every text-bearing scope in `zip` and return the total number of
 * tokens across them. Used as the before/after snapshot for
 * `evaluateWordCountSanity`.
 *
 * The walk goes through `extractTextFromZip` so it picks up the same
 * scopes the redactor operates on (body + headers + footers + footnotes
 * + endnotes + comments). Any new scope added to `listScopes` is
 * automatically included here.
 */
export async function snapshotWordCount(zip: JSZip): Promise<number> {
  const scopes = await extractTextFromZip(zip);
  let total = 0;
  for (const { text } of scopes) {
    total += countWords(text);
  }
  return total;
}

/**
 * Evaluate whether the word-count drop from `before` to `after` is
 * within the sanity threshold. Returns a structured report including
 * the threshold used (so callers can render "X% dropped, threshold Y%").
 *
 * Guarded against the degenerate cases:
 *   - `before === 0`: the document had no words. Drop is 0, sane=true.
 *   - `after > before`: should never happen (redaction only removes),
 *     but if it does we clamp the drop to 0 and report sane=true.
 *   - `before > 0 && after === 0`: 100% drop, always insane.
 */
export function evaluateWordCountSanity(
  before: number,
  after: number,
  thresholdPct: number = DEFAULT_DROP_THRESHOLD_PCT,
): WordCountSanity {
  let droppedPct: number;
  if (before === 0) {
    // Empty document — no meaningful drop to compute.
    droppedPct = 0;
  } else if (after >= before) {
    droppedPct = 0;
  } else {
    droppedPct = Math.round(((before - after) / before) * 100);
  }
  return {
    before,
    after,
    droppedPct,
    thresholdPct,
    sane: droppedPct <= thresholdPct,
  };
}
