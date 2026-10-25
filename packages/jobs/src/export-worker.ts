// The export worker (ADR-0006): the desktop starts it with
// `new Worker(new URL("@course-suite/jobs/export-worker", import.meta.url), { type: "module" })`
// and passes it to runInWorker as the export job's build. The package bytes move back, not copied.
import { buildExport } from "./build-export.js";
import { serveJob } from "./worker.js";

serveJob(buildExport, (built) => [built.zip.buffer]);
