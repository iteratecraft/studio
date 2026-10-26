// This file runs in Node (process.env); the app's own build stays without Node types.
/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets runs from several checkouts on one machine each test their own build.
const port = Number(process.env.E2E_PORT) || 4173;

export default defineConfig({
  testDir: "e2e",
  // A distinct suffix keeps Vitest from collecting browser tests.
  testMatch: "**/*.e2e.ts",
  // A leaked test.only would silently skip every other test in CI.
  forbidOnly: !!process.env.CI,
  // CI uploads playwright-report/ and test-results/ (traces) when a browser test fails.
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The built gallery (turbo builds it before test:e2e), served by Vite's preview server.
  webServer: {
    command: `vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
