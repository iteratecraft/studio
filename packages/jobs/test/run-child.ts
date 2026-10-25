// Run by runner.test.ts in a child Node process, the "app" that gets killed: opens a runner over
// <folder>, submits one "slow" job whose run writes temporary output and never ends, prints
// "running" once that output is on disk, and waits to be killed.
// Usage: node run-child.ts <folder>
import { join } from "node:path";
import { openJobRunner } from "@course-suite/jobs";
import { nodeJobFiles, nodeJobStore } from "./node.ts";

const [folder = ""] = process.argv.slice(2);
const runner = await openJobRunner({
  store: nodeJobStore(join(folder, "store")),
  files: nodeJobFiles(folder),
  handlers: {
    slow: {
      async run(_input, { temp, files }) {
        await files.write(`${temp}/part.bin`, new Uint8Array(1024));
        process.stdout.write("running\n");
        return new Promise(() => {});
      },
    },
  },
});
await runner.submit("slow", { note: "survives a restart" });
