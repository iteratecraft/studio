import { defineConfig } from "@playwright/test";

// The Moodle end-to-end tests (M1-21), against the Moodle that up.ts starts; see docs/ci.md.
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  forbidOnly: !!process.env.CI,
  // One learner account in one Moodle: one test at a time.
  workers: 1,
  // A real LMS on a shared runner: page loads and saves take seconds, not milliseconds.
  timeout: 300_000,
  expect: { timeout: 20_000 },
  use: { trace: "retain-on-failure" },
  // CI uploads both when a test fails.
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
