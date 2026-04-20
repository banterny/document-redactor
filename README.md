# document-redactor (England & Wales)

> **This is a fork of [kipeum86/document-redactor](https://github.com/kipeum86/document-redactor)** — an excellent offline DOCX redaction tool originally built for Korean legal practice. This fork adds detection rules for the legal system of **England & Wales**, with a focus on **clinical negligence proceedings** and **inquests**.

All credit for the core architecture, security model, OOXML handling, and verification pipeline belongs to the [original project](https://github.com/kipeum86/document-redactor). This fork only extends the detection rules.

## What this fork adds

The upstream tool ships with detection rules tuned for Korean and US legal documents. This fork adds **20 UK-specific rules** across four new files, without modifying any existing rules:

### Identifiers (`identifiers-uk.ts`)

| Rule | Example | Tier |
|---|---|---|
| National Insurance number | `QQ 12 34 56 C` | All |
| NHS number (Modulus 11 validated) | `943 476 5919` | All |
| UK domestic phone (all Ofcom formats) | `07700 900123`, `020 7946 0958`, `0117 496 0123` | All |
| UK postcode | `SW1A 1AA`, `B2 4QA` | Standard |
| GMC number (context-gated) | `GMC No: 1234567` | Standard |
| NMC PIN (context-gated) | `NMC PIN: 12A3456B` | Standard |
| UK driving licence | `SMITH 861215 J99KA 12` | Standard |
| Hospital number / MRN (context-gated) | `MRN: RXH 123456` | Standard |
| UK bank sort code (context-gated) | `Sort Code: 12-34-56` | Standard |

### Legal (`legal-uk.ts`)

| Rule | Example | Tier |
|---|---|---|
| Court claim number (all divisions) | `KB-2024-001234`, county court refs | Standard |
| Coroner's reference (context-gated) | `Inquest Ref: 2024-0123` | Standard |
| UK legal context scanner | `Claim No: ...`, `Inquest into the death of ...` | Standard |

### Temporal (`temporal-uk.ts`)

| Rule | Example | Tier |
|---|---|---|
| DD/MM/YYYY date (calendar-validated) | `15/03/2024`, `15.03.2024` | Standard |
| DD/MM/YY short date | `15/03/24` | Paranoid |

### Entities (`entities-uk.ts`)

| Rule | Example | Tier |
|---|---|---|
| NHS Trust / Health Board / ICB | `Barts Health NHS Trust`, `Betsi Cadwaladr University Health Board` | Standard |
| UK judicial titles + name | `His Honour Judge Smith`, `Mrs Justice Andrews`, `HHJ Taylor` | Standard |
| KC / QC + name | `Sarah Jones KC` | Standard |
| Medical professional titles + name | `Consultant Smith`, `Staff Nurse Patel` | Paranoid |
| Medical record context labels | `Patient:`, `D.O.B:`, `GP:`, `Ward:` | Standard |
| Inquest context | `Touching the death of`, `Deceased:`, `The late` | Standard |

### What is deliberately *not* detected

Neutral citations (`[2024] EWHC 123 (KB)`), law report citations (`[2024] 1 WLR 123`), statute references (`s.11 Limitation Act 1980`), and CPR references are **not** flagged. These are public legal knowledge — they don't identify any person, case, or place.

## What the upstream provides (unchanged)

Everything else comes from the original project:

- **Zero-network architecture** — CSP `default-src 'none'`, ESLint network bans, build-time ship gate
- **Single HTML file** — download, double-click, redact
- **OOXML deep traversal** — body, headers, footers, footnotes, endnotes, comments, metadata, relationship files
- **Round-trip verification** — the output DOCX is re-parsed and checked before download
- **Metadata stripping** — scrubs author, company, tracked changes, comments, custom properties
- **Field and hyperlink flattening** — catches hidden URLs in OOXML instruction text
- **Manual additions** — type any string to add it as a redaction target
- **1,700+ automated tests** with 90% coverage thresholds

See the [upstream README](https://github.com/kipeum86/document-redactor) and [USAGE.md](USAGE.md) for full documentation.

## Quick start

### Use the built tool

1. Go to [Releases](../../releases) and download `document-redactor.html`
2. Double-click to open in your browser
3. Drop a `.docx` file
4. Review candidates, add any the tool missed
5. Click **Apply and verify**
6. Download the `.redacted.docx`

### Build from source

```bash
git clone https://github.com/banterny/document-redactor.git
cd document-redactor
bun install
bun run test
bun run build
open dist/document-redactor.html
```

## Syncing with upstream

This fork tracks the upstream `main` branch. To pull in future improvements:

```bash
git fetch upstream
git merge upstream/main
```

The UK rules live in separate files (`*-uk.ts`), so merge conflicts should be rare.

## Licence

[Apache 2.0](LICENSE) — same as the upstream project.

## Acknowledgements

This fork exists because [kipeum86](https://github.com/kipeum86) built something genuinely excellent. The security architecture (defence-in-depth with three enforcement layers), the round-trip verification pipeline, and the single-file distribution model are all outstanding engineering decisions. This fork just teaches it to recognise UK postcodes and NHS numbers.
