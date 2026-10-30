# Desktop 0.1 exit review (M2-22)

Review of every M2 exit item in [ROADMAP.md](../../ROADMAP.md) (the "### M2" section, with the items
carried from M1 by D-26) and every "done when" item of the M2 epics in [BACKLOG.md](../../BACKLOG.md):
ENG-07, ENG-08, ENG-10 to ENG-15, ENG-40 (start), BLK-01 to BLK-10 and STD-08. Checked against `main`
at `e44674f` (after #56) plus this change.

How to read it:

- **Met:** a test, or a CI job, asserts the item. Its file and title are named. The bodies of the
  exit-item proofs were read for the assertion, not only for a page that loads, and so were those
  of the BLK-03 copy, BLK-04 snapshot and carousel, BLK-05 seek, BLK-06 completion, BLK-02
  microlearning, ENG-13 call-log and STD-08 identifier rows; the other done-when rows were matched
  by a title that states the assertion. A title that overstates its body would not be caught there.
- **Met with a limit:** the item is asserted, but in a narrower form than its wording; the limit is
  said.
- **Not met:** nothing proves it. The row says whether this change fixes it, or why it waits and for
  which roadmap task.
- **Not M2:** the item belongs to a slice of the epic that the roadmap puts in a later milestone (the
  M2 line lists "ENG-07 (VTT captions only)", "ENG-11 (slice)", "ENG-14 (basic import only)", "ENG-40
  (start)"), or to an edition or platform that comes later (D-29: Windows only; the server edition is
  M3). Listed so nothing is dropped silently.
- **(local)** after a proof: it runs over the `test-courses` corpus, which CI checks out only once the
  `TEST_COURSES_DEPLOY_KEY` secret exists (docs/ci.md). That secret is still not set: in CI these
  tests run over the format's fixtures only. They were run locally for this review.
- `check` is the Windows CI job (`pnpm test`, `pnpm test:e2e`, Rust tests); `moodle` is the Linux
  Moodle job; `hosts` is `.github/workflows/hosts.yml` (ILIAS, SQL LRS, CATAPULT).

## Summary

| Exit item | Result |
|---|---|
| Scripted end-to-end run on Windows, passed in Moodle, offline | Met with a limit (new in this change) |
| Preview and export pixel-identical for corpus courses | Met with a limit (widened to every page, top to bottom, in this change) |
| A forced quit never corrupts a project | Met (desktop write path proven in this change) |
| Undo and redo cover every MVP edit | Met with a limit (two dashboard actions are outside undo) |
| The editor is usable by keyboard and screen reader | Keyboard met; screen reader not verified (owner: M2-22) |
| Editor network assertions pass | Met with a limit (whole-session assertion added in this change) |
| Installers, release notes and a user guide are published | Not met: met once #59 merges and the lead publishes the 0.1.0 draft |
| Carried from M1: ILIAS, open-source LRS, CATAPULT, player budget | Met |

Done-when items of the M2 epics: 80 rows below; 54 met, 19 met with a limit, 2 not met (the user guide, #59; a Narrator and Magnifier run), 5 not M2.

## M2 exit items

| Item | Result | Evidence | If not met |
|---|---|---|---|
| **(a)** A scripted end-to-end run on Windows: create a course, add 3 lessons using every MVP block type and a quiz lesson, set theme and navigation, preview, export SCORM 1.2, and pass in Moodle, all offline | Met with a limit | `apps/web/e2e/exit-run.e2e.ts` "M2 exit, ROADMAP M2, D-29: offline, a course with three lessons holding every block type and a quiz is built, themed, given navigation, previewed and exported as SCORM 1.2": by keyboard, a blank course gets 3 lessons and a quiz; the 51 block types the library offers (the test checks its list against the library's) go into the 3 lessons; every insert is undone and redone; pictures, audio, video, a file and an embed address are given; the quiz gets a question; the theme gets the bold layout and a colour, the navigation the overlay menu and floating buttons; the preview shows every block of every lesson in the real player and the quiz passes; the publish panel tracks the quiz, passed or failed, and exports SCORM 1.2 (manifest 1.2, mastery score 80). Every request outside the page's origin is cut off and fails the run. Then `packages/conformance/moodle/moodle.e2e.ts` "M2 exit, D-29 …: the course built and exported in the editor's exit run passes in Moodle, and its pages load nothing from outside Moodle": a learner walks every lesson and the quiz; Moodle keeps passed with score 100, as the conformance test LMS does for the same walk | The journey runs in `check` on Windows (part of `pnpm test:e2e`) and again in `moodle` on Linux, where the package it makes goes to Moodle in the next step (ci.yml). So the package that passes in Moodle is made by the same editor code in Chromium on Linux, not in WebView2 on Windows: handing the Windows package over would make `moodle` wait for `check`, adding about 6 minutes to every pull request. The editor runs against the in-memory host, not the desktop shell (see ENG-12) |
| **(b)** Preview and export are pixel-identical for corpus courses | Met with a limit | `apps/web/e2e/preview.e2e.ts` "M2 exit, <course>: the overview and every lesson and quiz render identically from top to bottom at computer, tablet and phone width": for the sample course and each corpus course (local), the preview frame and the exported web package opened from disk, at the same size, give the same markup and byte-identical screenshots, on every page at 1280, 768 and 375 px, from top to bottom. A screenshot shows one screen (the preview frame scrolls inside), so both are scrolled together screen by screen down to the end of the page, each screen overlapping the last by a quarter so nothing stays under the sticky top bar; each panel that scrolls on its own (the contents beside a lesson) is scrolled the same way. At every stop the markup and the pixels must match. Both start afresh at each page and width (the preview is restarted at that width; the package page is loaded again). A trial run with one line of text recoloured below the first screen of the package page failed at that stop. This change widens it from the first screen of the overview and first lesson to every screen of every page; 7/7 pass locally (long-resume: 37 pages) | Corpus courses run only locally until the deploy key is set (CI runs the sample). The six corpus courses use 17 of the 51 block types; the others are compared only through the sample course and the player harness snapshots (BLK-04, BLK-06). Both pages are compared as a learner who asks for less motion sees them (UI-ACCESSIBILITY-R40), so blocks show at rest with no fade-in as they scroll into view; the fade itself is not compared. With the fade on, the comparison below the first screen is not stable: Chromium can draw a rounded border next to a block that has faded in one colour step apart in the frame and in the page (9 pixels in the text-only and long-resume corpus courses, in some runs only), so it would fail without a difference in the player's output |
| **(c1)** A forced quit never corrupts a project | Met | `packages/project/src/crash.test.ts` "killing the process at random points during save never leaves a project that will not open": 40 kills of a child saving, autosaving and snapshotting a 2 MB project; every time the project opens with all its assets and some kills landed mid-write. New: `apps/desktop/src-tauri/src/files.rs` `a_process_killed_while_replacing_a_file_leaves_the_old_or_the_new_one_whole`: 30 kills of a process replacing a 3 MB file through the desktop's own `replace_atomically` (what `write_atomic` runs); the file is always the old or the new content whole, and kills did land mid-write. `apps/web/e2e/editor.e2e.ts` "BLK-01: after a crash, opening the course offers the autosaved work, or the saved file" | The app executable itself is not killed mid-save in a test: its save is the project code above over the shell's `write_atomic` and `rename_file`, each proven under kill separately |
| **(c2)** Undo and redo cover every MVP edit | Met with a limit | Every edit of an open course goes through its doc-ops editor (`CourseSession` makes one per course) and its undo history; the exported package version is kept out of that history by design (`publish.tsx`: an undo never hands out a shipped version again). Each of the 34 commands is undone and redone in `packages/doc-ops/src/property.test.ts`, see [Undo and redo, command by command](#undo-and-redo-command-by-command). In the editor, `exit-run.e2e.ts` undoes and redoes the insert of every one of the 51 block types with Ctrl+Z and Ctrl+Y | Outside any undo history, by design, two actions change a course file that is not open: they apply doc-ops commands (`applyCommands`) and save the file (`saveProject`). **Rename** on Your courses (`packages/blocks-editor/src/app.tsx`, `rename`) sets a listed course's title: the dashboard has no undo history, as no course is open there; the author renames it back the same way. **Copy to another course**, for lessons and for blocks (`app.tsx`, `copyInto`), adds them to another listed course and saves that file: the target is not open, so it has no history to join; once the author opens it, the copies are deleted like any lesson or block, with undo. New course and Duplicate write new files rather than change a course. Undo history is per screen (UI-BLOCKS-EDITOR-R15), so a whole-course undo across screens is not offered by design |
| **(d)** The editor is usable by keyboard and screen reader | Keyboard met; screen reader not verified | Keyboard: each screen has its own keyboard-only journey (`editor.e2e.ts` "keyboard only: a card's actions…", "H10, 5.1 by keyboard alone"; `blocks.e2e.ts` "by keyboard alone, the library inserts a block…", "reordered by keyboard drag…"; `outline.e2e.ts` "by keyboard alone, Enter adds a lesson…", "rows are reordered by keyboard drag…"; `navigation.e2e.ts`, `theme.e2e.ts`, `quiz.e2e.ts`, `publish.e2e.ts` "keyboard only" tests; `preview.e2e.ts` "keyboard only: pick a device, take the course in the frame…"; `apps/web/e2e/keyboard.e2e.ts` for every kit pattern). The exit run (`exit-run.e2e.ts`) is only partly by keyboard. By keys alone, once the focus is placed on a control (as every keyboard test here does): adding the three lessons and the quiz in the outline, inserting all 51 blocks from the library, Ctrl+Z and Ctrl+Y on every insert, moving between lessons, adding the quiz question, choosing and saving the layout style, colour and navigation, setting the publish options, Export and closing its dialog, and every save (Ctrl+S). By pointer or by filling a field: creating the course (the New menu, the title and Create), opening the first lesson, the click on the course title before the undos, every file pick (each "Choose …" button), the alt text and the embed address, the Theme, Preview, Publish, Back to the course and Edit buttons, and the whole preview walk with the quiz answer. Screen-reader semantics: axe (WCAG 2.0 to 2.2 A and AA) finds no violation of any impact on every editor screen in light and dark (`UI-ACCESSIBILITY: no axe violation…` in each `apps/web/e2e/*.e2e.ts`), and moves and inserts are announced through live regions (asserted text in `blocks.e2e.ts`, `outline.e2e.ts`, `quiz.e2e.ts`) | Not verified: no run with a real screen reader (Narrator, NVDA or JAWS) on the built app. Such a run would show what axe and role queries cannot: whether announcements are spoken at the right moment and not twice, whether the reading order and the names make sense when heard, how WebView2 exposes React Aria's grid and tree to UI Automation, and whether focus moves feel lost. It needs a person or a UI Automation harness on Windows; neither is in this repository. **Owner: M2-22** (open; the release gate for Desktop 0.1). M2-22 stays open until a person has used the built app with Narrator, or until the lead moves this check to another roadmap task |
| **(e)** Editor network assertions pass | Met with a limit | New: `exit-run.e2e.ts` cuts off and records every request of the whole editing session (pages, frames and the export worker) outside the page's origin and expects none, from launch to export. `preview.e2e.ts` "ENG-13: the preview makes no network request; the frame runs only on files held in memory". `apps/desktop/test/shell.test.ts` "connects only to the app's own files … and Tauri's IPC", "allows no eval and no remote origin"; `apps/desktop/e2e/app.e2e.ts` "the content security policy blocks inline script, eval and other origins" in the real WebView2. The shell's own connections, ADR-0004's two rows: `apps/desktop/test/release.test.ts` "the app asks only the latest published release of this repository, over https", "the update check and download have a row…"; `shell.test.ts` "D-43: the media converter is a pinned LGPL build from a public GitHub release"; `apps/web/e2e/updates.e2e.ts` "offline, nothing is checked, at start or from the menu" | The shell's native connections (update check, converter download) are proven by their pinned addresses and switches, not by capturing the running app's traffic; the session assertion runs against the in-memory host, which has neither |
| **(f)** Installers, release notes and a user guide are published | Not met | Installer on tag: `.github/workflows/release.yml`, pinned by `apps/desktop/test/release.test.ts`; `v0.1.0` is tagged at `e44674f` and its release is a **draft**. Per-user install and uninstall: `apps/desktop/e2e/installer.e2e.ts` (run by hand, docs/release.md step 8) | Met once #59 (user guide and 0.1.0 release notes, part 1 of M2-22) merges and the lead writes the notes into the draft and publishes it (docs/release.md, "Each release" steps 6 to 10). Both are outside this task |
| Carried from M1 (D-26): SCORM 2004 runs in ILIAS | Met | `hosts` job `ilias`: `packages/conformance/ilias/ilias.e2e.ts` (passes, fails, closes and resumes, for SCORM 1.2 and 2004; ILIAS keeps what the test LMS keeps). Green on #54 | Runs on pull requests that change packaged code, nightly and by hand (D-67), not on every pull request |
| Carried: xAPI statements and resume accepted by an open-source LRS (1.0.3 and 2.0) | Met | `hosts` job `lrs`: `packages/conformance/lrs/lrs.e2e.ts` against SQL LRS speaking 2.0 and held to 1.0.3 (D-66) | As above |
| Carried: the ADL CATAPULT cmi5 content tests pass | Met | `hosts` job `catapult`: `packages/conformance/catapult/catapult.e2e.ts` "[standards:T-2] … the CTS finds no broken cmi5 requirement…"; reports kept as an artifact | As above |
| Carried: the player performance budget is set | Met | D-68, docs/ci.md; `packages/exporters/src/player-budget.test.ts` (gzip size) and `packages/conformance/e2e/performance.e2e.ts` (main-thread, script, wall-clock, heap) in `check` | — |

## Undo and redo, command by command

`packages/doc-ops/src/property.test.ts` "full undo restores the document byte for byte, and rejected
commands change nothing" runs 30 seeds of 150 random command lists over the format's full and
minimal courses (and 5 more seeds over each corpus course, local). After each run it redoes
everything, undoes everything and expects the original bytes, then redoes everything and expects
the final bytes. It also expects that the commands applied cover every type in `COMMAND_TYPES`, so
each row below is undone and redone there. The editor's Undo and Redo buttons and Ctrl+Z / Ctrl+Y
call the same `editor.undo()` and `editor.redo()`. The last column names an editor test that undoes
that edit through the editor (none redoes it except where said).

| Command | Undone and redone in | Undone in the editor by |
|---|---|---|
| `updateCourse` | property test | `theme.e2e.ts` "a layout style … saves as one undo step"; `navigation.e2e.ts` "… saving is one undo step"; `editor.e2e.ts` "undo and redo start disabled, follow edits and work from the keyboard" (undo and redo) |
| `insertEntry` | property test | `outline.e2e.ts` "by keyboard alone, Enter adds a lesson…" (asserts the undo step exists) |
| `updateEntry` | property test | `outline.e2e.ts` "a row title is kept while typing: … as one undo step" |
| `moveEntry` | property test | `outline.e2e.ts` "rows are reordered by keyboard drag, by the menu and by pointer drag" |
| `duplicateEntry` | property test | — |
| `deleteEntry` | property test; `editor.test.ts` "undo brings back a deleted lesson and the references the delete fixed" | `outline.e2e.ts` "delete offers undo in one step, and buttons to a deleted lesson go with it" |
| `insertBlock` | property test | `exit-run.e2e.ts` (all 51 types, undo and redo); `blocks.e2e.ts` "by keyboard alone, the library inserts a block…, one undo step each" (undo and redo) |
| `updateBlock` | property test | `blocks.e2e.ts` "the style menu sets a background colour and its text, one undo step each" |
| `moveBlock`, `duplicateBlock`, `deleteBlock` | property test | `blocks.e2e.ts` "move up and down, duplicate below and delete with an undo notice, each announced and one undo step" |
| `insertItem`, `updateItem`, `moveItem`, `deleteItem` | property test | `static-blocks.e2e.ts` "quotes, list items and table cells are edited in place, added, moved and removed, each one undo step"; `interactive-blocks.e2e.ts` "sections are edited in place, added, moved and removed, each one undo step" |
| `duplicateItem` | property test | — |
| `insertQuestion`, `updateQuestion`, `moveQuestion`, `duplicateQuestion`, `deleteQuestion` | property test | `quiz.e2e.ts` "by keyboard, a check is added, switched to fill in the blank…" (updateQuestion); the quiz editor's add, move, duplicate and delete are not undone in an editor test |
| `insertAnswer`, `updateAnswer`, `moveAnswer`, `duplicateAnswer`, `deleteAnswer` | property test | `quiz.e2e.ts` "lines pasted into an answer become answers in one undo step" |
| `insertPair`, `updatePair`, `movePair`, `duplicatePair`, `deletePair` | property test | — |
| `insertMedia`, `updateMedia`, `deleteMedia` | property test | `media.e2e.ts` "an image block takes a picture from the open dialog … then replaced or removed, one undo step each" |

## Done-when items of the M2 epics

### ENG-07 Media player, captions and caption editor (M2: VTT captions only)

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Every control works by keyboard and screen reader; axe clean | Met with a limit | The player uses the browser's own media controls; axe on the player output of every media block: `apps/web/e2e/media.e2e.ts` "no axe violation on the media screens and in the player output of every media block" (both themes); captions and transcript: `packages/player-blocks-harness/e2e/media.e2e.ts` "a video has a caption track per language…" | No screen-reader run (see exit item d). The custom player of ENG-07 (speed menu, transcript panel) is not M2 |
| Video position resumes within 1 s after relaunch under SCORM 1.2 and xAPI | Not M2 | Only the store exists: `packages/tracking/src/resume.test.ts` "[rise:R22] a video's playback position is kept in the progress data"; the player does not restore it | Rest of ENG-07, M2b (D-52 media items) |
| Caption files round-trip in all four formats with millisecond timing intact | Not M2 (VTT met) | VTT: `packages/format/src/vtt.test.ts`; caption editor: `media.e2e.ts` "caption files per language; the caption editor splits, adds and joins captions…" | SRT, SBV and SUB with SLD-10 in M5b (D-52) |

### ENG-08 Theme tokens, contrast and fonts

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Every generated colour pair meets 4.5:1 or 3:1 | Met | `packages/format/src/theme.test.ts` "automatic contrast keeps text at 4.5:1 and theme-coloured buttons at 3:1 for 1,000 random theme colours", "text on an element filled with the accent colour keeps 4.5:1 for 2,000 random theme colours"; in the real player: `packages/player-blocks-harness/e2e/theme-contrast.e2e.ts`, `interactive.e2e.ts` "…keep 4.5:1 with the colours themeVariables gives…" | — |
| A changed brand never changes a course until the author accepts it | Not M2 | No brands in the desktop app | Brands with BLK-14 / team libraries, M3c |
| Exported packages contain every used font and no remote font URLs | Met | `packages/exporters/src/builder.test.ts` "[ENG-08] a package carries every font the theme uses and only those, each face once"; `apps/web/e2e/theme.e2e.ts` "an exported web package carries the theme's fonts and only those … shows its custom font from disk with no network" | — |

### ENG-10 Document command layer

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Random command sequences followed by full undo restore the original document | Met | `packages/doc-ops/src/property.test.ts` (above) | — |
| Invalid commands are rejected with no partial write | Met | Same test: every rejected list leaves the same document object and bytes; `commands.test.ts` "an unknown command or a command that is not an object is rejected"; `editor.test.ts` "a rejected or empty dispatch sends no event and makes no undo step" | — |
| Command JSON Schemas for AI tool calls are generated from the same types | Met | `packages/doc-ops/src/schemas.test.ts` "there is one per command…", "accept valid commands and reject wrong ones" | — |

### ENG-11 Project container (M2 slice)

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Killing the app during save never corrupts the project | Met | Exit item (c1) | — |
| A project reopens identically after save on all three OS | Met with a limit | Windows: `packages/project/src/project.test.ts` "restore, after a save and reopen, gives back the snapshot's document and assets" and the BLK-01 round trip below; in a browser without Node.js: `packages/project/e2e/browser.e2e.ts` | macOS and Linux follow the platform order (D-29) |
| Restoring a snapshot reproduces the exact document and assets | Met | `project.test.ts` "<fixture>: restore, after a save and reopen…", "restore as a new course…", "a snapshot keeps the document as it was" | Snapshots have no screen yet: rise.md snapshots are M2b |

### ENG-12 UI kit and host interface

| Item | Result | Evidence | If not met |
|---|---|---|---|
| The Blocks editor e2e suite passes against the desktop adapter and an in-memory server mock | Met with a limit | The whole suite runs against the in-memory host (`apps/web/src/editor.tsx`). The desktop adapter has its own tests (`apps/desktop/test/desktop-host.test.ts`) and the built app is driven in WebView2 for the dashboard, files, preview and converter (`apps/desktop/e2e/app.e2e.ts`) | The editor journeys do not run inside the desktop app. Running them there means driving WebView2 over CDP for each journey (as app.e2e.ts does for a few); a large task, proposed for M2b. The server mock comes with the server adapter (M3) |
| The component kit passes axe and keyboard tests | Met | `apps/web/e2e/gallery.e2e.ts` "has no axe violation in the light/dark theme", high contrast, 320 px reflow; `apps/web/e2e/keyboard.e2e.ts` (every pattern) | — |

### ENG-13 Real-player preview harness

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Preview and exported web package render pixel-identical for corpus courses | Met with a limit | Exit item (b) | Corpus in CI waits for the deploy key |
| Reset clears all progress; the call log matches the golden trace for the same steps | Met with a limit | `preview.e2e.ts` "ENG-13: progress lasts through a live update, and Restart clears all of it…"; "[rise:R2] [rise:R3] ENG-13: the debug adapter in the preview gets the same calls as in the exported web package for the same steps" | The reference is the exported package's own calls for the same steps, recorded in the same run, not a stored golden file; the stored golden traces are the LMS adapters' (`packages/conformance/e2e/standards.e2e.ts`) |

### ENG-14 Media pipeline and intake (M2: basic import only)

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Corpus media transcodes to the same results on Windows, macOS, Linux and the server image | Not M2 | Windows only (D-29); the corpus has no media to transcode | Platform order; server image M3 |
| The licence gate confirms the shipped ffmpeg build is allowed | Met with a limit | ffmpeg is not shipped: it is downloaded on first use (D-12, D-43). `apps/desktop/test/shell.test.ts` "D-43: the media converter is a pinned LGPL build from a public GitHub release, never bundled"; `tools/licence-gate/licence-gate.test.ts` "accepts LGPL in an app…" | The gate does not scan the downloaded archive; its SHA-256 pin and the `lgpl` build name stand for it |
| oEmbed works for listed providers with no intermediary service | Met | D-44 replaced oEmbed lookups with a built-in provider list: `packages/blocks-editor/src/media.test.ts` "listed providers match by address or embed code", `media.e2e.ts` "an embed takes a listed provider's link; the published package loads nothing from outside until the learner asks" | — |

### ENG-15 Job runner

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Cancel stops work within 2 s and removes temporary files | Met | `packages/jobs/src/runner.test.ts` "ENG-15: cancel stops a running job within 2 s and removes its temporary output"; in a real worker: `packages/conformance/e2e/jobs-worker.e2e.ts` | — |
| A job survives an app or server restart and resumes or fails cleanly | Met with a limit | `runner.test.ts` "ENG-15: a job cut short by a restart starts again, a queued one starts, and leftovers are removed" | Desktop only; the server queue is M3 |

### ENG-40 Docs and website (M2: start)

| Item | Result | Evidence | If not met |
|---|---|---|---|
| (no done-when list in BACKLOG.md) User guide and release notes | Not met | — | #59 (M2-22 part 1) |

### BLK-01 Authoring shell, project files and dashboard

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Created, saved, closed and reopened on Windows, macOS and Linux yields identical course JSON | Met with a limit | Windows: `editor.e2e.ts` "a blank course gets a title, a file and opens empty", `packages/format/src/open.test.ts` "serialise, open, serialise is byte-identical"; `project.test.ts` save and reopen | macOS and Linux: D-29 |
| Killing the app mid-edit loses at most 10 seconds of work and the next launch offers recovery | Met | `packages/blocks-editor/src/session.test.ts` "BLK-01: edits autosave once, a few seconds after the first, well inside 10 seconds", "after a crash the autosaved work is offered on open"; `editor.e2e.ts` "after a crash, opening the course offers the autosaved work, or the saved file" (the app restarted on the same disk) | — |
| With 500 items, search, sort and type filter each return in under 300 ms | Met | `packages/blocks-editor/src/library.test.ts` "BLK-01: search, sort and type filter over 500 courses each take under 300 ms" | — |
| A deleted course restored from Deleted reappears in its original folder with all lessons and media | Met with a limit | `editor.e2e.ts` "delete moves a course to Deleted, with undo, restore and empty"; the file is never touched (D-41) | No folders on desktop (D-39) |
| A file written by a newer schema version shows an error and its bytes are unchanged | Met | `editor.e2e.ts` "BLK-01: a file written by a newer version is refused with a clear message and left unchanged" | — |
| A duplicated course shares no ids with its source and editing one never changes the other | Met | `editor.e2e.ts` "duplicate asks for a name and makes a copy that shares no ids"; `doc-ops/src/copy.test.ts` "a duplicated course shares no ids with its source and stays valid"; `project.test.ts` "a copy for a duplicated course carries its assets into a file of its own" | — |

### BLK-02 Course outline

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Reordering with the keyboard alone works and each move is announced | Met | `outline.e2e.ts` "BLK-02, UI-ACCESSIBILITY-R32: rows are reordered by keyboard drag, by the menu and by pointer drag; each move is announced and ids stay" | — |
| Lesson ids unchanged after reorder, rename and re-export | Met | `packages/blocks-editor/src/outline.test.ts` "lesson ids stay through reorder, rename and re-export…" | — |
| A lesson copied to another course appears last there, with new ids and its media | Met | `outline.e2e.ts` "a lesson copied to another course lands last there, with new ids and its media" | — |
| A microlearning offers no quiz entry, and pasting a quiz lesson into it is refused with a message | Met with a limit | `outline.e2e.ts` "a microlearning shows its one lesson, and no outline to add a quiz to", "only other courses: not this one, and not a microlearning" as copy targets; `copy.test.ts` "a quiz, or any other entry, pasted into a microlearning is refused" | The editor never offers the paste, so its refusal message (`copyTo.microlearning`) is not shown in any test |
| Deleting a lesson can be undone in one step | Met | `outline.e2e.ts` "delete offers undo in one step…" | — |

### BLK-03 Block editing core

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Every block type in BLK-04 to BLK-13 registers through the plugin contract without edits to core editor files | Met with a limit | Each type is one entry of `BLOCK_TYPES` (`packages/blocks-editor/src/blocks.tsx`) with its fields and format menu in its own file; `blocks.test.ts` "each type the player shows today makes a valid block with sample content" | Nothing checks the "no core edits" rule mechanically; BLK-11 to BLK-13 are M2b |
| A property test of 100 random edit sequences followed by full undo returns the original | Met | `property.test.ts` (30 × 150 lists, plus corpus) | — |
| Variant switch keeps title, text and media where the target has the same fields | Met | `blocks.e2e.ts` "a text block switches to a sibling type keeping its content…"; `static-blocks.e2e.ts` "statements switch to a note and galleries to fewer columns, keeping what they hold"; `media.e2e.ts` gallery test | — |
| For 1,000 custom accent colours, automatic contrast keeps block text at 4.5:1 | Met | `packages/format/src/contrast.test.ts` "automatic contrast keeps text at 4.5:1 on 1,000 custom colours and every grey" | — |
| Five blocks moved to another course keep their order and media | Met with a limit | `copy.test.ts` "blocks pasted into another course keep their order and their media, with new ids" (5 blocks); `blocks.e2e.ts` "blocks chosen in manage blocks paste into another course in order, with their media" | Copied, not moved: the source keeps them (rise.md 3J copy) |
| Every editor action, including drag alternatives, can be done with the keyboard alone | Met with a limit | Exit item (d); drag alternatives: `blocks.e2e.ts` "reordered by keyboard drag", `outline.e2e.ts` reorder; markers: `interactive-blocks.e2e.ts` "by keyboard, a marker is added in the middle and moved with the arrow keys" | No single sweep proves "every action"; each screen has its own keyboard journey |

### BLK-04 Text and static blocks

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Every variant renders at 375, 768 and 1280 px with no horizontal scroll (visual snapshots) | Met | `packages/player-blocks-harness/e2e/static.e2e.ts` "every text and static variant shows in the player, accessible and without sideways scrolling at 320, 375, 768 and 1280 px, and looks as its snapshot" | — |
| An image with no alt text raises an editor warning unless decorative | Met | `static-blocks.e2e.ts` "a picture without alt text is flagged until it gets alt text or is marked decorative" | — |
| Quote and gallery carousels are keyboard operable and announce the position | Met | `static.e2e.ts` "by keyboard, the quote carousel moves … and announces the position"; "a gallery carousel and a checklist hold back the continue block…" (by keyboard, "Image 3 of 3") | — |
| Chosen heading level changes the published element and the outline stays valid | Met | `static.e2e.ts` "the chosen heading level is the published element, the lesson title stays the only level 1"; `static-blocks.e2e.ts` "a heading cannot take a level that skips one…" | — |
| Checklist and gallery carousel emit the completion events the continue block relies on | Met | `static.e2e.ts` "a gallery carousel and a checklist hold back the continue block below them until every image is seen and every box ticked" | — |

### BLK-05 Media blocks

| Item | Result | Evidence | If not met |
|---|---|---|---|
| A 500 MB video is transcoded offline on desktop with bundled ffmpeg, with progress and cancel | Met with a limit | `apps/desktop/e2e/app.e2e.ts` "BLK-05, D-12, D-43: the converter downloads once, checked by SHA-256, converts a 500 MB video with progress, and stops at once when cancelled" | Runs only with `MEDIA_CONVERTER_E2E=1` (it downloads about 77 MB), not in CI; the converter is downloaded once, not bundled (D-12) |
| Caption edits show in preview immediately and ship as WebVTT in the package | Met | `media.e2e.ts` "caption files per language; the caption editor … edits show in the preview…" | — |
| A published embed makes no request to a third-party embedding service | Met | `media.e2e.ts` "an embed takes a listed provider's link; the published package loads nothing from outside until the learner asks, then only the provider's frame"; `packages/player-blocks-harness/e2e/media.e2e.ts` "D-44, ADR-0004…" | — |
| With forward seeking off, audio and video cannot be skipped ahead by mouse, keyboard or media keys | Met with a limit | `player-blocks-harness/e2e/media.e2e.ts` "with forward seeking off, no seek goes past what was played…": every jump ahead lands back on the furthest point played | The test sets the playback time, which the seek bar, arrow keys and media keys all do; it does not press a media key |
| An exported package contains only media the course references | Met | `packages/format/src/vtt.test.ts` "BLK-05: every key a media reference names, captions and narration included, and no unused file"; `builder.test.ts` | — |

### BLK-06 Interactive blocks

| Item | Result | Evidence | If not met |
|---|---|---|---|
| A marker at given x/y percentages lands on the same image point at every width | Met | `player-blocks-harness/e2e/interactive.e2e.ts` "a marker placed at given percentages lands on the same point of the picture at every width" | — |
| All six blocks pass axe with no serious or critical violation and are keyboard operable | Met | `interactive.e2e.ts` "every interactive variant shows in the player, accessible…", the accordion, tabs, marker, process and flashcard keyboard tests; `interactive-blocks.e2e.ts` axe on the editor screens | — |
| A button pointing at a deleted lesson is flagged and blocks export until fixed | Met (by D-36) | D-36 removes such buttons with the lesson in the same undo step, so none is left to flag: `outline.e2e.ts` "…buttons to a deleted lesson go with it"; `interactive-blocks.e2e.ts` "a single button whose lesson was deleted offers a new button"; links in text: `publish.e2e.ts` "an empty lesson, a broken lesson link and a picture without alt text are listed before an export" | — |
| Hidden process steps neither render nor count toward completion | Met | `packages/player-blocks/src/interactive.test.ts` "hidden process steps neither show nor count toward completion"; `interactive.e2e.ts` "a process … leaves out the hidden step" | — |
| Each block's completion event matches its rule (player end-to-end test) | Met | `interactive.e2e.ts` "each block holds back the continue block below it until its own rule is met, by keyboard"; "a flashcard stack waits for turned cards" | — |

### BLK-07 Knowledge checks and quiz lessons

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Skip ahead switches navigation to restricted and the panel names the quiz | Met | `quiz.e2e.ts` "skip ahead turned on in the quiz settings keeps lessons in order, and the navigation panel names the quiz" | — |
| In preview, a timer at zero auto-submits with unanswered questions wrong, and resets on retry | Met | `player-blocks-harness/e2e/quiz.e2e.ts` "the timer … submits at zero with unanswered questions wrong, and restarts on retake"; `quiz.e2e.ts` "in the preview a timed quiz shows its limit, starts its timer…" | — |
| A quiz exported to SCORM 1.2 reports each answer as an interaction named by rule 11 (Moodle) | Met | `moodle` job: `moodle.e2e.ts` "three failed attempts at a quiz of every question type … an interaction per answer named by rule 11" | — |
| Across three attempts with falling scores, the LMS keeps the best score | Met | Same Moodle test; `packages/conformance/e2e/quiz.e2e.ts` | — |
| With require-passing on and retries used up, the course cannot reach completion in preview or LMS | Met with a limit | `player-blocks-harness/e2e/quiz.e2e.ts` "with require-passing and no retakes left, the course cannot go on" (the player the preview and packages run); `progress.test.ts` "with require-passing a failed quiz does not count and later lessons wait" | Not run inside the preview frame or a real LMS |

### BLK-08 Completion gating and navigation

| Item | Result | Evidence | If not met |
|---|---|---|---|
| A continue block requiring a button or attachment above is refused, with an explanation | Met | `navigation.e2e.ts` "a continue block below an attachment cannot wait for it and says why" | — |
| Restricted navigation disables search and mark-complete in the panel | Met | `navigation.e2e.ts` "each menu shows in the player beside the panel; lessons in order turn search and mark-done off in the panel" | — |
| Preview honours each navigation type at phone and desktop widths | Met | `navigation.e2e.ts` "the preview honours the <menu> menu at phone and computer widths" | — |
| Continue with all blocks above counts only blocks since the previous continue (rule 13, player e2e) | Met with a limit | `packages/player-blocks/src/progress.test.ts` "[rise:R13] 'all above' counts only the blocks since the previous continue block"; `navigation.test.ts` | Unit tests of the rule the renderer shares (one rule, `progress.ts`), not a player end-to-end test |
| In stepped microlearning preview, the bottom arrow first reveals a tall step, then advances (rule 17) | Met | `navigation.e2e.ts` "[rise:R17] BLK-08: in a stepped microlearning the bottom arrow first shows the rest of a tall step, then moves on" | — |

### BLK-09 Theme and appearance

| Item | Result | Evidence | If not met |
|---|---|---|---|
| For 1,000 random theme colours, text keeps 4.5:1 and theme-coloured navigation buttons 3:1 | Met | `theme.test.ts` "…for 1,000 random theme colours" | — |
| Changing the layout preset leaves colour, font and navigation values unchanged | Met | `theme.e2e.ts` "a layout style shows on selection, saves as one undo step and keeps colour, font and navigation values"; `theme.test.ts` | — |
| A course using a custom font exports a package that shows it offline | Met | `theme.e2e.ts` "…shows its custom font from disk with no network" | — |
| Editing a custom font updates every course using it; deleting it returns them to the default | Met | `theme.e2e.ts` "editing a custom font updates every course using it; deleting it returns those courses to the device's fonts"; `fonts.test.ts` | — |
| A skipped cover opens the first lesson in both LMS and web exports | Met | `packages/conformance/e2e/theme.e2e.ts` "a skipped cover opens the first lesson at launch and where the learner stopped on relaunch"; `theme.e2e.ts` web package "opens past a skipped cover" | — |

### BLK-10 Responsive preview and export

| Item | Result | Evidence | If not met |
|---|---|---|---|
| One sample course in each standard launches, resumes and reports completion and score in Moodle, an open LRS and a cmi5 test player | Met | `moodle` (SCORM 1.2), `hosts` `ilias` (SCORM 2004), `lrs` (xAPI), `catapult` (cmi5); each builds its package the way the publish panel exports it (`packages/conformance/test/hosts.ts`) | — |
| The web package from a local folder with networking off loads fully (rule 20) | Met | `publish.e2e.ts` "the exported web package opens from a folder with only its own files, keeps nothing, and matches the preview"; `navigation.e2e.ts` "…from disk, with no network" | — |
| Preview and exported web package match pixel for pixel at 375, 768 and 1280 px | Met with a limit | Exit item (b): every page, from top to bottom, at the three widths (the sample course in `check`, the corpus locally). `publish.e2e.ts` "the exported web package opens from a folder…" also compares a package exported through the panel with the preview, on the first screen of the cover and of the first lesson | Compared with reduced motion, so blocks show at rest with no fade-in; see exit item (b) |
| Re-export with reset-on-update clears bookmark and resume data at the next LMS launch (rule 12) | Met with a limit | `packages/conformance/e2e/publish.e2e.ts` "a re-export with reset on update clears the bookmark and progress at the next LMS launch" | In the conformance test LMS, not Moodle |
| An invalid xAPI identifier blocks export with a message on that field | Met | `publish.e2e.ts` "an invalid identifier blocks export on its field…" (xAPI, then SCORM) | — |
| An exported sample course is navigable with Windows Narrator and usable with Windows Magnifier | Not met | — | **Owner: M2-22** (open; the release gate for Desktop 0.1). A person walks an exported sample course with Narrator and with Magnifier before 0.1.0 is published; it cannot be automated here without a UI Automation harness. M2-22 stays open until then, or until the lead moves this check to another roadmap task. docs/release.md does not list it as a step yet |

### STD-08 Publish settings panel

| Item | Result | Evidence | If not met |
|---|---|---|---|
| Each MVP package type can be produced from the editor with defaults and no other input | Met | `packages/conformance/e2e/publish.e2e.ts` "the panel's defaults export a valid <standard> package with no other input"; `publish.e2e.ts` "a package exported with the panel's defaults…" | — |
| Settings persist in the project file and a republish uses them unchanged | Met | `publish.e2e.ts` "the panel shows every option with its default, keeps each change in the course, and a republish uses them unchanged" | — |
| Incoherent choices are flagged | Met | `publish.e2e.ts` "cmi5 move-on follows the tracking, and waiting for a pass no quiz decides is marked and blocks export"; `publish.test.ts` | — |
| The panel passes automated WCAG 2.1 AA checks and is fully keyboard operable | Met | `publish.e2e.ts` "the publish panel, its dialogs and their states pass axe" (both themes), "keyboard only: choose SCORM 2004, set the threshold, export…" | — |
| The same component renders in the desktop app and in the server web UI | Not M2 | One React component in `packages/blocks-editor`, used by the desktop app and the web route | Server web UI, M3 |

## Gaps that wait (not built here)

- **Corpus in CI:** the `TEST_COURSES_DEPLOY_KEY` secret (docs/ci.md). Until the lead sets it, (b) and
  every "(local)" proof run only on a contributor's machine.
- **Editor journeys inside the desktop app (ENG-12):** run the editor suite, or at least the exit run,
  in WebView2 over CDP against the desktop adapter. Proposed for M2b.
- **Screen-reader and Magnifier runs (exit item d, BLK-10):** owned by M2-22, which stays open
  until a person (or a UI Automation harness) uses the built app with Narrator and an exported
  sample course with Narrator and Magnifier on Windows, or until the lead moves them to another
  task.
- **Video position resume (ENG-07):** M2b with the rest of ENG-07.
- **Release:** #59 (guide and notes), then the lead publishes the `v0.1.0` draft.

## What this change adds

- `apps/web/e2e/exit-run.e2e.ts`: the exit run, on Windows in `check` and on Linux in `moodle`, which
  writes the package and course document for the next step (`EXIT_RUN_OUT`).
- `packages/conformance/moodle/moodle.e2e.ts`: the exit run's package passed in Moodle
  (`EXIT_RUN_PACKAGE`); ci.yml runs the journey before the Moodle tests.
- `apps/web/e2e/preview.e2e.ts`: the pixel comparison covers every screen of every page, not only
  the first screen of the overview and the first lesson.
- `apps/desktop/src-tauri/src/files.rs`: the desktop's atomic replace, killed mid-write 30 times.
