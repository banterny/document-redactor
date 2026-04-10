/**
 * Vite config — produces `dist/document-redactor.html`, the single file
 * the entire product ships as.
 *
 * Three requirements this config enforces:
 *
 *   1. **vite-plugin-singlefile** inlines every JS chunk and CSS sheet
 *      into the HTML `<script>` and `<style>` blocks, so the build
 *      artifact is ONE file. No sidecar assets, no sourcemap files, no
 *      external references — which is what makes file:// work and makes
 *      the Kakao-message distribution path possible (Eureka #4).
 *
 *   2. **3MB bundle cap.** The design budget for the single HTML file
 *      is 2-3 MB. We surface this as a post-build check that fails the
 *      build if the file grows past 3 MB. Future features that push us
 *      over the cap must either reduce other code or justify raising
 *      the cap as a conscious decision.
 *
 *   3. **CSP compliance assertion.** The root `index.html` ships with a
 *      strict Content-Security-Policy meta tag. We post-build-check
 *      that the bundled HTML contains:
 *        - the `default-src 'none'` directive
 *        - no `<script src=...>` tags (only inline scripts allowed)
 *        - no `<link rel="stylesheet" href=...>` tags
 *      If any of these fails, the build fails — this is the code-level
 *      backstop for Invariants #1 and #2 at the bundler layer (ESLint
 *      is the source-level backstop; CSP is the runtime backstop).
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

/** 3 MB hard cap per the design budget. */
const BUNDLE_SIZE_CAP_BYTES = 3 * 1024 * 1024;

/** The canonical output filename (D8.3b lock-in). */
const OUTPUT_FILENAME = "document-redactor.html";

/**
 * Post-build plugin: rename index.html → document-redactor.html, enforce
 * the 3 MB cap, assert CSP compliance. Runs in the `writeBundle` hook so
 * it sees the final bytes on disk.
 */
function shipGate(): Plugin {
  return {
    name: "document-redactor:ship-gate",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
      const indexPath = path.resolve(outDir, "index.html");
      const finalPath = path.resolve(outDir, OUTPUT_FILENAME);

      if (!fs.existsSync(indexPath)) {
        throw new Error(
          `[ship-gate] expected ${indexPath} to exist after build`,
        );
      }

      // Rename to the canonical filename.
      fs.renameSync(indexPath, finalPath);

      // Size cap.
      const size = fs.statSync(finalPath).size;
      const sizeMb = size / (1024 * 1024);
      if (size > BUNDLE_SIZE_CAP_BYTES) {
        throw new Error(
          `[ship-gate] bundle is ${sizeMb.toFixed(2)} MB, exceeds 3 MB cap`,
        );
      }

      // CSP compliance.
      const html = fs.readFileSync(finalPath, "utf-8");
      if (!/default-src\s+['"]none['"]/i.test(html)) {
        throw new Error(
          "[ship-gate] missing Content-Security-Policy default-src 'none' meta tag",
        );
      }
      if (/<script[^>]+\bsrc\s*=/i.test(html)) {
        throw new Error(
          "[ship-gate] bundled HTML contains a <script src=...> — not a single-file build",
        );
      }
      if (/<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=/i.test(html)) {
        throw new Error(
          "[ship-gate] bundled HTML contains a <link rel=\"stylesheet\" href=...> — not a single-file build",
        );
      }

      // Invariant #6: SHA-256 sidecar for release integrity verification.
      // Writes `document-redactor.html.sha256` next to the HTML in
      // GNU coreutils text-mode format, readable by `sha256sum -c`.
      //
      // Reading bytes separately (instead of reusing the `html` string
      // above) avoids any utf-8 round-trip ambiguity — createHash wants
      // a Buffer of the raw file bytes.
      const htmlBytes = fs.readFileSync(finalPath);
      if (htmlBytes.length === 0) {
        throw new Error(
          `[ship-gate] cannot hash ${finalPath} — empty file. ` +
          `An earlier invariant should have caught this.`,
        );
      }
      const hash = createHash("sha256").update(htmlBytes).digest("hex");
      const sidecarPath = finalPath + ".sha256";

      // Format: "<64 hex chars><space><space><filename><newline>"
      // Two-space separator = GNU coreutils text mode (the default
      // format `sha256sum <file>` outputs). This is the form
      // `sha256sum -c` expects. Binary mode would use `<space><*>`;
      // both are valid but text mode is the ubiquitous default.
      fs.writeFileSync(
        sidecarPath,
        `${hash}  ${OUTPUT_FILENAME}\n`,
      );

      // Report.
      // eslint-disable-next-line no-console
      console.log(
        `\n[ship-gate] ✓ ${OUTPUT_FILENAME}  ${sizeMb.toFixed(2)} MB / 3 MB cap` +
        `\n[ship-gate] ✓ ${OUTPUT_FILENAME}.sha256  ${hash.slice(0, 8)}…${hash.slice(-8)}`,
      );
    },
  };
}

export default defineConfig({
  plugins: [svelte(), viteSingleFile(), shipGate()],
  build: {
    target: "es2022",
    cssMinify: "esbuild",
    // vite-plugin-singlefile handles inlining; keep outDir stable.
    outDir: "dist",
    emptyOutDir: true,
    // Disable the modulepreload polyfill — it injects a `fetch()` call
    // into the bundle to preload dynamic module chunks. We don't have
    // dynamic chunks (single-file build), CSP blocks network at runtime,
    // and Invariant #2 (zero network) requires zero fetch code at the
    // SOURCE level, not just zero network traffic. No polyfill = no
    // fetch.
    modulePreload: { polyfill: false },
    // Note: vite-plugin-singlefile internally sets
    // `rollupOptions.output.inlineDynamicImports: true`, which triggers
    // a deprecation warning under Vite 8 ("use codeSplitting: false").
    // That's the plugin's doing, not ours — the warning is harmless and
    // will disappear when vite-plugin-singlefile updates for Vite 8.
  },
  // No dev server network exposure. We bind to localhost only.
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
