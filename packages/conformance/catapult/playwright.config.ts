import { defineConfig } from "@playwright/test";

// The cmi5 tests in CATAPULT's CTS (M2-21), started by `catapult:up`; see docs/ci.md.
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  forbidOnly: !!process.env.CI,
  // Each test imports its own course and starts its own conformance test.
  timeout: 120_000,
  globalTimeout: 15 * 60_000,
  use: { trace: "retain-on-failure" },
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
