// Builds the kit gallery (M2-05). The bundle is split so `pnpm --filter @course-suite/web size`
// can report React, React Aria and the kit apart from the gallery's own code.
import { defineConfig } from "vite";

const react = /[/]node_modules[/](react|react-dom|scheduler)[/]/;

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: react },
            { name: "react-aria", test: (id) => id.includes("node_modules") && !react.test(id) },
            { name: "kit", test: /[/]packages[/]ui[/]/ },
          ],
        },
      },
    },
  },
});
