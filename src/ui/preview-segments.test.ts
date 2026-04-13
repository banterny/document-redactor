import { describe, expect, it } from "vitest";

import {
  buildPreviewSegments,
  type PreviewCandidate,
} from "./preview-segments.js";

function markSummary(candidates: readonly PreviewCandidate[], text: string) {
  return buildPreviewSegments(text, candidates, 0, 0)
    .filter((segment) => segment.type === "mark")
    .map((segment) => ({
      text: segment.text,
      candidate: segment.candidate,
      selected: segment.selected,
    }));
}

describe("buildPreviewSegments", () => {
  it("prefers a selected short candidate over an overlapping unchecked long candidate", () => {
    const marks = markSummary(
      [
        { text: "ABC", selected: true },
        { text: "ABC Corp", selected: false },
      ],
      "ABC Corp signed the agreement",
    );

    expect(marks).toEqual([
      { text: "ABC", candidate: "ABC", selected: true },
    ]);
  });

  it("keeps a selected long candidate over an overlapping unchecked short candidate", () => {
    const marks = markSummary(
      [
        { text: "ABC Corp", selected: true },
        { text: "ABC", selected: false },
      ],
      "ABC Corp signed the agreement",
    );

    expect(marks).toEqual([
      { text: "ABC Corp", candidate: "ABC Corp", selected: true },
    ]);
  });

  it("keeps unchecked non-overlapping candidates visible", () => {
    const marks = markSummary(
      [
        { text: "ABC", selected: true },
        { text: "Sunrise", selected: false },
      ],
      "ABC signed with Sunrise Ventures",
    );

    expect(marks).toEqual([
      { text: "ABC", candidate: "ABC", selected: true },
      { text: "Sunrise", candidate: "Sunrise", selected: false },
    ]);
  });

  it("still resolves overlaps longest-first within selected candidates", () => {
    const marks = markSummary(
      [
        { text: "ABC", selected: true },
        { text: "ABC Corp", selected: true },
      ],
      "ABC Corp signed the agreement",
    );

    expect(marks).toEqual([
      { text: "ABC Corp", candidate: "ABC Corp", selected: true },
    ]);
  });

  it("preserves normalized fallback matching for selected candidates", () => {
    const marks = markSummary(
      [{ text: "ABC", selected: true }],
      "A\u200BBC signed the agreement",
    );

    expect(marks).toEqual([
      { text: "A\u200BBC", candidate: "ABC", selected: true },
    ]);
  });
});
