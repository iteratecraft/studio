# @course-suite/project

The desktop project container (M2-04, ENG-11, D-4): one ZIP-based file per course, a
content-addressed asset store, snapshots, crash-safe saving and autosave recovery. Apache-2.0. It
runs in a browser, a Web Worker and Node.js (ADR-0006) and reaches files only through the
`ProjectFiles` port.

## The file

A project is a `.crs` file. Format version 1 holds:

| Entry | What it is |
|---|---|
| `project.json` | Manifest: `formatVersion`, `revision`, the asset store (`assets`, by storage key) and the snapshot list |
| `course.json` | The course document, exactly as `serializeCourse` writes it |
| `assets/<sha256>` | Each asset's bytes, once, stored without compression |
| `snapshots/<id>.json` | Each snapshot's course document |

An asset record keeps the SHA-256 hash, size, original name, media type, source (`upload`, `ai`,
`stock`, `default`), licence and attribution. Fonts are assets with a `font/` type. The storage key
is the `key` the course's media entries use; `addAsset` makes one from the hash and the file's
extension unless you pass your own. A snapshot keeps the course document and the asset manifest of
its time, and the file keeps the bytes of every asset a snapshot or the course still uses.

Storage keys follow the course format's `StorageKey` rule (`^[a-z0-9][a-z0-9._-]{0,127}$`), in the
manifest and in `addAsset`. On open, every `assets/<sha256>` entry must hash to its name and hold the
size the asset store declares, or the file is refused; bytes from a file are trusted, deduplicated
and saved again only after that check.

`formatVersion` is checked on open: a newer version is refused with a message naming it, and an
older one goes through `PROJECT_MIGRATIONS` (one step per version, none yet). The course inside goes
through the format package's own `openCourse` migration and validation.

## Saving and recovery

- `saveProject(files, name, project)` writes the whole file under a temporary name in the
  autosave folder, flushes it, reads it back and compares it, and only then renames it over the
  project file. Until that rename the previous file is untouched, so a crash at any moment leaves
  the old file or the new one, never a broken one. It refuses a course that would not open again.
- `autosaveProject(files, name, project)` writes `.<name>.autosave/<revision>.crs` the same way,
  leaving out asset bytes the project file already holds, and keeps the newest three.
- `openProject(files, name)` opens the file and, as `recovered`, the newest autosave that is newer
  than it and opens cleanly. Offer it to the author; if they decline, call `discardAutosaves`. A
  project that was only ever autosaved comes back as `recovered` with `ok: false`.
- Snapshots: `takeSnapshot(project, { name, trigger })` with `trigger` `manual`, or `publish`,
  `export` or `share-link` for the automatic ones (the publish and export flows call it);
  `restoreSnapshot` puts one back; `restoreAsNewCourse` returns a new, unsaved project with a new
  project id.

## Port

```ts
interface ProjectFiles {
  read(path: string): Promise<Uint8Array | undefined>; // undefined when missing
  write(path: string, data: Uint8Array): Promise<void>; // creates folders, flushes to disk
  rename(from: string, to: string): Promise<void>; // atomic, replaces `to`
  remove(path: string): Promise<void>; // a file, or a folder with everything in it
  list(folder: string): Promise<string[]>; // names in the folder, [] when missing
}
```

Paths are relative to the folder that holds the project file, with forward slashes. One write at a
time per project. `memoryProjectFiles()` is the in-memory implementation; `test/node-files.ts` is
the Node one the tests use. The desktop adapter (M2-02) provides the real one.

## Measured

`node packages/project/test/measure.ts` (after `pnpm build`, with the corpus checked out) saves and
opens the largest corpus course 20 times on Node's file system, and again with 100 MiB of media.

Limits: the whole file is held in memory while it is saved or opened; no ZIP64, so a project holds
at most 4 GiB and 65,535 files.
