# Usage Guide

A step-by-step walkthrough for running `document-redactor` on a real file. If you haven't downloaded the tool yet, start with the [README Quick Start](README.md#quick-start).

---

## Table of contents

1. [Getting the file](#1-getting-the-file)
2. [Verifying your download](#2-verifying-your-download)
3. [Opening the tool](#3-opening-the-tool)
4. [Your first redaction](#4-your-first-redaction)
5. [The candidate panel — 8 category sections + catch-all](#5-the-candidate-panel--8-category-sections--catch-all)
6. [The inline document preview](#6-the-inline-document-preview)
7. [Defined term labels (the D9 policy)](#7-defined-term-labels-the-d9-policy)
8. [The four post-Apply outcomes](#8-the-four-post-apply-outcomes)
9. [Non-contract documents](#9-non-contract-documents)
10. [Keyboard shortcuts](#10-keyboard-shortcuts)
11. [Verifying your output file](#11-verifying-your-output-file)
12. [Troubleshooting](#12-troubleshooting)
13. [What this tool does not do](#13-what-this-tool-does-not-do)
14. [Privacy statement](#14-privacy-statement)

---

## 1. Getting the file

Go to the [latest release](https://github.com/kipeum86/document-redactor/releases/latest) and download **both** files:

- **`document-redactor.html`** — the tool itself (~281 KB / 288,133 bytes, single HTML file)
- **`document-redactor.html.sha256`** — the integrity sidecar (89 bytes)

If you received the files via Kakao, email, or USB from someone else, that's fine — the verification step in the next section is exactly designed for this case. You don't need to trust the sender; you need to verify the hash.

---

## 2. Verifying your download

The sidecar lets you prove your copy is byte-identical to what was published. Between the official release and your disk, a file can be modified by:

- A compromised mirror
- A corporate proxy or DLP system that transparently rewrites downloads
- A malicious network intermediary
- A well-meaning sender who accidentally re-exported or re-zipped the file

All of these produce a different SHA-256 hash. Verification is a one-line command.

### macOS / Linux

```bash
cd /path/to/where/you/downloaded/both/files
sha256sum -c document-redactor.html.sha256
```

Expected output:

```
document-redactor.html: OK
```

On older macOS without `sha256sum`, use:

```bash
shasum -a 256 -c document-redactor.html.sha256
```

### Windows (PowerShell)

```powershell
cd C:\path\to\where\you\downloaded\both\files
$actual = (Get-FileHash -Algorithm SHA256 document-redactor.html).Hash.ToLower()
$expected = (Get-Content document-redactor.html.sha256).Split(' ')[0].ToLower()
if ($actual -eq $expected) { "OK" } else { "MISMATCH — do not run" }
```

### If you see anything other than `OK`

**Stop.** Do not open the HTML file. Possible next steps:

1. Re-download both files directly from the GitHub releases page (browser address bar, not a link someone sent you).
2. Verify on a different network (your corporate proxy may be rewriting the file).
3. Report the mismatch to the author via a GitHub issue.

---

## 3. Opening the tool

Double-click `document-redactor.html`. Your default browser opens it as a `file://` URL. There is no installer, no permissions prompt, no network call.

The tab title reads `document-redactor · offline DOCX redactor`. The top-right badge reads `0 network requests` — and means it.

### Which browsers work

- Chrome, Chromium, Brave, Edge (v120+) — tested
- Firefox (v120+) — tested
- Safari (16+) — tested
- Any modern browser with ES2022, Web Crypto SubtleCrypto, and `file://` origin support

### Which browsers don't work

- Internet Explorer (any version)
- Very old Safari (<16)
- Mobile browsers with restrictive file APIs — technically loads but the drop-zone UX is awkward on phones

---

## 4. Your first redaction

### Step 4.1 — Drop your file

Drag a `.docx` onto the drop zone, or click "choose a file" and pick one. The tool accepts input files up to **50 MB**, caps any single decompressed ZIP entry at **20 MB**, unzips the file in memory, and walks every text-bearing scope (body, headers, footers, footnotes, endnotes, comments). Typical contracts parse in under a second.

> **Nothing leaves your machine.** The file lives only in a JavaScript variable inside your browser tab. There is no server to upload to, no disk cache, no telemetry.

### Step 4.2 — Read the inline document preview (center)

The center panel shows the **contract body rendered as text**, with every detected candidate wrapped in a yellow `<mark>` highlight. You can:

- Scroll through the document and see candidates in context
- Click any highlight to toggle its selection (checked ↔ unchecked)
- Use keyboard Tab / Enter / Space to navigate and toggle

Each scope appears under its own header: **본문** (body), **각주** (footnotes), **머리글 1** (header 1), **바닥글 1** (footer 1), etc. Empty paragraphs appear as visible blank lines so the document structure stays familiar.

### Step 4.3 — Review the candidate sections (right panel)

The right panel groups candidates into **8 category sections** plus a catch-all. Each section shows its count and the rule or source that produced each item. Click any row to toggle its selection — the corresponding document highlight updates immediately.

Each row has a **↓ jump** button. Click it to scroll the document to the first occurrence of that candidate, with a brief pulse animation to draw your eye.

Use **Export policy** to save the current manual additions and their selected/unchecked defaults as a local JSON file. Use **Import policy** to apply that JSON to another document; policy files contain only strings/categories/defaults, not DOCX content.

See [§ 5](#5-the-candidate-panel--8-category-sections--catch-all) for the full section breakdown.

### Step 4.4 — Press Apply

When the selections look right, click **Apply and verify** at the bottom of the right panel (or press **⌘/Ctrl + Enter** from anywhere on the page).

The tool runs the full pipeline:

1. **Flatten track changes** — removes deleted-but-hidden text
2. **Strip comments** — deletes `word/comments.xml` and markers
3. **Flatten fields** — unwraps hyperlinks, removes `<w:fldChar>` / `<w:instrText>` (so `HYPERLINK "mailto:..."` instructions can't leak)
4. **Redact** — replaces every selected string with `[REDACTED]` across all scopes
5. **Scrub metadata** — clears author, lastModifiedBy, company, title in `docProps/*`
6. **Clean relationship targets** — strips external `http://` / `https://` targets in `.rels` files and repairs selected literals found in relationship targets
7. **Round-trip verify** — re-parses the output and confirms zero surviving sensitive strings, including relationship targets in `word/_rels/*.rels`
8. **Word-count sanity** — compares before/after word counts; ≥30% drop triggers a warning

One of four post-Apply outcomes appears. See [§ 8](#8-the-four-post-apply-outcomes).

### Step 4.5 — Download

On **downloadReady** (green), **downloadRepaired** (green after one internal retry), or **downloadWarning** (amber), click **Download** to save `{original}.redacted.docx`. Example: `NDA_2026_final.docx` becomes `NDA_2026_final.redacted.docx`.

On **downloadRisk** (red), review the survivors or check the acknowledgement box and click **Download anyway**. See [§ 8.4](#84-downloadrisk-red--warned-override).

---

## 5. The candidate panel — 8 category sections + catch-all

After parse, the right panel renders candidates grouped into these sections, in this order:

### 1. 당사자 (Parties)

Entity literals from the structural parsers and propagation layer — `ABC Corporation`, `XYZ Holdings`, `김철수`, and any automatic variants. **Checked by default.**

### 2. 정의된 대리어 (Defined term labels)

Generic role words from definition clauses: `the Buyer`, `the Discloser`, `매수인`, `갑`. **Unchecked by default** — see [§ 7](#7-defined-term-labels-the-d9-policy).

### 3. 식별번호 (PII)

Identifiers the regex sweep detects deterministically:

- 주민등록번호 (Korean RRN, format `XXXXXX-Xxxxxxx`)
- 사업자등록번호 (Korean BRN, format `XXX-XX-XXXXX`)
- EIN (US, format `XX-XXXXXXX`)
- Korean mobile phones (010/011/016-019)
- **Korean landlines** (02-, 031-069, 070, 080, 060, 050)
- International phones (with `+` prefix)
- Email addresses (RFC-bounded)
- Korean bank accounts
- Credit cards (Luhn-validated)

**All checked by default.**

### 4. 금액 (Financial)

Currency values: `50,000원`, `1억`, `USD 100,000`, `₩50,000,000`, `€50,000`, percentages (`15%`), Korean fractions (`3분의 1`), and label-driven amount context (`금액: 5,000,000`). **Checked by default** for all confidence=1.0 regex matches.

### 5. 날짜 / 기간 (Temporal)

Korean dates (`2024년 3월 15일`, `2024.3.15`), ISO 8601 (`2024-03-15`, with optional time), English dates (`March 15, 2024`), Korean durations (`3년간`, `6개월`), English durations (`3 years`), and label-driven date context (`계약일: 2024.3.15`). **Checked by default.**

### 6. 법인 / 인물 (Entities)

Korean corporations (`주식회사 ABC`, `(주)ABC`, `㈜ABC`), other legal forms (`유한회사`, `사단법인`), executive titles with names (`대표이사 김철수`), honorifics (`김철수 님`), English corporations (`ABC Corp.`, `XYZ Inc.`), international legal forms (`ABC GmbH`, `XYZ S.A.`, `DEF Pty Ltd`), English titles (`Mr. Smith`, `Dr. Jones`, `CEO John Smith`), **label-driven address capture** (`주소: 서울특별시 강남구 논현로 568` / `Address: 12345 Main St, ...`), and **label-driven phone capture** (`전화: 02-3446-3727` / `Phone Number: +82-2-3446-3727`). **Checked by default.**

### 7. 법원 / 사건 (Legal)

Korean case numbers (`2024가합12345`), court names (`서울중앙지방법원`, `대법원`), statute references (`민법 제750조`, `제15조 제2항`), English case citations (`123 F.3d 456`), statute references (`17 U.S.C. § 101`), and legal context scanners. **Checked by default.**

### 8. 추측 (Low-confidence heuristics)

Heuristic detections with confidence below 1.0 — capitalization clusters (`Acme Holdings`), quoted terms (`"Project Alpha"`), repeated proper nouns, and email-domain-inferred company names. Rendered with a warm/amber background and dashed outline in the document preview. **Unchecked by default** — the user opts in after review.

### Catch-all — 기타 (그 외)

A catch-all section at the bottom with an always-visible input field. Use this for anything the rules missed: foreign addresses with unusual formats, internal project codewords, non-standard phone formats, or any free-form sensitive string.

Typed entries:

- appear with the checkbox already checked
- are added as inline highlights in the document preview
- persist across re-analysis (if you drop the same file again, they stay)
- can be unchecked (kept in the manual list but skipped for this redaction)
- can be removed entirely via the **×** button

---

## 6. The inline document preview

The center panel is the **primary review surface**. It renders the contract body as plain text (no bold/italic/tables — just readable paragraphs) with candidate highlights baked in.

### Visual states

- **Checked highlight**: solid warm yellow with an amber ring — this string will be redacted on Apply
- **Unchecked highlight**: dashed border, transparent background — detected but skipped
- **Pulse animation**: briefly drawn around the target when you click a row's **↓ jump** button

### Interactions

- **Click a highlight** → toggle its selection (same as toggling the row in the right panel)
- **Tab** → move focus to the next highlight
- **Enter / Space** on a focused highlight → toggle
- **Scroll** normally through multi-scope documents (header → body → footer → footnotes)

### Scope headers

Each scope starts with a small uppercase label:

- **본문** — `word/document.xml` (main body)
- **각주** — `word/footnotes.xml`
- **미주** — `word/endnotes.xml`
- **머리글 1, 2, ...** — `word/header1.xml`, `header2.xml`, ...
- **바닥글 1, 2, ...** — `word/footer1.xml`, ...

If a scope is empty, it still appears with a `(비어 있음)` note so you know the tool checked it.

### What the preview does NOT render

- Bold / italic / underline (plain text only)
- Tables as tables (cells flatten to paragraphs)
- Images
- Numbering / bullets (just the text content)
- Headings distinctly (all appear as paragraphs)

This is a review surface, not a Word clone. For layout-faithful review, open the output in Word afterward.

---

## 7. Defined term labels (the D9 policy)

In a typical two-party contract, the definition section says something like:

> This Agreement is made between ABC Corporation ("Discloser") and XYZ Holdings ("Recipient").

After this sentence, the contract refers to parties as "the Discloser" / "the Recipient" instead of full names. If you redact BOTH the full names AND the defined terms, every reference disappears:

> `The [REDACTED] agrees that [REDACTED] may share information with [REDACTED] employees…`

Not useful. The whole point of redacting is to hand the file to a downstream reader (another lawyer, an AI tool, a non-NDA counterparty) who can still reason about the agreement's structure. Keeping role labels intact preserves readability:

> `The Discloser agrees that Recipient may share information with Recipient employees…`

This is why **정의된 대리어** (defined terms) is **unchecked by default**.

### When to turn defined terms ON

1. **Three or more parties share the same role.** If three companies are all "Licensees", leaving `Licensee` unredacted doesn't hide anything. But if two of them are `Licensee A` and `Licensee B`, redacting only the full names (while keeping `Licensee A` / `Licensee B` intact) might leak who-is-who by elimination.
2. **Your output is going to an adversarial reader.** If the recipient might de-anonymize by cross-referencing external data, removing all labels is safer than preserving structure.
3. **Public record sharing.** For court filings where party names must be obscured but document structure must remain intact, decide per-label.

### When to keep them OFF (the default)

For the common case — sending a contract to a colleague, another attorney, or a legal AI tool for analysis — leaving defined terms intact is the right call. The reader sees contract structure clearly and can focus on analysis instead of decoding `[REDACTED]`.

---

## 8. The four post-Apply outcomes

After Apply, one of four banners appears. Understanding the split is critical for deciding whether to download.

### 8.1 `downloadReady` (green) — verified clean

- `verify.isClean === true`: zero surviving sensitive strings in the output
- `warningReasons.length === 0`
- `wordCount.sane === true`

The banner shows the SHA-256 of the output file (first 4 + last 4 hex chars) and a **Download** button. Click it to save `{original}.redacted.docx`.

### 8.2 `downloadRepaired` (green) — automatic repair succeeded

- pass 1 was dirty
- the app retried once from the original bytes
- the final verify is clean
- no residual warnings remain

This is still a clean output. The difference from `downloadReady` is that the app had to use its one internal repair pass before the final verify cleared.

### 8.3 `downloadWarning` (amber) — verified clean, but deserves a spot check

- `verify.isClean === true`: zero surviving sensitive strings
- one or more warning reasons remain

Typical warning reasons:

- the word-count sanity check exceeded its threshold
- preflight had to touch field / hyperlink relationship surfaces
- repair touched non-body or formatting-sensitive surfaces

**No surviving leak was detected**, but the output deserves a quick review. You can:

1. **Back to review** — return without losing selections, trim broad entries, then Apply again.
2. **Download anyway** — continue when the warning is expected and acceptable.
3. **Start over** — discard everything and reload from scratch.

### 8.4 `downloadRisk` (red) — warned override

- `verify.isClean === false`: one or more selected sensitive strings still survived in the generated output
- the app already ran:
  - preflight catch-up
  - pass 1 redaction
  - one automatic retry from the original bytes

The banner lists every surviving string with:

- the text
- the count
- the source file (`word/document.xml`, `word/_rels/document.xml.rels`, etc.)
- the surface (`text`, `field`, or hyperlink target)
- a **Review this item** button per row → jumps back to the inline preview

The app does **not** call this output clean. You have four choices:

1. **Review first survivor** — go back with the first survivor focused.
2. **Back to review** — return without focusing a specific row.
3. Check **I understand that sensitive text may still remain in this output file.**
4. **Download anyway** — enabled only after that acknowledgement.

Common causes:

- the string survives in a rels hyperlink target (`word/_rels/document.xml.rels`)
- the string appears in an unusual scope or transformed literal form
- the document contains a normalization edge case (zero-width spaces, hyphen variants, split runs)

---

## 9. Non-contract documents

The engine is text-based and works on any DOCX — it doesn't care whether the file is a contract, an opinion, a brief, a memo, or internal notes. For non-contract use:

- **The 8 category rules still fire automatically.** Addresses, phones, emails, IDs, amounts, dates, court names, statute references — all picked up regardless of document type.
- **The 정의된 대리어 section will usually be empty** on non-contract docs. The D9 parser looks for `"X" means Y` / `("Y"이라 함은)` patterns, which are almost exclusive to contracts.
- **Use the 기타 section heavily** for domain-specific terms. A judgment might want case numbers, judge names, or party names; a patent spec might want inventor names or assignee; a memo might want internal codewords.
- **Redacted output opens in Word the same way** regardless of source type.

Practical example — redacting a judgment excerpt:

1. Drop the file
2. Auto-detected candidates fill the category sections
3. In **기타 (그 외)**, add:
   ```
   김철수
   박영희
   ABC 법인
   서울중앙지방법원 2024가합12345
   ```
4. Apply → verify → download

---

## 10. Keyboard shortcuts

| Key | Action |
|---|---|
| **⌘/Ctrl + Enter** | Apply and verify (from anywhere) |
| **Tab** | Move focus through candidates (rows + document highlights) |
| **Enter** / **Space** | Toggle selection on a focused row or highlight |
| **Escape** | Cancel an open "+ 추가" input (in sections where it's collapsible) |

That's the full v1.1 shortcut list. More may arrive later — follow releases.

---

## 11. Verifying your output file

After a successful redaction, the banner shows the SHA-256 of your output file (first 4 + last 4 hex). Verify independently in a terminal:

```bash
shasum -a 256 NDA_2026_final.redacted.docx
```

The first 4 + last 4 hex chars should match what the banner showed. If they don't, something is wrong — file a bug.

### Why hash the output?

If you send the redacted file to someone else and want them to confirm they received exactly what you sent, the hash is the contract. Same hash = byte-identical. Different hash = something changed in transit (email re-encoding, zip re-compression, corporate DLP rewriting).

### Is the hash deterministic across runs?

**Yes, for the same input + same selections.** Every ZIP entry's internal timestamp is pinned to Unix epoch 0 before generating the output. Same input + same toggle choices → byte-identical output → identical SHA-256. Two people running the tool on the same input with the same selections produce identical hashes.

---

## 12. Troubleshooting

### "The file I dropped just shows a spinner forever"

Parse is synchronous and typically under a second. If it appears stuck:

1. Open browser DevTools (F12) → Console. Look for errors.
2. Check the file is actually a `.docx`. The tool rejects `.doc` (legacy binary), `.pages`, etc.
3. Very large files (>10 MB) may take a few seconds.
4. If none of the above: file a bug with the console error and a minimal synthetic `.docx` that reproduces.

### "A name I expected isn't highlighted"

The tool only highlights what the rules detect. If a company name is purely free-form and not caught:

1. Check whether it has a label in the document (`상호: ...`, `법인명: ...`). Label-driven rules should pick those up.
2. If it's bare text without a label, use the **기타 (그 외)** section to add it manually. That's the catch-all's whole purpose.

### "The tool flagged 주민번호 where there isn't one"

Unlikely — the regex is strict (6 digits + hyphen + 1-8 + 6 digits). Common explanations:

- A long ID like `2024041012345678` that happens to contain the pattern → regex anchors should reject this, but report as a bug if you see it
- A date like `2024-01-15` formatted as `240115` → does NOT match the 주민번호 pattern

If you see a false positive, uncheck the row before Apply.

### "Verification still found survivors even though I checked everything"

This is `downloadRisk` — a sensitive string survived even after preflight and the one automatic retry. The most common causes in v1.1:

- **The string is in `word/_rels/document.xml.rels`** as a hyperlink Target. The banner shows the rels path. Unwrapping hyperlinks removes the display text, but the URL in the rels file stays.
- **Zero-width spaces or hyphen variants** in the source. The normalization layer handles most, but some exotic combinations can slip through.
- **Unusual scope or transformed literal form** not fully covered by the selected exact literals.

At that point, the product posture is: review the survivors if you want to improve the result, or acknowledge the residual risk and download anyway.

### "The tool is slow"

Typical timings on a 50 KB contract:

- Parse: ~200 ms
- Detection: ~300 ms
- Apply + verify: ~500 ms
- Document preview render: <500 ms

Total under 2 seconds end to end. If it's genuinely slow (>10 seconds), the most likely cause is a very large DOCX with thousands of paragraphs. Open DevTools Performance tab to profile. File a bug with the fixture size.

### "I dropped a large file and it was rejected"

The tool rejects input files larger than **50 MB** and any single decompressed ZIP entry larger than **20 MB**. Typical legal documents are <5 MB. For unusually large files (scanned pages converted to DOCX with embedded images), the OCR caveat from [§ 13](#13-what-this-tool-does-not-do) applies — the tool cannot redact text inside images regardless, so there's little benefit to running it on an image-heavy file.

### "The mobile layout looks cramped"

The tool is intended for desktop use (≥1024 px wide). Below that, the 3-column layout degrades. Mobile polish is not on the v1.x roadmap.

### "I want to undo a redaction after downloading"

You can't — the output file has `[REDACTED]` baked in. But you can re-run:

1. Click **검토로 돌아가기** (or **Start over** if you want a fresh reload)
2. Adjust selections
3. Apply again

The tool never modifies the original input on disk; it only reads it.

### "My download looks like an old version"

If the HTML tool itself (`document-redactor.html`) appears outdated:

- Browser cache: **Cmd+Shift+R** (hard refresh) or open in an incognito window
- Downloaded-once sitting in `~/Downloads`: delete it and re-download from GitHub Releases
- The GitHub release isn't up to date yet — check the release date on the latest tag

If the redacted `.docx` output looks odd, it's a different issue — attach an input fixture to a bug report.

---

## 13. What this tool does not do

These are v1.1 limitations. Some are planned for future paranoid-tier work; others are intentional.

- **No OCR.** If your DOCX has images of text (scanned pages, screenshots), the text inside is invisible. Redact images in an editor before converting, or OCR separately.
- **No handwritten signature images.** Same as OCR — pixels, not text.
- **No SmartArt or WordArt text.** These are special OOXML constructs the scope walker skips.
- **No embedded Excel / PowerPoint objects.** OLE-embedded objects are treated as opaque blobs. Regular Word tables ARE fully handled.
- **No full `<w:sdt>` content control handling.** Text inside structured document tags is walked as text but the form semantics are not preserved.
- **No macros, VBA, or encrypted/password-protected packages.** `.docm` and password-protected files are rejected. Convert to a plain `.docx` first.
- **No undo / redo.** Each Apply is one-shot; use **검토로 돌아가기** before Apply or re-drop the file.
- **No automatic persistent state between sessions.** Close the tab, reopen, start fresh unless you explicitly export/import a local policy JSON.
- **No batch processing.** One file at a time.
- **No cloud policy sync or accounts.** Policy import/export is a local JSON file workflow only.
- **Limited `word/_rels/*.rels` Target rewriting.** The tool strips external `http://` / `https://` relationship targets and repairs selected literals found in relationship targets, then verifies that sensitive strings do not survive. It is not a general-purpose relationship sanitizer for every possible non-HTTP or opaque target.
- **No image EXIF scrubbing.** Images inside the DOCX keep their original metadata (GPS, camera info).
- **No revision-ID scrubbing.** `w:rsidR` identifiers stay. Usually harmless, but in theory allow author correlation across documents.
- **No hidden text (`<w:vanish>`) surfacing.** Hidden text is a separate leak vector; Paranoid-tier work will address it.

---

## 14. Privacy statement

**We collect nothing because there is no "we".**

`document-redactor` is an HTML file. It runs inside your browser tab, on your computer, from your disk. It has no backend. There is no database, analytics endpoint, error reporting service, or telemetry. The tool cannot contact the outside world because:

1. The source has zero `fetch`, `XMLHttpRequest`, `WebSocket`, or any network API call
2. The built HTML is scanned at build time to confirm zero such tokens in the bundle
3. The runtime Content-Security-Policy (`default-src 'none'; connect-src 'none'`) blocks any such call even if one existed
4. You can verify all three above yourself before running it

When you redact a file: the dropped bytes, the selections you toggle, the manual entries you type, and the output you download — all of it exists only in your browser tab's memory and on your disk. Close the tab, all of it is gone.

If you observe any behavior that contradicts this statement, it is a bug, and it would be the single most important bug in the project. Please file an issue immediately.

---

_That's the full v1.1 guide. For architecture rationale, see the [README](README.md). For detection rule internals, see [docs/RULES_GUIDE.md](docs/RULES_GUIDE.md). Bug reports and feature requests: [GitHub Issues](https://github.com/kipeum86/document-redactor/issues)._
