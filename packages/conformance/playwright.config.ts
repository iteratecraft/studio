import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // A distinct suffix keeps Vitest from collecting browser tests.
  testMatch: "**/*.e2e.ts",
  // A leaked test.only would silently skip every other test in CI.
  forbidOnly: !!process.env.CI,
  // CI uploads playwright-report/ when a browser test fails.
  reporter: [["list"], ["html", { open: "never" }]],
});
