// This file runs in Node (process.env); the app's own build stays without Node types.
/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
  projects: [
    // The page in Chromium against the in-memory host, served by Vite.
    {
      name: "page",
      testMatch: "page.e2e.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:1421" },
    },
    // The built executable, driven through WebView2's DevTools port (app.e2e.ts).
    { name: "app", testMatch: "app.e2e.ts" },
  ],
  webServer: {
    command: "vite --port 1421 --strictPort",
    url: "http://localhost:1421/e2e/memory.html",
    reuseExistingServer: !process.env.CI,
  },
});
