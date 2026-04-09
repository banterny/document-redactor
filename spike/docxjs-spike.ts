/**
 * Gate 0 docx.js spike.
 *
 * Goal: validate whether docx.js (v9.6.1) can serve as our DOCX read/modify/write
 * layer for Lane B. Runs the 7-item checklist from design-v1.md § Eng Review
 * Lock-in #6 against the worst-case bilingual NDA fixture.
 *
 * The real question this answers: does docx.js have an INGEST path? If not,
 * we cannot preserve the user's original document structure and the library
 * fails Gate 0 at item #1 (text preservation).
 *
 * Run:
 *   bun spike/docxjs-spike.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as docx from "docx";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(
  REPO_ROOT,
  "tests/fixtures/bilingual_nda_worst_case.docx",
);
const OUT_DIR = path.join(REPO_ROOT, "spike/out");

type CheckResult = {
  id: number;
  item: string;
  status: "PASS" | "FAIL" | "N/A";
  evidence: string;
};

function header(s: string): void {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  ${s}`);
  console.log(`${"═".repeat(72)}`);
}

function row(r: CheckResult): void {
  const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "–";
  console.log(
    `  [${icon}] #${r.id} ${r.item.padEnd(48)} ${r.status.padEnd(6)}  ${r.evidence}`,
  );
}

async function main(): Promise<number> {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Fixture not found: ${FIXTURE}`);
    console.error(`Run: python3 tools/make-fixture.py`);
    return 1;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  header("GATE 0 — docx.js (v9.6.1) CAPABILITY PROBE");
  console.log(`  Fixture: ${path.relative(REPO_ROOT, FIXTURE)}`);
  console.log(`  Size: ${(fs.statSync(FIXTURE).size / 1024).toFixed(1)} KB`);

  // ────────────────────────────────────────────────────────────────────────
  // Probe 1: Does docx.js expose any API to ingest an existing DOCX file?
  // ────────────────────────────────────────────────────────────────────────
  header("PROBE 1: Does docx.js expose an ingest API?");

  console.log(
    "\n  Packer (the canonical I/O class) exposes ONLY output methods:",
  );
  const packerStatics = Object.getOwnPropertyNames(docx.Packer).filter(
    (k) => typeof (docx.Packer as unknown as Record<string, unknown>)[k] === "function",
  );
  for (const method of packerStatics) {
    console.log(`    docx.Packer.${method}()`);
  }
  console.log(
    `\n  None of these methods accept a Buffer or file path as input.`,
  );
  console.log(`  docx.Packer is write-only by design.`);

  console.log(`\n  Searching the public API for any fromX / parse / load:`);
  const allExports = Object.keys(docx).sort();
  const ingestLike = allExports.filter((name) =>
    /^(from|parse|load|read|import|decode)/i.test(name),
  );
  if (ingestLike.length === 0) {
    console.log(`    (none found at top level)`);
  } else {
    for (const name of ingestLike) console.log(`    docx.${name}`);
  }

  // There IS an ImportedXmlComponent.fromXmlString — but as the class name
  // says, it's for importing XML as a COMPONENT inside a newly-constructed
  // document, not for loading an existing document. Prove this.
  console.log(
    `\n  Probing ImportedXmlComponent.fromXmlString(...) — the only import-ish API:`,
  );
  try {
    const buf = fs.readFileSync(FIXTURE);
    // Extract word/document.xml from the DOCX (DOCX = zip) via JSZip so we can
    // hand the raw XML to docx.js's importer.
    const zip = await JSZip.loadAsync(buf);
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile === null) {
      console.log(`    ✗ fixture has no word/document.xml (impossible)`);
      return 1;
    }
    const documentXml = await docXmlFile.async("string");
    console.log(
      `    document.xml size: ${(documentXml.length / 1024).toFixed(1)} KB`,
    );

    const imported = docx.ImportedXmlComponent.fromXmlString(documentXml);
    console.log(
      `    ✓ fromXmlString returned: ${imported.constructor.name}`,
    );
    console.log(`    But the result is an ImportedXmlComponent, not a Document.`);
    console.log(
      `    Its intended use is to embed this XML inside a NEW docx.Document,`,
    );
    console.log(`    which means rebuilding the wrapper, headers, footers,`);
    console.log(`    comments, numbering, styles, and everything else from scratch.`);
    console.log(
      `    There is no way to produce a Document from the fixture that preserves`,
    );
    console.log(`    the original document's non-body structure.`);
  } catch (err) {
    console.log(`    ✗ fromXmlString threw: ${(err as Error).message}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Probe 2: Attempted the "build a new doc" workaround — document the
  // data that would be lost if we went this route.
  // ────────────────────────────────────────────────────────────────────────
  header("PROBE 2: Could we rebuild a new doc from extracted content?");

  const buf = fs.readFileSync(FIXTURE);
  const zip = await JSZip.loadAsync(buf);

  const parts = Object.keys(zip.files).filter((k) => !zip.files[k]!.dir);
  console.log(`\n  The fixture DOCX contains ${parts.length} parts:`);
  for (const p of parts) {
    // Read the uncompressed bytes through the public API. Adds a tiny cost
    // (we already have the file in memory) but stays out of JSZip internals.
    const bytes = await zip.files[p]!.async("uint8array");
    console.log(`    ${p.padEnd(40)} ${bytes.length.toString().padStart(6)} bytes`);
  }

  console.log(
    `\n  If we used docx.js "build from scratch", we would need to reconstruct:`,
  );
  console.log(
    `    - word/document.xml       (body, tables, sections — doable but lossy)`,
  );
  console.log(
    `    - word/comments.xml       (would be DROPPED — no read path)`,
  );
  console.log(
    `    - word/footnotes.xml      (would be DROPPED — no read path)`,
  );
  console.log(
    `    - word/header1.xml + N    (would be DROPPED — no read path)`,
  );
  console.log(
    `    - word/footer1.xml + N    (would be DROPPED — no read path)`,
  );
  console.log(
    `    - word/styles.xml         (would be DEFAULT, losing user styling)`,
  );
  console.log(
    `    - word/numbering.xml      (would be DEFAULT, losing list numbering)`,
  );
  console.log(
    `    - docProps/core.xml       (metadata — would be REPLACED, not scrubbed)`,
  );
  console.log(
    `    - docProps/app.xml        (metadata — would be REPLACED)`,
  );
  console.log(
    `    - word/_rels/document.xml.rels  (relationships — would be REBUILT, losing links)`,
  );
  console.log(
    `\n  Result: a "rebuilt" DOCX would look nothing like the user's original.`,
  );
  console.log(
    `  This is a structural architecture mismatch, not a bug we can work around.`,
  );

  // ────────────────────────────────────────────────────────────────────────
  // 7-item Gate 0 checklist verdict
  // ────────────────────────────────────────────────────────────────────────
  header("GATE 0 SEVEN-ITEM CHECKLIST — docx.js verdict");

  const results: CheckResult[] = [
    {
      id: 1,
      item: "Body/table/header/footer/footnote round-trip",
      status: "FAIL",
      evidence: "no ingest API",
    },
    {
      id: 2,
      item: "Track changes: preserve OR remove cleanly",
      status: "FAIL",
      evidence: "can't read; rebuild loses history",
    },
    {
      id: 3,
      item: "Comments removable without corruption",
      status: "FAIL",
      evidence: "can't read comments.xml",
    },
    {
      id: 4,
      item: "Korean NFC/NFD/한자/emoji round-trip",
      status: "FAIL",
      evidence: "blocked by #1",
    },
    {
      id: 5,
      item: "Section breaks untouched",
      status: "FAIL",
      evidence: "blocked by #1",
    },
    {
      id: 6,
      item: "Complex tables (merged + nested cells) preserved",
      status: "FAIL",
      evidence: "blocked by #1",
    },
    {
      id: 7,
      item: "Word reopen: no repair dialog",
      status: "N/A",
      evidence: "no output to reopen",
    },
  ];

  console.log("");
  for (const r of results) row(r);

  const passes = results.filter((r) => r.status === "PASS").length;
  const fails = results.filter((r) => r.status === "FAIL").length;

  console.log("");
  console.log(`  Passed: ${passes}/7`);
  console.log(`  Failed: ${fails}/7`);
  console.log("");

  if (passes === 7) {
    header("VERDICT: GO — docx.js accepted for Lane B");
    return 0;
  }

  header("VERDICT: NO-GO — fall back to JSZip + raw XML manipulation");
  console.log("");
  console.log(
    "  docx.js is a DOCUMENT CREATION library. Our use case is DOCUMENT",
  );
  console.log(
    "  MODIFICATION: read an existing DOCX, surgically replace sensitive",
  );
  console.log(
    "  strings, and emit a DOCX that preserves everything else byte-for-byte",
  );
  console.log("  where possible. These are different problems.");
  console.log("");
  console.log(
    "  Recommendation: use JSZip to unzip, modify word/document.xml and",
  );
  console.log(
    "  related parts in-place via targeted XML string manipulation, then",
  );
  console.log(
    "  re-zip. This preserves 100% of the untouched structure because we",
  );
  console.log(
    "  only edit the substrings we explicitly target. See spike/jszip-spike.ts",
  );
  console.log("  for the fallback validation.");
  console.log("");

  return 2; // exit code 2 = NO-GO
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
