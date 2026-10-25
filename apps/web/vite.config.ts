// Builds the kit gallery (M2-05) and the blocks editor's test route (editor.html, M2-08). The bundle
// is split so `pnpm --filter @course-suite/web size` can report React, React Aria, the kit and the
// editor apart from each page's own code.

import { resolve } from "node:path";
import { defineConfig } from "vite";

const react = /[/]node_modules[/](react|react-dom|scheduler)[/]/;

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        gallery: resolve(import.meta.dirname, "index.html"),
        editor: resolve(import.meta.dirname, "editor.html"),
      },
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: react },
            { name: "react-aria", test: (id) => id.includes("node_modules") && !react.test(id) },
            { name: "kit", test: /[/]packages[/]ui[/]/ },
            // The editor and the engine packages it uses (doc-ops, format, host, project, zip).
            { name: "blocks", test: /[/]packages[/](?!ui[/])/ },
          ],
        },
      },
    },
  },
});
