// Builds the kit gallery (M2-05), the blocks editor's test route (editor.html, M2-08) and the
// preview test page (M2-11). The bundle is split so `pnpm --filter @course-suite/web size` can report
// React, React Aria, the kit, the editor and the preview's player apart from each page's own code.
// The editor and preview pages get the desktop app's release content security policy, read from its
// Tauri configuration, so their browser tests run under that policy.
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
        path.endsWith("/preview.html") || path.endsWith("/editor.html")
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
          // Groups take their modules and those modules' dependencies, higher priority first:
          // the eager chunks before the ones that load later, so these keep only their own code.
          groups: [
            { name: "react", test: react, priority: 1 },
            {
              name: "react-aria",
              test: (id) => id.includes("node_modules") && !react.test(id),
              priority: 1,
            },
            { name: "kit", test: /[/]packages[/]ui[/]/, priority: 1 },
            // The editor and the engine packages it uses (doc-ops, format, host, project, zip).
            {
              name: "blocks",
              test: /[/]packages[/](?!ui[/]|preview[/]|exporters[/]|player-blocks[/]|tracking[/]|labels[/]|blocks-editor[/]dist[/](player-view|resume-size))/,
              priority: 1,
            },
            // The editor's block previews: the player's block renderer and style sheet, loaded
            // when a lesson first opens.
            {
              name: "block-preview",
              test: /[/]packages[/](blocks-editor[/]dist[/]player-view|player-blocks[/](dist[/](blocks|dom|question|progress|hooks)\.js|src[/]player\.css)|labels[/])/,
            },
            // The preview and the player bundle it runs, loaded when a preview first opens, and the
            // publish panel's estimate of learner progress, which runs the player's own code (M2-18).
            {
              name: "player",
              test: /[/]packages[/](preview|exporters|player-blocks|tracking|labels|blocks-editor[/]dist[/]resume-size)/,
            },
          ],
        },
      },
    },
  },
});
