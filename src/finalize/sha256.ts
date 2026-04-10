/**
 * SHA-256 hashing utility — Lane D, trust-surface primitive.
 *
 * The single HTML file distribution model (Eureka #3, #4) hinges on
 * users being able to verify, in ten seconds, that the bytes in their
 * browser match the bytes the GitHub Release published. Two places in
 * the product call this:
 *
 *   1. **View-source modal (D8.1).** On mount, the app hashes its own
 *      HTML source and displays the digest next to an "Open GitHub
 *      Releases" link. User compares, decides whether to trust.
 *
 *   2. **Output DOCX footer (D4 "Download ready" state).** After the
 *      round-trip verify passes, the app hashes the emitted .docx bytes
 *      and surfaces the first 8 hex chars in the green download banner.
 *      This lets the user send the file to a colleague with "verify the
 *      hash if you want to confirm it's the same bytes."
 *
 * Both cases run client-side via `crypto.subtle.digest('SHA-256', ...)`.
 * Web Crypto is present in every modern browser, Node.js 20+, and Bun,
 * so there is no polyfill or fallback path. If the runtime doesn't
 * expose `globalThis.crypto.subtle`, the calling code has bigger
 * problems than hashing.
 *
 * Public API:
 *   - `computeSha256(bytes)` — async, returns lowercase 64-char hex.
 *   - `truncateHash(hash, length?, opts?)` — sync display helper for
 *     the short-form shown in banners and badges.
 *
 * Out of scope (future):
 *   - Streaming SHA-256 for files >100MB. v1 has a 20MB DOCX cap, so
 *     one-shot digest is fine.
 *   - Algorithms other than SHA-256. MD5 and SHA-1 are not trust
 *     primitives and must never be introduced.
 */

/**
 * Compute the SHA-256 hash of the given bytes and return the lowercase
 * hex-encoded digest. Pure async function — same input always produces
 * the same output, no I/O.
 *
 * Uses the Web Crypto API (`crypto.subtle.digest`), which is present in
 * every supported runtime (browser, Node 20+, Bun). The caller is
 * responsible for making sure `bytes` is a `Uint8Array` — this is a
 * byte primitive, not a string helper, so TextEncoder is the caller's
 * job. Keeping it byte-in / hex-out means the function is trivially
 * reusable for HTML source, DOCX bytes, or any other binary artifact.
 */
export async function computeSha256(bytes: Uint8Array): Promise<string> {
  // `bytes.slice()` returns a new Uint8Array backed by a plain ArrayBuffer
  // (not SharedArrayBuffer), which is what `crypto.subtle.digest` requires
  // under strict TS5 lib.dom BufferSource typing. The copy is cheap and
  // avoids any lingering SharedArrayBuffer concern from the caller.
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return bufferToHex(digest);
}

/** Options for `truncateHash`. */
export interface TruncateHashOptions {
  /** Render the truncated form in uppercase. Default false. */
  readonly upper?: boolean;
}

/**
 * Return the first `length` characters of a hex hash (default 8). Used
 * by the UI to show the short-form badge — long enough to spot obvious
 * mismatches at a glance, short enough to fit in a chip. Callers that
 * need the full hash should render the original string directly.
 */
export function truncateHash(
  hash: string,
  length = 8,
  opts: TruncateHashOptions = {},
): string {
  const slice = hash.slice(0, length);
  return opts.upper === true ? slice.toUpperCase() : slice;
}

/**
 * Convert an ArrayBuffer to a lowercase hex string. Extracted as a
 * helper so the test for `computeSha256` can rely on a single output
 * format contract regardless of the runtime's native digest encoding.
 */
function bufferToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  const chars = new Array<string>(view.length);
  for (let i = 0; i < view.length; i++) {
    chars[i] = view[i]!.toString(16).padStart(2, "0");
  }
  return chars.join("");
}
