/**
 * Scope walker.
 *
 * Eng review lock-in #1: every redaction touches all 10 OOXML scopes that may
 * contain user-authored text, in one place. New scopes are added once here and
 * the rest of the system picks them up automatically. Skipping a scope is the
 * #1 source of redaction leaks.
 *
 * The walker resolves the parameterised header/footer paths at runtime by
 * listing the zip's entries.
 */

import type JSZip from "jszip";

import { SCOPE_PATTERNS, type Scope, type ScopeKind } from "./types.js";

/**
 * Return every text-bearing scope present in the given DOCX zip, in a stable
 * order: body → footnotes → endnotes → comments → headers (numerically) →
 * footers (numerically). Scopes that don't exist in the zip are simply
 * omitted from the result.
 */
export function listScopes(zip: JSZip): Scope[] {
  const out: Scope[] = [];

  // Singletons in fixed order
  for (const kind of ["body", "footnotes", "endnotes", "comments"] as const) {
    const path = SCOPE_PATTERNS[kind];
    if (typeof path === "string" && zip.file(path) !== null) {
      out.push({ kind, path });
    }
  }

  // Headers and footers — collect, sort numerically by their suffix.
  const headerRe = SCOPE_PATTERNS.header;
  const footerRe = SCOPE_PATTERNS.footer;

  const headers: Scope[] = [];
  const footers: Scope[] = [];
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path]?.dir === true) continue;
    if (headerRe.test(path)) headers.push({ kind: "header", path });
    else if (footerRe.test(path)) footers.push({ kind: "footer", path });
  }

  headers.sort(byNumericSuffix);
  footers.sort(byNumericSuffix);

  out.push(...headers, ...footers);
  return out;
}

/**
 * Sort comparator for paths like `word/header1.xml`, `word/header10.xml`.
 * Numeric ordering, not lexicographic — so header10 sorts AFTER header2.
 */
function byNumericSuffix(a: Scope, b: Scope): number {
  return numericSuffix(a.path) - numericSuffix(b.path);
}

function numericSuffix(path: string): number {
  const m = /(\d+)\.xml$/.exec(path);
  if (m === null) return 0;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read every scope's XML body from the zip and return them in walker order.
 * Used by the redactor to perform a single pass over all sensitive scopes.
 */
export async function readScopeXml(
  zip: JSZip,
  scope: Scope,
): Promise<string> {
  const file = zip.file(scope.path);
  if (file === null) {
    throw new Error(`scope ${scope.path} not found in zip`);
  }
  return file.async("string");
}

/**
 * Filter helper used by tests and audit logging — returns the subset of
 * scopes whose `kind` matches one of the requested kinds.
 */
export function scopesOfKind(
  scopes: ReadonlyArray<Scope>,
  ...kinds: ReadonlyArray<ScopeKind>
): Scope[] {
  return scopes.filter((s) => kinds.includes(s.kind));
}
