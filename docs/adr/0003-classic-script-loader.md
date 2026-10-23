# ADR-0003: Classic-script loader for published courses

- **Status:** Proposed
- **Date:** 2026-10-23
- **Deciders:** project lead (accepts on merge)
- **Roadmap / spec ids:** M1-01b, ENG-04, ENG-06a; rise.md §4 "Published web package"

## Context

A published course must open from a local disk (`file://`) as well as from any static host or LMS
(rise.md §4 "Published web package"). The course data file is loaded by a script tag for exactly this
reason: it needs no CORS and no server. Chromium treats `file://` pages as an opaque origin and blocks
module scripts (`<script type="module">`) and dynamic `import()` there, and also `fetch` and
`XMLHttpRequest` of package files. The player is split into chunks loaded on demand (rise.md §4), so
lazy loading needs a mechanism that works without modules.

## Decision

- Everything that ships in a published course runs as **classic scripts**. The build emits each entry
  and chunk as a self-contained classic script (IIFE format), never an ES module.
- **Every lazy chunk and every plugin loads by script-tag injection**, the same way as the course data
  file:
  1. The loader adds `<script src="<relative path>">` to the document.
  2. The chunk, when it runs, registers itself by name on one player-owned global registry.
  3. The loader's promise resolves on registration and rejects on the script's `error` event, with the
     chunk name in the error.
  4. Each chunk is requested at most once; later calls get the same promise.
- Paths are relative to the index page, so the same package works under `file://`, `http(s)://` and
  inside an LMS frame.
- Shipped code never uses `type="module"`, `import()`, `import.meta`, `fetch` or `XMLHttpRequest` for
  package files, or workers loaded from package files. Data the player needs arrives through script
  files.
- **Every chunk gets a `file://` test:** a Playwright test opens the built package from disk in
  Chromium, triggers that chunk's load, checks that its code ran, and fails on any console error or
  failed request. A new chunk without such a test fails review.
- The build checks its own output and fails if a shipped script contains a module script tag,
  `import(` or `import.meta`.

## Consequences

- One loading path for data, chunks and plugins, on every host the course runs on.
- The editor's preview runs the same player build, so preview and published course load the same way.
- We give up native module loading and the bundler's built-in code splitting for shipped code; chunk
  boundaries are declared by us and registered by name.
- Follow-ups: the loader and registry in the player shell (M1-09); IIFE output and the output check in
  the package builder (M1-16); `file://` tests as each chunk lands; the no-network tests (M1-30).

## Alternatives considered

- **ES modules with `import()`:** blocked from `file://` in Chromium.
- **One bundle with no chunks:** works from disk, but every learner downloads every block's code before
  the first screen.
- **A local web server shipped with the course:** learners cannot be asked to run one, and LMS hosts
  do not need it.
- **Inlining all code into the index page:** the same first-load cost as one bundle.
