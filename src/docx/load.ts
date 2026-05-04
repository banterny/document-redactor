import JSZip from "jszip";

import { MAX_ENTRY_BYTES, MAX_INPUT_BYTES } from "./limits.js";

export class FileTooLargeError extends Error {
  constructor(size: number, limit: number) {
    super(`File size ${size} bytes exceeds limit of ${limit} bytes`);
    this.name = "FileTooLargeError";
  }
}

export class EntryTooLargeError extends Error {
  constructor(path: string, size: number, limit: number) {
    super(`ZIP entry "${path}" decompressed to ${size} bytes, exceeds limit of ${limit} bytes`);
    this.name = "EntryTooLargeError";
  }
}

export class CorruptDocxError extends Error {
  constructor() {
    super("File is not a readable ZIP/DOCX package");
    this.name = "CorruptDocxError";
  }
}

export class InvalidDocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocxError";
  }
}

const CONTENT_TYPES_PATH = "[Content_Types].xml";
const MAIN_DOCUMENT_PATH = "word/document.xml";
const ROOT_RELS_PATH = "_rels/.rels";
const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";

export async function loadDocxZip(bytes: Uint8Array): Promise<JSZip> {
  if (bytes.length === 0) {
    throw new FileTooLargeError(0, MAX_INPUT_BYTES);
  }
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new FileTooLargeError(bytes.length, MAX_INPUT_BYTES);
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes.slice());
  } catch {
    throw new CorruptDocxError();
  }
  await validateDocxPackage(zip);
  return zip;
}

export async function readZipEntry(
  zip: JSZip,
  path: string,
): Promise<string> {
  const file = zip.file(path);
  if (file === null) {
    throw new Error(`ZIP entry not found: ${path}`);
  }
  const content = await file.async("string");
  if (content.length > MAX_ENTRY_BYTES) {
    throw new EntryTooLargeError(path, content.length, MAX_ENTRY_BYTES);
  }
  return content;
}

async function validateDocxPackage(zip: JSZip): Promise<void> {
  const entryPaths = fileEntryPaths(zip);

  if (hasEncryptedPackageParts(entryPaths)) {
    throw new InvalidDocxError(
      "Unsupported DOCX package: encrypted or password-protected files are not supported",
    );
  }
  if (zip.file(CONTENT_TYPES_PATH) === null) {
    throw new InvalidDocxError(
      'Unsupported DOCX package: missing "[Content_Types].xml"',
    );
  }
  const contentTypes = await readZipEntry(zip, CONTENT_TYPES_PATH);
  if (isMacroEnabledPackage(contentTypes, entryPaths)) {
    throw new InvalidDocxError(
      "Unsupported DOCX package: macros or VBA parts are not supported",
    );
  }
  if (zip.file(MAIN_DOCUMENT_PATH) === null) {
    throw new InvalidDocxError(
      'Unsupported DOCX package: missing "word/document.xml"',
    );
  }
  if (
    zip.file(ROOT_RELS_PATH) === null &&
    zip.file(DOCUMENT_RELS_PATH) === null
  ) {
    throw new InvalidDocxError(
      'Unsupported DOCX package: missing package relationships ("_rels/.rels" or "word/_rels/document.xml.rels")',
    );
  }
}

function fileEntryPaths(zip: JSZip): string[] {
  return Object.entries(zip.files)
    .filter(([, entry]) => !entry.dir)
    .map(([path]) => path);
}

function hasEncryptedPackageParts(paths: readonly string[]): boolean {
  return (
    paths.includes("EncryptionInfo") ||
    paths.includes("EncryptedPackage")
  );
}

function isMacroEnabledPackage(
  contentTypes: string,
  paths: readonly string[],
): boolean {
  return (
    /macroEnabled|vbaProject/i.test(contentTypes) ||
    paths.some((path) => /(^|\/)(vbaProject\.bin|vbaData\.xml)$/i.test(path))
  );
}
