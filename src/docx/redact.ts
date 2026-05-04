/**
 * Cross-run redactor for WordprocessingML text runs.
 *
 * Contract:
 * - match against coalesced logical paragraph text, not raw XML strings;
 * - rewrite only the runs touched by a match;
 * - preserve untouched runs and formatting byte-for-byte;
 * - prefer the longest overlapping target.
 */

import { coalesceParagraphRuns, type RunSpan } from "./coalesce.js";

export const DEFAULT_PLACEHOLDER = "[REDACTED]";

/** A non-overlapping match found in a coalesced logical text. */
export interface RedactionMatch {
  /** Inclusive start offset in the logical text. */
  readonly start: number;
  /** Exclusive end offset in the logical text. */
  readonly end: number;
  /** The literal substring matched (one of the target strings). */
  readonly matched: string;
}

/**
 * Find every non-overlapping match of any target string in `text`.
 *
 * Targets are matched longest-first: when "ABC" and "ABC Corporation" are
 * both in the target list and "ABC Corporation" appears in the text, the
 * longer target wins (so we don't redact "ABC" and leave " Corporation"
 * dangling).
 */
export function findRedactionMatches(
  text: string,
  targets: ReadonlyArray<string>,
): RedactionMatch[] {
  if (text.length === 0) return [];
  // Drop empty strings (a zero-length target would match everywhere) and
  // sort by length descending so the regex alternation tries longer strings
  // first at each position.
  const sorted = [...targets]
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return [];

  const pattern = sorted.map(escapeRegex).join("|");
  const re = new RegExp(pattern, "g");
  const matches: RedactionMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      matched: m[0],
    });
  }
  return matches;
}

/**
 * Redact every occurrence of any target inside one paragraph's XML and
 * return the rewritten paragraph. Pure: same input → same output. Runs
 * not touched by any match are returned byte-identical, including their
 * `<w:rPr>` formatting.
 */
export function redactParagraph(
  paragraphXml: string,
  targets: ReadonlyArray<string>,
  placeholder: string = DEFAULT_PLACEHOLDER,
): string {
  const coalesced = coalesceParagraphRuns(paragraphXml);
  if (coalesced.runs.length === 0 || coalesced.text.length === 0) {
    return paragraphXml;
  }

  const matches = findRedactionMatches(coalesced.text, targets);
  if (matches.length === 0) return paragraphXml;

  // Materialise the per-run text from the coalesced view. We mutate this
  // array in place as we apply substitutions, then write the new contents
  // back into the original XML.
  const runTexts: string[] = coalesced.runs.map((r) =>
    coalesced.text.slice(r.start, r.start + r.length),
  );

  // Apply substitutions right-to-left so each match's offsets stay valid
  // against the original logical text (which is what coalesced.runs is
  // indexed against).
  for (let i = matches.length - 1; i >= 0; i--) {
    applyMatch(runTexts, coalesced.runs, matches[i]!, placeholder);
  }

  return writeBackRunTexts(paragraphXml, runTexts);
}

/**
 * Safety-net: scrub sensitive strings from any `<w:instrText>` content or
 * `<w:fldSimple w:instr="...">` attribute that survives the flatten pass.
 */
export function redactInstrText(
  xml: string,
  targets: ReadonlyArray<string>,
  placeholder: string = DEFAULT_PLACEHOLDER,
): string {
  if (targets.length === 0) return xml;

  const sorted = [...targets]
    .filter((target) => target.length > 0)
    .sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return xml;

  let out = xml.replace(
    /<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/g,
    (full, inner: string) => {
      let redacted = inner;
      for (const target of sorted) {
        redacted = redacted.split(target).join(placeholder);
      }
      if (redacted === inner) return full;
      return full.replace(inner, redacted);
    },
  );

  out = out.replace(
    /(<w:fldSimple\s[^>]*?w:instr=")([^"]*)("[^>]*>)/g,
    (full, open: string, instr: string, close: string) => {
      let redacted = instr;
      for (const target of sorted) {
        redacted = redacted.split(target).join(placeholder);
        const encoded = target.replace(/"/g, "&quot;");
        if (encoded !== target) {
          redacted = redacted.split(encoded).join(placeholder);
        }
      }
      if (redacted === instr) return full;
      return `${open}${redacted}${close}`;
    },
  );

  return out;
}

/**
 * Apply `redactParagraph` to every `<w:p>` element inside an entire scope
 * XML (e.g. word/document.xml, word/header1.xml, word/footnotes.xml).
 * Self-closing `<w:p/>` and `<w:pPr>` are left alone.
 */
export function redactScopeXml(
  scopeXml: string,
  targets: ReadonlyArray<string>,
  placeholder: string = DEFAULT_PLACEHOLDER,
): string {
  // Match `<w:p>...</w:p>` and self-closing `<w:p/>`. The negative-lookahead
  // `(?!P)` ensures we don't accidentally match `<w:pPr>` (paragraph
  // properties) — we want a paragraph element, not a properties container.
  const afterRunRedact = scopeXml.replace(
    /<w:p(?!P|r)(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g,
    (paragraph) => {
      // Self-closing paragraphs have no body to redact.
      if (paragraph.endsWith("/>")) return paragraph;
      return redactParagraph(paragraph, targets, placeholder);
    },
  );

  return redactInstrText(afterRunRedact, targets, placeholder);
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Apply one match to the in-progress `runTexts` array. The `runs` parameter
 * is the original (coalesced) run span list and is NOT updated as matches
 * are applied — that's why callers must process matches right-to-left.
 */
function applyMatch(
  runTexts: string[],
  runs: ReadonlyArray<RunSpan>,
  match: RedactionMatch,
  placeholder: string,
): void {
  const startRun = findRunContaining(runs, match.start);
  // For end: match.end is exclusive, so the LAST character of the match
  // sits at offset (end - 1). Find the run containing that.
  const endRun = findRunContaining(runs, match.end - 1);

  if (startRun.index === endRun.index) {
    // Single-run match: surgically replace the slice within one run's text.
    const orig = runTexts[startRun.index]!;
    const offBegin = match.start - startRun.start;
    const offEnd = match.end - startRun.start;
    runTexts[startRun.index] =
      orig.slice(0, offBegin) + placeholder + orig.slice(offEnd);
    return;
  }

  // Cross-run match. Surgical replacement:
  //   - start run keeps everything before the match, then placeholder
  //   - middle runs become empty
  //   - end run keeps everything after the match
  const startOrig = runTexts[startRun.index]!;
  const endOrig = runTexts[endRun.index]!;
  const offBeginInStart = match.start - startRun.start;
  const offEndInEnd = match.end - endRun.start;

  runTexts[startRun.index] = startOrig.slice(0, offBeginInStart) + placeholder;
  for (let i = startRun.index + 1; i < endRun.index; i++) {
    runTexts[i] = "";
  }
  runTexts[endRun.index] = endOrig.slice(offEndInEnd);
}

/** Find the run that contains the given logical-text offset. Skips empty runs. */
function findRunContaining(
  runs: ReadonlyArray<RunSpan>,
  offset: number,
): RunSpan {
  for (const r of runs) {
    if (r.length === 0) continue;
    if (offset >= r.start && offset < r.start + r.length) return r;
  }
  // This should be impossible because match offsets always come from a
  // coalesced text view that was built from these runs.
  throw new Error(
    `redact: logical offset ${offset} did not fall in any non-empty run`,
  );
}

/**
 * Walk every `<w:r>` in the paragraph XML in document order and replace its
 * `<w:t>` content with the corresponding entry from `runTexts`. Self-closing
 * `<w:r/>` is left as-is (their text was always empty and the runIdx counter
 * still advances correctly because the coalescer also yields them in order).
 */
function writeBackRunTexts(
  paragraphXml: string,
  runTexts: ReadonlyArray<string>,
): string {
  let runIdx = 0;
  return paragraphXml.replace(
    /<w:r(?!Pr|Style|Fonts)(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:r>)/g,
    (runMatch) => {
      const i = runIdx;
      runIdx++;
      // Self-closing <w:r/> carries no text — leave as-is.
      if (!runMatch.includes("</w:r>")) {
        return runMatch;
      }
      return rewriteRunText(runMatch, runTexts[i]!);
    },
  );
}

/**
 * Replace the visible text of a single `<w:r>...</w:r>` element. Handles:
 *   - one `<w:t>` element (the common case)
 *   - multiple `<w:t>` elements in one run (rare but legal): the FIRST
 *     carries the new text, subsequent ones are emptied
 *   - self-closing `<w:t/>` (carries no text — replaced with the new text)
 *   - no `<w:t>` at all (control-only run with `<w:tab/>` etc.): if the
 *     new text is non-empty, insert a `<w:t>` element before `</w:r>`
 */
function rewriteRunText(runXml: string, newText: string): string {
  const encoded = encodeXmlEntities(newText);
  const wtRe = /<w:t(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:t>)/g;

  let isFirst = true;
  let foundAny = false;
  const result = runXml.replace(wtRe, () => {
    foundAny = true;
    if (isFirst) {
      isFirst = false;
      // First <w:t>: carries the new text. Empty placeholder uses self-closing.
      if (encoded === "") return `<w:t/>`;
      return `<w:t xml:space="preserve">${encoded}</w:t>`;
    }
    // Subsequent <w:t> elements: empty them so we don't double-print text.
    return `<w:t/>`;
  });

  if (!foundAny && encoded !== "") {
    // Run has no <w:t> at all (e.g. only `<w:tab/>`) but we need to add text.
    // Insert a new <w:t> right before </w:r>.
    return runXml.replace(
      /<\/w:r>/,
      `<w:t xml:space="preserve">${encoded}</w:t></w:r>`,
    );
  }

  return result;
}

/** Minimal XML entity encoder. We only need these three for `<w:t>` content. */
function encodeXmlEntities(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape regex metacharacters so a literal target can be used in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
