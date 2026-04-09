/**
 * Shared types for the DOCX I/O layer (Lane B).
 *
 * The DOCX layer is intentionally narrow: load a `.docx` file into memory,
 * walk its text-bearing scopes, apply transformations (flatten track changes,
 * strip comments, scrub metadata, redact substrings), and emit a modified
 * `.docx`. Detection (regex) and variant propagation live in other layers.
 */

/**
 * The 10 OOXML scopes that may contain user-authored text the redactor must
 * walk. Defined once here so any new scope is added in exactly one place
 * (eng review lock-in #1: scope walker abstraction).
 *
 * Each entry is a path inside the DOCX zip. Some are singletons
 * (`word/document.xml`, `word/comments.xml`); others are parameterised by
 * an integer index that Word assigns per-section (`word/header1.xml`,
 * `word/header2.xml`, ...). The walker resolves the parameterised forms
 * at runtime by listing the zip's files.
 */
export const SCOPE_PATTERNS = {
  body: "word/document.xml",
  footnotes: "word/footnotes.xml",
  endnotes: "word/endnotes.xml",
  comments: "word/comments.xml",
  header: /^word\/header\d*\.xml$/,
  footer: /^word\/footer\d*\.xml$/,
} as const;

export type ScopeKind = keyof typeof SCOPE_PATTERNS;

/**
 * A resolved scope inside a loaded DOCX. The `path` is the zip entry path
 * and `kind` indicates which category of scope it belongs to (so callers
 * can apply scope-specific policies — e.g. comments may be deleted entirely
 * while body XML is rewritten in-place).
 */
export interface Scope {
  readonly kind: ScopeKind;
  readonly path: string;
}

/**
 * The set of metadata fields the scrub-metadata pass clears. These are the
 * fields most likely to leak the author's identity, the document's prior
 * title, or the company name from `docProps/core.xml` and `docProps/app.xml`.
 */
export const METADATA_SENSITIVE_FIELDS = [
  "creator",
  "lastModifiedBy",
  "lastPrinted",
  "title",
  "subject",
  "keywords",
  "description",
  "Company",
  "Manager",
  "Template",
] as const;

export type MetadataField = (typeof METADATA_SENSITIVE_FIELDS)[number];

/**
 * Result of a redaction pass against a single text scope. Used by the
 * orchestrator to build an audit log and to feed the round-trip
 * verification step.
 */
export interface ScopeRedactionResult {
  readonly scope: Scope;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly substitutionsApplied: number;
}
