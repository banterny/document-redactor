import { describe, expect, it } from "vitest";

import { ROLE_BLACKLIST_EN } from "./role-blacklist-en.js";

describe("ROLE_BLACKLIST_EN", () => {
  it("exports exactly 50 entries", () => {
    expect(ROLE_BLACKLIST_EN.size).toBe(50);
  });

  it("contains the anchor word party", () => {
    expect(ROLE_BLACKLIST_EN.has("party")).toBe(true);
  });

  it("does not contain empty strings", () => {
    expect(ROLE_BLACKLIST_EN.has("")).toBe(false);
  });

  it("contains only non-empty strings", () => {
    for (const entry of ROLE_BLACKLIST_EN) {
      expect(typeof entry).toBe("string");
      expect(entry.length).toBeGreaterThan(0);
    }
  });

  it("contains only lowercase ASCII tokens", () => {
    for (const entry of ROLE_BLACKLIST_EN) {
      expect(entry).toBe(entry.toLowerCase());
      expect(/^[a-z]+$/.test(entry)).toBe(true);
    }
  });
});
