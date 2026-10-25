import { defineConfig } from "vite";

// The Tauri window loads this dev server when the shell runs without its built frontend
// (`cargo run --no-default-features`, README); the port matches build.devUrl in tauri.conf.json.
export default defineConfig({
  server: {
    port: 1420,
    strictPort: true,
    // The page test (playwright.config.ts) needs no live reload. With a watcher, other CI tasks
    // rebuilding packages/*/dist reloaded the page mid-test ("frame was detached").
    ...(process.env.COURSE_SUITE_NO_WATCH ? { watch: null } : {}),
  },
  build: { target: "es2023" },
});
