import { normalizeForMatching } from "../detection/normalize.js";

export interface PreviewCandidate {
  readonly text: string;
  readonly selected: boolean;
}

interface MarkSpan {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly candidate: string;
  readonly selected: boolean;
}

export type PreviewSegment =
  | { readonly type: "text"; readonly key: string; readonly text: string }
  | {
      readonly type: "mark";
      readonly key: string;
      readonly text: string;
      readonly candidate: string;
      readonly selected: boolean;
    };

export function buildPreviewSegments(
  paragraphText: string,
  candidates: readonly PreviewCandidate[],
  scopeIndex: number,
  paragraphIndex: number,
): PreviewSegment[] {
  const marks = findMarksWithFallback(paragraphText, candidates);
  if (marks.length === 0) {
    return [
      {
        type: "text",
        key: `${scopeIndex}-${paragraphIndex}-text-0`,
        text: paragraphText,
      },
    ];
  }

  const segments: PreviewSegment[] = [];
  let cursor = 0;
  let segmentIndex = 0;

  for (const mark of marks) {
    if (mark.start > cursor) {
      segments.push({
        type: "text",
        key: `${scopeIndex}-${paragraphIndex}-text-${segmentIndex}`,
        text: paragraphText.slice(cursor, mark.start),
      });
      segmentIndex += 1;
    }

    segments.push({
      type: "mark",
      key: `${scopeIndex}-${paragraphIndex}-mark-${segmentIndex}`,
      text: mark.text,
      candidate: mark.candidate,
      selected: mark.selected,
    });
    segmentIndex += 1;
    cursor = mark.end;
  }

  if (cursor < paragraphText.length) {
    segments.push({
      type: "text",
      key: `${scopeIndex}-${paragraphIndex}-text-${segmentIndex}`,
      text: paragraphText.slice(cursor),
    });
  }

  return segments;
}

function findMarksWithFallback(
  paragraphText: string,
  candidates: readonly PreviewCandidate[],
): MarkSpan[] {
  const primary = resolveOverlaps(findRawMarks(paragraphText, candidates));
  const matchedCandidates = new Set(primary.map((span) => span.candidate));
  const remaining = candidates.filter((candidate) => !matchedCandidates.has(candidate.text));
  if (remaining.length === 0) return primary;

  const normalizedParagraph = normalizeForMatching(paragraphText);
  const fallback: MarkSpan[] = [];

  for (const candidate of remaining) {
    const normalizedCandidate = normalizeForMatching(candidate.text).text;
    if (normalizedCandidate.length === 0) continue;

    let from = 0;
    while (from <= normalizedParagraph.text.length - normalizedCandidate.length) {
      const idx = normalizedParagraph.text.indexOf(normalizedCandidate, from);
      if (idx < 0) break;

      const start = normalizedParagraph.origOffsets[idx];
      const end = normalizedParagraph.origOffsets[idx + normalizedCandidate.length];
      if (start === undefined || end === undefined) break;

      fallback.push({
        start,
        end,
        text: paragraphText.slice(start, end),
        candidate: candidate.text,
        selected: candidate.selected,
      });
      from = idx + 1;
    }
  }

  return resolveOverlaps([...primary, ...fallback]);
}

function findRawMarks(
  paragraphText: string,
  candidates: readonly PreviewCandidate[],
): MarkSpan[] {
  const spans: MarkSpan[] = [];

  for (const candidate of candidates) {
    if (candidate.text.length === 0) continue;

    let from = 0;
    while (from <= paragraphText.length - candidate.text.length) {
      const start = paragraphText.indexOf(candidate.text, from);
      if (start < 0) break;

      spans.push({
        start,
        end: start + candidate.text.length,
        text: candidate.text,
        candidate: candidate.text,
        selected: candidate.selected,
      });
      from = start + 1;
    }
  }

  return spans;
}

function resolveOverlaps(spans: readonly MarkSpan[]): MarkSpan[] {
  const sorted = [...spans].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });

  const kept: MarkSpan[] = [];
  let cursor = 0;

  for (const span of sorted) {
    if (span.start < cursor) continue;
    kept.push(span);
    cursor = span.end;
  }

  return kept;
}
