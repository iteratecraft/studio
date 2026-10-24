// Dev harness (M1-09): writes the sample courses of the format's test fixtures as course packages
// under dist/. Open dist/<name>/index.html in a browser straight from disk.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fullCourse, minimalCourse, sampleCourse } from "@course-suite/format/test/courses";
import { writePackage } from "./package.ts";

const dist = join(import.meta.dirname, "..", "dist");
rmSync(dist, { recursive: true, force: true });
for (const [name, course] of [
  ["sample", sampleCourse()],
  ["full", fullCourse()],
  ["minimal", minimalCourse()],
] as const) {
  const dir = join(dist, name);
  await writePackage(dir, { course });
  console.log(pathToFileURL(join(dir, "index.html")).href);
}
