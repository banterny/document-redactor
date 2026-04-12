/**
 * Ship-gate test — runs the real Vite build and asserts the output is
 * a valid single-file offline bundle.
 *
 * This is the automated version of the 7-item Gate 0 checklist, applied
 * to the production build artifact (not the spike). It catches:
 *
 *   1. Build failures         — Vite errors, missing imports, Svelte
 *                                compile errors.
 *   2. Multi-file leakage     — `<script src=...>` or
 *                                `<link rel="stylesheet" href=...>` surviving
 *                                the vite-plugin-singlefile pass.
 *   3. Missing CSP            — `default-src 'none'` gone from the
 *                                bundled HTML.
 *   4. Bundle growth          — the 3 MB cap is enforced in
 *                                vite.config.ts's `shipGate()` plugin;
 *                                this test re-asserts it as a second
 *                                layer of defense.
 *   5. Filename drift         — output must be
 *                                `dist/document-redactor.html` per D8.3b.
 *
 * The test spawns a one-shot `vite build` via Bun's child_process shim.
 * Build takes ~0.3s so the overhead is acceptable for a ship-gate.
 * It's also the only test that needs Vite at runtime — the rest of the
 * engine is framework-free.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DIST = path.join(REPO_ROOT, "dist");
const ARTIFACT = path.join(DIST, "document-redactor.html");
const FIXTURES_DIR = path.join(REPO_ROOT, "tests/fixtures");

/** 3 MB hard cap — mirrors vite.config.ts. */
const BUNDLE_SIZE_CAP_BYTES = 3 * 1024 * 1024;

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, name)));
}

function loadFixtureFile(
  name: string,
  fileName = "test.docx",
): File {
  const bytes = Uint8Array.from(loadFixture(name));
  return new File([bytes.buffer], fileName);
}

type AppStateModule = typeof import("./state.svelte.ts");

describe("ship gate — single-file build", () => {
  let html: string;

  beforeAll(() => {
    // Run the real production build. Fails loudly if anything in the
    // pipeline is broken.
    execSync("bunx vite build", {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
    expect(fs.existsSync(ARTIFACT)).toBe(true);
    html = fs.readFileSync(ARTIFACT, "utf-8");
  }, 60_000);

  it("produces dist/document-redactor.html (D8.3b canonical filename)", () => {
    expect(fs.existsSync(ARTIFACT)).toBe(true);
  });

  it("fits under the 3 MB bundle cap", () => {
    const size = fs.statSync(ARTIFACT).size;
    expect(size).toBeLessThan(BUNDLE_SIZE_CAP_BYTES);
  });

  it("embeds a strict CSP default-src 'none' meta tag", () => {
    expect(html).toMatch(/Content-Security-Policy/);
    expect(html).toMatch(/default-src\s+['"]none['"]/);
  });

  it("has connect-src 'none' (blocks fetch/XHR/WS/SSE at runtime)", () => {
    expect(html).toMatch(/connect-src\s+['"]none['"]/);
  });

  it("has NO <script src=...> tags (single-file invariant)", () => {
    expect(html).not.toMatch(/<script[^>]+\bsrc\s*=/i);
  });

  it("has NO <link rel=stylesheet href=...> tags (single-file invariant)", () => {
    expect(html).not.toMatch(
      /<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=/i,
    );
  });

  it("contains at least one inline <script> block", () => {
    // The Svelte-compiled module is expected to be inlined by
    // vite-plugin-singlefile. No inline script = no app.
    expect(html).toMatch(/<script[^>]*>[\s\S]*<\/script>/i);
  });

  it("contains the app mount point #app", () => {
    expect(html).toMatch(/id=["']app["']/);
  });

  it("does not ship a raw `fetch(` token anywhere in the bundle", () => {
    // Belt-and-suspenders: the ESLint ban catches source usage, CSP
    // catches runtime attempts, and this test makes sure no bundled
    // dependency snuck a fetch in via transitive imports. Note that
    // this is a literal string check — a minifier could rename
    // `fetch` → `a.fetch` which this won't catch. That's fine: the
    // CSP is the real backstop. This test catches accidental
    // surface-level regressions.
    //
    // `.fetch(` inside a longer MemberExpression like `foo.fetch(` is
    // the minifier-survived form we'd see if a third-party package
    // shipped a fetch() call. Filter those too.
    expect(html).not.toMatch(/\bfetch\s*\(/);
  });

  it("does not ship XMLHttpRequest or WebSocket calls", () => {
    expect(html).not.toMatch(/\bXMLHttpRequest\b/);
    expect(html).not.toMatch(/new\s+WebSocket\b/);
  });

  it("writes a sha256sum-compatible sidecar next to the HTML", () => {
    const sidecarPath = ARTIFACT + ".sha256";
    expect(fs.existsSync(sidecarPath)).toBe(true);

    const htmlBytes = fs.readFileSync(ARTIFACT);
    const expected = createHash("sha256").update(htmlBytes).digest("hex");
    const sidecarContent = fs.readFileSync(sidecarPath, "utf-8");

    // Exact format: "<64 hex chars><space><space>document-redactor.html<\n>"
    // Two-space separator = GNU coreutils text mode, parseable by `sha256sum -c`.
    expect(sidecarContent).toBe(`${expected}  document-redactor.html\n`);
  });
});

describe("ship gate — manual candidate state flow", () => {
  let appState: AppStateModule["appState"];

  beforeAll(async () => {
    const stateShim = Object.assign(
      <T>(value: T): T => value,
      {
        eager: <T>(value: T): T => value,
        raw: <T>(value: T): T => value,
        snapshot: <T>(value: T): T => value,
      },
    );
    const globalWithState = globalThis as typeof globalThis & {
      $state?: typeof $state;
    };
    globalWithState.$state = stateShim as typeof $state;
    ({ appState } = await import("./state.svelte.ts"));
  });

  beforeEach(() => {
    appState.reset();
  });

  it("addManualCandidate adds text to both manualAdditions and selections", async () => {
    await appState.loadFile(loadFixtureFile("bilingual_nda_worst_case.docx"));

    const before = appState.selections.size;
    appState.addManualCandidate("financial", "USD 1,000,000");

    expect(appState.selections.has("USD 1,000,000")).toBe(true);
    expect(appState.manualAdditions.get("financial")?.has("USD 1,000,000")).toBe(true);
    expect(appState.selections.size).toBe(before + 1);
  });

  it("removeManualCandidate removes text from both manualAdditions and selections", async () => {
    await appState.loadFile(loadFixtureFile("bilingual_nda_worst_case.docx"));

    appState.addManualCandidate("financial", "USD 1,000,000");
    appState.removeManualCandidate("financial", "USD 1,000,000");

    expect(appState.selections.has("USD 1,000,000")).toBe(false);
    expect(appState.manualAdditions.get("financial")?.has("USD 1,000,000")).toBe(false);
  });

  it("manualAdditions persist across re-analysis via loadFile", async () => {
    await appState.loadFile(loadFixtureFile("bilingual_nda_worst_case.docx"));
    appState.addManualCandidate("financial", "USD 1,000,000");
    await appState.loadFile(loadFixtureFile("bilingual_nda_worst_case.docx"));

    expect(appState.selections.has("USD 1,000,000")).toBe(true);
    expect(appState.manualAdditions.get("financial")?.has("USD 1,000,000")).toBe(true);
  });

  it("reset clears both selections and manualAdditions", async () => {
    await appState.loadFile(loadFixtureFile("bilingual_nda_worst_case.docx"));

    appState.addManualCandidate("financial", "USD 1,000,000");
    appState.reset();

    expect(appState.selections.size).toBe(0);
    expect(appState.manualAdditions.get("financial")?.size ?? 0).toBe(0);
  });
});
