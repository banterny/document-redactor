# document-redactor (England & Wales)

> **This is a fork of [lowtidebuild/document-redactor](https://github.com/lowtidebuild/document-redactor)** — an excellent offline DOCX redaction tool originally built for Korean legal practice. This fork adds detection rules for the legal system of **England & Wales**, with a focus on **clinical negligence proceedings** and **inquests**.

All credit for the core architecture, security model, OOXML handling, and verification pipeline belongs to the [original project](https://github.com/lowtidebuild/document-redactor). This fork extends the detection rules, and has since diverged in one way that matters — see [Differences beyond the UK rules](#differences-beyond-the-uk-rules).

## What this fork adds

The upstream tool ships with detection rules tuned for Korean and US legal documents. This fork adds **20 UK-specific rules** across four new files:

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

## Differences beyond the UK rules

This fork was originally additive. It is no longer purely so, and the difference is worth stating plainly rather than leaving in a commit log.

**A ReDoS fix that upstream does not have.** Thirteen detection rules backtracked catastrophically on ordinary document shapes — long runs of spaces, digits or hyphens, of the kind produced by column-aligned tables, padded forms and discharge summaries. Because detection runs on the main thread, an affected document froze the browser tab until it was killed by the script timeout. Two rules were bad enough to breach their time budget at around 150 consecutive spaces.

The defect is engine-specific. It affects **Safari and every browser on iOS and iPadOS** (JavaScriptCore) and does not affect Chrome, Edge or Firefox, where the same rules measure ~0.00ms. That is why it went unnoticed: a single-engine test gate cannot see it.

**Eight of the thirteen are upstream's own rules** — `ko-corp-suffix`, `amount-context-ko`, `ko-identity-context`, `en-identity-context`, `ko-address-context`, `ko-phone-context`, `en-phone-context` and `date-context-ko` — and as of upstream v1.3.0 they are still unfixed there. So this fork is not merely upstream-plus-UK-rules: for a Safari or iOS user working on Korean documents, it is the more robust of the two.

Every pattern change was differential-tested against the previous pattern before it landed, across more than 190,000 label, separator, padding and value combinations, and verified in real Safari rather than by proxy. Detection output is unchanged except for one deliberate, documented and test-pinned limit, described in the source.

**Supporting changes.** The ReDoS test gate benchmarks every rule under **both** JavaScript engines rather than one, and measures CPU time rather than wall-clock. `docs/RULES_GUIDE.md` carries the rule-authoring contract, including the engine-dependence lesson.

## What the upstream provides (unchanged)

Everything else comes from the original project:

- **Zero-network architecture** — CSP `default-src 'none'`, ESLint network bans, build-time ship gate
- **Single HTML file** — download, double-click, redact
- **OOXML deep traversal** — body, headers, footers, footnotes, endnotes, comments, metadata, relationship files
- **Round-trip verification** — the output DOCX is re-parsed and checked before download
- **Metadata stripping** — scrubs author, company, tracked changes, comments, custom properties
- **Field and hyperlink flattening** — catches hidden URLs in OOXML instruction text
- **Manual additions** — type any string to add it as a redaction target
- **2,700+ automated tests** with 90% coverage thresholds

See the [upstream README](https://github.com/lowtidebuild/document-redactor) and [USAGE.md](USAGE.md) for full documentation.

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

**A plain `git merge upstream/main` no longer works.** Upstream force-pushed its
history, so the two repositories have **no common ancestor** — `git merge-base`
returns nothing and git refuses the merge outright rather than producing a
misleading result. The advice this section used to give (merge, conflicts should
be rare) is no longer true and would fail immediately if followed.

Bringing an upstream change across is now a deliberate port rather than a merge:

```bash
git fetch upstream
git diff upstream/main main -- <path>        # two-dot: no ancestor needed
git checkout upstream/main -- <path>         # take a file wholesale, then review
```

Two things to know before porting anything:

- **Do not blindly take `src/detection/rules/{entities,financial,temporal}.ts`.**
  Upstream's copies still contain the ReDoS defect described above. Overwriting
  the fork's versions would silently reintroduce a browser freeze on Safari and
  iOS. Run `bun run test:redos:deep` after touching any rule file.
- This fork deliberately does not carry some upstream files (`README.ko.md`,
  `USAGE.ko.md`, the pnpm lockfiles, and a performance suite), so a wholesale
  sync would reintroduce them.

## Licence

[Apache 2.0](LICENSE) — same as the upstream project.

## Acknowledgements

This fork exists because [lowtidebuild](https://github.com/lowtidebuild) built something genuinely excellent. The security architecture (defence-in-depth with three enforcement layers), the round-trip verification pipeline, and the single-file distribution model are all outstanding engineering decisions — none of which this fork changed, and all of which it depends on.

What this fork adds on top is a body of England & Wales detection rules, and a ReDoS fix for a defect that made the tool unusable in Safari and on iOS. The second of those was found by testing the original author's rules under a second JavaScript engine; it says nothing about the quality of the design, which held up under considerably more adversarial scrutiny than it was built to expect.
