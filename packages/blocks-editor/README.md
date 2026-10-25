# @course-suite/blocks-editor

The blocks editor's screens (M2-08 onward, BLK-01): runtime-neutral React that reaches files,
dialogs and the window only through `@course-suite/host` (ADR-0006), edits courses only through
`@course-suite/doc-ops` commands, keeps them in `@course-suite/project` files and draws everything
with `@course-suite/ui` and its string catalogue. Apache-2.0, layer `ui`. `apps/desktop` runs it
over the desktop host; `apps/web` serves it at `editor.html` over the in-memory host for the
browser tests.

```tsx
import "@course-suite/ui/styles.css";
import "@course-suite/blocks-editor/styles.css";
import { BlocksEditorApp } from "@course-suite/blocks-editor";

createRoot(element).render(<BlocksEditorApp host={host} locale="en" />);
```

## What it does

| Part | Behaviour |
|---|---|
| Dashboard (blocks-editor.md H6 to H13) | Course cards with title, type, lesson count and last change; new blank course or microlearning (title, then where to save the `.crs`, then the editor); open a `.crs` through the open dialog; search by title as you type, type filter, sort by last updated, date created or title (remembered, UI-BLOCKS-EDITOR-R2), grid or list view (remembered); empty state on first launch |
| Card actions | Duplicate (name, then where to save; new ids, media copied), rename (the course title, saved into its file), delete to the Deleted list with an undo notice; Deleted: restore, remove from the list, empty Deleted. The app never deletes a file. A card whose file is gone says so and can be removed |
| Opening | `openProject` with crash recovery: autosaved work newer than the file is offered (recover it, or open the saved file and drop the autosaves); a damaged or newer-version file is refused with its problems and left unchanged |
| Saving | Autosave 3 s after an edit, gathering the edits in between (`AUTOSAVE_DELAY_MS`; BLK-01 allows 10 s of loss); Ctrl+S or the save button writes the file (`saveProject`); one write at a time |
| Leaving | Back to the dashboard, or the window's close button, asks Save, Don't save or Cancel when there are unsaved changes; Don't save drops the autosaves |
| Editor frame (C1, C2) | Top bar: back, course title, save state (a live status), undo and redo (UI-BLOCKS-EDITOR-R14; Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z outside text fields), save; Theme, Preview and Publish shown disabled until M2-17, M2-11 and M2-18. The window title names the course, with `*` while unsaved. The overview holds the course title field (100 characters, UI-BLOCKS-EDITOR-R13; one undo step per edit, kept on Enter or leaving the field) and the outline area that M2-09 fills |

The course list lives in the host's storage (`library`), with what each card shows, so the
dashboard never reads the course files; on launch it only asks the host when each file last
changed (`HostFiles.modified`), which also tells which are gone.

`CourseSession` (one open course: editor, autosave, save, discard, save state) and the session's
change events are what later editor screens build on.

## Size

Built for the browser (`pnpm --filter @course-suite/web build`, then `size`): this package with the
engine packages it uses (doc-ops, format, host, project, zip) is 25.4 KB gzipped, on top of React
(65.8 KB) and React Aria with the kit (126.6 KB).
