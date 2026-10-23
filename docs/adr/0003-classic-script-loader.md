# ADR-0003: Classic-script loader for published courses

- **Status:** Proposed
- **Date:** 2026-10-23
- **Deciders:** project lead (accepts on merge)
- **Roadmap / spec ids:** M1-01b, ENG-04, ENG-06a; rise.md §4 "Published web package"

## Context

A published course must open from a local disk (`file://`) as well as from any static host or LMS
(rise.md §4 "Published web package"). The course data file is loaded by a script tag for exactly this
reason: it needs no CORS and no server. Chromium treats `file://` pages as an opaque origin and blocks
module scripts loaded from files (`<script type="module" src>`) and dynamic `import()` there, and also
`fetch`, `XMLHttpRequest` and workers of package files. A classic `<script src>` still loads. The
player is split into chunks loaded on demand (rise.md §4), so lazy loading needs a mechanism that works
without modules.

## Decision

- Everything that ships in a published course runs as **classic scripts**. The build emits each entry
  and chunk as a self-contained classic script (IIFE format), never an ES module.
- **Every lazy chunk and every plugin loads by script-tag injection**, the same way as the course data
  file:
  1. If the chunk is already in the registry, the loader resolves at once. Otherwise it adds
     `<script src="<relative path>">` to the document.
  2. The chunk registers itself by name on one player-owned global registry, synchronously, while its
     top-level code runs. A chunk never registers later (after a timer, an event or a promise).
  3. The loader's promise settles on the first of these, and every rejection is an error that names
     the chunk and the reason:
     - the script's `load` event: resolve if the chunk is now registered under its expected name;
       otherwise reject with "loaded without registering". A classic script's `load` fires after its
       top-level code has run, so this catches a chunk that throws at top level and a chunk that
       registers under another name. Both fire `load`, not `error`.
     - the script's `error` event (the file is missing or could not be read): reject.
     - a timeout of 30 seconds from injection, with neither event: reject. This is one player
       constant, not an author setting.
  4. Concurrent calls for the same chunk share one pending promise. A resolved promise is kept for the
     session. A rejected promise is dropped from the cache and its script element removed, so the
     next call injects the script again; a chunk that registered late (after its timeout) resolves
     at step 1 instead.
  5. A rejection the player cannot work around shows the player's error screen in the course window:
     it says which part of the course failed to load, offers **Retry** (which calls the loader again)
     and logs the error with the chunk name to the browser console. The error is never sent anywhere
     (ADR-0004).
- Paths are relative to the index page, so the same package works under `file://`, `http(s)://` and
  inside an LMS frame.
- Shipped code never uses `type="module"`, `import()`, `import.meta`, `fetch` or `XMLHttpRequest` for
  package files, or workers loaded from package files. Data the player needs arrives through script
  files.
- **Every chunk gets a `file://` test:** a Playwright test opens the built package from disk in
  Chromium, triggers that chunk's load, checks that its code ran, and fails on any console error or
  failed request. A new chunk without such a test fails review.
- **The loader's own tests** run against a built package opened from disk (`file://`) in Chromium,
  with test chunks:

  | Case | Expected |
  |---|---|
  | Chunk loads and registers | resolves; the chunk's code ran; no console error, no failed request |
  | Chunk file missing | rejects naming the chunk; the error screen shows |
  | Chunk throws at top level | rejects with "loaded without registering", naming the chunk; the error screen shows |
  | Chunk registers under another name | rejects with "loaded without registering", naming the chunk |
  | Two calls before the first settles | one script element; both calls get the same result |
  | Retry after a failure (the test writes the missing file, then presses Retry) | a new script element is injected and the load resolves |
  | Neither `load` nor `error` fires | rejects after the timeout, naming the chunk; the error screen shows |

  The timeout case runs over `http://` with a request the test holds open, because a `file://` read
  cannot be stalled; the test shortens the timeout through a test-only hook.
- The build checks its own output and fails if a shipped script contains a module script tag,
  `import(` or `import.meta`.

## Consequences

- One loading path for data, chunks and plugins, on every host the course runs on.
- The editor's preview runs the same player build, so preview and published course load the same way.
- We give up native module loading and the bundler's built-in code splitting for shipped code; chunk
  boundaries are declared by us and registered by name.
- Follow-ups: the loader, registry, error screen and the loader's tests in the player shell (M1-09);
  IIFE output and the output check in the package builder (M1-16); `file://` tests as each chunk
  lands; the no-network tests (M1-30).

## Alternatives considered

- **ES modules with `import()`:** blocked from `file://` in Chromium.
- **One bundle with no chunks:** works from disk, but every learner downloads every block's code before
  the first screen.
- **A local web server shipped with the course:** learners cannot be asked to run one, and LMS hosts
  do not need it.
- **Inlining all code into the index page:** the same first-load cost as one bundle.
