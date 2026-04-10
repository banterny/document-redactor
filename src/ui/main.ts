/**
 * Svelte 5 entry point — mounts the single top-level `App` component
 * into `#app` and exposes nothing else.
 *
 * This file is intentionally minimal. All UI logic lives in components,
 * all engine logic lives in sibling modules (`../detection`, `../docx`,
 * `../propagation`, `../finalize`). `main.ts` is the seam between the
 * browser DOM and everything else.
 */

import { mount } from "svelte";

import App from "./App.svelte";
// Side-effect import — Vite picks up the stylesheet and inlines it
// into the bundle via vite-plugin-singlefile. The tokens and resets
// need to be global (not scoped to a component), so they live in a
// plain .css file rather than a Svelte component's <style> block.
import "./styles.css";

const target = document.getElementById("app");
if (target === null) {
  throw new Error("missing #app mount point in index.html");
}

// `mount` is the Svelte 5 runes-mode entry (replaces `new App({ target })`).
mount(App, { target });
