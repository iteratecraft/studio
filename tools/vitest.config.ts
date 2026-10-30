import { defineConfig } from "vitest/config";

// Every test here runs a command-line tool (Biome, Node.js scripts, turbo) as a child process, often
// several in one test. On a shared CI runner, busy with the other packages' tests, starting them can
// take longer than Vitest's 5 s default for in-process unit tests (#60: lint/editor-imports.test.ts
// timed out with three Biome runs that pass in 1 to 2 s when the machine is idle).
export default defineConfig({ test: { testTimeout: 60_000 } });
