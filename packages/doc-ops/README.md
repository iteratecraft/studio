# @course-suite/doc-ops

The document command layer (ENG-10, M2-03). Every edit of a Blocks course, whether made by hand, by
AI or by a co-author, is a list of typed commands. A list is checked, applied as one unit and undone
as one step. Apache-2.0. It runs in a browser, a Web Worker and Node.js: it depends only on
`@course-suite/format`, and its build has no DOM or Node.js types (ADR-0006).

## Use

```ts
import { createEditor } from "@course-suite/doc-ops";

const editor = createEditor(course); // throws if the course is not valid
const result = editor.dispatch({ type: "insertBlock", parent: lessonId, value: block });
if (!result.ok) showErrors(result.errors); // nothing was written
editor.undo();
editor.subscribe(({ document, ids, source }) => autosave(document, ids));
```

`applyCommands(course, commands)` is the same check and apply without a session, for a server or a
worker. It never changes its input.

`copyCourse(course)` duplicates a whole course (rise.md 3J, BLK-01): a new project id and a new
id for every object, with every reference inside the course pointing at the copies; references to
other containers are kept.

`copyEntryTo(source, id, target)` gives the commands that copy one outline entry of `source` to the
end of `target`'s outline (rise.md 3B, BLK-02): new ids, a media index entry for each media file
the target lacks, and the storage `keys` whose bytes the target project needs. Buttons to other
lessons and a quiz's skip-ahead are dropped, as when the entry they point at is deleted (D-36).
It refuses with a `reason` instead (`ok: false`) when the target is a microlearning, which holds
exactly one lesson and no quiz (rise.md 3A), and when a lesson has a custom block, as custom blocks
have no commands yet.

`clipBlocks(course, ids)` takes blocks aside for copy and paste (rise.md 3J, BLK-03): the blocks
in lesson order with the media index entries they use. `pasteBlocks(clip, target, lesson, index)`
gives the commands that insert copies of them into a lesson of any course from `index` on: new
ids, a media index entry for each file the target lacks and the storage `keys` whose bytes it
needs. In another course a button to a lesson is dropped (D-36) and a custom block is refused
(undefined); in its own course a button keeps its lesson. `contentIds(course)` gives every content
id in a course, for `newContentId`.

## Commands

| Command | For |
|---|---|
| `updateCourse` | Course settings: title, description, authors, cover, theme, label set, languages, publish and navigation settings |
| `insert…`, `update…`, `move…`, `duplicate…`, `delete…` with `Entry`, `Block`, `Item`, `Question`, `Answer`, `Pair` | Outline entries (lessons, quizzes, section headers), blocks with their common settings, block items, quiz questions and draws, answer choices, matching pairs |
| `insertMedia`, `updateMedia`, `deleteMedia` | The media index |

- Insert takes `parent` (except for entries and media), an optional `index` (default: the end) and the
  new `value`. The caller picks its ids with `newContentId` from the format package, so later commands
  in the same list can address it.
- Update takes `id`, `set` (new field values) and `unset` (optional fields to remove). Ids, kinds,
  a block's category, a media entry's key and child lists are locked; child lists have their own
  commands. A knowledge check's question is updated by its id like any question.
- Move takes `id`, the `index` after the move and optionally another `parent`.
- Duplicate copies with new ids; the copy lands directly below the original, or at the end of another
  parent (UI-BLOCKS-EDITOR-R10, R24). A sorting card in the copy points at its category's copy.
- Delete removes the object and everything in it. Deleting an outline entry also keeps references
  valid: a button that goes to it is removed, a quiz's skip-ahead to it is turned off, and course
  tracking by a deleted quiz falls back to the completion rule. Continue blocks gate by position, so
  they hold no reference to fix.
- Custom-block documents have no commands yet: their object tree is not in the format.

## Validation and errors

Each command is checked against its JSON Schema, then against the document (does the id exist, can
that parent hold it, is the index in range). The whole list is then applied to a copy and the result
must pass the format's `validateCourse`. Any failure returns `{ ok: false, errors }` and writes
nothing. Each error has a `code` (`invalid-command`, `not-found`, `not-allowed`, `invalid-document`),
the index of the `command` in the list, and a JSON Pointer `path` into the command, or into the
resulting document for `invalid-document`.

Because a list is validated as a whole, a change that passes through an invalid state is one list:
for example, moving the correct answer of a single-choice question sets one answer to `false` and
another to `true` in the same dispatch.

## Undo, redo, groups and events

- One dispatch is one undo step. `beginGroup()` and `endGroup()` join every dispatch between them into
  one step, for actions made of several calls (an AI insert of a lesson and its blocks, say). Groups
  nest; undo or redo closes the open step.
- History keeps 50 steps (UI-PUBCOLLAB-R38; `historyLimit` changes it). `canUndo` and `canRedo` drive
  the buttons (UI-BLOCKS-EDITOR-R14). `clearHistory()` is for leaving a lesson (UI-BLOCKS-EDITOR-R15).
- A rejected dispatch, or one that changes nothing, makes no step and no event.
- Every change calls the listeners with the new `document`, the `ids` of the objects changed, added or
  removed and of the objects holding them, the `ops` applied, and its `source` (`do`, `undo`, `redo`).
  Autosave, snapshots and segment change detection use these.

Documents are never changed in place: an edit copies only the objects on its path and shares the rest,
so keeping old documents (undo, snapshots) costs little. Never mutate `editor.document`.

## JSON Schemas for AI tool calls

`commandSchemas()` returns a JSON Schema (2020-12) per command type. They are generated from the
format's `course.schema.json`, the source of the format's TypeScript types, and carry only the
definitions they use. The same schemas check every dispatched command, so an AI tool call and a UI
action are validated alike. Command types are valid tool names as they are (`insertBlock`).

## Ports

None. The layer keeps the document in memory and needs no files, storage or clock: ids come from Web
Crypto through the format package. Saving is the job of the project container (ENG-11), which listens
to change events. Timestamps (`createdAt`, `updatedAt`) are not stamped; a caller that wants them sets
them in the command.

## Co-editing (ENG-19)

The commands are shaped so that one dispatch maps to one Yjs transaction:

| Here | Yjs |
|---|---|
| One dispatch (a command, or a list) | One `doc.transact(fn, origin)` |
| `set` op | `Y.Map.set(key, value)` on the object's map |
| `unset` op | `Y.Map.delete(key)` |
| `insert` op | `Y.Array.insert(index, [value])` |
| `remove` op | `Y.Array.delete(index, 1)` |
| `move…` command | `delete` then `insert` in the same transaction |
| Undo and redo | `Y.UndoManager` tracking the local origin, so an author undoes only their own changes |

Ops address values by path, which is exact for one author. With co-authors ENG-19 must resolve each
op's target by object id at apply time, because concurrent edits shift array indexes. Yjs maps do not
keep property order, so a document read back from Yjs must be serialised in schema order.

## Cost

Measured with Node.js 24 on Windows, on a generated course of 40 lessons and 1,000 text blocks
(874 KB of JSON): a dispatch takes about 3 ms (update), 3.3 ms (insert) or 4.6 ms (duplicate a
lesson), of which the full validation takes about 2.8 ms; undo and redo take under 0.1 ms; 50 undo steps of a
text edit kept about 160 KB. Built code is 28.6 KB, 8.1 KB gzipped.
