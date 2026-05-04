import { describe, expect, it, vi, afterEach } from "vitest";
import JSZip from "jszip";

import { MAX_ENTRY_BYTES, MAX_INPUT_BYTES } from "./limits.js";
import {
  CorruptDocxError,
  EntryTooLargeError,
  FileTooLargeError,
  InvalidDocxError,
  loadDocxZip,
  readZipEntry,
} from "./load.js";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

async function makeZipBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadDocxZip", () => {
  it("rejects empty bytes", async () => {
    await expect(loadDocxZip(new Uint8Array(0))).rejects.toBeInstanceOf(
      FileTooLargeError,
    );
  });

  it("accepts a valid docx-sized zip", async () => {
    const bytes = await makeZipBytes();
    const zip = await loadDocxZip(bytes);
    expect(zip.file("word/document.xml")).not.toBeNull();
  });

  it("accepts the exact MAX_INPUT_BYTES boundary and delegates to JSZip", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", "<w:document/>");
    const spy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(zip);
    const bytes = new Uint8Array(MAX_INPUT_BYTES);

    await expect(loadDocxZip(bytes)).resolves.toBe(zip);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rejects bytes larger than MAX_INPUT_BYTES", async () => {
    const spy = vi.spyOn(JSZip, "loadAsync");
    const bytes = new Uint8Array(MAX_INPUT_BYTES + 1);

    await expect(loadDocxZip(bytes)).rejects.toBeInstanceOf(FileTooLargeError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports corrupt ZIP data separately from invalid DOCX structure", async () => {
    await expect(loadDocxZip(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(
      CorruptDocxError,
    );
  });

  it("rejects valid ZIP files that are not DOCX packages", async () => {
    const zip = new JSZip();
    zip.file("notes.txt", "hello");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(loadDocxZip(bytes)).rejects.toBeInstanceOf(InvalidDocxError);
    await expect(loadDocxZip(bytes)).rejects.toThrow(
      'missing "[Content_Types].xml"',
    );
  });

  it("rejects DOCX-like ZIPs that are missing the main document part", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(loadDocxZip(bytes)).rejects.toBeInstanceOf(InvalidDocxError);
    await expect(loadDocxZip(bytes)).rejects.toThrow(
      'missing "word/document.xml"',
    );
  });

  it("rejects DOCX-like ZIPs that are missing relationship metadata", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("word/document.xml", "<w:document/>");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(loadDocxZip(bytes)).rejects.toBeInstanceOf(InvalidDocxError);
    await expect(loadDocxZip(bytes)).rejects.toThrow(
      "missing package relationships",
    );
  });

  it("rejects macro-enabled DOCX packages", async () => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      CONTENT_TYPES.replace(
        "wordprocessingml.document.main+xml",
        "ms-word.document.macroEnabled.main+xml",
      ),
    );
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", "<w:document/>");
    zip.file("word/vbaProject.bin", new Uint8Array([0, 1, 2]));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(loadDocxZip(bytes)).rejects.toBeInstanceOf(InvalidDocxError);
    await expect(loadDocxZip(bytes)).rejects.toThrow("macros or VBA");
  });

  it("rejects encrypted package markers with a clear unsupported-docx error", async () => {
    const zip = new JSZip();
    zip.file("EncryptionInfo", new Uint8Array([1]));
    zip.file("EncryptedPackage", new Uint8Array([2]));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(loadDocxZip(bytes)).rejects.toBeInstanceOf(InvalidDocxError);
    await expect(loadDocxZip(bytes)).rejects.toThrow(
      "encrypted or password-protected",
    );
  });
});

describe("readZipEntry", () => {
  it("returns a string for a normal entry", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document/>");

    await expect(readZipEntry(zip, "word/document.xml")).resolves.toBe(
      "<w:document/>",
    );
  });

  it("throws when the entry does not exist", async () => {
    const zip = new JSZip();
    await expect(readZipEntry(zip, "missing.xml")).rejects.toThrow(
      "ZIP entry not found: missing.xml",
    );
  });

  it("throws EntryTooLargeError for oversized decompressed content", async () => {
    const zip = {
      file(path: string) {
        if (path !== "word/document.xml") return null;
        return {
          async: vi.fn().mockResolvedValue("x".repeat(MAX_ENTRY_BYTES + 1)),
        };
      },
    } as unknown as JSZip;

    await expect(readZipEntry(zip, "word/document.xml")).rejects.toBeInstanceOf(
      EntryTooLargeError,
    );
  });

  it("accepts content at the exact MAX_ENTRY_BYTES boundary", async () => {
    const zip = {
      file(path: string) {
        if (path !== "word/document.xml") return null;
        return {
          async: vi.fn().mockResolvedValue("x".repeat(MAX_ENTRY_BYTES)),
        };
      },
    } as unknown as JSZip;

    await expect(readZipEntry(zip, "word/document.xml")).resolves.toBe(
      "x".repeat(MAX_ENTRY_BYTES),
    );
  });
});
