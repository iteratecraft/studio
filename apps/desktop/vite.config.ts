import { defineConfig } from "vite";

// The Tauri window loads this dev server when the shell runs without its built frontend
// (`cargo run --no-default-features`, README); the port matches build.devUrl in tauri.conf.json.
export default defineConfig({
  server: { port: 1420, strictPort: true },
  build: { target: "es2023" },
});
