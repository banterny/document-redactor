import { describe, expect, it } from "vitest";

import { ROLE_BLACKLIST_KO } from "./role-blacklist-ko.js";

describe("ROLE_BLACKLIST_KO", () => {
  it("exports exactly 50 entries", () => {
    expect(ROLE_BLACKLIST_KO.size).toBe(50);
  });

  it("contains the anchor word 당사자", () => {
    expect(ROLE_BLACKLIST_KO.has("당사자")).toBe(true);
  });

  it("does not contain empty strings", () => {
    expect(ROLE_BLACKLIST_KO.has("")).toBe(false);
  });

  it("contains only non-empty strings", () => {
    for (const entry of ROLE_BLACKLIST_KO) {
      expect(typeof entry).toBe("string");
      expect(entry.length).toBeGreaterThan(0);
    }
  });

  it("contains Hangul tokens", () => {
    for (const entry of ROLE_BLACKLIST_KO) {
      expect(/[가-힣]/.test(entry)).toBe(true);
    }
  });
});
