// The ports on Node's file system, for Node tests: jobs as one JSON file each, and job files under a
// folder. The desktop gets its own through the host interface (M2-02); these never ship.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Job, JobFiles, JobStore } from "../src/index.js";

export function nodeJobFiles(root: string): JobFiles {
  const at = (path: string) => join(root, ...path.split("/"));
  return {
    async write(path, data) {
      await mkdir(dirname(at(path)), { recursive: true });
      await writeFile(at(path), data, { flush: true });
    },
    rename: (from, to) => rename(at(from), at(to)),
    remove: (path) => rm(at(path), { recursive: true, force: true }),
  };
}

/** Each job in `<folder>/<id>.json`, written under a temporary name and renamed into place. */
export function nodeJobStore(folder: string): JobStore {
  const file = (id: string) => join(folder, `${id}.json`);
  return {
    async list() {
      const names = await readdir(folder).catch(() => []);
      return Promise.all(
        names
          .filter((name) => name.endsWith(".json"))
          .map(async (name) => JSON.parse(await readFile(join(folder, name), "utf8")) as Job),
      );
    },
    async put(job) {
      await mkdir(folder, { recursive: true });
      await writeFile(`${file(job.id)}.tmp`, JSON.stringify(job), { flush: true });
      await rename(`${file(job.id)}.tmp`, file(job.id));
    },
    remove: (id) => rm(file(id), { force: true }),
  };
}
