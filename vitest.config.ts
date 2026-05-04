import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // UK fork divergence: docs-stale.test.ts asserts upstream-specific
    // documentation invariants (build size, SHA-256, Korean docs, exact
    // English wording in USAGE/README). The UK fork maintains its own
    // README/USAGE structure and does not ship Korean docs. The test would
    // require continual patching against every upstream merge to keep in
    // sync with the fork's own docs. Excluded here rather than patched
    // in-place to keep merge conflicts away from the test file itself.
    exclude: ["src/docs-stale.test.ts", "node_modules/**", "dist/**"],
    // Use the threads pool instead of vitest's default forks pool. Some
    // tests (notably redos-guard.test.ts and ship-gate.test.ts with fake
    // timers) leave open handles that prevent fork workers from exiting,
    // causing `bun run test` to hang at the end of the run. Threads share
    // a process and shut down cleanly. No behavioural change to the tests
    // themselves — only the worker model.
    pool: "threads",
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/types.ts"],
      // Eng review #13: 100% branch coverage on all production code.
      // Threshold raised once we have meaningful code coverage.
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
