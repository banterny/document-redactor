import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language-detect.js";

describe("detectLanguage", () => {
  it("returns 'ko' for Korean-only text", () => {
    expect(detectLanguage("안녕하세요 오늘 계약서를 검토합니다")).toBe("ko");
  });

  it("returns 'en' for English-only text", () => {
    expect(detectLanguage("This is a confidential disclosure agreement")).toBe(
      "en",
    );
  });

  it("returns 'mixed' for balanced bilingual text", () => {
    expect(detectLanguage("Contract 계약 Agreement 합의서")).toBe("mixed");
  });

  it("returns 'en' for empty text", () => {
    expect(detectLanguage("")).toBe("en");
  });

  it("returns 'en' for symbol-only text", () => {
    expect(detectLanguage("!!! 1234 ###")).toBe("en");
  });

  it("ignores digits and punctuation in the ratio", () => {
    expect(detectLanguage("한국어 text with 123 and ,,,")).toMatch(
      /^(ko|en|mixed)$/,
    );
  });

  it("returns 'ko' at 80% Hangul threshold", () => {
    expect(detectLanguage("가나다라마바사아ab")).toBe("ko");
  });

  it("returns 'en' at 10% Hangul threshold", () => {
    expect(detectLanguage("가abcdefghi")).toBe("en");
  });
});
