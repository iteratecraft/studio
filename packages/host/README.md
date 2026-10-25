# @course-suite/host

The host interface (M2-02, ENG-12, ADR-0006): what the editors need from the edition they run in.
Editor code reaches files, dialogs and storage only through `HostInterface`, so the same editor
runs in the desktop app and in a browser. Importing `@tauri-apps/*` anywhere outside
`apps/desktop` fails `pnpm lint`.

Apache-2.0, layer `engine`. No dependencies; it runs in a browser, a Web Worker or Node.js.

## The interface

| Part | What it does |
|---|---|
| `appInfo()` | Name, version and edition (`desktop` or `server`) |
| `files.pickOpen(options)` | Open dialog; an empty list when the user cancels |
| `files.pickSave(options)` | Save dialog; `null` when the user cancels |
| `files.dataFile(name)` | A file in the app's data folder, by a relative name such as `autosave/course-1.zip` (`checkDataName`) |
| `files.read(file)` | Reads a picked file or a data file; `HostError("not-found")` when it does not exist |
| `files.write(file, data)` | Replaces a picked file or a data file atomically: old bytes or new bytes, never a mix |
| `files.projectFiles(file)` | The project container's files for a picked project file (below) |
| `storage` | Small string values kept between sessions (settings, recent files); never projects or media |

`FileRef.id` is opaque: a path on desktop, a key in memory. Keep it and hand it back, never parse
it. A file the user did not pick, outside the data folder, is refused with
`HostError("not-allowed")` in every adapter, so tests catch what the desktop app would refuse.

Long tasks are not part of the host: they keep the one job contract of `@course-suite/jobs`
(ENG-15), whose `JobStore` and `JobFiles` ports wave G connects to the host.

## Project files

`files.projectFiles(file)` gives a `HostFolder`, the shape of `ProjectFiles` in
`@course-suite/project`: `read`, `write` (atomic, flushed), `rename`, `remove` and `list`, by
relative paths with forward slashes. It reaches exactly two things in the picked file's folder:

- the picked file itself, by its name, to read it and to replace it;
- its autosave folder `.<name>.autosave` (`autosaveFolderOf`, D-4) and everything in it.

Renames stay inside the autosave folder or go from it over the picked file, so a save is one step
on one volume and the project file is never moved away or deleted. `projectFolder(name, ops)`
holds these rules for every adapter (`checkFolderPath` checks the paths); the desktop shell checks
them again for script that bypasses the host.

## Adapters

| Adapter | Where | Use |
|---|---|---|
| `createMemoryHost(init)` | here | Tests. Files live in `disk`; dialogs answer from `onPickOpen` and `onPickSave`; the same scope rule as the desktop app |
| `createBrowserHost(app, localStorage)` | here | The editor in a browser until the server adapter (M3): app info and storage work, files refuse with `HostError("unsupported")` |
| `createDesktopHost()` | `apps/desktop/src/desktop-host.ts` | The Tauri app: the dialog plugin and the shell's own file commands |

`HostStorage` (`get`, `set` and `delete` of string values by key) is the port other wave F
packages plug into for small values. `createKeyValueStorage` puts it over any Web Storage object
(`localStorage` on desktop and in the browser, a map in the memory host); keys are prefixed with
`course-suite:`.
