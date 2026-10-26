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
| Editor frame (C1, C2) | Top bar: back, course title, save state (a live status), undo and redo (UI-BLOCKS-EDITOR-R14; Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z outside text fields), save, Preview (below); Theme and Publish shown disabled until M2-17 and M2-18. The window title names the course, with `*` while unsaved. Undo history belongs to one screen: opening a lesson or going back clears it (UI-BLOCKS-EDITOR-R15) |
| Overview (C2, 2.2) | Course title (100 characters, UI-BLOCKS-EDITOR-R13), the author shown to learners (empty hides it), the description (formatted text, below), then the outline; a microlearning shows its one lesson instead of an outline |
| Text fields (R13) | What is typed, plain or formatted, reaches the course after a pause of 0.8 s (`TYPING_PAUSE_MS`), so autosave keeps it, and again on Enter, on leaving the field, and before saving, leaving the course, closing the window or switching lesson (`keepDrafts`). Everything typed in one visit to a field is one undo step; Escape puts back the text the field had when the visit began |
| Outline (C4 to C10, W4, W5, BLK-02) | One reorderable list of section headers, lessons and quizzes. A title field under it adds a lesson on Enter and a section header on Shift+Enter (UI-BLOCKS-EDITOR-R9); its Add menu adds a lesson, a quiz or a header. Each row: drag handle, its type icon when it has content (R11), title renamed in place, Open, a bin for headers and empty lessons (R12), and a menu: open, duplicate (lands below, R10), copy to another course, add a lesson, quiz or header below, move up or down, delete. Deleting shows a notice with undo for 8 seconds; buttons that go to the deleted lesson go in the same undo step (D-36). A section folds its lessons away and moves with them. Rows move by pointer drag, by keyboard drag (Enter on the handle, arrows, Enter) or by the menu, and every move, add and duplicate is announced |
| Copy to another course (C8, W5) | Pick one of the other listed courses (not a microlearning, which holds one lesson and no quiz; doc-ops refuses that copy too); the lesson goes to the end of its outline with new ids and its media files, and that file is saved; a notice offers to open it. When a crash left autosaved work in that course, the author first chooses it or the saved file, as opening it asks; cancelling copies nothing. Buttons to other lessons and a quiz's skip-ahead are left out; a lesson with a custom block is refused with a message |
| Lesson (L1, C11) | A lesson switcher (another lesson or quiz, or back to the overview, where focus returns to the lesson's row), the lesson's title, description (formatted text) and the author shown on it (empty: the course author), and its blocks (below). A quiz says its questions come later (M2-15). A microlearning edits its one lesson's blocks on the overview |
| Blocks (L1 to L6, W7 to W12) | One row per block: its type (a text block switches between its sibling types, keeping its content: W8, UI-BLOCKS-EDITOR-R25), its tools (style, format, move up and down, duplicate below, delete with an undo notice, and a menu to copy, paste below, insert below or copy a link to the block) and its content edited in place, with the block as the player's own renderer draws it beside the fields (BLK-03; `block-preview.tsx`, loaded with the first lesson opened). An insert control sits under every block and above the first; the shortcut bar at the end adds a paragraph with heading or a continue block, opens all blocks, and pastes. Rows move by pointer drag, by keyboard drag (Enter on the handle, arrows, Enter) or by the move buttons. Every change is one doc-ops command list (one undo step) and is announced (moved, added, duplicated, pasted) |
| Block library (L3, L4) | Every block type of blocks-editor.md 3 by category, searchable; the types the player shows today insert with sample content (text: paragraph, with heading, with subheading, heading, subheading; knowledge checks: single choice, multiple response, fill in, matching; continue); the others say they are not available yet. With blocks copied, it pastes them where it was opened |
| Block content | Headings and subheadings as plain text, body text as formatted text (below), a continue block's own label and hint, and a knowledge check's question, answers and right answers (single choice keeps exactly one). Adding answers and feedback comes with M2-15 |
| Formatted text (L11, L13, 2.6, W14) | `RichTextField` from the kit with its tools while in use: paragraph style (normal, headings 2 to 5, UI-ACCESSIBILITY-R35), bold, italic, underline, strikethrough, subscript, superscript, bulleted and numbered lists, links to web and mail addresses, to a lesson or quiz found by its title (UI-BLOCKS-EDITOR-R33) or to a block (a copied block link), clear formatting; Ctrl/Cmd+B, I, U and K; Alt+F10 to the tools, Escape back. What a course file holds is cleaned to the format's allow-list (`cleanRichText` in the kit) before it enters the page, and what is typed or pasted is cleaned the same way before it is kept: only the format's elements and attributes (`RICH_TEXT_ELEMENTS`), b to strong, i to em, strike to s, no style |
| Style and format (L9, L10, 2.4, W10, W11) | Style: background light (default), gray, dark, black or a custom colour with automatic, light or dark text (theme colours wait for M2-17, an image for M2-13); for blocks with item cards, keep cards white (on by default); an accent colour of the block's own, which the player uses only where it keeps 4.5:1 on the block's surface. Format: padding presets small 15, medium 30 and large 60 px, or top and bottom from 0 to 200 px by slider or typed number, linked by default (UI-BLOCKS-EDITOR-R18); content width narrow, full column (default), wide or full width; the entrance animation (on by default for blocks other than text, rise.md 3D); in a microlearning, show with the next block in one step (BLK-03; the player's stepped mode comes with M2-16) |
| Copy and paste (W12, W13, rise.md 3J) | Copy a block (its menu, or Ctrl/Cmd+C on its row) or the blocks picked in manage blocks; paste below a block (its menu, or Ctrl/Cmd+V on its row), at the end, or where the library was opened, in any lesson of this course or of another course opened later. The app keeps the copied blocks with their media files; a paste gets new ids and the media index entries and files the course lacks (UI-BLOCKS-EDITOR-R24) |
| Manage blocks (L16, W12, W13) | Every block of the lesson to pick from (Space, click or select all); the picked blocks move as one by drag, take one background, are copied, copied to the end of another lesson of this course or to the end of the last lesson of another course or microlearning through a picker, with a notice that opens it (B7, B8, UI-PUBCOLLAB-R31), duplicated below the selection or deleted after a question, each one undo step |
| Preview (P1, W23, 2.20) | The top bar's Preview shows the course in the real player (`PreviewPane`, M2-11) from the lesson being edited, at computer, tablet or phone width; Edit goes back to the editor at the lesson on show (UI-BLOCKS-EDITOR-R52) |

The course list lives in the host's storage (`library`), with what each card shows, so the
dashboard never reads the course files; on launch it only asks the host when each file last
changed (`HostFiles.modified`), which also tells which are gone.

`CourseSession` (one open course: editor, autosave, save, discard, save state, media for the preview
and media files pasted from another course) and the session's change events are what later editor
screens build on.

## Block types

`blocks.tsx` lists every block type with what it brings (the BLK-03 block-type contract): its
library group and name, `create` (a new block with sample content, from the string catalogue),
`Fields` (its content, edited in place through doc-ops commands) and `switchable` (sibling types it
can turn into, keeping its content). A type without `create` is listed as not available yet. A
later block epic adds its type there; the lesson, the library, copy and paste, manage blocks and
the style and format menus take it as it is.

## Size

Built for the browser (`pnpm --filter @course-suite/web build`, then `size`, gzip -9): this package
with the engine packages it uses (doc-ops, format, host, project, zip) is 37.9 KB gzipped, on top of
React (65.8 KB), React Aria (121.1 KB) and the kit (17.2 KB). Block editing (M2-10) added 7.3 KB to
it, 5.5 KB to the kit (formatted text, slider field, strings and icons) and 3.5 KB of React Aria
(slider and list sections), and no dependency. The player chunk that a preview loads grew 0.8 KB,
to 46.6 KB, for block backgrounds.
