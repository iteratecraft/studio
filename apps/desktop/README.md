# @course-suite/desktop

The desktop app (M2-01, ADR-0006): a Tauri 2 shell around the editor UI, which runs in WebView2 on
Windows. There is no Node.js at run time. The window shows the blocks editor
(`@course-suite/blocks-editor`, M2-08) over the desktop host: the dashboard on launch, one course
at a time in the editor.

| Path | What it holds |
|---|---|
| `index.html`, `src/` | The frontend, built by Vite into `dist/`: `src/main.tsx` mounts the editor |
| `src/desktop-host.ts` | The desktop adapter of `@course-suite/host`, the only code allowed to import `@tauri-apps/*` |
| `src-tauri/` | The Rust shell: window, default menu, the dialog plugin, our file commands (`src/files.rs`) and the remembered picks (`src/picks.rs`) |
| `src-tauri/tauri.conf.json` | Window, content security policy, enabled capabilities, and the Windows installer (M2-19) |
| `src-tauri/capabilities/main.json` | Every command the window may call, and the file scope |
| `src-tauri/src/media.rs`, `src-tauri/media-tool.json` | The media converter (M2-13, D-12, D-43): the pinned FFmpeg build, its download, check and fixed conversion |
| `src-tauri/src/update.rs` | Updates (M2-20): Tauri's updater plugin behind five commands, and *Help*, *Check for updates* in the window's menu |

## Security boundary

- **Content security policy:** `default-src 'none'`; script, style, images and fonts only from the
  app itself; connections only to Tauri's IPC and the app's own files. No inline script, no
  eval, no remote origin.
  `devCsp` adds only inline styles and Vite's reload socket, for development. For the course
  preview (M2-11, `@course-suite/preview`) both add `frame-src data:` for its sandboxed frame,
  which inherits the policy, the frame's one script by its hash in `script-src`, and `blob:` in
  `script-src`, `style-src` and `img-src` for the package files the frame holds in memory. A
  `blob:` address exists only once script already running in that page made it, so injected markup
  gains nothing from it. `apps/web/preview.html` runs the preview under the release policy.
  `media-src 'self' blob:` lets the preview play audio, video and caption files from memory, and the
  editor read a video's size while adding it (M2-13). No third-party frame is allowed: the preview
  shows where a web embed plays without loading it. For the course theme (M2-17, ENG-08)
  `font-src` adds `blob:` for the fonts the preview frame holds in memory, and `connect-src` adds
  `'self'` so the editor can read the bytes of its own bundled fonts (`fetch` of the app's files)
  to put them in the preview and in exported packages; it reaches no other origin. Export (M2-18)
  builds each package in a Web Worker loaded from the app's own files (`worker-src` falls back to
  `script-src 'self'`), so the policy needs no change for it.
- **Commands:** app name and version, the open and save dialogs, the shell's own file commands
  (`data_folder`, `read_file`, `file_modified`, `write_atomic`, `rename_file`, `remove_path`,
  `list_folder`), the media converter's commands (`media_converter`, `media_install`,
  `media_convert`, `media_cancel`; below), the updater's commands (`update_ready`,
  `update_check`, `update_download`, `update_cancel`, `update_install`; below), and listening for
  the window's close request with `destroy` to close it, so the editor can offer to save first
  (`HostInterface.onCloseRequested`), and for *Help*, *Check for updates*. Nothing else, and only for the `main` window. No file system plugin command is granted: the
  plugin only records the files the user picks in a dialog.
- **Remembered picks:** `src/picks.rs` keeps the newest 100 files picked in a dialog in
  `picked.txt` beside the data folder, out of the page's reach, and allows them again at the next
  start, so the editor's course list reopens them without a dialog. Only a dialog adds to it.
- **Window title:** `main.rs` builds the window from `tauri.conf.json` (`create: false`) and keeps
  its title in step with the page's `<title>` (the open course, `*` while unsaved), so the page
  needs no permission for it.
- **React Aria's style element:** the policy blocks it; `index.html` holds the marker that tells
  React Aria its rule is already in the kit's stylesheet (`packages/ui/README.md`).
- **Files:** every path goes through one rule in `src-tauri/src/files.rs`:
  - the data folder, `%LOCALAPPDATA%\org.iteratecraft.coursesuite\data`: everything. The folder
    above it also holds WebView2's own profile (`EBWebView`: cookies, local storage, preferences),
    which the page can neither read nor change;
  - a file the user picked in a dialog: read it and replace it;
  - the picked file's autosave folder `.<name>.autosave` next to it (D-4): everything inside, and
    renaming a file from there over the picked file. Nothing else in that folder.

  Paths must be absolute, without `..` and without parts ending in a dot or space.
- **Media converter (`src/media.rs`):** the pinned LGPL FFmpeg build named in `media-tool.json`
  (address, size, SHA-256). After the editor asked the author, `media_install` downloads it with
  Windows' own `curl.exe` (https only), checks size and SHA-256, unpacks it with Windows' own
  `tar.exe` and keeps it in `tools\<build>` in the app local data folder, beside `data` and so out of
  the page's reach. `media_convert` runs `ffmpeg.exe` with arguments built in Rust around two paths:
  a file the page may read (the scope rule above) and an output in the Rust-only `media-work`
  folder, whose bytes it returns and deletes; a data file under `data\media-work` (a dropped file) is
  deleted once read. Progress comes back through a channel; `media_cancel` kills the child process,
  and a cancel that arrives before its task started stops that task as it starts. The page's job id
  names the task's files in `media-work`, so every media command first checks it is a plain id (1 to
  64 letters, digits and hyphens), never a path. Nothing is unpacked unless the download's size and
  SHA-256 are the pin's. No shell is involved. The build is not in the app or its installer.
- **Updates (`src/update.rs`, M2-20):** Tauri's updater plugin, with its settings in
  `plugins.updater` of `tauri.conf.json`: the only address is this repository's
  `releases/latest/download/latest.json` over https, which GitHub serves from the latest published
  release only; `requireSignedVersion` makes the signature cover the version too, so an older
  signed installer cannot be passed off as newer; the NSIS installer runs in `passive` mode (its
  progress bar only) and starts the app again. The page gets five commands and no plugin command:
  `update_ready` (whether `pubkey` is set; empty until the lead sets it, docs/release.md),
  `update_check`, `update_download` (the signature is checked against `pubkey` as it ends, and
  the installer kept in memory), `update_cancel` and `update_install`, which checks it again and
  runs it; on Windows the app exits as it starts. The page decides when to check (the blocks
  editor: at start at most once a day, never offline or when turned off in *Settings*) and asks
  the author before downloading. The menu item only sends the page an event.
- **Drag and drop:** the window's own file-drop handling is off (`dragDropEnabled: false`), so
  files dragged from the desktop reach the editor's drop zones as the browser's `File`s, which it
  reads; a drop grants no path.

`test/shell.test.ts` pins the policy and the capability; `e2e/app.e2e.ts` checks them in the built
app, along with the editor starting without a policy violation, the window title and closing.

## Build and run

You need Node.js and pnpm (see the root `AGENTS.md`), plus `rustup` and the Visual Studio C++ build
tools. `rust-toolchain.toml` at the repository root pins the Rust version.

```bash
pnpm build                                          # includes this app's frontend
pnpm --filter @course-suite/desktop build:app       # src-tauri/target/release/course-suite-desktop.exe
pnpm --filter @course-suite/desktop check:size      # fails over 15 MB
pnpm --filter @course-suite/desktop test:e2e        # the page, then the built app
```

For development, run `pnpm --filter @course-suite/desktop dev` (Vite on port 1420) and, in a second
terminal in `src-tauri`, `cargo run --no-default-features`: without the `custom-protocol` feature
the window loads the dev server instead of the built files.

To build the Windows installer, run `pnpm build`, then
`pnpm --filter @course-suite/desktop build:installer`: Tauri's bundler builds the app and writes
`src-tauri/target/release/bundle/nsis/Course Suite_<version>_x64-setup.exe`. The first run downloads
NSIS into Tauri's cache (`%LOCALAPPDATA%\tauri`). The release workflow runs the same command
(`docs/release.md`). `INSTALLER_E2E=1 pnpm --filter @course-suite/desktop exec playwright test
--project installer` then installs it for you, starts it, measures it and uninstalls it again.
`UPDATE_E2E=1 pnpm --filter @course-suite/desktop exec playwright test --project update` proves
the updater (M2-20): it builds versions 0.0.1 and 0.0.2 of a separate *Course Suite Update Test*
app in `src-tauri/target/update-e2e` with a key pair it makes for the run, serves the update from a
local server, installs 0.0.1 silently, checks that it refuses a signature of another key, updates
it in place to 0.0.2 and opens a course in it, with the window hidden throughout; then it
uninstalls it and deletes the keys and its data folder.

## Install and uninstall

Desktop 0.1 runs on Windows 10 and 11, 64-bit (D-29). It uses WebView2, which Windows already
has; on a machine without it the installer fetches Microsoft's WebView2 setup first (ADR-0004 lists
that download, and how to install on a closed network).

- **Install:** download `Course-Suite_<version>_x64-setup.exe` from the project's GitHub releases
  and check it against `SHA256SUMS.txt` from the same release: in PowerShell,
  `Get-FileHash .\Course-Suite_<version>_x64-setup.exe` must print the same SHA-256. Desktop 0.1 is
  not code-signed (D-2), so Windows SmartScreen may warn; choose *More info*, then *Run anyway*.
  The installer needs no administrator rights: it installs for your user only, into
  `%LOCALAPPDATA%\Course Suite`, and adds *Course Suite* to the Start menu, and to the desktop
  unless you untick *Create desktop shortcut* on its last page. `/S` installs silently.
- **Uninstall:** *Settings*, *Apps*, *Course Suite*, *Uninstall* (or `uninstall.exe` in the install
  folder; `/S` for silent). It removes the program, its shortcuts and its entry in *Apps*, and
  nothing else: your `.crs` course files stay wherever you saved them, and the app's data folder
  `%LOCALAPPDATA%\org.iteratecraft.coursesuite` (your course list, font library and the media
  converter) stays for a later install, as does the install folder it remembers in
  `HKCU\Software\iteratecraft\Course Suite`. Tick *Delete the application data* in the uninstaller
  only to remove both too; course files are never in that folder, and a file of yours left in the
  install folder is kept.

The app test launches the executable with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` set to open
WebView2's DevTools port and drives the window with Playwright over CDP. It writes and removes a
`smoke-test` folder in the app's data folder, and checks that page script cannot reach WebView2's
profile.
