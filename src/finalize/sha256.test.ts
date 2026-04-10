import { describe, it, expect } from "vitest";

import { computeSha256, truncateHash } from "./sha256.js";

describe("computeSha256", () => {
  it("produces the canonical SHA-256 of an empty input", async () => {
    // NIST test vector: SHA-256("") =
    //   e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const hash = await computeSha256(new Uint8Array(0));
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produces the canonical SHA-256 of 'abc'", async () => {
    // NIST test vector: SHA-256("abc") =
    //   ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    const bytes = new TextEncoder().encode("abc");
    const hash = await computeSha256(bytes);
    expect(hash).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces the canonical SHA-256 of the 'quick brown fox' sentence", async () => {
    // SHA-256("The quick brown fox jumps over the lazy dog") =
    //   d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592
    const bytes = new TextEncoder().encode(
      "The quick brown fox jumps over the lazy dog",
    );
    const hash = await computeSha256(bytes);
    expect(hash).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });

  it("is deterministic (same input → same hash)", async () => {
    const bytes = new TextEncoder().encode("hello world");
    const a = await computeSha256(bytes);
    const b = await computeSha256(bytes);
    expect(a).toBe(b);
  });

  it("differs for one-bit input changes (avalanche)", async () => {
    const a = await computeSha256(new TextEncoder().encode("hello"));
    const b = await computeSha256(new TextEncoder().encode("hellp"));
    expect(a).not.toBe(b);
  });

  it("returns a 64-character lowercase hex string", async () => {
    const hash = await computeSha256(new TextEncoder().encode("x"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles Unicode content via byte input", async () => {
    const bytes = new TextEncoder().encode("매수인 김철수 甲 📼");
    const hash = await computeSha256(bytes);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles large inputs (1MB)", async () => {
    const bytes = new Uint8Array(1024 * 1024);
    // Fill with a deterministic pattern
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const hash = await computeSha256(bytes);
    expect(hash).toHaveLength(64);
  });
});

describe("truncateHash", () => {
  it("returns the first N chars by default (8)", () => {
    const full =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(truncateHash(full)).toBe("ba7816bf");
  });

  it("accepts a custom length", () => {
    const full =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(truncateHash(full, 12)).toBe("ba7816bf8f01");
  });

  it("returns the full hash when length >= full length", () => {
    const full =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(truncateHash(full, 64)).toBe(full);
    expect(truncateHash(full, 100)).toBe(full);
  });

  it("uppercases the truncated form when `upper` is true", () => {
    const full =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(truncateHash(full, 8, { upper: true })).toBe("BA7816BF");
  });
});
