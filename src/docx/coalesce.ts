/**
 * Text run coalescer.
 *
 * WordprocessingML splits paragraphs of visible text across many `<w:r>` (run)
 * elements whenever formatting changes, a hyperlink starts, a spell-check
 * marker fires, or Word feels like it. A search-and-replace pass that scans
 * the raw XML directly will MISS strings that span run boundaries:
 *
 *     <w:r><w:t>ABC Corpo</w:t></w:r><w:r><w:t>ration</w:t></w:r>
 *
 * For a legal redactor, missing one string is a confidentiality breach. So
 * before any redaction or pattern search, every paragraph is run through
 * `coalesceParagraphRuns()` to produce a logical text view — the concatenated
 * visible characters of every text run inside the paragraph — together with a
 * `runs` index that maps each character offset back to the originating run.
 *
 * Public API:
 *   - `coalesceParagraphRuns(paragraphXml)` returns a `CoalescedParagraph`
 *     containing `text` (the logical string) and `runs` (the offset map).
 *
 * Constraints:
 *   - Pure function. Same input → same output.
 *   - No DOM, no XML parser dependency. We work on the raw XML string with
 *     targeted regex because (a) the bundle size budget (3MB) makes a full
 *     parser expensive, (b) the WordprocessingML run structure is well
 *     defined and easy to walk by string scanning, (c) keeping it pure
 *     string-in / string-out makes round-trip rewriting trivial.
 *
 * Out of scope (future modules will handle these):
 *   - Substitution write-back (will live in `redact.ts`).
 *   - Field codes, hyperlinks, math, embedded objects.
 *   - Multi-paragraph coalescing — coalescing is per-paragraph because
 *     redaction is per-paragraph (a sensitive string never spans paragraphs).
 */

/** Position of one text run inside the coalesced logical string. */
export interface RunSpan {
  /** Index of the run inside the paragraph (0-based). */
  readonly index: number;
  /** Inclusive start offset in the coalesced text. */
  readonly start: number;
  /** Number of characters this run contributed (may be 0 for empty runs). */
  readonly length: number;
}

/** Result of coalescing one paragraph. */
export interface CoalescedParagraph {
  /** Concatenated visible text of every `<w:t>` inside the paragraph. */
  readonly text: string;
  /** One entry per `<w:r>` inside the paragraph, in document order. */
  readonly runs: ReadonlyArray<RunSpan>;
}

/**
 * Walk a paragraph's `<w:r>` elements in document order and concatenate the
 * text content of any `<w:t>` they contain. Other run children (e.g. `<w:rPr>`,
 * `<w:tab/>`, `<w:br/>`) are ignored — they don't contribute visible text that
 * a redactor needs to match against.
 */
export function coalesceParagraphRuns(paragraphXml: string): CoalescedParagraph {
  const runs: RunSpan[] = [];
  const textParts: string[] = [];
  let logicalOffset = 0;

  // Walk every <w:r ...>...</w:r> in document order.
  for (const runXml of iterateRuns(paragraphXml)) {
    const runText = extractRunText(runXml);
    runs.push({
      index: runs.length,
      start: logicalOffset,
      length: runText.length,
    });
    textParts.push(runText);
    logicalOffset += runText.length;
  }

  return {
    text: textParts.join(""),
    runs,
  };
}

/**
 * Yield each `<w:r ...>...</w:r>` substring inside `paragraphXml` in document
 * order. Implemented as a generator so callers can stream paragraphs without
 * materialising an intermediate array.
 *
 * Self-closing `<w:r/>` is treated as an empty run.
 */
function* iterateRuns(paragraphXml: string): Generator<string, void, void> {
  // Match either <w:r ...>...</w:r> (with content) or <w:r .../> (self-closing)
  // Non-greedy on the body. We don't validate nesting because runs cannot be
  // nested in valid WordprocessingML.
  const RUN_RE = /<w:r(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:r>)/g;
  let match: RegExpExecArray | null;
  while ((match = RUN_RE.exec(paragraphXml)) !== null) {
    yield match[0];
  }
}

/**
 * Extract the visible text content of a single `<w:r>...</w:r>` substring.
 * Joins all `<w:t>...</w:t>` (and self-closing `<w:t/>`) elements found
 * inside the run, decoding XML entities along the way.
 *
 * Note: a single `<w:r>` typically contains exactly ONE `<w:t>`, but the
 * spec permits multiple. We handle the multi-`<w:t>` case for robustness.
 */
function extractRunText(runXml: string): string {
  // Match <w:t ...>content</w:t> or self-closing <w:t .../>.
  const T_RE = /<w:t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:t>)/g;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = T_RE.exec(runXml)) !== null) {
    // match[1] is undefined for the self-closing form. The non-self-closing
    // form always captures (possibly an empty string).
    const content = match[1] ?? "";
    parts.push(decodeXmlEntities(content));
  }
  return parts.join("");
}

/**
 * Decode the five predefined XML entities and any numeric character refs.
 * We don't depend on a generic HTML decoder because the surface area inside
 * a WordprocessingML `<w:t>` is restricted to these five plus numeric refs.
 */
function decodeXmlEntities(s: string): string {
  if (s.indexOf("&") === -1) return s; // fast path
  return s.replace(
    /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g,
    (_match, named: string | undefined, dec: string | undefined, hex: string | undefined) => {
      if (named !== undefined) {
        switch (named) {
          case "amp":
            return "&";
          case "lt":
            return "<";
          case "gt":
            return ">";
          case "quot":
            return '"';
          case "apos":
            return "'";
        }
      }
      if (dec !== undefined) {
        const code = Number.parseInt(dec, 10);
        if (Number.isFinite(code)) return String.fromCodePoint(code);
      }
      if (hex !== undefined) {
        const code = Number.parseInt(hex, 16);
        if (Number.isFinite(code)) return String.fromCodePoint(code);
      }
      return _match;
    },
  );
}
