// Zips a fixture folder for tests. Test code only; hostile archives come from @course-suite/zip.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { makeZip } from "@course-suite/zip/test/make-zip";

/** Zips every file under `dir`, named by its path relative to `dir` with forward slashes. */
export function zipDirectory(dir: string): Promise<Uint8Array> {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const path = join(e.parentPath, e.name);
      return { name: relative(dir, path).split(sep).join("/"), data: readFileSync(path) };
    });
  return makeZip(entries);
}
