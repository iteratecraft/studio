// The Blocks conformance corpus (M1-28): the course folders of a test-courses checkout at the root
// of studio. The same few lines as @course-suite/conformance's loader, kept here because a dev
// dependency on that test-only package would reach every app that uses the project container:
// turbo boundaries counts the dependencies of dependencies, dev ones included.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TEST_COURSES_DIR = join(import.meta.dirname, "..", "..", "..", "test-courses");

export interface CorpusCourse {
  /** Folder name under `blocks/`. */
  name: string;
  /** `course.json` as stored. */
  text: string;
  /** Names of the files in its `media/` folder, sorted. */
  mediaFiles: string[];
}

/** Every Blocks course of the checkout, sorted by name; undefined without a checkout. */
export function loadBlocksCorpus(): CorpusCourse[] | undefined {
  const blocks = join(TEST_COURSES_DIR, "blocks");
  if (!existsSync(blocks)) return undefined;
  return readdirSync(blocks, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const media = join(blocks, name, "media");
      return {
        name,
        text: readFileSync(join(blocks, name, "course.json"), "utf8"),
        mediaFiles: existsSync(media) ? readdirSync(media).sort() : [],
      };
    });
}
