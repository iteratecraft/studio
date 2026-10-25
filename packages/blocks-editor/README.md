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
| Editor frame (C1, C2) | Top bar: back, course title, save state (a live status), undo and redo (UI-BLOCKS-EDITOR-R14; Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z outside text fields), save; Theme, Preview and Publish shown disabled until M2-17, M2-11 and M2-18. The window title names the course, with `*` while unsaved. Undo history belongs to one screen: opening a lesson or going back clears it (UI-BLOCKS-EDITOR-R15) |
| Overview (C2, 2.2) | Course title (100 characters, UI-BLOCKS-EDITOR-R13), the author shown to learners (empty hides it), the description (edited as plain paragraphs; a description with other formatting is shown read-only so it is never flattened), then the outline; a microlearning shows its one lesson instead of an outline |
| Text fields (R13) | What is typed reaches the course after a pause of 0.8 s (`TYPING_PAUSE_MS`), so autosave keeps it, and again on Enter, on leaving the field, and before saving, leaving the course, closing the window or switching lesson (`keepDrafts`). Everything typed in one visit to a field is one undo step; Escape puts back the text the field had when the visit began |
| Outline (C4 to C10, W4, W5, BLK-02) | One reorderable list of section headers, lessons and quizzes. A title field under it adds a lesson on Enter and a section header on Shift+Enter (UI-BLOCKS-EDITOR-R9); its Add menu adds a lesson, a quiz or a header. Each row: drag handle, its type icon when it has content (R11), title renamed in place, Open, a bin for headers and empty lessons (R12), and a menu: open, duplicate (lands below, R10), copy to another course, add a lesson, quiz or header below, move up or down, delete. Deleting shows a notice with undo for 8 seconds; buttons that go to the deleted lesson go in the same undo step (D-36). A section folds its lessons away and moves with them. Rows move by pointer drag, by keyboard drag (Enter on the handle, arrows, Enter) or by the menu, and every move, add and duplicate is announced |
| Copy to another course (C8, W5) | Pick one of the other listed courses (not a microlearning, which holds one lesson and no quiz; doc-ops refuses that copy too); the lesson goes to the end of its outline with new ids and its media files, and that file is saved; a notice offers to open it. When a crash left autosaved work in that course, the author first chooses it or the saved file, as opening it asks; cancelling copies nothing. Buttons to other lessons and a quiz's skip-ahead are left out; a lesson with a custom block is refused with a message |
| Lesson (L1, C11) | A lesson switcher (another lesson or quiz, or back to the overview, where focus returns to the lesson's row), the lesson's title, description and the author shown on it (empty: the course author), and its blocks by type, read-only until M2-10. A quiz says its questions come later (M2-15) |

The course list lives in the host's storage (`library`), with what each card shows, so the
dashboard never reads the course files; on launch it only asks the host when each file last
changed (`HostFiles.modified`), which also tells which are gone.

`CourseSession` (one open course: editor, autosave, save, discard, save state) and the session's
change events are what later editor screens build on.

## Size

Built for the browser (`pnpm --filter @course-suite/web build`, then `size`): this package with the
engine packages it uses (doc-ops, format, host, project, zip) is 29.4 KB gzipped, on top of React
(65.8 KB) and React Aria with the kit (127.7 KB). The outline and lessons (M2-09) added 4.0 KB to
it and 1.1 KB to the kit, and no dependency.
