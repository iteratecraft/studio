# @course-suite/host

The host interface (M2-02, ENG-12, ADR-0006): what the editors need from the edition they run in.
Editor code reaches files, dialogs, storage and long tasks only through `HostInterface`, so the
same editor runs in the desktop app and in a browser. Importing `@tauri-apps/*` anywhere outside
`apps/desktop` fails `pnpm lint`.

Apache-2.0, layer `engine`. No dependencies; it runs in a browser, a Web Worker or Node.js.

## The interface

| Part | What it does |
|---|---|
| `appInfo()` | Name, version and edition (`desktop` or `server`) |
| `files.pickOpen(options)` | Open dialog; an empty list when the user cancels |
| `files.pickSave(options)` | Save dialog; `null` when the user cancels |
| `files.dataFile(name)` | A file in the app's data folder, by a relative name such as `autosave/course-1.zip` (`checkDataName`) |
| `files.read(file)` | Reads a picked file or a data file |
| `files.write(file, data)` | Replaces a picked file or a data file atomically: old bytes or new bytes, never a mix |
| `storage` | Small string values kept between sessions (settings, recent files); never projects or media |
| `jobs.run(request, options)` | Runs a long task by kind, with progress and an abort signal |

`FileRef.id` is opaque: a path on desktop, a key in memory. Keep it and hand it back, never parse
it. A file the user did not pick, outside the data folder, is refused with
`HostError("not-allowed")` in every adapter, so tests catch what the desktop app would refuse.

## Adapters

| Adapter | Where | Use |
|---|---|---|
| `createMemoryHost(init)` | here | Tests. Files live in `disk`; dialogs answer from `onPickOpen` and `onPickSave`; the same scope rule as the desktop app |
| `createBrowserHost(app, localStorage)` | here | The editor in a browser until the server adapter (M3): app info and storage work, files refuse with `HostError("unsupported")` |
| `createDesktopHost()` | `apps/desktop/src/desktop-host.ts` | The Tauri app: dialog and file system plugins, and the shell's `write_atomic` command for atomic writes |

## Ports

The two minimal ports other wave F packages plug into; wave G wires the real implementations.

- **`HostStorage`**: `get`, `set` and `delete` of string values by key. `createKeyValueStorage`
  puts it over any Web Storage object (`localStorage` on desktop and in the browser, a map in the
  memory host); keys are prefixed with `course-suite:`.
- **`HostJobs`**: `run({ kind, input }, { signal, onProgress })`. `createJobs(handlers)` runs
  handlers in the calling thread; a job that ignores its signal still settles as aborted for the
  caller. The job runner (M2-06) replaces it with Web Workers on desktop.
