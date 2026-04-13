<!--
  Minimal footer — credit line at the bottom of the app shell.

  Intentionally tiny and unobtrusive. No links (keeps the app 100%
  self-contained — no clickable paths out to the network, even if
  the user initiates them). Plain text.

  Placed in the grid by `App.svelte` as row 3, spanning all columns.
-->
<script lang="ts">
  import { APP_VERSION } from "../app-version.ts";
</script>

<footer class="footer">
  Built by Kipeum Lee · {APP_VERSION}
</footer>

<style>
  .footer {
    grid-column: 1 / -1;
    grid-row: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink-muted);
    font-size: 11px;
    letter-spacing: 0.02em;
    user-select: none;
  }
</style>
