// Builds the kit gallery (M2-05), the blocks editor's test route (editor.html, M2-08) and the
// preview test page (M2-11). The bundle is split so `pnpm --filter @course-suite/web size` can report
// React, React Aria, the kit, the editor and the preview's player apart from each page's own code.
// The preview page gets the desktop app's release content security policy, read from its Tauri
// configuration, so its browser tests run under that policy.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      input: {
        gallery: resolve(import.meta.dirname, "index.html"),
        editor: resolve(import.meta.dirname, "editor.html"),
        preview: resolve(import.meta.dirname, "preview.html"),
      },
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
            // The editor and the engine packages it uses (doc-ops, format, host, project, zip).
            { name: "blocks", test: /[/]packages[/](?!ui[/])/ },
          ],
        },
      },
    },
  },
});
