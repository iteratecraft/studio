# @course-suite/desktop

The desktop app (M2-01, ADR-0006): a Tauri 2 shell around the editor UI, which runs in WebView2 on
Windows. There is no Node.js at run time. Until the editor arrives in wave G the window shows a
placeholder page that asks the host for the app's name and version.

| Path | What it holds |
|---|---|
| `index.html`, `src/` | The frontend, built by Vite into `dist/` |
| `src/desktop-host.ts` | The desktop adapter of `@course-suite/host`, the only code allowed to import `@tauri-apps/*` |
| `src-tauri/` | The Rust shell: window, default menu, the dialog plugin and our file commands (`src/files.rs`) |
| `src-tauri/tauri.conf.json` | Window, content security policy, enabled capabilities |
| `src-tauri/capabilities/main.json` | Every command the window may call, and the file scope |

## Security boundary

- **Content security policy:** `default-src 'none'`; script, style, images and fonts only from the
  app itself; connections only to Tauri's IPC. No inline script, no eval, no remote origin.
  `devCsp` adds only inline styles and Vite's reload socket, for development.
- **Commands:** app name and version, the open and save dialogs, and the shell's own file commands
  (`data_folder`, `read_file`, `write_atomic`, `rename_file`, `remove_path`, `list_folder`).
  Nothing else, and only for the `main` window. No file system plugin command is granted: the
  plugin only records the files the user picks in a dialog.
- **Files:** every path goes through one rule in `src-tauri/src/files.rs`:
  - the data folder, `%LOCALAPPDATA%\org.iteratecraft.coursesuite\data`: everything. The folder
    above it also holds WebView2's own profile (`EBWebView`: cookies, local storage, preferences),
    which the page can neither read nor change;
  - a file the user picked in a dialog: read it and replace it;
  - the picked file's autosave folder `.<name>.autosave` next to it (D-4): everything inside, and
    renaming a file from there over the picked file. Nothing else in that folder.

  Paths must be absolute, without `..` and without parts ending in a dot or space.

`test/shell.test.ts` pins the policy and the capability; `e2e/app.e2e.ts` checks them in the built
app.

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
