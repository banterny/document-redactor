<!--
  Topbar — brand + "0 network requests" badge.

  The "0 network requests" badge is a trust affordance (Invariant #2).
  It stays green for the entire session because the CSP meta tag and
  the ESLint ban guarantee zero network activity by construction.
-->
<script lang="ts">
  import { APP_VERSION } from "../app-version.ts";
</script>

<header class="topbar">
  <div class="brand">
    <div class="brand-mark">R</div>
    <span class="brand-name">Redactor</span>
    <span class="version-badge">{APP_VERSION}</span>
    <span class="brand-sub">for lawyers · offline · local-only</span>
  </div>
  <div class="topbar-right">
    <div class="net-badge" title="Content-Security-Policy blocks every network request at the browser level">
      <span class="net-dot"></span>
      <span>0 network requests</span>
    </div>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    height: 56px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    position: relative;
    z-index: 10;
    grid-column: 1 / -1;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    letter-spacing: -0.015em;
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--primary);
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    font-family: var(--mono);
    box-shadow: 0 1px 2px rgba(37, 99, 235, 0.35);
  }

  .brand-name {
    font-size: 17px;
    font-weight: 700;
    color: var(--primary);
  }

  .brand-sub {
    font-size: 12px;
    color: var(--ink-soft);
    margin-left: 2px;
    font-weight: 400;
  }

  .version-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--primary) 22%, white);
    background: color-mix(in srgb, var(--primary) 10%, white);
    color: var(--primary);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .net-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--ok-bg);
    color: #15803d;
    border: 1px solid var(--ok-border);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--mono);
  }

  .net-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0 3px #dcfce7;
  }
</style>
