import { describe, expect, it } from "vitest";

import {
  IDENTIFIER_SUBCATEGORY_TO_KIND,
  piiKindLabel,
} from "./pii-kinds.js";

describe("pii-kinds", () => {
  it("maps Korean landline identifiers to a distinct UI kind", () => {
    expect(IDENTIFIER_SUBCATEGORY_TO_KIND["phone-kr-landline"]).toBe(
      "phone-kr-landline",
    );
  });

  it("returns the UI label for Korean landline candidates", () => {
    expect(piiKindLabel("phone-kr-landline")).toBe("phone · KR landline");
  });
});
