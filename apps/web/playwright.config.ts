import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // A distinct suffix keeps Vitest from collecting browser tests.
  testMatch: "**/*.e2e.ts",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
