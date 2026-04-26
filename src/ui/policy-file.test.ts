import { describe, expect, it } from "vitest";

import {
  createPolicyFile,
  parsePolicyFileJson,
  serializePolicyFile,
} from "./policy-file.js";

describe("policy-file", () => {
  it("round-trips a v1 policy file", () => {
    const policy = createPolicyFile(
      [
        {
          text: "Acme Corporation",
          category: "entities",
          defaultSelected: true,
        },
        {
          text: "Project Falcon",
          category: "other",
          defaultSelected: false,
        },
      ],
      {
        name: "Acme NDA redaction policy",
        createdAt: "2026-04-25T00:00:00.000Z",
      },
    );

    expect(parsePolicyFileJson(serializePolicyFile(policy))).toEqual(policy);
  });

  it("trims and deduplicates entries by category plus text", () => {
    const policy = parsePolicyFileJson(
      JSON.stringify({
        schemaVersion: 1,
        createdAt: "2026-04-25T00:00:00.000Z",
        name: "Dedup",
        entries: [
          {
            text: " Acme Corporation ",
            category: "entities",
            defaultSelected: true,
          },
          {
            text: "Acme Corporation",
            category: "entities",
            defaultSelected: false,
          },
        ],
      }),
    );

    expect(policy.entries).toEqual([
      {
        text: "Acme Corporation",
        category: "entities",
        defaultSelected: false,
      },
    ]);
  });

  it("rejects unsupported categories with a friendly error", () => {
    expect(() =>
      parsePolicyFileJson(
        JSON.stringify({
          schemaVersion: 1,
          createdAt: "2026-04-25T00:00:00.000Z",
          name: "Bad",
          entries: [
            {
              text: "Acme Corporation",
              category: "pii",
              defaultSelected: true,
            },
          ],
        }),
      ),
    ).toThrow("Unsupported policy category");
  });

  it("rejects non-JSON input", () => {
    expect(() => parsePolicyFileJson("not json")).toThrow(
      "Policy file is not valid JSON.",
    );
  });
});
