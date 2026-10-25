import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // A distinct suffix keeps Vitest from collecting browser tests.
  testMatch: "**/*.e2e.ts",
  // A leaked test.only would silently skip every other test in CI.
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
