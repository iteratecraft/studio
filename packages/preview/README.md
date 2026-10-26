# @course-suite/preview

The real-player preview (M2-11, ENG-13): the course being edited, shown in the exact player bundle
that every published package ships, never a copy of it. Apache-2.0, layer `engine`. It runs in a
browser (the desktop app's WebView2 and, later, the server edition); `previewPackage` also runs in
Node.js. The editor's pane around it is `PreviewPane` in `@course-suite/ui`.

## Use

```ts
import { createPreview } from "@course-suite/preview";

const preview = createPreview(container, {
  source: editor, // a doc-ops Editor: `document` and `subscribe`
  media: (key) => assetBytes(key), // project media by storage key
  start: lessonId, // optional: the overview when left out
  title: "Course preview", // the frame's accessible name
});
preview.page; // the lesson or quiz on show, for "back to editing"
preview.restart(); // forgets all learner progress, opens the start page again
await preview.calls(); // what the player told its debug adapter
preview.dispose();
```

## How it works

- `previewPackage(course, media)` builds the plain web output of the course in memory from the
  exporters' own pieces (`blocksPlayer`, `courseDataFor`, `packagedMediaKeys`): the same index page,
  player script, style sheet, course data file and media bytes that an exported web package holds
  (a unit test compares them byte for byte). Nothing is written to disk.
- `createPreview` puts it in an `<iframe sandbox="allow-scripts">` whose document is a `data:` page
  with one fixed script (`FRAME_SCRIPT`). The frame has an opaque origin: no storage, cookies, forms,
  pop-ups or navigation of the editor. The editor posts it the package files; the frame turns them
  into `blob:` addresses of its own and boots the player from them as the index page would, telling
  it where each file is through the player's `blocksPlayerHooks.files`.
- No network: the player gets the course data, its style sheet and the media from those in-memory
  addresses, and with no LMS it reports to its debug adapter inside the frame. Nothing is sent
  anywhere.
- Live update: a doc-ops change event starts a 300 ms wait (`UPDATE_DELAY_MS`), reset by every
  further change. Then a new frame loads beside the one on show, unseen (`data-pending`), at the same
  lesson and scroll position and with the same learner progress (the debug adapter's saved state,
  which the editor keeps), and replaces it once the player shows its page.
- Restart drops that saved state and loads the start page again.

## Content security policy

The frame inherits the editor's policy. The desktop app's policy (`apps/desktop/README.md`) adds
for it: `FRAME_SCRIPT_HASH` and `blob:` in `script-src`, `blob:` in `style-src`, `img-src` and
`media-src` (audio, video and caption tracks, M2-13), and `frame-src data:`. A web embed shows
where it plays and loads nothing in the preview (the player sees the in-memory files hook).
`FRAME_SCRIPT` is a literal whose hash is pinned there; change both together
(`src/files.test.ts` and `apps/desktop/test/shell.test.ts` fail until they match).

## Measured

On the preview test page in `apps/web` (Chromium, Windows, built with `vite build`):

- The preview's code with the player bundle it runs is a separate chunk that loads when a preview
  first opens: 45.8 KB gzipped, of which the player script is 39.8 KB and its style sheet 3.2 KB.
- Time to first render of the largest corpus course (`long-resume`, 96 KB of course JSON), from the
  start of the load to the player's first page: 86 to 100 ms over three runs.
