import { describe, expect, it } from "vitest";

import { canDownloadReport, redactedFilename } from "./download-policy.js";

describe("download-policy", () => {
  it("allows strict clean and warning reports without acknowledgement", () => {
    expect(canDownloadReport("strictClean")).toBe(true);
    expect(canDownloadReport("warning")).toBe(true);
  });

  it("requires acknowledgement for risk reports", () => {
    expect(canDownloadReport("risk", false)).toBe(false);
    expect(canDownloadReport("risk", true)).toBe(true);
  });

  it("adds UNVERIFIED to risk override filenames", () => {
    expect(redactedFilename("NDA.docx", { unverified: true })).toBe(
      "NDA.UNVERIFIED.redacted.docx",
    );
    expect(redactedFilename("NDA", { unverified: true })).toBe(
      "NDA.UNVERIFIED.redacted",
    );
  });

  it("keeps clean filenames on the existing redacted pattern", () => {
    expect(redactedFilename("NDA.docx")).toBe("NDA.redacted.docx");
    expect(redactedFilename("NDA")).toBe("NDA.redacted");
  });
});
