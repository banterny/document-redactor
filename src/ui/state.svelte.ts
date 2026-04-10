/**
 * App state — Svelte 5 runes-backed singleton.
 *
 * The UI is a small state machine: one of a handful of discrete phases,
 * each with its own allowed transitions and data. Rather than scatter
 * `$state` declarations across components, we centralize everything in
 * this module and export a single `appState` object components import.
 *
 * Why a module, not a store: Svelte 5's `$state` works in any file
 * ending in `.svelte.ts` (or `.svelte.js`). Exporting a single
 * rune-backed object is the idiomatic replacement for the legacy
 * `writable` store pattern — simpler, better-typed, and it still
 * triggers reactivity in every component that reads it.
 *
 * State phases:
 *
 *   - idle          — nothing loaded. Drop zone is the main affordance.
 *   - parsing       — bytes received, analysis running. Pipeline view.
 *   - postParse     — analysis done, candidates ready for review.
 *   - redacting     — user clicked Apply, engine running. Locked.
 *   - downloadReady — verify + sanity both clean. Green banner + SHA-256.
 *   - verifyFail    — verify OR sanity failed. Red banner, download blocked.
 *   - fatalError    — something threw before we could render a report.
 *
 * All transitions run through the exported verb functions (`loadFile`,
 * `applyNow`, `reset`, ...) so there's exactly one place to audit the
 * state machine's allowed moves.
 */

import type { FinalizedReport } from "../finalize/finalize.js";
import {
  analyzeZip,
  applyRedaction,
  defaultSelections,
  type Analysis,
} from "./engine.js";

/** Discriminated union of every state the app can be in. */
export type AppPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "parsing"; readonly fileName: string }
  | {
      readonly kind: "postParse";
      readonly fileName: string;
      readonly bytes: Uint8Array;
      readonly analysis: Analysis;
    }
  | { readonly kind: "redacting"; readonly fileName: string }
  | {
      readonly kind: "downloadReady";
      readonly fileName: string;
      readonly report: FinalizedReport;
    }
  | {
      readonly kind: "verifyFail";
      readonly fileName: string;
      readonly report: FinalizedReport;
    }
  | {
      readonly kind: "fatalError";
      readonly fileName: string | null;
      readonly message: string;
    };

/**
 * Default entity seeds — hardcoded to the ones in the worst-case
 * fixture so a first-time user can drop the fixture and see the full
 * candidates tree populate immediately. The UI lets them edit this
 * list before analysis runs.
 */
const DEFAULT_SEEDS = [
  "ABC Corporation",
  "Sunrise Ventures LLC",
  "ABC 주식회사",
  "김철수",
  "이영희",
  "Project Falcon",
  "블루윙 2.0",
] as const;

/** The singleton state object. Mutate via the verb functions below. */
class AppState {
  phase = $state<AppPhase>({ kind: "idle" });

  /** The user's editable seed list, always available regardless of phase. */
  seeds = $state<string[]>([...DEFAULT_SEEDS]);

  /**
   * Current checkbox selections — the set of literal strings the
   * redactor will target when Apply is clicked. Mutable on purpose:
   * toggle-in/toggle-out operations hit `.add`/`.delete` directly and
   * Svelte's proxy tracking picks up the change.
   *
   * Empty when phase !== 'postParse'.
   */
  selections = $state<Set<string>>(new Set());

  // ── Verbs ────────────────────────────────────────────────────────

  async loadFile(file: File): Promise<void> {
    this.phase = { kind: "parsing", fileName: file.name };
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const analysis = await analyzeZip(bytes, this.seeds);
      this.selections = defaultSelections(analysis);
      this.phase = {
        kind: "postParse",
        fileName: file.name,
        bytes,
        analysis,
      };
    } catch (err) {
      this.phase = {
        kind: "fatalError",
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  toggleSelection(text: string): void {
    if (this.phase.kind !== "postParse") return;
    if (this.selections.has(text)) {
      this.selections.delete(text);
    } else {
      this.selections.add(text);
    }
  }

  isSelected(text: string): boolean {
    return this.selections.has(text);
  }

  async applyNow(): Promise<void> {
    if (this.phase.kind !== "postParse") return;
    const { fileName, bytes } = this.phase;
    this.phase = { kind: "redacting", fileName };

    try {
      const report = await applyRedaction(bytes, this.selections);
      if (report.verify.isClean && report.wordCount.sane) {
        this.phase = { kind: "downloadReady", fileName, report };
      } else {
        this.phase = { kind: "verifyFail", fileName, report };
      }
    } catch (err) {
      this.phase = {
        kind: "fatalError",
        fileName,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  reset(): void {
    this.phase = { kind: "idle" };
    this.selections = new Set();
  }

  setSeeds(next: ReadonlyArray<string>): void {
    this.seeds = [...next];
  }
}

/** The one global state instance — import this from every component. */
export const appState = new AppState();
