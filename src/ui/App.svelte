<!--
  Top-level component — the entire app's layout and state-machine
  orchestrator.

  Responsibilities:
   1. Render the 3-column grid: topbar, sidebar, main, panel.
   2. Own the global Cmd/Ctrl+Enter shortcut that fires Apply when the
      app is in postParse phase (per D8.6).
   3. Delegate every pixel to a child component. This file should
      never contain real layout logic beyond the grid + the global
      keyboard listener.

  State is owned by `./state.svelte.ts` and imported wherever needed.
  Components don't take state as props — they reach into `appState`
  directly — so adding a new state slot doesn't require threading a
  new prop through the tree.
-->
<script lang="ts">
  import CandidatesPanel from "./CandidatesPanel.svelte";
  import DocumentPreview from "./DocumentPreview.svelte";
  import Footer from "./Footer.svelte";
  import Sidebar from "./Sidebar.svelte";
  import Topbar from "./Topbar.svelte";
  import { appState } from "./state.svelte.ts";

  /**
   * Global Cmd/Ctrl+Enter shortcut — D8.6. Fires `appState.applyNow()`
   * whenever the app is in postParse phase. Ignored in any other phase
   * so the shortcut doesn't re-trigger Apply while a redaction is
   * already in flight.
   *
   * `$effect` with a return function handles the mount/unmount cycle
   * automatically — same pattern as `onMount` + `onDestroy` in the
   * legacy Svelte 3/4 API.
   */
  $effect(() => {
    function onKeydown(e: KeyboardEvent): void {
      const isApply =
        (e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key === "Return");
      if (!isApply) return;
      if (appState.phase.kind !== "postParse") return;
      e.preventDefault();
      void appState.applyNow();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

<div class="app">
  <Topbar />
  <Sidebar />
  <DocumentPreview phase={appState.phase} />
  <CandidatesPanel phase={appState.phase} />
  <Footer />
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 260px 1fr 340px;
    /* 56px topbar / 1fr content / auto footer */
    grid-template-rows: 56px 1fr auto;
    height: 100vh;
    max-width: 1440px;
    margin: 0 auto;
  }

  @media (max-width: 1080px) {
    .app {
      grid-template-columns: 220px 1fr 300px;
    }
  }
</style>
