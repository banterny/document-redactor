/**
 * Flatten track changes (`w:ins`, `w:del`) inside a WordprocessingML document.
 *
 * Eng review lock-in #1 leak vector #1: deleted text is still present in the
 * XML inside `<w:del>` elements. A redactor that walks only the visible text
 * would leak it. Level 2 Standard policy is to flatten:
 *
 *   - Unwrap `<w:ins>...</w:ins>` (keep the inner runs — the inserted text
 *     becomes part of the body).
 *   - Drop `<w:del>...</w:del>` entirely (the deleted text disappears,
 *     including its `<w:delText>` payload).
 *
 * This is a pure string-in / string-out transformation. The decision to flatten
 * (vs. preserve track changes intact) is fixed at the Level 2 Standard policy
 * level; Conservative may want to preserve, Paranoid may want to drop *both*.
 * Both extensions are caller policy, not this function's job.
 */

/**
 * Flatten track changes in a single XML scope. Idempotent: running it twice
 * produces the same output as running it once.
 */
export function flattenTrackChanges(xml: string): string {
  let out = xml;

  // Drop self-closing <w:del/> first (rare but valid).
  out = out.replace(/<w:del\b[^>]*\/>/g, "");

  // Drop <w:del>...</w:del> blocks entirely. The inner content is the deleted
  // text wrapped in <w:delText>; we want all of it gone. Non-greedy to avoid
  // swallowing across siblings.
  out = out.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");

  // Drop self-closing <w:ins/> (no inserted text, nothing to keep).
  out = out.replace(/<w:ins\b[^>]*\/>/g, "");

  // Unwrap <w:ins>...</w:ins> — keep the inner XML (the inserted runs)
  // and drop only the wrapper. Non-greedy.
  out = out.replace(
    /<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g,
    (_match, inner: string) => inner,
  );

  return out;
}

/**
 * Convenience predicate used by tests and verification: does the XML still
 * contain any track-change markers?
 */
export function hasTrackChanges(xml: string): boolean {
  return /<w:ins\b/.test(xml) || /<w:del\b/.test(xml);
}
