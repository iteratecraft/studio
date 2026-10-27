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
| `src-tauri/tauri.conf.json` | Window, content security policy, enabled capabilities |
| `src-tauri/capabilities/main.json` | Every command the window may call, and the file scope |
| `src-tauri/src/media.rs`, `src-tauri/media-tool.json` | The media converter (M2-13, D-12, D-43): the pinned FFmpeg build, its download, check and fixed conversion |

## Security boundary

- **Content security policy:** `default-src 'none'`; script, style, images and fonts only from the
  app itself; connections only to Tauri's IPC. No inline script, no eval, no remote origin.
  `devCsp` adds only inline styles and Vite's reload socket, for development. For the course
  preview (M2-11, `@course-suite/preview`) both add `frame-src data:` for its sandboxed frame,
  which inherits the policy, the frame's one script by its hash in `script-src`, and `blob:` in
  `script-src`, `style-src` and `img-src` for the package files the frame holds in memory. A
  `blob:` address exists only once script already running in that page made it, so injected markup
  gains nothing from it. `apps/web/preview.html` runs the preview under the release policy.
  `media-src 'self' blob:` lets the preview play audio, video and caption files from memory, and the
  editor read a video's size while adding it (M2-13). No third-party frame is allowed: the preview
  shows where a web embed plays without loading it.
- **Commands:** app name and version, the open and save dialogs, the shell's own file commands
  (`data_folder`, `read_file`, `file_modified`, `write_atomic`, `rename_file`, `remove_path`,
  `list_folder`), the media converter's commands (`media_converter`, `media_install`,
  `media_convert`, `media_cancel`; below), and listening for the window's close request with
  `destroy` to close it, so the editor can offer to save first (`HostInterface.onCloseRequested`).
  Nothing else, and only for the `main` window. No file system plugin command is granted: the
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
the window loads the dev server instead of the built files. Installers come with M2-19.

The app test launches the executable with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` set to open
WebView2's DevTools port and drives the window with Playwright over CDP. It writes and removes a
`smoke-test` folder in the app's data folder, and checks that page script cannot reach WebView2's
profile.
