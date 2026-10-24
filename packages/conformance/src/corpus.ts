// Blocks conformance corpus (M1-28, ENG-37): the reference course documents in the private
// iteratecraft/test-courses repository, one folder per course under `blocks/` with `course.json` and
// `media/<storage key>` files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the test-courses checkout lives: `test-courses/` at the root of studio, git-ignored. CI
 * checks it out there (.github/workflows/ci.yml); locally, clone iteratecraft/test-courses there.
 */
export const TEST_COURSES_DIR = join(import.meta.dirname, "..", "..", "..", "test-courses");

export interface CorpusCourse {
  /** Folder name under `blocks/`, for example `long-resume`. */
  name: string;
  /** `course.json` as stored. */
  text: string;
  /** Names of the files in its `media/` folder, sorted. */
  mediaFiles: string[];
}

/** Every Blocks course in a test-courses checkout, sorted by name; undefined without a checkout. */
export function loadBlocksCorpus(dir = TEST_COURSES_DIR): CorpusCourse[] | undefined {
  const blocks = join(dir, "blocks");
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
