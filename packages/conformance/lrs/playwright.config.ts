import { defineConfig } from "@playwright/test";

// The xAPI tests against SQL LRS (M2-21), started by `lrs:up`; see docs/ci.md.
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  forbidOnly: !!process.env.CI,
  // Each test reports under its own registration, so they may share the LRS.
  timeout: 120_000,
  globalTimeout: 15 * 60_000,
  use: { trace: "retain-on-failure" },
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
