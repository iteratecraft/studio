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
    // Ready once the page script itself is served: Vite transforms it and its imports on first
    // request, which took close to 30 s on a cold Windows runner, inside the test's own timeout.
    url: "http://localhost:1421/e2e/memory.tsx",
    timeout: 180_000,
    env: { COURSE_SUITE_NO_WATCH: "1" },
    reuseExistingServer: !process.env.CI,
  },
});
