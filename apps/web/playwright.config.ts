// This file runs in Node (process.env); the app's own build stays without Node types.
/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // A distinct suffix keeps Vitest from collecting browser tests.
  testMatch: "**/*.e2e.ts",
  // A leaked test.only would silently skip every other test in CI.
  forbidOnly: !!process.env.CI,
  // CI uploads playwright-report/ and test-results/ (traces) when the smoke test fails.
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
