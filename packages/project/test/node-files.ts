// ProjectFiles on Node's file system, for Node tests: the folder `root` holds the project file.
// The desktop gets its own through the host interface (M2-02); this one never ships.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProjectFiles } from "../src/files.js";

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

export function nodeProjectFiles(root: string): ProjectFiles {
  const at = (path: string) => join(root, ...path.split("/"));
  return {
    async read(path) {
      try {
        return await readFile(at(path));
      } catch (error) {
        if (missing(error)) return undefined;
        throw error;
      }
    },
    async write(path, data) {
      await mkdir(dirname(at(path)), { recursive: true });
      // flush: fsync before the promise resolves, so the bytes are on disk before any rename.
      await writeFile(at(path), data, { flush: true });
    },
    rename: (from, to) => rename(at(from), at(to)),
    remove: (path) => rm(at(path), { recursive: true, force: true }),
    async list(folder) {
      try {
        return await readdir(at(folder));
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
    },
  };
}
