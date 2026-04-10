<!-- release-notes/TEMPLATE.md — copy to release-notes/vX.Y.Z.md at release time -->

# document-redactor vX.Y.Z

_Released YYYY-MM-DD_

## What's new

- (User-facing summary in plain language. 2-5 bullets. Avoid engineering jargon.)

## Download

- **[`document-redactor.html`](https://github.com/kipeum86/document-redactor/releases/download/vX.Y.Z/document-redactor.html)** — the tool itself (single HTML file)
- **[`document-redactor.html.sha256`](https://github.com/kipeum86/document-redactor/releases/download/vX.Y.Z/document-redactor.html.sha256)** — integrity sidecar

## Verify your download (recommended)

Save both files to the same directory and run:

```bash
sha256sum -c document-redactor.html.sha256
# expected output:
#   document-redactor.html: OK
```

If you see `OK`, the file is byte-identical to what the author published. Anything else — do not run it.

Or compare this hash by eye:

```
(PASTE_HASH_HERE)
```

## Known limitations

- (What this version does NOT do. Be specific — sets realistic expectations.)

## For the curious

- **Source:** https://github.com/kipeum86/document-redactor
- **License:** MIT
- **Build:** Bun + Vite + Svelte 5, single-file HTML, zero network requests
- **Invariants:** CSP `default-src 'none'`, no `fetch`/`XHR`/`WebSocket` in source (lint-enforced), 3 MB bundle cap
