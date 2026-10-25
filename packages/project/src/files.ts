// The one port the project container needs: files in the folder that holds the project file. The
// host adapter (M2-02) gives the desktop's file system through it; tests use the in-memory one.

/**
 * Files inside one folder, named by relative paths with forward slashes, such as
 * `Safety.course` or `.Safety.course.autosave/3.course`. One write at a time per project.
 */
export interface ProjectFiles {
  /** The file's bytes, or undefined when it does not exist. */
  read(path: string): Promise<Uint8Array | undefined>;
  /** Creates or replaces the file, creating missing folders, and flushes it to disk before resolving. */
  write(path: string, data: Uint8Array): Promise<void>;
  /** Moves `from` to `to` in one step, replacing `to` (an atomic rename on the same volume). */
  rename(from: string, to: string): Promise<void>;
  /** Deletes the file, or the folder and everything in it; nothing happens when it does not exist. */
  remove(path: string): Promise<void>;
  /** Names of the files directly in the folder; empty when the folder does not exist. */
  list(folder: string): Promise<string[]>;
}

/** Project files held in memory, for tests and previews. `files` is every file by path. */
export function memoryProjectFiles(): ProjectFiles & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    read: async (path) => files.get(path)?.slice(),
    async write(path, data) {
      files.set(path, data.slice());
    },
    async rename(from, to) {
      const data = files.get(from);
      if (!data) throw new Error(`${from} does not exist`);
      files.delete(from);
      files.set(to, data);
    },
    async remove(path) {
      for (const name of [...files.keys()]) {
        if (name === path || name.startsWith(`${path}/`)) files.delete(name);
      }
    },
    list: async (folder) =>
      [...files.keys()]
        .filter((name) => name.startsWith(`${folder}/`) && !name.includes("/", folder.length + 1))
        .map((name) => name.slice(folder.length + 1)),
  };
}
