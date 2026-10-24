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
  // Stay inside the CI job's 40 minutes (setup takes up to ten), so the report, traces and Moodle
  // logs still get uploaded: a Moodle that hangs makes every test wait its full 5 minutes.
  globalTimeout: 25 * 60_000,
  maxFailures: process.env.CI ? 3 : 0,
  expect: { timeout: 20_000 },
  use: { trace: "retain-on-failure" },
  // CI uploads both when a test fails or the job runs out of time.
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
});
