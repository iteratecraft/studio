// Builds the kit gallery (M2-05) and the preview test page (M2-11). The bundle is split so
// `pnpm --filter @course-suite/web size` can report React, React Aria, the kit and the preview's
// player apart from the pages' own code. The preview page gets the desktop app's release content
// security policy, read from its Tauri configuration, so its browser tests run under that policy.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const react = /[/]node_modules[/](react|react-dom|scheduler)[/]/;
const tauri = JSON.parse(
  readFileSync(new URL("../desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const policy = Object.entries(tauri.app.security.csp as Record<string, string>)
  .map(([directive, sources]) => `${directive} ${sources}`)
  .join("; ");

export default defineConfig({
  plugins: [
    {
      name: "desktop-policy",
      apply: "build",
      transformIndexHtml: (html, { path }) =>
        path.endsWith("/preview.html")
          ? [
              {
                tag: "meta",
                attrs: { "http-equiv": "Content-Security-Policy", content: policy },
                injectTo: "head-prepend",
              },
            ]
          : html,
    },
  ],
  build: {
    rolldownOptions: {
      input: { gallery: "index.html", preview: "preview.html" },
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: react },
            { name: "react-aria", test: (id) => id.includes("node_modules") && !react.test(id) },
            { name: "kit", test: /[/]packages[/]ui[/]/ },
            // The preview and the player bundle it runs, loaded when a preview first opens.
            {
              name: "player",
              test: /[/]packages[/](preview|exporters|player-blocks|tracking|labels)[/]/,
            },
          ],
        },
      },
    },
  },
});
