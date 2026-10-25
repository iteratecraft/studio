# Course Suite: Backlog

Every work package (epic) from the seven clean-room specs, plus the shared-engine epics. Milestone ids refer to [ROADMAP.md](ROADMAP.md).
Sizes: S < 1 week, M 1–2 weeks, L 2–4 weeks, XL > 4 weeks for one focused agent team. Priority: **mvp** = first usable release of that product, **v1** = parity, **later** = parked.

Where ROADMAP.md splits or moves an epic (for example ENG-26a/b), the roadmap wins.

## Contents

- Shared engine: 38 epics
- Slides app: 20 epics
- Blocks app: 20 epics
- Review: 20 epics
- Reach: 20 epics
- Translate and AI: 20 epics
- Teams and collaboration platform: 20 epics
- Standards: exporters, player run-time, LMS/LRS: 19 epics

**Total: 177 epics.**

## Shared engine (ENG)

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| ENG-01 | Foundations: monorepo, CI, licences, desktop and server shells | mvp | both | M | M0 | — |
| ENG-02 | Course format core and Blocks course schema | mvp | shared-engine | L | M1 | ENG-01 |
| ENG-03 | Package reader, validator and test LMS host | mvp | shared-engine | M | M1 | ENG-01 |
| ENG-04 | Blocks player shell (MIT) | mvp | player | L | M1 | ENG-02, ENG-09 |
| ENG-05 | Shared quiz model, progress engine and Blocks quiz runtime | mvp | player | L | M1 | ENG-02, ENG-04 |
| ENG-06 | Player lifecycle, state snapshot and tracking app profiles | mvp | player | M | M1 | ENG-04, ENG-05, STD-01 |
| ENG-07 | Media player, captions and caption editor | mvp | player | L | M2 | ENG-04 |
| ENG-08 | Theme tokens, contrast and fonts | mvp | shared-engine | M | M2 | ENG-02, ENG-04 |
| ENG-09 | Label sets and learner-facing strings | mvp | player | M | M1 | ENG-02 |
| ENG-10 | Document command layer (doc-ops) with undo and integrity | mvp | shared-engine | L | M2 | ENG-02 |
| ENG-11 | Project container, asset store and snapshots | mvp | both | M | M2 | ENG-02 |
| ENG-12 | Shared web UI kit and edition host interface | mvp | both | L | M2 | ENG-01 |
| ENG-13 | Real-player preview harness | mvp | shared-engine | M | M2 | ENG-04, ENG-06, ENG-12 |
| ENG-14 | Media pipeline and intake | mvp | both | L | M2 | ENG-11, ENG-15 |
| ENG-15 | Job runner | mvp | both | M | M2 | ENG-01 |
| ENG-16 | Segment model and translation exchange | mvp | shared-engine | L | M2b | ENG-02, ENG-10 |
| ENG-17 | Accessibility checker | mvp | shared-engine | M | M2b | ENG-02, ENG-08 |
| ENG-18 | Server platform services | mvp | server | L | M3 | ENG-01, ENG-15 |
| ENG-19 | Yjs document model and co-editing service | mvp | server | L | M3 | ENG-02, ENG-10, ENG-18 |
| ENG-20 | Review surface and video wrapper outputs | mvp | both | L | M3b | ENG-04, STD-02, STD-04, STD-05, STD-06 |
| ENG-21 | PDF rendering | mvp | both | M | M3c | ENG-02, ENG-08, ENG-15 |
| ENG-22 | Reuse payload formats | v1 | both | M | M3c | ENG-02, ENG-08, ENG-11 |
| ENG-23 | Native server tracking adapter and portal player features | mvp | player | M | M4 | ENG-06, STD-01, ENG-18 |
| ENG-24 | Slides project schema and library formats | mvp | shared-engine | L | M5 | ENG-02, ENG-10 |
| ENG-25 | Canvas object model and slide renderer | mvp | player | XL | M5 | ENG-24, ENG-08 |
| ENG-26 | Slide runtime and slides output profile | mvp | player | L | M5 | ENG-25, ENG-06, STD-02 |
| ENG-27 | Timeline and animation engine | mvp | player | L | M5 | ENG-26 |
| ENG-28 | Trigger, state and variable engine | mvp | player | XL | M5 | ENG-26 |
| ENG-29 | Author JavaScript API and sandbox | mvp | player | L | M5 | ENG-28, ENG-27 |
| ENG-30 | Slide question engine | mvp | player | XL | M5b | ENG-28, ENG-05, STD-09 |
| ENG-31 | Slides player frame | mvp | player | L | M5b | ENG-26, ENG-09, ENG-07, STD-01 |
| ENG-32 | Rendered outputs: MP4 video and DOCX handout | v1 | both | L | M5c | ENG-26, ENG-27, ENG-14, ENG-15 |
| ENG-33 | Data importers and document text extraction | v1 | shared-engine | M | M5c | ENG-02, ENG-24 |
| ENG-34 | AI provider contracts, usage and policy hooks | mvp | shared-engine | M | M6 | ENG-10, ENG-15 |
| ENG-35 | Multi-language format, delivery and preview API | mvp | shared-engine | L | M6 | ENG-16, ENG-09, ENG-04, ENG-07, ENG-31, STD-02 |
| ENG-36 | Project importers: PowerPoint, other projects and .story | v1 | shared-engine | XL | M6c | ENG-24, ENG-25, ENG-27, ENG-28, ENG-33 |
| ENG-37 | Conformance corpus and parity tests | mvp | shared-engine | M | M1 | ENG-02, STD-03 |
| ENG-38 | Operations: Helm chart, backups, upgrades and observability | v1 | server | L | M7 | ENG-18 |

### ENG-01: Foundations: monorepo, CI, licences, desktop and server shells

Give every agent team one repo that builds, tests and ships installers and a server image from day one.

**Features**

- Monorepo with package boundaries (format, player, tracking, exporters, ui, desktop, server, web) and a dependency-direction check
- Licence split: Apache-2.0 for apps and server, MIT for the player and tracking runtime; third-party licence gate
- Clean-room guard: research-path and vendor-trademark checks, spec-reference trailer on every PR
- CI on Windows, macOS and Linux: lint, typecheck, unit tests, browser smoke tests
- Tauri shell skeleton with capability files and a strict content security policy (ADR-0006)
- Installers for Windows, macOS and Linux on every tag; signing hooks; auto-updater from GitHub Releases with stable/beta channels and a policy switch
- Server skeleton: Node.js + TypeScript, PostgreSQL migrations, S3/MinIO client, Docker Compose, health checks
- test-courses repo pinned into CI

**Done when**

- [ ] A clean clone builds and passes tests on all three OS in under 15 minutes
- [ ] A tag produces installers for all three OS and a server container image
- [ ] An installed build updates itself from one tag to the next
- [ ] CI fails on fixtures for: disallowed licence in a player package, a research-path reference, a vendor trademark in a UI string
- [ ] docker compose up yields a healthy server with database and object-storage checks

**Spec refs:** studio/ARCHITECTURE.md: Stack decisions, Repositories, Licences, Build order phase 0, studio/CLEAN-ROOM.md  
**Risks:** Toolchain choices made here are expensive to change; unsigned installers trigger OS warnings until signing is funded.

### ENG-02: Course format core and Blocks course schema

One validated, versioned JSON format for courses that every app, exporter and the server share.

**Features**

- JSON Schema for Course, Entry, Block, Item, Question, Rich text, Media reference, Label set and Custom-block document, with generated TypeScript types
- Stable unique ids for course, lessons, blocks, questions, choices and variables that survive copy, import, publish and sync
- Versioned migrations; unknown fields preserved so older apps keep newer data; project-file compatibility policy
- Project identity: stable project id kept on file copy, new id on save-as; linked Review items cleared on save-as-template and library send
- Publish settings: standard, SCORM 2004 edition, status wording pair, passing score, tracking source, identifiers, LOM metadata, move-on, thresholds, LRS settings, reset-on-update flag
- Completion rule (percentage viewed, pass a chosen quiz, both, none; microlearning), required-lesson flags, duration estimate
- Reserved fields: sourceLanguage, languages[], glossaryRef, per-language overrides, author byline, theme/brand ref, asset licence and attribution, AI provenance (narration item, image provenance)
- Server-only metadata (owner, lineage, share ids, last-updated-by) kept outside the course document

**Done when**

- [ ] 20+ valid and 20+ invalid fixtures pass or fail with path-precise errors
- [ ] Serialise, parse, serialise is byte-identical; unknown fields survive a round trip
- [ ] Copy keeps ids; save-as mints a new project id; ids are unchanged after export and import
- [ ] A scan of exported packages finds no server-only metadata or internal ids

**Spec refs:** rise.md §4 Our course document, standards.md §4.2, §4.3, teams-collab.md §4 Formats, R20, R23, review.md shared needs (project link), localization-ai.md §4, reach.md shared needs (completion rule, stable ids)  
**Risks:** Schema churn ripples through every team; needs ADRs, one schema owner and migrations from the first commit.

### ENG-03: Package reader, validator and test LMS host

Open and validate any SCORM, xAPI or cmi5 package safely and run it in a headless test LMS that records every call.

**Features**

- Safe unzip (zip and zip64): path traversal, symlink, duplicate-name and decompression-bomb guards
- Manifest parsing for SCORM 1.2 and 2004 (2nd-4th), tincan.xml and cmi5.xml; launch-file discovery; multi-SCO lesson list; schema validation
- SCORM 1.2/2004 API host page on an open-source MIT runtime, with CMI data-model validation and suspend data beyond 4,096 characters
- Ordered call-trace recorder for golden tests
- In-memory xAPI statement and State sink and a cmi5 launch stub (fetch token, launch data) for tests
- Packaged for reuse by server package upload and the server SCORM host

**Done when**

- [ ] Traversal, bomb, symlink and duplicate-name zip fixtures are rejected with a reason
- [ ] Public ADL and CATAPULT sample packages parse, launch and produce a trace
- [ ] The same host package runs unchanged inside the server in M4

**Spec refs:** standards.md §3.10 S-1 to S-3, §3.11 T-6, T-7, reach.md shared needs (package importer and validator, tracking-runtime package)  
**Risks:** Dependence on a third-party runtime; keep an adapter seam so it can be swapped.

### ENG-04: Blocks player shell (MIT)

The accessible, responsive learner-facing player every Blocks course and every preview runs on.

**Features**

- Boots from a script-loaded course data file so it works from disk or any static host; 10-second timeout with a clear error
- Cover page, sidebar, compact and overlay menus, lesson headers, previous/next, skip link, per-lesson deep links by id
- Responsive layouts at phone, tablet and desktop widths; zoom on click; entrance animations with reduced-motion handling
- Renderer registry: one renderer per block type, filled in by the block epics
- In-course search with highlights, off when navigation is restricted or the sidebar hidden
- Author byline on the cover page; right-to-left rendering hook
- Lazy plugin slot for optional modules (such as the tutor) that makes zero requests when switched off
- Feature-split hashed bundles; no telemetry; runs under a strict content security policy

**Done when**

- [ ] Corpus courses open from file:// and over HTTP; a missing data file shows the error after 10 s
- [ ] Keyboard-only runs complete every corpus course; zero serious axe violations at three widths
- [ ] Network log shows only same-origin, LMS and configured LRS requests
- [ ] The bundle builds as an MIT package with no editor or server imports

**Spec refs:** rise.md §3F, §3N, §4 Published web package, rules 17 and 20, teams-collab.md H12 (byline), localization-ai.md shared needs (plugin slot), reach.md shared needs (in-course search)  
**Risks:** Bundle size and first load on phones; enforce a size budget in CI.

### ENG-05: Shared quiz model, progress engine and Blocks quiz runtime

Compute learner progress and run quizzes the same way in preview, on the web and in every LMS.

**Features**

- Quiz and result model shared with the slides question engine: true-false, choice, fill-in, long fill-in, matching, sequencing, Likert, numeric, performance; weighting, correct pattern, learner response, latency, result, objective id; per-quiz raw, max and pass; several tracked quizzes
- Interaction and answer id builder (rise rule 11, with the AICC fallback)
- Block, lesson and course percentages (rule 5); completion threshold (rule 6); continue gating (rule 13); restricted navigation (rule 14); learner mark-complete; branching via buttons
- Stepped and continuous microlearning with 100% completion (rules 16, 17)
- Quiz runtime: start screen, timer with auto-submit (rule 15), retries, require passing, skip ahead, reveal answers, best score (rule 8), random draws from banks, results area

**Done when**

- [ ] Unit tests reproduce the spec examples 2/3 = 67%, 13/20 = 65%, 1/4 = 25%, 1/2 = 50%
- [ ] Rule 11 examples and the AICC fallback pass; ids stay within SCORM 1.2 limits
- [ ] Best score never decreases across retries; timer expiry marks unanswered questions wrong
- [ ] Drawn question order is part of the saved state and survives resume

**Spec refs:** rise.md §3G, §3I, rules 5-8, 11, 13-17, standards.md §3.7 P-12, P-18, P-19  
**Risks:** Per-block completion rules are still partly unknown (rise.md open question 3); keep rules data-driven.

### ENG-06: Player lifecycle, state snapshot and tracking app profiles

Give every standard adapter one set of player events and one restorable state, with each app's exact timing rules.

**Features**

- Lifecycle events: start button, lesson or slide entered and left with timestamps, quiz submitted, retried or reset, course finished, exit button, page-hide
- Serializable state snapshot and restore (position, variables, states, answers, draws, media and scroll positions), each part tagged with a drop priority
- Completion model driven by the tracking source (viewed, quiz result, trigger)
- Player API actions: complete course, exit course, reset or retry quiz, send custom xAPI statement
- App profiles: Blocks (location on every lesson open, 100 ms resume debounce, 20 s commit) and Slides (resume only in suspend data, 0.5 s debounce, 60 s commit, score sent only when it changes, whole numbers under cmi5)
- Course language passed to the LMS learner preference and xAPI statement language
- Accessible UI slots: save-failed notice, offline banner, LMS-only error page, goodbye page
- Injectable clock and storage; debug tracking adapter for preview

**Done when**

- [ ] Snapshot then restore is the identity across the corpus
- [ ] Fake-clock tests prove debounce and commit intervals for each profile
- [ ] Notices are announced by screen readers and never block the course

**Spec refs:** standards.md §5 rules 3-9 and 17, shared needs, rise.md rules 1-4, storyline.md rules 25, 41, 42  
**Risks:** Profiles could drift silently; per-profile golden traces in STD-03 catch it.

### ENG-07: Media player, captions and caption editor

One accessible audio and video player with captions for both players, plus the caption editor both editors use.

**Features**

- Play/pause, 0.25x-2x speed, captions, picture-in-picture, full screen, poster, dark/light/no controls, relative volume
- Forward-seek lock; playback position kept in progress data
- Transcript panel with timestamps and auto-scroll; styled caption renderer; language-tagged caption tracks matched to the browser language
- Caption files SRT, VTT, SBV and SUB in and out; caption editor component with WebVTT round trip
- Adaptive streaming playback; arrow keys seek 5 s

**Done when**

- [ ] Every control works by keyboard and screen reader; axe clean
- [ ] Video position resumes within 1 s after relaunch under SCORM 1.2 and xAPI
- [ ] Caption files round-trip in all four formats with millisecond timing intact

**Spec refs:** rise.md §3H, rules 19 and 22, storyline.md formats table (captions), localization-ai.md shared needs (caption tracks, caption editor), review.md rule 22  
**Risks:** Codec support differs per browser; publish-time transcoding (ENG-14) normalises it.

### ENG-08: Theme tokens, contrast and fonts

One theme model that keeps courses on-brand and readable, shared by editors and players.

**Features**

- Theme tokens for layout style, colours, fonts, cover and header options
- Automatic contrast: text 4.5:1, navigation 3:1
- Brand id plus accepted brand revision, logo, primary and extra colours as picker presets, heading and body fonts, per-course overrides, brand-to-course diff
- Custom font references (organisation or personal .woff, regular weight required) resolved live in the editor; exporters embed every font used

**Done when**

- [ ] Every generated colour pair meets 4.5:1 or 3:1
- [ ] A changed brand never changes a course until the author accepts it
- [ ] Exported packages contain every used font and no remote font URLs

**Spec refs:** rise.md §3E, rule 18, teams-collab.md §3N, R13, R14  
**Risks:** Licensing of fonts that authors upload is their responsibility; show a notice.

### ENG-09: Label sets and learner-facing strings

Every learner-facing word in both players comes from an editable, translatable label set.

**Features**

- Label set format: language code plus key-to-text map, including screen-reader and video-player strings
- English built-in set first; original sets for every supported language (about 330 keys, including chooser and tutor strings) added with ENG-35
- Custom label sets assignable per language
- Lint rule that forbids hard-coded learner-facing strings in player code

**Done when**

- [ ] Lint fails on a hard-coded string fixture
- [ ] Overriding a label changes both the visible text and the screen-reader announcement

**Spec refs:** rise.md §3L, §4 Label set, storyline.md §3K, localization-ai.md shared needs (built-in label sets)  
**Risks:** Built-in strings must be original wording, never vendor text.

### ENG-10: Document command layer (doc-ops) with undo and integrity

Every edit, whether by hand, by AI or by a co-author, goes through one validated, undoable command layer.

**Features**

- Typed commands for every object type with validation and referential integrity
- Undo/redo; each AI insert or replace is one undo step
- Integrity rules extended by the slides schema (variable rename updates triggers and text; deleting a data-entry field removes its variable and trigger; deleting a variable leaves text references and unassigns triggers)
- The same commands drive the editor UI, AI tool calls and co-editing transactions
- Change events for autosave, snapshots and segment change detection

**Done when**

- [ ] Property test: random command sequences followed by full undo restore the original document
- [ ] Invalid commands are rejected with no partial write
- [ ] Command JSON Schemas for AI tool calls are generated from the same types

**Spec refs:** storyline.md rule 20, localization-ai.md shared needs (command and undo API), teams-collab.md §3H  
**Risks:** Command granularity must fit Yjs transactions; design together with ENG-19.

### ENG-11: Project container, asset store and snapshots

Keep a desktop course in one safe file and every asset in one store, with snapshots to roll back to.

**Features**

- Desktop single-file project holding course JSON, media, snapshots and fonts; crash-safe save and autosave
- Asset store: local disk on desktop, S3/MinIO on the server; content-addressed; source, provider, licence and attribution kept; never hotlinked
- Snapshot payload = course JSON plus asset manifest; manual and automatic (publish, export, share-link change); restore and restore as a new course
- Publish, export and share-link events emitted for automatic snapshots

**Done when**

- [ ] Killing the app during save never corrupts the project
- [ ] A project reopens identically after save on all three OS
- [ ] Restoring a snapshot reproduces the exact document and assets

**Spec refs:** rise.md §6 (snapshot store), Blocks shared needs (desktop project container), teams-collab.md §3J, §3Q, R17, localization-ai.md shared needs (snapshots)  
**Risks:** Very large media inside one file; container format is decision D-4.

### ENG-12: Shared web UI kit and edition host interface

Let one React editor and admin UI run unchanged in the desktop app and in the browser.

**Features**

- Host interface the editors code against (storage, files, dialogs, sign-in, jobs), with a desktop adapter in M2 and a server adapter in M3
- Accessible component kit with design tokens, light and dark themes, keyboard patterns
- Accessible data table with cursor paging, filters and CSV export
- UI string catalogue with English fallback, covering 20 learner languages

**Done when**

- [ ] The Blocks editor e2e suite passes against the desktop adapter and an in-memory server mock
- [ ] The component kit passes axe and keyboard tests

**Spec refs:** studio/ARCHITECTURE.md Layers, Editions, reach.md shared needs (data table, string catalogue)  
**Risks:** Tauri APIs leaking into editor code; a lint rule forbids it.

### ENG-13: Real-player preview harness

The editor previews with the exact player bundle that gets published.

**Features**

- Player bundle in an isolated editor frame with a simulated LMS (debug adapter) and resettable progress
- Phone, tablet and desktop widths
- Log of the calls a package would make
- Slides additions via ENG-28 hooks: slide, scene or project scope; restart; jump; variable inspector; trigger log; timeline-only mode

**Done when**

- [ ] Preview and exported web package render pixel-identical for corpus courses
- [ ] Reset clears all progress; the call log matches the golden trace for the same steps

**Spec refs:** studio/ARCHITECTURE.md principle 4, rise.md §2 step 7, storyline.md §3P, standards.md shared needs (debug tracking adapter)  
**Risks:** Preview drift if editor styles leak into the frame; enforce frame isolation.

### ENG-14: Media pipeline and intake

Turn any imported image, audio or video into web-ready assets on desktop and server.

**Features**

- Bundled ffmpeg: import transcoding, trim, crop, volume, brightness, contrast, watermark, frame grab, MP3/WAV/MP4/WebM export, waveforms, thumbnails, adaptive renditions, loudness normalisation, audio bitrate
- Image variants and pre-scaling with per-file JPG quality
- WebVTT handling; audio extraction for speech-to-text
- oEmbed resolver on desktop and server with no third-party embedding service
- Text-to-speech hook through ENG-34

**Done when**

- [ ] Corpus media transcodes to the same results on Windows, macOS, Linux and the server image
- [ ] The licence gate confirms the shipped ffmpeg build is allowed
- [ ] oEmbed works for listed providers with no intermediary service

**Spec refs:** rise.md §6 (media pipeline, oEmbed), storyline.md §4 Published web package (images pre-scaled), localization-ai.md shared needs (audio extraction)  
**Risks:** ffmpeg licence, binary size and codec patents (decision D-12).

### ENG-15: Job runner

Run long tasks such as export, media, translation and narration with progress, cancel and retry on desktop and server.

**Features**

- Desktop worker processes; server queue backed by PostgreSQL
- Progress events, cancel, retry, resume after restart, completion notification
- Bounded concurrency and resource limits

**Done when**

- [ ] Cancel stops work within 2 s and removes temporary files
- [ ] A job survives an app or server restart and resumes or fails cleanly

**Spec refs:** localization-ai.md shared needs (job runner), rise.md §6 (export jobs), standards.md §6 (export jobs)  
**Risks:** Two runtimes; keep one job contract.

### ENG-16: Segment model and translation exchange

Give every translatable string a stable id so translation, XLIFF, Word and Review all work on the same units.

**Features**

- Stable segmentId for every translatable string: block text, text shapes, caption cues, transcripts, alt text, narration scripts, variable values, questions and answers, resource titles, custom-block text
- Source rich text with inline-format placeholders and a source fingerprint
- Per-language entries with origin (machine, author, validator, ai-suggestion) and state (current, stale, suggestion-pending, suggestion-imported)
- Shared extract, apply and diff functions; per-version extraction and version-to-version diff
- XLIFF 1.2 and 2.0 reader and writer; Word-table export and import with optional screenshots

**Done when**

- [ ] Extract then apply is lossless for corpus courses, formatting included
- [ ] segmentIds survive copy, paste and block conversion
- [ ] XLIFF output validates against the 1.2 and 2.0 schemas and re-imports cleanly

**Spec refs:** localization-ai.md §4, rules 1-3, review.md §4 (Segment, Suggestion), rise.md §3L, storyline.md §3N  
**Risks:** Segment granularity is hard to change once translations exist.

### ENG-17: Accessibility checker

Find accessibility problems before publishing, in the editor and in CI.

**Features**

- WCAG 2.1/2.2 AA rules over the course model: missing alt text or alt text over 150 characters, contrast, focus order, missing captions, untitled dialogs, time limits, per-language text overflow, unapproved AI captions
- Editor panel API and a command-line checker for CI

**Done when**

- [ ] Each rule has a failing and a passing fixture
- [ ] The CLI exits non-zero on violations and writes a machine-readable report

**Spec refs:** storyline.md §3L, rise.md Blocks shared needs (accessibility baseline), localization-ai.md shared needs (checker hooks)  
**Risks:** Automated checks miss real usability problems; keep manual screen-reader passes per release.

### ENG-18: Server platform services

The backbone every server feature uses: storage, jobs, mail, realtime, tokens and isolated content hosting.

**Features**

- Node.js + TypeScript API with PostgreSQL migrations and an organisation id on every record
- S3/MinIO storage with resumable upload up to 5 GB
- Job queue and scheduler (reminders, digests, retention)
- SMTP sending with templates and bounce hooks
- WebSocket/SSE realtime channel
- Personal access tokens for desktop publishing
- Isolated content origin with no access to app cookies; no-index headers on share links
- Docker Compose deployment configured by environment

**Done when**

- [ ] A 5 GB resumable upload survives a network drop
- [ ] Content served from the content origin cannot read app cookies (security test)
- [ ] Scheduled jobs fire at the configured times under a fake clock

**Spec refs:** reach.md §6, review.md §6 items 2-8, teams-collab.md §6  
**Risks:** Hosting untrusted packages; external security review before Server 0.1.

### ENG-19: Yjs document model and co-editing service

Let several authors edit one course at the same time without losing work.

**Features**

- Lossless mapping of the course format to a Yjs document and back, sharing schema migrations
- Separately lockable parts (title, description, section headers, each lesson); presence, lock awareness and take-over
- Hocuspocus service with PostgreSQL persistence, sign-in hook and per-document access checks
- Offline edits merge on reconnect (basis for M8 sync)

**Done when**

- [ ] Fuzz test: three simulated clients making random edits converge to identical JSON that validates
- [ ] JSON to Yjs to JSON is byte-identical for the corpus
- [ ] Removing a collaborator disconnects them at once

**Spec refs:** teams-collab.md §3H, R9, R10, open question 4, rise.md §6  
**Risks:** Lock model versus true CRDT editing (decision D-5); memory use on large documents.

### ENG-20: Review surface and video wrapper outputs

Make every published course reviewable: players report where the reviewer is, take screenshots, and outputs carry a review manifest.

**Features**

- Player review mode: always from the beginning, no resume, no LMS calls, ignores close-window and orientation locks
- Versioned, origin-checked message bridge: player reports scene and slide id, number and title, lesson id and title, media time; the shell can go to a location and seek
- In-player screenshot of the content area to PNG on request
- Review manifest in every web output: content type, project id, player version, title, poster, outline of stable ids with numbers and titles
- Publish scope (project, scene, slide), quality options, thumbnail choice, zip with the entry page at the root
- Review-copy export: web output plus an offline review shell that runs from file:// and writes a portable comments file
- Video LMS wrapper for SCORM 1.2, SCORM 2004 and xAPI with a watch threshold of 1-100% (default 80)
- Linked Review items stored in the project file

**Done when**

- [ ] Bridge contract tests: version mismatch detected; messages from other origins ignored
- [ ] Screenshots match the visible frame within a pixel tolerance for corpus courses
- [ ] A review copy opens from disk, records comments, and the comments file imports back
- [ ] The video wrapper completes at the set threshold in the test LMS host

**Spec refs:** review.md §6 item 4, §4 Formats, rules 6, 7, 21, storyline.md §6  
**Risks:** Screenshots of cross-origin video or canvas content; handle tainted canvases.

### ENG-21: PDF rendering

One PDF engine for course PDFs, comment reports and certificates, with non-Latin fonts.

**Features**

- Blocks course PDF export following rise.md §3M
- Comment report PDF; certificate PDF (standard and company layouts)
- CJK and other non-Latin font fallback; one PDF per language in multi-language exports

**Done when**

- [ ] A corpus course and a CJK fixture render with no missing glyphs (text-extraction test)
- [ ] The same input gives the same PDF on desktop and server

**Spec refs:** rise.md §3M, review.md §6 item 12, reach.md §3O, localization-ai.md shared needs (exporters)  
**Risks:** Choose one renderer for both editions to avoid output differences.

### ENG-22: Reuse payload formats

Portable formats for what teams reuse: block templates, question banks, brands and asset packs.

**Features**

- Block-template payload inserted as a copy that adopts the target course's theme fonts and keeps inline formatting
- Question bank references in courses; banks copied into the published package; random draw at runtime
- Brand exchange file (JSON plus font zip) shared by desktop and server
- Content-library asset-pack format: index, multilingual tags, licence and attribution

**Done when**

- [ ] An inserted template gets new ids and keeps no link back
- [ ] A brand file exported on desktop imports on the server unchanged
- [ ] A package with a bank reference contains the bank and draws at runtime

**Spec refs:** teams-collab.md §3L-§3P, R15, §4 Formats  
**Risks:** Id collisions on insert; always re-id on copy.

### ENG-23: Native server tracking adapter and portal player features

Let the learning server track Blocks courses lesson by lesson without SCORM, reliably even when the tab closes.

**Features**

- Native server adapter: lesson completed, progress %, per-question results, media positions, session time
- Durable retry queue and beacon-style save on page exit, with idempotency keys
- Learner features: outline with lesson status, progress %, resume button, resume at the top of the last lesson, finish button, completion celebration toggle, start again, language picker
- In-course search with counts per lesson, including text behind unfinished steps

**Done when**

- [ ] Closing the tab mid-lesson loses no recorded progress (beacon test)
- [ ] Events queued offline arrive once and in order when the connection returns

**Spec refs:** reach.md shared needs, §3N, §3U, §6 Scaling  
**Risks:** Duplicate events under retry; the server endpoint (RCH-08) must be idempotent.

### ENG-24: Slides project schema and library formats

Extend the course format to slide projects so the slides editor, player and exporters share one model.

**Features**

- Entities: project (slide size, themes, masters, feedback masters, scenes, banks, variables, player config, media library, publish settings, languages), scene, slide, layer, object, state, trigger (event and action params, nested AND/OR/NOT conditions, else, enabled, order), variable, question, draw, result, player config
- Slides integrity rules in doc-ops
- Yjs mapping for slide projects
- Library subset format (chosen slides, masters, slide size, player settings, assets) and insert-as-copy with name-clash renaming; templates that adapt to slide size

**Done when**

- [ ] The reference slide corpus validates; round-trip and migration tests as in ENG-02
- [ ] Integrity tests match storyline.md rule 20

**Spec refs:** storyline.md §4 Our project document, rule 20, teams-collab.md §3O, §3P  
**Risks:** Must be expressive enough for later .story import; review against ENG-36 needs.

### ENG-25: Canvas object model and slide renderer

Draw slides identically in the editor canvas and the published player, with a real accessible structure underneath.

**Features**

- One DOM/SVG renderer for the editor canvas and the player
- Text layout with font metrics, shapes, merged outlines, pictures; fixed slide size with scaling
- Hidden accessible structure of real buttons, text and landmarks in focus order; slide title announced
- Canvas object model shared with Blocks custom blocks (states, per-screen-size overrides)
- Font packaging in output

**Done when**

- [ ] Editor-versus-player pixel parity on the slide corpus within tolerance on all three OS
- [ ] A screen reader reads objects in the author's focus order; every interactive object is a native control

**Spec refs:** storyline.md §3C, §3L, rise.md §4 Custom-block document, studio/ARCHITECTURE.md principle 4  
**Risks:** Text layout parity is the hardest technical risk in the suite; spike it in the first two weeks of M5.

### ENG-26: Slide runtime and slides output profile

Play slide projects: navigation, layers, windows, slide data loading and slides packages.

**Features**

- Scene and slide navigation; per-slide data loaded on demand with a prefetch queue of 3; next-slide requests de-duplicated within 300 ms
- Layer stack and options (hide others, hide base objects, hide at end, seek modes, dialog focus trap, block clicks, pause base); revisit modes including the automatic rule
- Lightbox windows, hidden system prompt slides, start button when sound autoplay is blocked, lost-connection alert, tooltips, swipe
- Background audio playlist with learner toggle and volume variable
- Slides web and LMS output: separate web and LMS launch pages, course data, frame data, shared outlines, per-slide data via a provide-data loader, web-object folders, publish scope; no author content evaluated except the author-JavaScript file
- Slide resume parts (slide and layer states, answers, drawn order, language) for the resume codec
- Embed profile for slide packages inside Blocks courses: completion by trigger, result slide or slide count; quiz result as tracking source; pinned version

**Done when**

- [ ] Double-clicking Next advances once; the network log shows 3 slides prefetched
- [ ] Dialog layers trap focus and block clicks
- [ ] The reference long course's resume record fits 4,096 characters

**Spec refs:** storyline.md §3A, §3B, §4 Published web package and Learner resume data, rules 9-12, 33, 40, 41, rise.md Blocks shared needs (slide-app embedding)  
**Risks:** Revisit and resume semantics are subtle; one corpus slide per rule.

### ENG-27: Timeline and animation engine

Time and animate every object on slides and layers, seekably and with reduced-motion support.

**Features**

- Per-layer timeline clock with cue points; default length 5 s or the slide audio length
- Entrance, exit, emphasis and motion-path effects with easing and strength, relative chaining, orient to path, reverse
- Text animation by paragraph; slide and layer transitions
- Low-motion option and reduced-motion handling
- Effect set rich enough to map PowerPoint effects; scripted animation added to the timeline stays seekable

**Done when**

- [ ] Seeking to any time renders the same frame as playing to it (virtual-clock test)
- [ ] prefers-reduced-motion disables motion paths and large movement

**Spec refs:** storyline.md §3E, §3F, rule 13  
**Risks:** Frame determinism across machines; drive everything from a virtual clock.

### ENG-28: Trigger, state and variable engine

The when / do / if / else rule system and variables that make slides interactive without code.

**Features**

- Event registry (about 47 kinds) and action registry (about 86 kinds, including for-each, if/else blocks, shared action groups overridable per slide, custom xAPI statements, cancel event, debug trace) in our own vocabulary
- Condition evaluator with exactly ten operators, loose equality, curly-quote normalisation, case-insensitive language checks, contains, exists/state/hit-test/descendant tests, nested AND/OR/NOT; unknown operator raises an error
- Order: master triggers first, then panel order; a jump ends the group; disabled triggers stripped at publish
- Built-in states (Hover, Down, Selected, Visited, Disabled, Hidden, Drag Over, Drop Correct/Incorrect) with combined states and a documented fallback priority
- Variables: true/false, text up to 32,767 characters, number (fixed or random range); built-in player, elapsed-time and numbering variables; live text substitution; resume flags; current-language variable and condition
- Trigger log and variable inspector hooks for preview

**Done when**

- [ ] Every event and action has a corpus slide and a passing test
- [ ] Operator tests reproduce storyline.md rules 36-39 exactly
- [ ] State fallback priority is documented and tested

**Spec refs:** storyline.md §3D, §3G, §3H, rules 1-8, 18, 36-39  
**Risks:** Vocabulary size; keep it registry-driven with a corpus per event and action group.

### ENG-29: Author JavaScript API and sandbox

Let advanced authors script slides safely, and isolate all author code and web content.

**Features**

- Execute-JavaScript runtime: scripts gathered into one file and called by id; player handle with get/set variable
- Object API (x, y, scale, rotation, opacity, depth, state; read-only width and height), pointer position, slide size, per-frame update loop, run-once, add-to-timeline, per-object pointer events (last handler wins), key down/up and held keys, CSS style access; no audio API
- Sandbox for author JavaScript, web objects and Blocks code blocks: sandboxed frames, content security policy, separate origin in browser editor and server previews
- Code-block protocol: JSON-RPC 2.0 notifications ready, loaded, resized, completed, error

**Done when**

- [ ] Author scripts cannot read editor or server cookies or storage (security tests)
- [ ] Contract tests cover every listed API member; storyline.md rule 32 holds
- [ ] A code-block frame reports resize and completion that gate the course

**Spec refs:** storyline.md §3I, rule 32, rise.md §4 (code-block messages), rule 21  
**Risks:** Sandboxing under file:// on desktop differs from hosted delivery; test both.

### ENG-30: Slide question engine

Graded and survey questions on slides, scored and reported the way every LMS expects.

**Features**

- Declarative response assembly and answer patterns with points and correct/incorrect status for 20 form-based and 6 freeform types
- Keyboard-operable drag and drop
- Bank draws with locks and stored drawn order
- Result scoring: viewed-only, rounding, combined pass-each or pooled; final, pre-check and knowledge-check reporting; quiz timer; attempt limits; submit all; read-only review; retry wrong-only or redraw; print results; multi-quiz status latch
- LMS interaction ids and types

**Done when**

- [ ] storyline.md rules 21-24 reproduced in tests
- [ ] Every question type works by keyboard and screen reader
- [ ] Interactions appear correctly in SCORM 1.2, SCORM 2004 and xAPI traces

**Spec refs:** storyline.md §3J, rules 21-24, 30, 34  
**Risks:** Freeform questions interact with triggers; one corpus slide per type.

### ENG-31: Slides player frame

The course frame around slides: menu, tabs, controls and settings learners use.

**Features**

- Modern frame with sidebar and top-bar tabs plus custom tabs; menu (free, restricted, locked; headings, numbering, result icons, search over slide text and notes); glossary; notes; resources
- Controls: volume, seekbar modes, play/pause, replay, captions, 0.25x-2x speed, full screen, search, accessibility settings; Prev, Next, Submit, Submit All, Finish
- Chromeless mode; colours, fonts and focus colours; about 185 editable labels with language sets and right-to-left
- Sizing modes with fixed frame increments; orientation lock; phone and tablet layouts
- Ctrl+Alt learner shortcuts overridden by author key triggers per slide; skip navigation and back-to-top
- Resume prompt, always or never (always start over when embedded or in Review); multi-language picker with live switch

**Done when**

- [ ] storyline.md rules 26-28 and 35 reproduced in tests
- [ ] Every control works by keyboard; the frame passes axe at phone, tablet and desktop sizes

**Spec refs:** storyline.md §3K, rules 26-28, 35  
**Risks:** Option combinations multiply layouts; snapshot tests per layout.

### ENG-32: Rendered outputs: MP4 video and DOCX handout

Publish a slide course as a video or a Word handout without extra software.

**Features**

- Headless render of the real player to one MP4 at 1080p, 720p, 540p or slide size; four quality levels; 30 fps; up to 2 hours; follows Next actions or slide order; captions burned in; never waits for learner input
- DOCX handout of base-layer screenshots with optional layer screenshots and notes, medium or large images, no Word install needed
- One file per language for multi-language projects

**Done when**

- [ ] Sampled MP4 frames equal player frames at the same time
- [ ] The 2-hour cap is enforced; the DOCX opens in LibreOffice and Word

**Spec refs:** storyline.md §3P, rule 29, formats table  
**Risks:** Render time on low-end machines; runs as a cancellable job.

### ENG-33: Data importers and document text extraction

Bring questions, glossaries and source documents into projects.

**Features**

- Question XLSX/TXT parser with an error list (points -1000 to 1000, at most 10 answers, first worksheet only, formatting stripped)
- Glossary CSV (Term, Definition) for the slides player; translation glossary CSV validation
- Document text extraction: PDF, DOCX, PPTX with speaker notes, XLSX, CSV, VTT/SRT

**Done when**

- [ ] Spec limits enforced with row-level error messages
- [ ] Extraction fixtures produce the expected text, including speaker notes

**Spec refs:** storyline.md rule 30, formats table, localization-ai.md §4 (glossary CSV), shared needs (document text extraction)  
**Risks:** Malformed office files; parse in a worker with size limits.

### ENG-34: AI provider contracts, usage and policy hooks

One capability-typed interface every AI feature calls, so nothing reaches a model without a configured provider and a policy check.

**Features**

- Capability contracts: chat with tool calls bound to doc-ops, text-to-speech with SSML and provider limits, speech-to-text, translation with glossary, image generation and editing, vision alt text, sound effects
- Per-request usage attributed to user and group; access-policy callback before any call; no call without a configured provider
- Provenance on every output (provider, model, settings, seed) so it can be regenerated
- Deterministic mock provider for tests and offline development

**Done when**

- [ ] Any capability called with no provider configured fails closed with a clear message
- [ ] A policy denial blocks the call and is logged
- [ ] Every AI feature's test suite runs against the mock provider

**Spec refs:** localization-ai.md §3.1, §8, teams-collab.md R22, storyline.md shared needs (ai-provider)  
**Risks:** Provider APIs drift; keep adapters thin and contract-tested in LOC-01.

### ENG-35: Multi-language format, delivery and preview API

Keep many languages in one project and deliver them in one package with a learner language choice.

**Features**

- Per-language overrides: text, media (link-to-source and revert), slide timing, player resources, label sets
- Structural propagation: add, move or delete applies to all languages; content added in a target language is copied untranslated
- Delivery: language manifest, one content set and label set per language, launch chooser that preselects only an exact browser-language match, share-link default language, live switch with progress keyed independently of language
- Right-to-left: player-wide direction, RTL text fields, mirrored alignment except centred text, sidebar and navigation direction
- Exporters: one package with all languages or per-language subfolders; PDF zip per language; per-language titles; LMS language reporting
- Preview API: render a language and review version, scroll to and highlight a segmentId, live text overrides without saving
- Original built-in label sets for every supported language

**Done when**

- [ ] Switching language mid-course keeps progress under SCORM 1.2 and native tracking
- [ ] An RTL corpus course renders mirrored correctly in preview, review and output
- [ ] The chooser preselects only an exact browser-language match

**Spec refs:** localization-ai.md §4, rules 3, 4, 7, 11, review.md shared needs (segment preview API), standards.md P-13, X-6  
**Risks:** Package size grows per language; load language data lazily.

### ENG-36: Project importers: PowerPoint, other projects and .story

Bring existing slide content in from PowerPoint, other projects and the vendor's project files.

**Features**

- PPTX: slides, masters, text, shapes, pictures, tables, notes, animations and transitions mapped, companion audio
- Slide import between projects with name-clash renaming
- Story-file container reader (relationship parts, per-slide parts, layouts, player settings, media) mapped onto our schema, classic player settings mapped onto the modern frame
- Import report listing every unsupported item
- Built only from the study team's clean-room spec

**Done when**

- [ ] PPTX corpus imports with a report; text and positions within tolerance
- [ ] Public community sample story files import without crashing and list unsupported items

**Spec refs:** storyline.md §3O, formats table, open question 7, studio/CLEAN-ROOM.md (levels 1-3 only)  
**Risks:** Undocumented internals and a clean-room spec dependency; current file versions only.

### ENG-37: Conformance corpus and parity tests

A shared set of reference courses that proves every behaviour rule on every change.

**Features**

- test-courses repo: reference Blocks courses per feature group (M1) and reference slide courses per feature group (M5)
- Golden call-order traces per app profile and standard (Blocks SCORM 1.2, Slides SCORM 1.2, Slides xAPI)
- Long-resume, multi-quiz, every question type and multi-language courses
- Editor-versus-player pixel parity suite

**Done when**

- [ ] Every numbered behaviour rule in the specs maps to at least one corpus course or test (traceability report)
- [ ] The corpus validates against the current schema on every PR

**Spec refs:** standards.md §3.11, shared needs (test courses), reach.md shared needs (golden traces R-TRK 29-33), storyline.md shared needs (conformance)  
**Risks:** Corpus goes stale; schema migrations run over it in CI.

### ENG-38: Operations: Helm chart, backups, upgrades and observability

Let companies run the server at any size and recover from failure.

**Features**

- Helm chart with autoscaling app instances, external PostgreSQL and S3
- Backup and restore of database and object storage
- Zero-downtime migrations and a documented upgrade path between minor versions
- Self-hosted health, metrics and log endpoints with no phoning home
- Load-test suite for the scaling guide (1,000 / 10,000 / 100,000 learners)

**Done when**

- [ ] A restore drill rebuilds a server from backup with identical data
- [ ] The medium scaling profile meets its targets under load test
- [ ] Upgrade from the previous minor version loses no data

**Spec refs:** studio/ARCHITECTURE.md Deploy, Scaling guide, phase 7, reach.md §6 Scaling-relevant behaviour  
**Risks:** Scaling-guide figures are estimates; publish measured numbers only.

## Slides app (slide-based authoring)

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| SLD-01 | Project, scenes, slides and story view | mvp | both | L | M5 | engine:slide-schema, engine:doc-ops, engine:preview |
| SLD-02 | Slide canvas and core objects | mvp | both | XL | M5 | SLD-01, engine:slide-renderer, engine:doc-ops |
| SLD-03 | Layers and states | mvp | both | L | M5 | SLD-02, engine:slide-runtime, engine:state-engine |
| SLD-04 | Timeline, cue points and basic animation | mvp | both | L | M5 | SLD-03, engine:animation, engine:slide-runtime |
| SLD-05 | Triggers, variables and JavaScript action | mvp | both | XL | M5 | SLD-03, SLD-04, engine:trigger-engine, engine:variables, engine:js-api, engine:sandbox |
| SLD-06 | Core interactive controls | mvp | both | M | M5 | SLD-05 |
| SLD-07 | Audio and video on slides | mvp | both | M | M5 | SLD-04, engine:media-player, engine:media-pipeline |
| SLD-08 | Graded question slides, feedback and result slides | mvp | both | XL | M5b | SLD-03, SLD-05, SLD-06, engine:question-engine, engine:lms-bridge |
| SLD-09 | Player designer | mvp | both | L | M5b | SLD-01, engine:player-frame, engine:resume-codec |
| SLD-10 | Accessibility authoring and captions | mvp | both | L | M5b | SLD-03, SLD-07, SLD-09, engine:a11y-checker, engine:slide-renderer |
| SLD-11 | Preview and publish to web and LMS | mvp | both | L | M5b | SLD-08, SLD-09, engine:preview, engine:web-exporter, engine:lms-exporters, engine:lms-bridge, engine:media-pipeline |
| SLD-12 | Masters, themes, templates and content library | v1 | both | L | M5c | SLD-02, SLD-05, SLD-08 |
| SLD-13 | Advanced design: rich objects and motion | v1 | both | L | M5c | SLD-02, SLD-04, engine:animation, engine:slide-renderer |
| SLD-14 | Advanced interactive objects | v1 | both | XL | M5c | SLD-05, SLD-06, engine:slide-runtime, engine:sandbox |
| SLD-15 | Advanced quizzing: survey, freeform, banks and combined results | v1 | both | XL | M5c | SLD-08, SLD-11, engine:question-engine, engine:resume-codec, engine:importers |
| SLD-16 | Media tools, narration and video/handout output | v1 | both | XL | M5c | SLD-07, SLD-10, SLD-11, engine:media-pipeline, engine:ai-provider, engine:video-export, engine:docx-export |
| SLD-17 | Import: PowerPoint, other projects and .story files | v1 | both | XL | M6c | SLD-05, SLD-08, SLD-12, SLD-13, SLD-14, SLD-15, engine:importers |
| SLD-18 | Translation and multi-language courses | v1 | both | L | M6c | SLD-09, SLD-10, SLD-16, engine:importers, engine:ai-provider, engine:multilang |
| SLD-19 | Team collaboration: co-editing, review and learning portal | v1 | both | L | M5c | SLD-11, suite:server-core, suite:review, suite:reach, engine:doc-ops |
| SLD-20 | AI assistant and generative tools | later | both | L | LATER | SLD-05, SLD-10, SLD-15, SLD-16, engine:ai-provider, engine:doc-ops |

### SLD-01: Project, scenes, slides and story view

Create, open and organise a slide project (scenes, slides and their properties) and see the whole course as a branching map.

**Features**

- New project with slide size presets: 16:9 HD (default), 4:3, 9:16 mobile, custom
- Scenes: add, rename, reorder, delete; designated starting slide; scene number used in numbering
- Slides: add blank or from a basic layout, duplicate, rename, reorder, move between scenes, delete
- Story view: zoomable map of scenes and slides with arrows drawn from jump triggers and question branching
- Slide view: edit one slide at a time with a slide thumbnail strip
- Slide properties: advance automatically or by user; revisit automatic / resume saved state / reset; per-slide Prev, Next, Submit; swipe on/off; per-slide player feature overrides
- Slide notes editor (feeds the learner notes tab and search)
- Hidden system scene created automatically with built-in prompt slides: resume, invalid answer, print, scroll, external-interface error, quiz timer expired
- One built-in default master, layout set and theme with editable colours and fonts, so MVP projects are styled before SLD-12
- Undo/redo for every edit; copy and paste slides between projects
- Desktop: project file on disk with autosave and crash recovery; server: project stored on the server (single editor until SLD-19)
- Project media library listing every asset with usage

**Done when**

- [ ] A project with 3 scenes and 12 slides is created, reordered, saved, closed and reopened; the document is identical and validates against the shared schema
- [ ] Story view shows one arrow for every jump-to-slide trigger and question branch; clicking a slide opens it in slide view
- [ ] Changing a scene's starting slide changes where scene preview begins
- [ ] Revisit automatic, resume and reset each behave per rule 9 when previewing a slide with a visited button
- [ ] After a forced kill of the desktop app, restart offers recovery and restores every edit made before the last autosave
- [ ] A 9:16 project previews and publishes at 9:16

**Spec refs:** storyline:A1-A5, storyline:A12 (default theme only), storyline:A14, storyline:A15, storyline:A17, storyline:A18 (manual part), storyline:§4 Project/Scene/Slide, storyline:rule 9  
**Risks:** Story view layout and arrow sync on 200+ slide projects; the file format must stay forward-compatible because .story import (SLD-17), co-editing (SLD-19) and desktop-server sync land later.

### SLD-02: Slide canvas and core objects

Place, size and format text, shapes and pictures on a fixed-size slide, the way a presentation tool does.

**Features**

- Canvas at project slide size with zoom, pan, rulers, grid, guides, snapping and smart alignment
- Select, multi-select, move, resize, rotate, flip, group/ungroup, align/distribute, arrange (stacking order)
- Text boxes and callout captions with rich text: font, size, bold/italic/underline/strike, colour, lists, alignment, spacing, autofit, text styles
- Shapes and lines with corner radius, solid/gradient/picture fill, line, shadow, opacity
- Pictures from file, clipboard or screen capture; crop; replace picture
- Size and position window with exact x, y, width, height, rotation
- Object list: rename, hide, lock any object
- Mouse cursor choice per object
- Copy/paste within and across slides and projects, paste in place, duplicate
- Project font list with missing-font warning; fonts packaged with the published course

**Done when**

- [ ] A slide with 50 mixed objects shows no position difference over 1 px between the editor canvas and the preview player at 100 % (pixel-diff test)
- [ ] All formatting survives save, reopen and publish
- [ ] Objects can be selected, moved (arrows, Shift for 10 px), resized and deleted with the keyboard only
- [ ] A 50-step edit script undoes back to the starting document exactly
- [ ] A text box using an unavailable font shows a warning in the editor and in the publish report

**Spec refs:** storyline:C1 (text, captions, shapes, lines), storyline:C3 (styles, font and paragraph), storyline:C6 (fill, line, shadow, size/position, grid/guides/rulers), storyline:C7 (pictures, screenshots), storyline:C31, storyline:C32 (rename, hide, lock)  
**Risks:** Identical rich-text layout in editor and DOM/SVG player across Windows, macOS and Linux font stacks is the hardest part; font licensing for packaging fonts in output.

### SLD-03: Layers and states

Give each slide pop-up layers and give each object looks that change automatically or by trigger.

**Features**

- Layers panel: add, duplicate, copy to other slides, rename, delete, reorder; base layer fixed at the bottom
- Layer options: hide other layers; hide all or chosen base objects; hide when its timeline finishes; allow seeking yes/no/automatic; block clicks; pause base timeline; revisit mode
- Dialog layer format: dims and blocks everything else, keeps focus inside, accessible title and description picked from slide text
- Each layer owns its own timeline
- Editor aids: keep a layer visible while editing, dim inactive layers
- States panel: Normal plus add, duplicate, rename, reorder, delete; a state can change text, formatting, shape, colour, effects, position, size and add or remove objects
- Built-in states: Hover, Down, Selected, Visited, Disabled, Hidden, Drag Over, Drop Correct, Drop Incorrect; can be added to pictures, shapes, captions and markers; buttons get them by default
- Designed combined states (for example Hover + Visited + Disabled)
- Renaming a built-in state removes its automatic behaviour; renaming it back restores it
- Initial state per object
- Insert pictures as states: each file name becomes a state, built-in names behave as built-in

**Done when**

- [ ] In preview, a layer with pause base timeline pauses base media and resumes at the same time when closed
- [ ] In a dialog layer Tab cycles only within the layer, Esc closes it, and its title and description are exposed in the accessibility tree
- [ ] In a 3-button set Selected is exclusive; Visited persists on revisit with resume and clears with reset
- [ ] A Disabled object ignores hover, click and drag in preview
- [ ] Renaming Hover stops automatic hover; renaming it back restores it
- [ ] Inserting 4 files named normal, hover, down, visited creates one object whose states behave as built-ins

**Spec refs:** storyline:B1-B13, storyline:D1-D5, storyline:D7-D11, storyline:rules 4-12, storyline:§7 Q3  
**Risks:** Precedence when several built-in states apply and no combined state was designed is unknown (open question 3); we must define and document our own order. Seek-mode automatic interplay with layer timelines.

### SLD-04: Timeline, cue points and basic animation

Control when each object appears, for how long, and how it enters and leaves, on every slide and layer.

**Features**

- Timeline panel per layer: one row per object, row order is stacking order; drag bars for start and duration
- Show until end, show always, exact timing entry, align to playhead, align to cue point
- Row tools: rename, hide, lock, group and expand rows, exclude from screen readers
- Default length 5 s or the slide audio length; fit to longest object; manual length
- Cue points: add at playhead (also by key during playback), drag, delete; used for alignment and trigger timing
- Playhead scrubbing (no layers or triggers) and timeline-only preview
- Entrance and exit animations (our own effect set) with direction, intensity and text by paragraph or all at once; default 0.75 s; duration handles on rows
- Slide and layer transitions with duration and direction

**Done when**

- [ ] An object starting at 2.0 s for 1.5 s appears and disappears at those times in preview within one frame at 60 fps
- [ ] Adding 12.3 s of audio to a default-length slide sets the timeline to 12.3 s
- [ ] Moving a cue point moves every object aligned to it and every trigger timed to it fires at the new time
- [ ] A scrubbed frame matches the preview frame at the same timestamp (pixel diff)
- [ ] Entrance animations are reduced to fades when the learner's system requests reduced motion

**Spec refs:** storyline:E1-E8, storyline:F1-F4 (entrance/exit on slides and layers), storyline:F7, storyline:C32, storyline:rule 13  
**Risks:** Frame-accurate sync of timeline, media and animation in the browser; scrubbing performance on heavy slides.

### SLD-05: Triggers, variables and JavaScript action

Let authors make anything interactive with when / do / if / else rules and variables, without writing code.

**Features**

- Triggers panel sections: slide, layer, key-press, variable, object, player and unassigned (incomplete) triggers
- Edit inline or in a fully keyboard-operable wizard that remembers the last trigger, prefills choices and filters lists as you type
- Event picker covering the engine's full event set in our own plain author labels (timeline start/end/time/cue point, click/press/release/click outside, hover/leave, key with optional focus target, drag start/over/off/drop/end, variable change, media and animation complete, focus lost, hyperlink, slider/dial move, intersect start/end, player buttons, double and right click, on/off screen, web-object message, all timelines finished, swipe)
- Action picker: change state, show/hide layer, jump to slide/scene/previous/next viewed, lightbox and close lightbox, adjust variable, media play/pause/stop/seek, pause/resume/seek timeline, play animation or motion path, open URL/file, send email, submit interaction/all, reset/review/print results, print slide, restart/exit/complete course, bring to front, enable/disable, set focus, set volume, toggle state/hidden/disabled, send xAPI statement, execute JavaScript
- Condition builder: variables, object states and window as sources; literal, variable or property operands; operators per type; AND/OR mix; reorder, duplicate, remove; one else action once a condition exists
- Order: drag to reorder, master-first and top-to-bottom order shown, warning when a jump is not last in its group
- Disable/enable (disabled triggers are not published), copy, paste, duplicate with object, multi-select, group by event, collapse, paste conditions onto other triggers
- Shared Prev/Next/Submit/Submit All/Finish action groups with per-slide overrides
- Variables manager: true/false, text (up to 32,767 characters, may default blank), number (fixed or random range); create, rename (updates every reference), change default, copy, paste, delete; type locked
- Use count with links to each use; delete all unused in one click (JavaScript-only use counts as unused); save-for-resume flag per variable
- Read-only built-in variables: player state, elapsed time for slide/scene/project, slide/scene/menu numbering and progress
- Variable references inside any text, updated live
- Execute JavaScript action with code editor, lint and API autocomplete; scripts gathered into one file at publish
- Preview debug panel: live variable values and trigger log

**Done when**

- [ ] A 10-slide branching scenario built only with triggers, layers, states, variables and if/else behaves identically in preview and in published web output (scripted browser run)
- [ ] Renaming a variable used in 5 triggers and 3 text boxes updates all 8 references
- [ ] Deleting a variable keeps its text references and moves its triggers to unassigned (rule 20)
- [ ] A disabled trigger is absent from published course data
- [ ] The trigger log shows master triggers firing before slide triggers and same-event triggers in panel order
- [ ] Every event and action kind can be created with the keyboard only in the wizard
- [ ] Text over 32,767 characters is rejected for a text variable; an execute-JavaScript setVar call updates a variable shown in text

**Spec refs:** storyline:G1-G7, storyline:G9-G47c, storyline:H1-H9, storyline:I1-I2, storyline:C4, storyline:A16 (lightbox action), storyline:rules 1-3, 18, 20, 36-39, storyline:§7 Q1-Q2  
**Risks:** The engine's roughly 47 events and 86 actions must collapse into a manageable author vocabulary; vendor author labels are partly inferred (open questions 1-2). Panel performance with thousands of triggers. Author JavaScript is an injection surface in the server edition and needs sandboxing.

### SLD-06: Core interactive controls

Give authors ready-made buttons, choices, hotspots, text fields and links that learners can use.

**Features**

- Buttons with optional icon and built-in states
- Check boxes and radio buttons; button sets (only one member selected at a time, any object type)
- Hotspots (rectangle, oval, freeform), invisible in output, hand cursor on by default with an off switch
- Data-entry fields: text or numeric, prompt text, optional character limit; auto-created variable and store-on-focus-lost trigger; deleting the field deletes both
- Hyperlinks in text that run any trigger action, with click and hover events
- Accessible names and keyboard operation by default for every control

**Done when**

- [ ] Inserting a numeric data-entry field creates a number variable and trigger; typing 42 and tabbing away sets it to 42 in preview
- [ ] Deleting the field removes its variable and trigger
- [ ] A hotspot covered by another object does not receive clicks
- [ ] Radio buttons in a set move with arrow keys and are exposed as a radio group in the accessibility tree
- [ ] A hyperlink fires its action in preview and in published output

**Spec refs:** storyline:C5, storyline:C21, storyline:C24, storyline:C25, storyline:L8, storyline:rules 16, 19, 20  
**Risks:** Low; mainly consistent focus handling across controls and layers.

### SLD-07: Audio and video on slides

Put narration, music and video on slides and control how they play.

**Features**

- Import audio and video from file or the media library; embed video from a website embed code; unsupported formats transcoded on import
- Audio sets the slide timeline length; audio and video appear as timeline rows
- Video start: when the timeline reaches it, on click, or by trigger; optional pause on click
- Video controls: accessible dark or light controls, or none; poster image; relative volume 50 %, 100 %, 150 % or mute
- Video can open in a new browser window instead of on the slide
- Background audio with its own learner on/off toggle and volume variable
- Media library: reuse, replace everywhere, usage list, remove unused

**Done when**

- [ ] A slide with narration, a click-to-start video and background audio previews with all three controllable; timeline length equals narration length
- [ ] Replacing a library media file updates every slide that uses it
- [ ] The learner background-audio toggle mutes only background audio
- [ ] A MOV file is transcoded to a web format on import with progress and cancel

**Spec refs:** storyline:C10 (file, media library, embed), storyline:C11, storyline:C12, storyline:C14, storyline:C17 (import), storyline:C18, storyline:E3  
**Risks:** Codec licensing via the bundled ffmpeg build; large media uploads and streaming in the server edition.

### SLD-08: Graded question slides, feedback and result slides

Build scored quizzes with feedback, branching and a result slide that reports to the LMS.

**Features**

- Graded form-based types: true/false, multiple choice (up to 10), multiple response (up to 10), fill-in-the-blank (up to 10 accepted answers), word bank, matching drag-and-drop, matching drop-down, sequence drag-and-drop, sequence drop-down, numeric (value, range or combination), hotspot (rectangle, oval, freeform)
- Edit questions in a form view or directly on the slide
- Per question: shuffle answers, points, attempts, feedback none / by question / by choice, try-again feedback when attempts exceed 1
- Feedback layers (correct, incorrect, try again) created from a built-in accessible feedback layout; can hold text, images, audio and video
- Branching per outcome: next slide, last viewed slide, a scene, a slide, or a result slide
- Graded result slide: chosen questions, passing percentage, purpose (final assessment, pre-check, knowledge check), round scores, success and failure layers, score placeholders
- Result slide buttons: review (optionally only wrong answers), retry (optionally only wrong answers), print results (optionally asks learner name)
- Auto-created result variables: score points and percent, pass points and percent
- Each question reports to one result slide with LMS interaction id, label, reported type, maximum points and tracked flag
- Quiz names limited to letters, digits and underscores

**Done when**

- [ ] Each of the 11 graded types answered correctly and incorrectly in preview yields the expected points and feedback layer
- [ ] A published SCORM 2004 course in Moodle records one interaction per question with correct type and learner response, and the score and pass/fail match the result slide
- [ ] Retry clears answers and reruns the quiz; review marks correct and incorrect answers
- [ ] Every graded type, including drag-and-drop, can be completed with the keyboard only
- [ ] A pre-check quiz reports only a pass; a knowledge check reports nothing
- [ ] Viewed but unanswered questions count as wrong

**Spec refs:** storyline:J1, storyline:J5-J13, storyline:J20 (graded), storyline:J21, storyline:J22, storyline:J24, storyline:J25, storyline:J27, storyline:J28, storyline:J30, storyline:A13 (default feedback layout only), storyline:H4 (result variables), storyline:rules 21, 22, 34  
**Risks:** Keyboard-operable drag-and-drop goes beyond the vendor (known gap L14) and needs its own design; interaction reporting varies between LMSs.

### SLD-09: Player designer

Let authors design the frame around the slides: menu, tabs, controls, colours, text labels, resume and window size.

**Features**

- Features: title (up to 80 characters), logo and cover photo with alt text, sidebar left or right or collapsed, menu/glossary/notes/resources tabs in sidebar or top bar, custom top-bar tabs that run an action
- Controls: volume, seekbar free / read-only / read-only until viewed, play/pause, replay, captions, playback speed 0.25x-2x, full screen, search, accessibility settings; Prev/Next/Submit as icons or text; Submit All and Finish buttons
- Chromeless mode (all features off)
- Menu editor: built from scene and slide titles; rename, add headings, reorder, indent with collapsible groups, delete and re-insert, reset; navigation free / restricted / locked; restrict Prev/Next; wrap titles, tooltips, auto-collapse, numbering, result icons
- Resources: titled links or attached files copied into the package
- Glossary: term and definition, always alphabetical, CSV import and export (optional Term/Definition header, blank rows skipped, keep or delete prompt for terms missing from the file)
- Colours, fonts, button styles, two focus-indicator colours, page background colour
- Text labels: every player string editable, built-in label sets per language, right-to-left
- Resume on restart: prompt, always or never, with editable prompt text
- Browser and size: open in new window, hide browser controls, allow resize, scale to fill / lock at slide size / lock but fit; restrict phone and tablet orientation
- Save as a named reusable player and apply it to other projects
- Live frame preview with the real player in desktop and phone layouts

**Done when**

- [ ] Toggling each feature changes the published frame and its outer size by the fixed increments of rule 28
- [ ] Restricted menu lets the learner open only viewed slides and the current one; locked allows only the designed order
- [ ] A 100-term glossary CSV imports sorted; re-import updates definitions and prompts for missing terms
- [ ] Switching the label set to Arabic mirrors the frame in preview
- [ ] A named player saved in project A and applied to project B yields the same frame
- [ ] With resume set to prompt, relaunching in an LMS shows the resume prompt and returns to the saved slide

**Spec refs:** storyline:K2-K11, storyline:K14-K23, storyline:E9, storyline:A17 (notes tab), storyline:O5, storyline:rules 27, 28, 35  
**Risks:** The frame itself is shared engine; the designer must configure it, never fork it. Built-in label sets for many languages need translation contributions.

### SLD-10: Accessibility authoring and captions

Let authors make courses that keyboard and screen-reader users can take, and check them before publishing.

**Features**

- Alt text on every object with a length check that flags 151+ characters; exclude-from-screen-reader toggle (also on timeline rows)
- Per-slide focus order editor covering base and layer objects, with reset to visual order
- Dialog layer title and description pickers
- Closed captions per audio or video: import SRT, VTT, SBV, SUB keeping bold/italic/underline and speaker tags; built-in caption editor with timing; export per media or all at once
- Caption styling: font, size, placement, background and text colours, optional text shadow
- Learner accessibility options: keyboard shortcuts on/off, skip navigation and back-to-top (on by default), accessible text, zoom mode
- Warning when an author key trigger replaces a built-in Ctrl+Alt learner shortcut on a slide
- Accessibility checker against WCAG 2.1 AA rules (missing or long alt text, contrast, focus order gaps, missing captions, untitled dialogs, time limits), grouped by scene with thumbnails, sortable, jump to issue

**Done when**

- [ ] A reference course passes automated axe checks with no serious or critical issues and a scripted manual run with NVDA and VoiceOver through navigation, layers, questions and player
- [ ] Captions in each of the four formats round trip without losing styling tags or timing
- [ ] The focus order set in the editor is the Tab order of the published slide
- [ ] The checker flags a 160-character alt text and an untitled dialog layer and jumps to each

**Spec refs:** storyline:L1-L4, storyline:L5-L9 (author toggles), storyline:L10 (import, editor, export), storyline:L11, storyline:L12, storyline:B8, storyline:C32, storyline:rule 26  
**Risks:** Real assistive-technology testing needs manual runs on several OS and screen-reader combinations; no conformance claim without them.

### SLD-11: Preview and publish to web and LMS

Preview any slide, scene or the whole course with the real player and publish it as a web folder or a tracked LMS/LRS package.

**Features**

- Preview slide, scene or project in the real player with restart, jump to slide, variable inspector and trigger log
- Publish scope: whole project, one scene or one slide
- Web publish: launch page plus course folder; open, zip, open folder
- LMS publish: SCORM 1.2, SCORM 2004 (2nd, 3rd, 4th edition), xAPI, cmi5
- LMS metadata: title (up to 80), description, author, email, website, duration, date, version, keywords, thumbnail, identifier kept stable across republishes, SCORM lesson title and id
- xAPI: activity id, optional separate launch URL, language code; LRS credentials supplied at launch or stored in the package (with a warning)
- Tracking: slides viewed (count or percent, all or numbered slides), quiz result, completion trigger; several criteria, first met is reported; status wording pair
- Quality: adaptive or static video with compression, audio bitrate (default 56 kbps) with optional loudness normalisation, JPG quality (default 100 %)
- Desktop publishes to a local folder; server builds a downloadable zip
- Publish report: size, missing media, unassigned triggers, accessibility issues

**Done when**

- [ ] A reference course published as SCORM 1.2, SCORM 2004 4th, xAPI and cmi5 launches, tracks completion, score and interactions, and resumes correctly in Moodle and in the conformance-corpus cmi5 and LRS harnesses
- [ ] Republishing after edits keeps the same package identifier and the LMS keeps learner records
- [ ] Preview and published output produce identical screenshots for every conformance-corpus slide
- [ ] The published package makes no network requests beyond its own files, the LMS API and the configured LRS
- [ ] Web output opened from the local file system shows a clear notice that it needs a web server

**Spec refs:** storyline:P1 (web, LMS), storyline:P2-P10, storyline:P11 (open, zip, folder), storyline:P16, storyline:P17, storyline:§4 Published web package, storyline:§4 Published LMS package, storyline:rules 23-25, 40-42  
**Risks:** LMS quirks; SCORM 2004 sequencing defaults and the cmi5 course structure are not confirmed from unedited samples (open question 8).

### SLD-12: Masters, themes, templates and content library

Keep course design consistent and fast with slide masters, feedback masters, themes, templates and a library of original media.

**Features**

- Slide masters: several per project; layouts inherit from a master and can be customised; placeholders for content, text, picture, character, video, web object and optional title
- Master objects show on every layout and slide that uses them; a layout can hide master graphics
- Rename, duplicate, preserve or delete unused masters and layouts; usage list with links to each slide
- Master-level triggers (fire before slide and layer triggers) and master animations
- Colour and font themes: save and share as files; built-in themes locked
- Feedback masters: correct, incorrect, try again, review, thank-you layouts that borrow colours and fonts from the host slide; accessible default
- Templates: save a project as a template, new project from template, basic layout slides
- Content library from our own library repo: photos, illustrations, icons, video, and illustrated and photographic characters with poses, perspectives and expression states switched by triggers

**Done when**

- [ ] Editing a master object updates every slide that uses its layouts
- [ ] A master trigger fires before a slide trigger on the same event (trigger log)
- [ ] A theme file exported from project A restyles project B
- [ ] Deleting a master in use is blocked and shows its usage list
- [ ] A character with 3 expressions switches expression by trigger in preview

**Spec refs:** storyline:A6 (layouts, templates), storyline:A7-A13, storyline:C7 (library), storyline:C8, storyline:C10 (content library video), storyline:D6, storyline:F1 (masters, feedback masters), storyline:rule 1  
**Risks:** Inheritance and override rules are intricate; original characters and media need artists and a separate asset pipeline.

### SLD-13: Advanced design: rich objects and motion

Add the richer drawing, text and motion tools power authors expect.

**Features**

- Tables, symbols, accessible math equations, slide-number fields
- Merge shapes into custom shapes; precise corner radius values
- Find and replace text across the project; replace fonts all at once or one by one
- Quick styles and picture formatting
- Emphasis animations, any number per object, including tilt, bounce, rotate, float and a low-motion option
- Motion paths: lock to slide or move with object, easing at each end with strength, reverse, relative start for chained paths, orient to path, precise start and end points; default 2 s
- Animation painter
- Animations on states, masters and feedback masters

**Done when**

- [ ] An equation authored in the editor is read correctly by NVDA and VoiceOver in the published course
- [ ] A relative motion path triggered 3 times moves the object 3 steps in preview
- [ ] Replace font across a 50-slide project changes every matching run and nothing else
- [ ] A merged shape publishes as one vector outline

**Spec refs:** storyline:C1 (tables, symbols, equations, slide numbers), storyline:C2, storyline:C3 (find/replace, replace fonts), storyline:C6 (quick styles, picture formatting), storyline:F1-F2 (emphasis, motion), storyline:F4-F6, storyline:F8, storyline:J13 (equations)  
**Risks:** Boolean shape operation precision; accessible math rendering inside an SVG-drawn slide.

### SLD-14: Advanced interactive objects

Add sliders, dials, markers, scrolling panels, web objects, zoom regions and 360-degree images for richer interactions.

**Features**

- Sliders: start and end from -9999 to 9999 (defaults 0 and 10), initial value, step (default 1), up to two decimals; bound number variable updated while dragging or on release; arrow-key operation
- Dials: built-in or converted from any picture, shape or text; arc 0.01 to 9999 degrees; start, end, initial, step; bound number variable
- Markers: icon plus pop-up label (title, description, one picture or video, audio); title on hover and full label on click, or all on hover; pulse by default; keyboard accessible
- Scrolling panels: vertical only; may hold text, shapes, pictures, characters, video and web objects; no nesting and no master placeholders
- Web objects: URL or local folder with an index page; on the slide or in a new window; load automatically or on click; send and receive messages with the slide
- Zoom regions on the base layer timeline only; chained for panning; copy across slides
- 360-degree images with markers and invisible hotspots, free or guided tour, camera controls, total and visited counter variables

**Done when**

- [ ] A slider moved by mouse and by arrow keys updates its variable within range and step
- [ ] Adding a zoom region on a non-base layer, or a scrolling panel inside another, is blocked with a message
- [ ] A local web-object folder is copied into the published package and a message it posts fires the matching trigger
- [ ] The 360-degree visited counter reaches the total once every marker is opened, by mouse or keyboard

**Spec refs:** storyline:C22, storyline:C23, storyline:C26-C30, storyline:H4 (slider, dial, 360 variables), storyline:L9, storyline:G24e, storyline:G40, storyline:rules 14, 15, 17, storyline:§7 Q10-Q11  
**Risks:** Keyboard behaviour inside dials, scrolling panels and 360-degree images is not specified (open question 10), so we define our own. Web objects run arbitrary pages and must be sandboxed in the server edition. 360-degree images can slip to a later release without blocking the rest.

### SLD-15: Advanced quizzing: survey, freeform, banks and combined results

Complete the quiz toolset with survey questions, any-object questions, randomised question banks, timers and multi-quiz results.

**Features**

- Survey types: Likert (built-in accessible scale, up to 10 statements and 10 points), pick one, pick many, which word, short answer (256 characters), essay (5,000 by default, adjustable), ranking drag-and-drop, ranking drop-down, how many
- Freeform questions from any slide objects: drag-and-drop, pick one, pick many, text entry, hotspot, shortcut key
- Drag-and-drop options: snap to target, return to start if dropped off target, several items per target, drop offsets, drag-over highlight, delay drop states until submit
- Question banks: create, add or import slides, one bank feeds many draws; draw count, shuffle, per-question always/never/random, lock to neighbour or to top/bottom; a draw shows as one slide in story view, slide view and menu
- Result slides: survey, blank, and combined (must pass each quiz, or pooled points against a combined passing percentage); score viewed questions only
- Quiz timer in minutes with countdown display options and built-in expiry prompt; timer start, pause, reset, show, hide actions
- Limit quiz attempts; submit all answers at once with a confirm step
- Several tracked quizzes: the first final status stays latched until that quiz is retried
- Question import from a spreadsheet (first worksheet) or text file: type codes, points -1000 to 1000, up to 10 answers, correct markers, per-answer feedback, comments ignored, errors listed before import

**Done when**

- [ ] A 20-question bank drawn 5 at a time gives a new set per retry, and a resumed learner sees the same drawn order
- [ ] Freeform drag-and-drop with delay drop states shows Drop Correct only after Submit
- [ ] A combined result requiring pass-each reports failed when one quiz fails even though the pooled percentage passes
- [ ] A 50-question spreadsheet with 2 bad rows lists both errors before import and then imports 48 questions
- [ ] Timer expiry shows the built-in prompt and ends the quiz

**Spec refs:** storyline:J2-J4, storyline:J14-J19, storyline:J20 (survey, blank, combined), storyline:J23, storyline:J24 (viewed only), storyline:J26, storyline:J29, storyline:J31, storyline:G36, storyline:D5 (delay drop), storyline:O4, storyline:rules 8, 24, 30, storyline:§7 Q9  
**Risks:** Details of delay drop states, attempt limits and submit-all are not specified (open question 9); resume data size with large banks under the SCORM 1.2 limit.

### SLD-16: Media tools, narration and video/handout output

Record, edit and voice media inside the app, and publish a course as an MP4 video or a Word handout.

**Features**

- Record microphone audio and webcam video
- Audio editor; export MP3 or WAV
- Video editor: trim, crop, volume, brightness, contrast, logo/watermark; export MP4/WebM or one frame as PNG
- Screen recording (desktop): record, insert as video or as step-by-step slides, edit, export, delete
- Text-to-speech narration through the user's own provider key or a local model: preview voices, several voices per slide, pronunciation via respelling and SSML (rate, pronunciation, pauses), provider character limits shown, captions generated with the narration, script and voice editable later, narration replaceable while keeping captions
- Voice manager: where each voice is used, quick voice swap, speed
- Narration generated from slide notes; AI sound effects
- Caption generation from speech (single, batch, or on import) with a local model or own key
- Video publish: one MP4 at 1080p, 720p, 540p or slide size, four quality levels, 30 fps, up to 2 hours, follows Next actions or slide order, captions burned in, no player frame
- Word publish: DOCX with base-layer screenshots, optional layer screenshots and notes, medium or large images

**Done when**

- [ ] A 10-slide narrated course publishes to an MP4 at 30 fps whose length equals the sum of slide timelines within 0.5 s
- [ ] The DOCX handout opens in Word and LibreOffice with one screenshot per slide plus notes
- [ ] Text-to-speech and caption generation work fully offline on desktop with a local model
- [ ] A trimmed video keeps its captions aligned to the new start
- [ ] A screen recording inserted as step slides creates one slide per recorded step

**Spec refs:** storyline:C10 (webcam), storyline:C13, storyline:C17 (record, TTS, AI voices and effects, editor, export), storyline:C19, storyline:M1-M6, storyline:L10 (AI captions), storyline:P1 (video, Word), storyline:P12, storyline:P13, storyline:rules 29, 31  
**Risks:** Screen recording with step capture differs per OS (macOS permissions); local TTS and speech-to-text quality; ffmpeg build licensing; video rendering on the server needs headless browser workers. Screen recording can slip to later without blocking the rest.

### SLD-17: Import: PowerPoint, other projects and .story files

Bring existing content in from PowerPoint decks, other slide projects and the vendor's project files.

**Features**

- PowerPoint import without PowerPoint installed: choose slides, new or existing scene; text, shapes, pictures, tables, notes, masters and layouts mapped; animations and transitions converted; narration from a companion audio file
- Import slides from another project: choose by scene, destination scene options, masters and variables carried over with renaming on name clashes, optional caption generation for uncaptioned media
- .story import (phase 6): read the vendor container and map scenes, slides, layers, objects, states, triggers, variables, questions, banks, masters, player settings including glossary, and embedded media
- Import report for every path listing anything not mapped or approximated

**Done when**

- [ ] A 30-slide reference PowerPoint deck imports with editable text, positions within 2 px and entrance animations mapped to equivalents
- [ ] Importing slides whose variable name already exists in the target creates a renamed variable and updates all references
- [ ] A community sample .story file from the test corpus imports every scene and slide, and the report lists every unmapped item; nothing is dropped silently

**Spec refs:** storyline:O1, storyline:O3, storyline:F9, storyline:§4 Other formats (.story, PPTX), storyline:§7 Q7  
**Risks:** The internal XML of .story parts is undocumented (open question 7); the study team must deliver a spec from public sample files before build. PowerPoint fidelity for SmartArt, charts and complex animations varies.

### SLD-18: Translation and multi-language courses

Translate a course by file round trip, or keep several languages in one project with AI translation and a learner language picker.

**Features**

- Export text as XLIFF 1.2 or 2.0 (with source language) or as a Word table (optional thumbnails, or one big table); variables inside text exported as values
- Import a translation into a copy of the project; bold, italic, underline, strike, superscript and subscript survive
- Documented exclusions from export: captions (own files), trigger conditions, player labels, variable names
- Multi-language projects: add languages; AI-translate slide text, captions, narration and text variable values with own key or local model; switch language in the editor
- Terminology glossary per translation
- Layout issue finder for overflowing text with one-click fixes
- Per-language media, timing and resources; language condition on triggers; mixed left-to-right and right-to-left
- Only changed source segments are retranslated
- Learner language drop-down on the start screen and picker in the player, each language shown by its own name; choice saved in resume data

**Done when**

- [ ] XLIFF 2.0 export, external translation and import produce a copy with all slide text translated and formatting intact on the corpus course
- [ ] A 3-language project publishes one package; the learner switches language live and the choice survives resume
- [ ] Editing one source text box marks only that segment for retranslation
- [ ] The overflow finder lists boxes that overflow in German and fixes them

**Spec refs:** storyline:N1-N8, storyline:G48, storyline:H9, storyline:K9 (label sets), storyline:K25, storyline:§4 XLIFF and Word table, storyline:§6 translation service, storyline:§7 Q6  
**Risks:** Per-language overrides on every object must be in the schema early or retrofitting is costly; AI translation quality depends on the chosen provider; whether browser language pre-selects the course language is unknown.

### SLD-19: Team collaboration: co-editing, review and learning portal

Let teams co-edit slide projects, share slides, collect review comments and publish to their own learning portal; desktop authors get a review-copy round trip.

**Features**

- Server: slide projects stored on the company server with roles from server core
- Server: live co-editing of one slide project with presence and per-object selection, conflict-free edits to objects, layers, states and trigger order, offline catch-up
- Server: team slide library: publish slides to a shared library, browse and insert
- Server: publish to Review as a new item or new version for project, scene or slide; password; comments on/off; optional project-file backup; size limit set by the admin
- Server: integrated review comments in the editor per slide with screenshots, replies, resolve/reopen, copy text or images into the slide; switch between linked review versions
- Server: translation validators review a language version in Review and accepted suggestions re-import
- Server: publish to Reach as SCORM 2004 4th edition plus optional xAPI statements to the server LRS; admin approval before learners are enrolled
- Desktop: export a review copy and import the reviewer comments file into the editor per slide

**Done when**

- [ ] Two authors editing different objects on the same slide see each other's changes within 1 s and both edits survive; concurrent trigger reorders converge to the same order
- [ ] Publishing a new version to Review keeps the same review link and earlier comments stay reachable through linked versions
- [ ] A comment resolved in the editor shows as resolved in Review
- [ ] A course published to Reach waits for admin approval and then tracks enrolled learners
- [ ] A desktop review copy commented offline imports its comments onto the right slides

**Spec refs:** storyline:Q1-Q3, storyline:P1 (review, portal), storyline:P14, storyline:P15, storyline:A6 (team slide library), storyline:N5, storyline:§6  
**Risks:** Depends on server phases 3 and 4; mapping ordered trigger lists and nested states onto Yjs without surprising merges; large media in shared projects.

### SLD-20: AI assistant and generative tools

Let authors build and change courses by chatting, and generate quizzes, images, alt text and code, using their own AI key or a local model.

**Features**

- Chat assistant acting on the document: add, rename, reorder, delete scenes and slides; manage layers, variables, triggers, shapes, animations, captions, voiceovers, images, theme colours and masters; each change shown and undoable
- Quiz generation from slide content with a summary linking to source slides
- AI image generation and editing: aspect ratio, combine two images, enhance
- Suggested and bulk alt text
- JavaScript generation for entrance animations and interactions
- AI avatar presenter videos for video or character placeholders through a pluggable provider
- Provider settings: own key on desktop, company-wide key on server, or local model; nothing is sent without a configured provider

**Done when**

- [ ] Asking the chat to add a scene with 3 slides and a quiz creates schema-valid content that one undo removes
- [ ] Bulk alt text fills every image lacking alt text with at most 150 characters each, flagged for author review
- [ ] With no provider configured, AI features are disabled and no network call is made
- [ ] A generated quiz links each question to its source slide

**Spec refs:** storyline:A18, storyline:B14, storyline:C9, storyline:C20, storyline:G8, storyline:H10, storyline:I8, storyline:J32, storyline:L2 (AI alt text), storyline:Q4  
**Risks:** Output quality varies widely across providers and local models; imported content can inject instructions into tool calls; avatar video providers are commercial services.

### Deliberately out of scope

- Classic player style (K1, second style): a legacy look the vendor keeps for old courses; we ship one modern frame with layout options, and .story import maps classic settings onto it
- AICC publishing (P5): legacy standard with no public samples examined (open question 8) and little modern LMS demand; deferred, and the LMS bridge stays extensible so it can be added on request
- Importing embedded quiz and interaction files from the vendor's other apps (O2): proprietary undocumented formats that clean-room rules give us no way to study
- Opening very old version-1 vendor project files (O6): the vendor itself no longer opens them; .story import targets current files only
- Vendor-hosted review and learning-portal quotas such as 5 GB per project (P14, P15): we host nothing; self-hosters set their own limits on their server
- Email-zip and FTP upload after publish (P11): emailing a zip cannot be done reliably from a desktop app and plain FTP is insecure; authors use their own tools (SFTP upload may be reconsidered later)
- Vendor's eight-word output folder name limit (P17): an implementation quirk; we only enforce file-system-safe names
- Cloud-only text-to-speech that requires an internet connection (M7) and the vendor's fixed character limits (M3, rule 31): replaced by the user's own provider or a local model, with that provider's limits shown
- Vendor 'course loaded' analytics posted from published courses: deliberately not reproduced; our player sends no telemetry, and any analytics must be opt-in and self-hosted
- Compatibility with vendor learner resume data (open question 4): not a goal; we use our own resume format
- Vendor content-library assets, characters, templates, themes and icons: never shipped under clean-room rules; original assets come from our own library repo (SLD-12)
- Matching the vendor's internal event and action identifiers or exact author labels (G24h, G42, open question 1): we reproduce behaviour with our own vocabulary
- Desktop-to-server sync of slide projects: covered by the suite-wide phase 8 sync work, not a Slides epic
- A separate mobile player or app (P16): the same responsive published output adapts to phones and tablets

## Blocks app (responsive course builder)

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| BLK-01 | Authoring shell, project files and dashboard | mvp | both | L | M2 | phase 0: desktop shell, installers and CI, shared: course format, shared: desktop project container |
| BLK-02 | Course outline, lessons and microlearning structure | mvp | both | M | M2 | BLK-01, shared: course format |
| BLK-03 | Block editing core and common block settings | mvp | both | L | M2 | BLK-02, shared: course format, shared: blocks player module, shared: real-player preview harness, shared: theme tokens and contrast |
| BLK-04 | Text and static content blocks | mvp | both | L | M2 | BLK-03, BLK-05, shared: blocks player module |
| BLK-05 | Media handling and media blocks | mvp | both | L | M2 | BLK-03, shared: media pipeline, shared: oEmbed resolver |
| BLK-06 | Core interactive blocks | mvp | both | L | M2 | BLK-03, BLK-05, shared: blocks player module, shared: progress engine |
| BLK-07 | Knowledge checks and quiz lessons | mvp | both | L | M2 | BLK-02, BLK-03, BLK-05, shared: quiz runtime, shared: LMS bridge |
| BLK-08 | Completion gating and navigation settings | mvp | both | M | M2 | BLK-03, BLK-06, shared: progress engine, shared: blocks player module |
| BLK-09 | Theme and appearance | mvp | both | L | M2 | BLK-03, BLK-05, shared: theme tokens and contrast, shared: blocks player module |
| BLK-10 | Responsive preview and LMS/web export | mvp | both | M | M2 | BLK-02, BLK-08, shared: real-player preview harness, shared: exporters, shared: LMS bridge |
| BLK-11 | Additional parity blocks: scenario, sorting, timeline, chart, math | v1 | both | XL | M2b | BLK-03, BLK-05, BLK-08, shared: blocks player module, library repo: original characters and backgrounds |
| BLK-12 | Embedded project blocks: code block and slide-app block | v1 | both | M | M5b | BLK-03, BLK-08, BLK-10, shared: code-block sandbox protocol, shared: slide-app embedding, slides app: published package format |
| BLK-13 | Custom block canvas | v1 | both | XL | M5c | BLK-03, BLK-05, shared: canvas object model, shared: course format |
| BLK-14 | Reuse libraries: block templates, question banks and brands | v1 | both | L | M3c | BLK-03, BLK-07, BLK-09, server core: accounts and team areas (Teams backlog) |
| BLK-15 | Snapshots and version history | v1 | both | M | M2b | BLK-01, BLK-10, shared: course format |
| BLK-16 | Text labels and manual translation | v1 | both | M | M2b | BLK-01, shared: label sets, shared: XLIFF 1.2 |
| BLK-17 | Live co-authoring and course roles | v1 | server | XL | M3 | BLK-03, server core: accounts, roles, projects (Teams backlog), shared: course format (Yjs mapping) |
| BLK-18 | Sharing and hand-offs: share links, Review, portal, send a copy, PDF | v1 | both | L | M4 | BLK-10, BLK-15, shared: PDF exporter, Review backlog: publish intake, Reach backlog: course intake |
| BLK-19 | AI-assisted authoring in the blocks editor | v1 | both | L | M6b | BLK-03, BLK-05, BLK-07, BLK-11, BLK-13, shared: AI provider layer, Localization+AI backlog |
| BLK-20 | Survey block and response collection | later | both | M | LATER | BLK-03, server core: accounts and storage, shared: LMS bridge |

### BLK-01: Authoring shell, project files and dashboard

Let an author create, open, save, find, duplicate, move and delete courses and microlearning items in either edition.

**Features**

- New course or microlearning from blank or from our own placeholder templates (library repo, original content only)
- Desktop: one project per file on disk; open, save, save as, recent list, autosave with crash recovery
- Server: the same editor in the browser over the server project store (personal area; team folders come from the Teams backlog)
- Dashboard: grid or list view, search by title, sort by created, updated or title (remembered), filter by content type
- Cards show cover, title, lesson count and last modified
- Duplicate a whole course (new ids, media copied)
- Delete to a Deleted area; restore returns the item to its original folder, or to the personal area if that folder is gone
- Move items between personal folders
- Course details: title, rich-text description, source language code (default en-US)
- Schema version check on open: older files upgraded through shared migrations, newer files refused with a clear message and left untouched

**Done when**

- [ ] A course created, saved, closed and reopened on Windows, macOS and Linux yields identical course JSON on all three
- [ ] Killing the app mid-edit loses at most 10 seconds of work and the next launch offers recovery
- [ ] With 500 items on the dashboard, search, sort and type filter each return in under 300 ms
- [ ] A deleted course restored from Deleted reappears in its original folder with all lessons and media
- [ ] Opening a file written by a newer schema version shows an error and the file's bytes are unchanged
- [ ] A duplicated course shares no ids with its source and editing one never changes the other

**Spec refs:** rise.md 2 Flow 1, rise.md 3A, rise.md 3J (duplicate course), teams-collab.md K3, K4, K10, K11  
**Risks:** The project file becomes a long-term compatibility contract and must carry stable ids for phase 8 sync from day one. MVP is ten epics (BLK-01 to BLK-10, mostly L): the 4-6 week phase-2 estimate holds only with about four agent teams working in parallel.

### BLK-02: Course outline, lessons and microlearning structure

Let the author build and reorder the list of lessons, quiz lessons and section headers that make up a course or microlearning item.

**Features**

- Outline entries: blocks lesson, quiz lesson, section header (title only, holds no blocks, groups the lessons below it)
- Add, rename, delete and reorder entries by drag or by keyboard
- Lesson fields: title, optional description, type icon, optional header image, per-lesson author avatar override
- Course author byline: choose which author is shown, or hide it
- Duplicate a lesson in place
- Copy a lesson to another existing course; it lands at the bottom of that course's outline
- Stable entry ids created once and kept through reorder, rename and every publish; copies get new ids
- Microlearning: exactly one lesson, no quiz lessons or quiz blocks, continuous or stepped mode switchable

**Done when**

- [ ] Reordering with the keyboard alone works and each move is announced to screen readers
- [ ] Lesson ids are unchanged after reorder, rename and re-export, so a lesson deep link from one export still opens the same lesson in the next
- [ ] A lesson copied to another course appears last in that outline, with new ids and its media copied
- [ ] A microlearning item offers no quiz entry, and pasting a quiz lesson into it is refused with a message
- [ ] Deleting a lesson can be undone in one step

**Spec refs:** rise.md 3A, rise.md 3B, rise.md 4 Entry, rise.md 5.16, teams-collab.md H12  
**Risks:** Lesson deep links depend on ids never being regenerated by import, copy or sync code paths; needs a regression test owned by the shared course format.

### BLK-03: Block editing core and common block settings

Give every block one shared way to be inserted, edited in place, styled, moved and undone, so later block epics add only their own content.

**Features**

- Categorised block library panel with variants and search; insert between any two blocks
- In-place rich-text editing (HTML fragments) with emphasis, links, lists and adjustable heading levels
- Block toolbar: duplicate, delete, move up or down, drag to reorder
- Manage-blocks panel: select several blocks to copy, move or delete, including into another lesson or another course
- Switch a block to another variant of its category when content shapes match, with a warning before anything is dropped
- Common settings: top and bottom padding (linked or separate); background none, colour, or image with light or dark overlay and opacity; card style; content width from narrow to full
- Accent colour override per block with automatic, light or dark text contrast
- Course-wide entrance animation toggle, on by default for non-text blocks
- Connect a block to the next so both show in one step (stepped microlearning only)
- Undo and redo for every editor action
- Each block previews inline through the real player renderer
- Block-type plugin contract: inspector schema, default content, variant mapping, completion capability

**Done when**

- [ ] Every block type in BLK-04 to BLK-13 registers through the plugin contract without edits to core editor files
- [ ] A property test of 100 random edit sequences followed by full undo returns the original document
- [ ] Variant switch keeps title, text and media wherever the target variant has the same fields
- [ ] For a sweep of 1,000 custom accent colours, automatic contrast keeps block text at 4.5:1 or better
- [ ] Five blocks moved to another course keep their order and their media
- [ ] Every editor action, including drag-to-reorder alternatives, can be performed with the keyboard alone

**Spec refs:** rise.md 2 Flow 3, rise.md 3C (intro), rise.md 3D, rise.md 3J (undo, redo, copy/move blocks), rise.md 5.18  
**Risks:** Rich-text editor choice and its HTML output shape the stored format; must normalise once at the editor boundary. Co-editing (BLK-17) later requires the same operations to map onto Yjs, so the edit model should be designed for it now.

### BLK-04: Text and static content blocks

Provide the everyday reading blocks: text, tables, statements, quotes, lists, images, galleries and dividers.

**Features**

- Text: paragraph, paragraph with heading, paragraph with subheading, heading, subheading, two-column text
- Paragraph text width setting and multi-column option
- Table with cell padding, table width and accent colour options
- Statement: four visual styles plus a note style
- Quote: four styles, quote on an image, quote carousel
- List: numbered, bulleted, checkbox (checkbox list can be a continue requirement)
- Image: centred, full-width, image with text, text on image, banner; zoom on click; alt text or decorative flag
- Gallery: carousel; two-, three- and four-column grids (carousel can be a continue requirement)
- Divider: plain, numbered, spacer

**Done when**

- [ ] Every variant renders at 375, 768 and 1280 px in the real player with no horizontal page scroll (visual snapshot tests)
- [ ] An image with no alt text raises an editor accessibility warning unless marked decorative
- [ ] Quote carousel and gallery carousel are keyboard operable and announce the current position
- [ ] Chosen heading level changes the published heading element and the page heading outline stays valid
- [ ] Checkbox list and gallery carousel emit the completion events the continue block relies on

**Spec refs:** rise.md 3C Text, Statement, Quote, List, Image, Gallery, Divider, rise.md 4 Block, Item, Rich text  
**Risks:** Options for the quote carousel are undocumented (open question 7); we define our own and record them in the spec.

### BLK-05: Media handling and media blocks

Let authors bring in images, audio, video, files and web embeds, and attach narration to any block.

**Features**

- Media picker: upload images, audio, video and files; replace; crop images; alt text
- Per-course media index with original width and height and optimised variants
- Audio block with an option to stop learners seeking forward
- Video block: upload, caption track import (WebVTT), caption editor, learner speed 0.25x to 2x (author can turn it off), stop forward seeking
- Embed block by URL resolved by our own oEmbed resolver; published output frames the provider directly
- Attachment block (downloadable file)
- Code snippet block (text-only code display)
- Block narration: attach an audio file to any block with a position setting and a transcript
- Unused media is left out of exports

**Done when**

- [ ] A 500 MB video is transcoded offline on desktop with bundled ffmpeg, with visible progress and cancel
- [ ] Caption edits show in preview immediately and ship as WebVTT inside the package
- [ ] A published embed of a video-sharing URL makes no request to any third-party embedding service (network capture test)
- [ ] With forward seeking off, audio and video cannot be skipped ahead by mouse, keyboard or media keys
- [ ] An exported package contains only media the course references

**Spec refs:** rise.md 3C Image (alt text), Multimedia, rise.md 3D (audio narration), rise.md 4 Media reference, rise.md 6 (media pipeline, embed rendering), teams-collab.md P6  
**Risks:** Codec licensing in the bundled ffmpeg build; oEmbed provider allowlist and offline authoring on desktop; disk use of large originals plus variants.

### BLK-06: Core interactive blocks

Provide the interactions most courses use: accordion, tabs, labeled graphic, process, flashcards and buttons.

**Features**

- Accordion: sections with title, text and optional media
- Tabs: panels with title, text and optional media; tab headers scroll sideways at phone width
- Labeled graphic: numbered or icon markers placed by percentage on an image; marker colour and icon; each marker opens title, text and optional media; viewed or not-viewed state announced
- Process: introduction card, numbered steps, summary card; direct step buttons plus previous/next; hide individual steps
- Flashcard grid and flashcard stack: front and back sides, each with text and optional media
- Button and button stack: label, optional description, destination (another lesson, a web address, or exit course), width and alignment
- Each block declares its completion rule for continue gating

**Done when**

- [ ] A marker placed at given x/y percentages lands on the same image point at every viewport width
- [ ] All six blocks pass axe-core with no serious or critical violations and are fully keyboard operable
- [ ] A button pointing at a lesson that is later deleted is flagged in the editor and blocks export until fixed
- [ ] Hidden process steps neither render nor count toward completion
- [ ] Each block's completion event matches the rule written for it in the spec (player end-to-end test)

**Spec refs:** rise.md 3C Interactive, rise.md 3G (blocks that can be required), rise.md 4 Item, rise.md 3N  
**Risks:** Exact per-block completion rules are unknown (open question 3); we must define and document our own. Flashcard stack options are undocumented (open question 7).

### BLK-07: Knowledge checks and quiz lessons

Let authors check understanding inside lessons and build graded quiz lessons with the full set of quiz settings.

**Features**

- Knowledge-check blocks: single choice, multiple response, fill in the blank (list of accepted answers), matching
- Knowledge-check options: require a correct answer, limit retries, reveal or hide the correct answer after a wrong answer
- Feedback by correct/incorrect or per answer choice; image, audio or video on questions
- Quiz lesson editor with an ordered list of the same four question types
- Quiz settings: passing score % (default 80); retries unlimited or a set number; require passing score to continue; skip ahead if passed (target lesson, optional learner choice); randomise question order; shuffle answers
- Reveal answers: all with feedback, none, or only the learner's wrong answers
- Correct and incorrect answer colours per quiz
- Timer toggle: default 10 minutes; remaining, elapsed or elapsed-of-total display; learner can hide it
- Include or exclude the quiz from the lesson count; finish button styled as next lesson or as a continue button
- Editor rules: skip ahead forces restricted navigation; microlearning cannot hold quizzes

**Done when**

- [ ] Turning on skip ahead switches navigation to restricted and the navigation panel says which quiz caused it
- [ ] In preview, a timer reaching zero auto-submits with unanswered questions scored wrong, and the timer resets on retry
- [ ] A quiz exported to SCORM 1.2 reports each answered question as an interaction whose id follows spec rule 11 (verified in Moodle)
- [ ] Across three attempts with falling scores, the LMS keeps the best score
- [ ] With require-passing on and retries used up, the course cannot reach completion in preview or in the LMS

**Spec refs:** rise.md 3C Knowledge check, rise.md 3I, rise.md 5.8, 5.10, 5.11, 5.14, 5.15, standards.md 4.4  
**Risks:** Quiz runtime flow (paging, results actions, retry) was never observed (open question 5); our own flow must be specified before build.

### BLK-08: Completion gating and navigation settings

Let the author decide how learners move through the course: continue blocks, menus, search, restricted order and stepped microlearning.

**Features**

- Continue block completion types: none, complete the block directly above, complete all blocks above since the previous continue block
- Editor shows which blocks may be required; buttons and attachments never can
- Continue button: label, hint text shown when the requirement is not met, colour with contrast options, width, corner radius
- Navigation type: sidebar (default), compact menu, overlay menu; sidebar starts open or closed; section groups start expanded or collapsed; navigation off
- Previous/next lesson buttons: full-width or floating; white, dark or theme colour; off for branching courses
- Course search on or off, switched off automatically when the sidebar is hidden, navigation is off or navigation is restricted
- Restricted navigation (lessons in order); allow learner manual mark-complete (free navigation only, never quizzes)
- Exit course link option
- Microlearning: continuous scroll or stepped; step indicator plain bar, numbered or hidden

**Done when**

- [ ] A continue block set to require the block above is refused when that block is a button or attachment, with an explanation
- [ ] Turning on restricted navigation disables the search and mark-complete toggles in the panel
- [ ] Preview honours each navigation type at phone and desktop widths
- [ ] Continue with all blocks above counts only blocks since the previous continue block (rule 13, player end-to-end test)
- [ ] In stepped microlearning preview, the bottom arrow first reveals the rest of a tall step, then advances (rule 17)

**Spec refs:** rise.md 3F, rise.md 3G, rise.md 5.13, 5.14, 5.16, 5.17  
**Risks:** Locked-lesson display and direct-link behaviour under restricted navigation were not observed (open question 4); we define our own.

### BLK-09: Theme and appearance

Let the author give a course its look: layout style, cover page, lesson headers, colour, contrast and fonts.

**Features**

- Layout style presets for cover page, menu and lesson headers; switching keeps colour, font and navigation settings
- Cover page layouts: full image, split, no image; cover image with crop, overlay and alt text
- Logo in three sizes (small, 1.5x, 2x) with optional square constraint
- Hide the start/resume button so learners pick a lesson; skip the cover page in published output
- Author avatar shown for all, for lessons only, per lesson, or hidden
- Lesson headers: layouts including an image style, overlay colour and opacity, height presets, hide the lesson n of m label, hide headers
- Theme colour and tint; custom colours by hex, palette or eyedropper
- Contrast modes: automatic (4.5:1), always light, always dark
- Fonts: recommended heading/body pairings; separate heading, body and interface fonts; open-licence font set
- Custom font upload (.woff; regular required, bold and italic optional) into the author's font library, usable in every course
- Block corner style and button style, rounded or square

**Done when**

- [ ] For 1,000 random theme colours, automatic contrast keeps text at 4.5:1 and theme-coloured navigation buttons at 3:1
- [ ] Changing the layout preset leaves colour, font and navigation values in the course JSON unchanged
- [ ] A course using a custom font exports a package that shows that font when opened offline
- [ ] Editing a custom font updates every course using it; deleting it returns those courses to the default font
- [ ] A skipped cover page opens the first lesson directly in both LMS and web exports

**Spec refs:** rise.md 3E, rise.md 5.18, teams-collab.md N12, N13, N14  
**Risks:** Only openly licensed fonts can ship; recommended pairings must be built from them. Brands are handled in BLK-14.

### BLK-10: Responsive preview and LMS/web export

Let the author check the course at phone, tablet and desktop widths and publish it as an LMS package or a static web package.

**Features**

- Preview the whole course or the current lesson in the real player at desktop, tablet and phone widths, with resettable simulated progress
- Export choice: LMS package (SCORM 1.2, SCORM 2004, xAPI, cmi5; AICC when the shared exporter provides it) or web-only package
- Tracking source: completion percentage (threshold default 100), quiz result (courses only), or slide-app block
- Reporting pair: passed/incomplete, passed/failed, completed/incomplete, completed/failed; unavailable pairs hidden for microlearning
- Editable package identifier for xAPI and cmi5, validated (no special characters), defaulting from the course id
- Options: exit course link, hide cover page, reset learner progress on update, hide LMS interface (SCORM 2004 only), only load inside an LMS
- Web package: static zip that opens at its index page from disk or any static host; optional hidden cover; no tracking
- Export settings remembered per course; export runs as a background job (desktop saves to a chosen folder; server builds the zip server-side and offers a download link)
- Pre-export checks: broken lesson links, missing alt text, missing media, estimated resume-data size against the SCORM 1.2 limit

**Done when**

- [ ] One sample course exported in each standard launches, resumes and reports completion and score in Moodle (SCORM) and in an open LRS and cmi5 test player (xAPI, cmi5)
- [ ] The web package opened from a local folder with networking off loads fully (rule 20)
- [ ] Preview and the exported web package match pixel for pixel at 375, 768 and 1280 px
- [ ] Re-export with reset-on-update on clears bookmark and resume data at next LMS launch (rule 12)
- [ ] An invalid xAPI identifier blocks export with a message on that field
- [ ] An exported sample course is navigable with Windows Narrator and usable with Windows Magnifier

**Spec refs:** rise.md 2 Flow 7, 8, rise.md 3M, rise.md 3N, rise.md 4 Published web package, SCORM 1.2 package, Learner state, rise.md 5.1-5.12, 5.20, 5.22, rise.md 6 (export jobs), standards.md 3.1-3.11  
**Risks:** xAPI/cmi5 statement shapes and SCORM 2004 specifics are unknown from the vendor (open questions 1, 2); we follow standards.md instead. The usage-data option is deliberately dropped (see out of scope).

### BLK-11: Additional parity blocks: scenario, sorting, timeline, chart, math

Complete the block library with branching scenarios, sorting activities, timelines, charts and equations.

**Features**

- Scenario: scenes with hidden organisational title, background and character, inherited from the previous scene
- Scenario content: dialogue (line with pose and up to three responses, each with pose and optional feedback) or text (one statement and one continue option)
- Scenario routing: next item, a chosen item, another scene, or the end; try-again on dialogue responses
- Scenario endings: built-in message or the author's own text with a start-over prompt; background blur; hide character; audio on content
- Scenario graph view that shows scenes and routes
- Sorting activity: up to four categories, text-only items up to 80 characters, instant right/wrong feedback, ungraded, first-try count
- Timeline: events in date order, each with text and optional media
- Chart: bar, line, pie, switchable; up to 12 label/value pairs; labels up to 30 characters; pie ignores negatives; per-slice colours; value on hover or focus
- Math equations in LaTeX inside text blocks

**Done when**

- [ ] The scenario editor flags orphan scenes and loops with no route to an ending before export
- [ ] Scenario completion fires on reaching any ending (player end-to-end test)
- [ ] A fifth sorting category or an 81-character sorting item is refused in the editor
- [ ] Sorting works by keyboard as well as by drag
- [ ] Each chart exposes a data table to screen readers and shows each value on keyboard focus
- [ ] LaTeX renders in an offline exported package with no external requests and with an accessible reading

**Spec refs:** rise.md 3C Interactive (scenario, sorting, timeline), Text (math), Chart, rise.md 3H Scenario, Chart, rise.md 5.19  
**Risks:** Original photographic or illustrated characters with poses are costly to produce and must come from our library repo. Timeline options are undocumented (open question 7).

### BLK-12: Embedded project blocks: code block and slide-app block

Let authors drop in their own HTML/JS projects and interactive projects from our slides app, with completion that can gate the course.

**Features**

- Code block: in-app HTML, CSS and JavaScript editor with live preview, search and replace
- Code block: upload a zip whose root holds an index page and every asset, up to 5 GB
- Code runs isolated in its own frame and can load only its own files; packages carry a separate sandbox page
- Frame messages as JSON-RPC 2.0 notifications: ready, loaded, resized, completed, error
- Optional completion requirement that unlocks a continue block
- Maximum-height setting plus automatic resize to content
- Editor notices: code blocks are not translated by XLIFF and appear as a notice in PDF
- Slide-app block: insert a project published from our slides app
- Slide-app completion by completion trigger, quiz result slide, or number of slides viewed
- Slide-app quiz can be the course tracking source, driving pass/fail and score

**Done when**

- [ ] A code block that sends the completion notification unlocks the next continue block in preview and in an exported package
- [ ] Code inside the block cannot read the course page, its storage or the LMS API (sandbox test)
- [ ] An uploaded zip without a root index page is refused with a message
- [ ] A slide-app quiz used for tracking reports passed/failed plus score whatever the reporting pair (rule 9), verified in Moodle

**Spec refs:** rise.md 3C Interactive (slide-app block), Other categories (code blocks), rise.md 3H Slide-app block, Code block, rise.md 4 Other formats, rise.md 5.9, 5.21  
**Risks:** The slide-app block waits on slides app output (phase 5); until then it is tested with a fixture package. On the server the sandbox may need a separate origin (open question 11). 5 GB uploads need resumable transfer on the server.

### BLK-13: Custom block canvas

Give authors a free-form fixed-layout canvas inside a responsive course for designs no standard block covers.

**Features**

- Canvas with background colour, border and overlay; exact pixel size or shrink to fit; suggested widths 920, 760 and 520 px
- Objects: text, shapes, lines and arrows, images, audio, video; grouping
- Per object: position, size, rotation, flip, lock, duplicate, stacking order, opacity, border, drop shadow, corner rounding, colour or gradient fill, image crop, alt text
- Screen-reader focus order set separately from visual order; objects decorative unless given alt text
- Prebuilt templates (including audio-guide templates) that replace or add to the canvas
- Stored as a custom-block document: object tree, per-language overrides, per-screen-size overrides, lock and visibility flags, asset table

**Done when**

- [ ] A 920 px canvas shrinks proportionally at 375 px with no reflow and no horizontal page scroll
- [ ] Focus order set in the editor is the order in the published accessibility tree, independent of stacking order
- [ ] Every canvas operation is undoable
- [ ] PDF export shows the canvas as a still image

**Spec refs:** rise.md 3C Other categories (custom blocks), rise.md 3H Custom block, rise.md 4 Custom-block document  
**Risks:** Must reuse the canvas model the slides app needs rather than build a second one. Object states and triggers are deferred (see out of scope; open question 9).

### BLK-14: Reuse libraries: block templates, question banks and brands

Let authors save and reuse block sets, questions and brand looks across all their courses, and share them with their team on the server.

**Features**

- Block templates: save selected blocks under a name of up to 42 characters; library available in every course
- Template library search, filter by author, sort by name or date
- Inserting a template copies its blocks, takes the course's theme fonts and keeps its own text formatting
- Templates cannot be edited after saving; private by default; share with the whole team (server only)
- Question banks: personal library (desktop local, server personal area); create, rename, duplicate, delete, restore; edit questions
- Add a knowledge check to a bank from the block
- Knowledge-check draw: one random question (with exclusions) or one fixed question
- Quiz draw: a set number of random questions or all in random order, with exclusions, mixed with fixed questions
- Bank edits reach a draw only when the author reopens it and updates it
- Brands: apply logo, colours and fonts in one step; brand colours appear as presets in every colour picker; desktop brand files; team brands on the server with an update-available banner and difference review
- Start from our own real-content course and lesson templates

**Done when**

- [ ] A template inserted into a course with different theme fonts uses the course fonts and keeps bold, size, colour and lists
- [ ] Editing a bank question leaves existing quizzes unchanged until their draw is updated
- [ ] A quiz drawing 5 of 20 questions shows a different set across attempts and reports each as an interaction
- [ ] Applying a brand overwrites course logo, colours and fonts; later per-course overrides do not change the brand
- [ ] A template name of 43 characters is refused

**Spec refs:** rise.md 3I (question banks, draws), rise.md 3J, rise.md 3E (brands), rise.md 6 (shared libraries), teams-collab.md L, M, N  
**Risks:** Team folders, bank roles, edit locks and brand-management permissions are owned by the Teams backlog; this epic must consume its contracts, not re-implement them.

### BLK-15: Snapshots and version history

Let authors save named versions, get one automatically on every publish, and preview or restore any of them.

**Features**

- Save a named snapshot on demand, only when something changed
- Automatic snapshot on every publish, export or share-link update
- History list with preview in the real player (read-only), restore, rename and delete
- Restore keeps the pre-restore state as a snapshot so nothing is lost
- Desktop: snapshots stored with the project; server: snapshot store in object storage

**Done when**

- [ ] Each export creates exactly one automatic snapshot labelled with its target and time
- [ ] Preview of a snapshot matches the export made at that moment
- [ ] After a restore, the previous state is listed as a snapshot and can itself be restored
- [ ] On the server, a restore during a live session reaches every connected editor within 2 seconds

**Spec refs:** rise.md 3J (snapshots), rise.md 6 (snapshot store), teams-collab.md J  
**Risks:** Snapshot size growth on desktop project files needs a retention or pruning rule.

### BLK-16: Text labels and manual translation

Let authors set every learner-facing interface word and translate course content through XLIFF files.

**Features**

- Label sets: every learner-facing string, including screen-reader strings, from a named set with a language code
- Built-in label sets per language; create custom sets; edit on screen or by XLIFF export and import
- Edits to a set affect every course using it (desktop author library; server team library)
- Choosing a label language also localises the video player
- Manual translation: duplicate the course per language, export XLIFF 1.2 with or without HTML formatting, translate, import into the same duplicate
- An XLIFF file from another course is rejected
- Source language code setting (default US English)
- Editor lists what is not covered by manual XLIFF: code blocks, survey blocks, question-bank questions; left-to-right languages only

**Done when**

- [ ] Export, pseudo-translate by script and re-import: every translatable string changes and the course structure does not
- [ ] Importing an XLIFF from another course is refused and names that course
- [ ] Exported XLIFF validates against the XLIFF 1.2 schema
- [ ] Switching the label set to another language changes all player interface strings, video controls and screen-reader labels in preview

**Spec refs:** rise.md 3L, rise.md 4 Label set, rise.md 4 Other formats  
**Risks:** Multi-language projects, right-to-left and AI translation belong to the Localization backlog; label and XLIFF formats must be the shared ones it will also use.

### BLK-17: Live co-authoring and course roles

Let several authors edit one course at the same time on the company server, with lesson locks and owner/manager/editor rights.

**Features**

- Course document synced as a Yjs document through Hocuspocus; changes appear for everyone at once
- Lesson lock: outline shows the editor's avatar and last-edit time; take control locks the other author out, with a warning first
- Single-editor locks on course title, description and section headers, shown greyed with the editor's avatar
- Anyone can add lessons and headers, reorder while items are locked, and preview; deleting a locked item is blocked
- Collaborate panel: add people, roles owner, manager, editor (default), remove a collaborator, transfer ownership to an existing collaborator, remove self (owner only after transfer)
- Removing a collaborator removes the course from their dashboard and ejects them if they are editing
- Role matrix enforced on the server and reflected in the editor (settings, publishing, export, labels, duplicate, delete, transfer)
- Per-lesson last updated by
- Short disconnects merge on reconnect

**Done when**

- [ ] Two browsers editing different lessons see each other's changes within 1 second on a local network
- [ ] After take control, the first author's lesson turns read-only within 1 second and no text they already typed is lost
- [ ] An editor-role account cannot export, change theme, change collaborators or edit labels through the editor or the API
- [ ] A removed collaborator is returned to the dashboard within 2 seconds
- [ ] Ten concurrent editors on a 50-lesson course keep sync delay under 500 ms (load test)

**Spec refs:** rise.md 2 Flow 6, rise.md 3K, rise.md 6 (co-editing, roles), teams-collab.md H  
**Risks:** Combining CRDT merging with lock semantics; migrating Yjs documents when the course schema changes; memory use of large course documents on the server.

### BLK-18: Sharing and hand-offs: share links, Review, portal, send a copy, PDF

Let authors get a course in front of people beyond the LMS: quick links, the review service, the learning portal, independent copies and PDF.

**Features**

- Quick share link (server): anyone with the link can open; optional password, guestbook (name and email), or both
- Per-course view counts and guestbook entries, visible to the owner
- Publish for review: to the review service on the server; desktop produces a review-copy file
- Publish to the learning portal (server), with several tracking options together
- Send a copy: server sends an independent copy to another author; desktop writes a project-file copy; copies never merge; server keeps the lineage
- PDF export for courses and microlearning: links stay live; media, embeds and custom blocks become still images; labeled graphics and tabs become screenshots; flashcards give front and back images; slide-app blocks show the first slide; questions without answers or feedback; code blocks show a notice

**Done when**

- [ ] A password-protected link refuses a wrong password and counts a view only after access
- [ ] Republishing to review adds a new version to the same review item
- [ ] A course published to the portal can be assigned there and reports progress back
- [ ] A desktop copy opened on another machine is a new independent course with a new id
- [ ] PDF export of the sample course matches every PDF rule in spec 3M

**Spec refs:** rise.md 3A (send a copy), rise.md 3K (quick share link), rise.md 3M (PDF, review, portal), rise.md 6 (share links, hand-off), teams-collab.md I  
**Risks:** Depends on Review and Reach intake contracts; PDF screenshots of interactive blocks need a headless renderer on desktop and server.

### BLK-19: AI-assisted authoring in the blocks editor

Bring drafting, rewriting, question writing, images, narration and captions into the editor using the author's own key or a local model.

**Features**

- Course draft or outline from an uploaded document
- AI-generated text blocks; rewrite, shorten or simplify text in place
- Knowledge checks and quiz questions generated from a document or lesson
- AI images for blocks, cover pages and custom blocks
- Text-to-speech narration on blocks and voice-overs in custom blocks, with transcripts
- Automatic video captions into the caption editor
- AI-generated branching scenario into a scenario block
- Course-wide edits by chat
- Every result lands as normal editable content, undoable as one step, with the prompt and source recorded in the media reference

**Done when**

- [ ] With no key or model configured, AI entry points explain how to set one and no network call is made
- [ ] A course generated from a 10-page document passes schema validation and opens in the editor
- [ ] Each AI action is a single undo step
- [ ] Text features work offline on desktop against a local model endpoint

**Spec refs:** rise.md 3C Other categories (AI-generated blocks), rise.md 3D (AI narration), rise.md 3O, rise.md 6 (AI proxy), localization-ai.md 3.2-3.6  
**Risks:** Quality varies widely across local models; voice licensing for text-to-speech; scope must stay aligned with the Localization+AI backlog so prompts and providers live in one place. Runtime behaviour of the vendor's AI scenario module was not observed (open question 10).

### BLK-20: Survey block and response collection

Let authors collect anonymous learner feedback inside a course and read aggregated results.

**Features**

- Question types: linear scale (2-10 points), sentiment (2-5 options), multiple response, single choice, short text (300 characters), long text (5,000 characters); mixed and changeable
- Per-question required toggle; required questions must be answered to finish
- Answers anonymous; text answers may carry the learner name when a guestbook is on; LMS packages may attach the LMS user id
- Responses sent to the company's own server (or its LRS); exports with no collection target warn the author
- Aggregated results per survey block in the editor
- AI summary once a question has five responses

**Done when**

- [ ] A required question blocks finishing until answered
- [ ] A 301-character short-text answer is refused
- [ ] Responses from three test learners aggregate correctly and store no identity unless a guestbook or LMS id applies
- [ ] The AI summary action is unavailable below five responses

**Spec refs:** rise.md 3C Other categories (survey blocks), rise.md 3H Survey block, rise.md 6 (survey collection)  
**Risks:** Vendor marks surveys as beta; desktop-only authors have no collection endpoint unless they run a server or LRS.

### Deliberately out of scope

- Newer vendor formats (guides, training decks, interactive video, standalone scenarios generated from source material): deferred; separate products once the core course builder is stable
- Vendor content library (stock photos, illustrations, icons, videos, vendor characters and templates): never shipped for clean-room and licence reasons; we ship only original assets from our library repo, and optional open stock connectors with the author's own key belong to the Teams backlog
- Partner content templates: we have no partners and host nothing
- Allow usage data collection export option and connected packages that report back to a vendor: dropped; we collect no telemetry and no vendor service exists (open question 6)
- Team folders, folder permissions, Shared With Me, shortcuts, External Connections and folder settings flowing to new content: owned by the Teams and Collaboration backlog; the Blocks editor consumes them
- Multi-language projects (one stack, 80+ languages including right-to-left, AI translation, in-context validation, multilingual publishing, theme shared across languages, learner language switch): owned by the Localization+AI backlog; Blocks delivers labels and manual XLIFF only (open question 8)
- AI tutor for learners (in-course chat, hidden during quizzes): owned by the Localization+AI backlog; needs a server proxy and a player chat panel; later
- Custom block object states and trigger list: deferred until the slides app's trigger engine can be reused (vendor marks it early; open question 9)
- Reviewer commenting, review requests and translation validation: owned by the Review backlog; Blocks only publishes into it
- Assigning and tracking learners in the learning portal: owned by the Reach backlog
- Share review copy with people outside the organisation (owner-only right): enforced by the Review backlog's guest-access rules, not by the editor

## Review (stakeholder review service, Review 360 equivalent)

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| REV-01 | Publishing into Review: items, versions and uploads | mvp | server | L | M3b | ext:server-core accounts, workspaces, object storage (phase 3), ext:shared-engine web exporter with review manifest, ext:BLK blocks editor in the browser |
| REV-02 | Review viewer: sandboxed content and review shell | mvp | server | L | M3b | REV-01, ext:shared-engine player review mode, ext:shared-engine player-to-review message bridge |
| REV-03 | Share links, guest reviewers and access control | mvp | server | L | M3b | REV-01, REV-02, ext:server-core accounts and sign-in |
| REV-04 | Comment threads, anchors and resolution | mvp | server | L | M3b | REV-02, REV-03, ext:shared-engine in-player screenshot capture |
| REV-05 | Live updates and notifications | mvp | server | L | M3b | REV-04, ext:server-core SMTP settings and job scheduler |
| REV-06 | Review requests: assign, remind, track completion | mvp | server | L | M3b | REV-03, REV-05 |
| REV-07 | Review library: areas, folders, trash and search | mvp | server | L | M3b | REV-01, ext:server-core accounts and workspaces, ext:server web UI unified dashboard shell |
| REV-08 | Version history: hide, restore and project backups | v1 | server | M | M3c | REV-01, REV-04, REV-07 |
| REV-09 | Screenshot annotation tools | v1 | server | M | M3c | REV-04 |
| REV-10 | Mentions, attachments and unread tracking | v1 | server | M | M3c | REV-04, REV-05 |
| REV-11 | Team folder sharing and permissions | v1 | server | L | M3c | REV-07, REV-03, ext:teams folder ACL service and content-transfer job |
| REV-12 | Comment export | v1 | server | M | M3c | REV-04 |
| REV-13 | Video review | v1 | server | M | M3c | REV-01, REV-02, REV-04, ext:shared-engine video LMS wrapper exporter |
| REV-14 | Blocks-editor integration: comments panel and slide embeds | v1 | both | L | M3c | REV-01, REV-04, REV-05, REV-11, ext:BLK blocks editor |
| REV-15 | Slides-editor integration | v1 | both | L | M5c | REV-01, REV-04, REV-05, REV-08, REV-14, ext:SLD slides editor |
| REV-16 | Language stacks and validator editing | v1 | server | L | M6c | REV-02, REV-05, REV-06, ext:LOC multi-language projects and segment store, ext:shared-engine player segment preview API |
| REV-17 | Update validation across versions | v1 | server | M | M6c | REV-16 |
| REV-18 | Desktop review copy round trip | v1 | desktop | L | M3c | REV-02, REV-04, REV-14, ext:shared-engine review-copy export target |
| REV-19 | Storage, retention and review policy | v1 | server | M | M7 | REV-03, REV-07, REV-08, ext:server-core admin console, ext:audit log service (phase 7) |
| REV-20 | AI translation suggestions for validators | later | server | S | M6c | REV-16, ext:shared-engine AI provider layer |

### REV-01: Publishing into Review: items, versions and uploads

Get courses into Review as numbered versions, by upload or straight from the browser blocks editor.

**Features**

- Item and Version records: type, owner, title, thumbnail, immutable numbered versions with publisher, publish time and source app
- Upload a zipped web-output package from the dashboard as a new item, or from an item's menu as a new version
- Chunked, resumable uploads streamed to object storage, capped per item or package (default 5 GB)
- Package check: entry page must sit at zip root; a zip that wraps the output in one extra folder is detected and offered as a fix; anything that is not our web output is refused with a reason
- Read the package's review manifest (content type, project id, stable slide/scene/lesson ids, numbers, titles, poster) into the version
- Title defaults to the first slide title, else the project file name; editable without renaming the project; up to 80 characters shown in the player
- Thumbnail defaults to the package poster; can be replaced with another slide or an uploaded image
- Publish API for authoring apps: list items the user may publish to (same content type, Private plus editable team folders), create item or add version, keep a project-id-to-item link
- Publish to Review dialog in the browser blocks editor: new item or new version picker, progress, then open the item or copy its link
- Clear error when the server cannot be reached (publishing needs a connection)
- Version menu at the top of an item lists versions with publisher and date; anyone with access can switch to an older one

**Done when**

- [ ] Uploading a valid web-output zip creates an item at version 1 with default title and thumbnail; uploading again through the item menu creates version 2
- [ ] A 4.9 GB package resumes after a dropped connection without restarting; a package over the configured cap is refused before the transfer completes
- [ ] A zip wrapping the output in an extra folder is detected and accepted after confirmation; an unrelated zip is refused with a readable reason; zip-slip paths and zip bombs are rejected
- [ ] From the blocks editor: publish as a new item, then publish again choosing that item; the version number increments and the dialog offers open and copy link
- [ ] The new-version picker lists only items of the same content type that the user may publish to
- [ ] An 81-character title is stored in full and truncated to 80 in the player; renaming the item does not rename the project
- [ ] The version menu shows who published each version and switching to version 1 loads version 1's package

**Spec refs:** review.md §3 A2, A3, A4, A7, A11, A12, A16, A17, review.md §3 C1, C2, C3, review.md §3 O1, review.md §3 R1, review.md §4 Item, Version, Formats (inbound packages), review.md §6.3, §6.13  
**Risks:** Upload validation must never execute content; 5 GB through Node needs streaming S3 multipart, not buffering; the review manifest is a shared contract and must be agreed with the engine team before either side builds.

### REV-02: Review viewer: sandboxed content and review shell

Let anyone with access open a version in the browser, with a comment sidebar or a full feedback list.

**Features**

- Serve each version's static files from an isolated origin (separate host name) or a sandboxed iframe so course scripts cannot read review cookies or call the review API
- Review view: content plus a comment sidebar that collapses, expands and resizes by dragging
- Feedback page listing every comment for the item, with slide numbers for slide-based content
- Switching between review view and feedback page keeps the place in the content
- Shell reads the player's position messages and can send go-to-location commands
- Player runs in review mode: always starts from the beginning, no resume, close-window triggers and orientation locks ignored, no progress or score tracking
- Full-screen for videos inside courses
- No-index header and meta on every review page; Open Graph title, author and thumbnail for link unfurls
- No third-party telemetry in the shell or the player
- Works on current Edge, Chrome and Firefox on Windows; Safari, Chrome and Firefox on Mac; Safari and Chrome on iOS and iPadOS; Chrome on Android; fully keyboard-usable
- Player accessibility features reach reviewers unchanged

**Done when**

- [ ] A script inside a test package cannot read the review session cookie or reach the review API (automated test from inside the frame)
- [ ] Close and reopen a course mid-way: it starts at the first slide or lesson
- [ ] A close-window trigger in the content does nothing inside Review; a landscape-only course rotates with the device
- [ ] Go to slide 7, open the feedback page, return: slide 7 is shown
- [ ] An item link responds with X-Robots-Tag noindex and Open Graph tags; a chat-app unfurl shows title, author and thumbnail
- [ ] A network capture of a full review session shows requests only to the company server
- [ ] Playwright suite passes on Chromium, Firefox and WebKit at desktop and phone widths

**Spec refs:** review.md §3 F1–F8, F14, F15, review.md §3 D16, D17, review.md §3 S1, S2, review.md §5 rules 21, 23, review.md §6.3, §6.4  
**Risks:** An isolated origin needs a second host name and certificate in Docker Compose installs; the fallback is a sandboxed iframe with strict CSP, which breaks packages that rely on storage. WebKit iframe and full-screen quirks.

### REV-03: Share links, guest reviewers and access control

Decide who can open and comment on an item: open link, invited people only, optional password, guests by email.

**Features**

- One unguessable share link per item that never changes when the item moves
- Access mode per item: anyone with the link, or invited people only
- Default: anyone with the link can view and guests can comment after giving an email
- Switch that allows or blocks commenting by people without an account
- Optional per-item password, set or removed by the owner and team editors only, stored hashed, attempts rate-limited
- Guest identity: the first click in a comment box asks for an email; an email that belongs to an account asks for its password instead; guest history links to an account later made with that email
- Invite list: add emails one by one or paste a list split by commas, semicolons, spaces or spreadsheet cells; remove with a delete control; individuals only; adding sends no email
- Invite-only viewers must sign in with an account whose email matches
- Access list markers for review-request reviewers and folder editors
- Signed-in reviewers see a share control that shows the link
- Duplicates get a new private link; duplicates in team folders do not copy per-item invitations
- Removing a user from the workspace removes their Review access

**Done when**

- [ ] A link visitor can view; their first comment attempt asks for an email; with guest commenting off they get no comment box
- [ ] Entering an email that belongs to an account prompts for that account's password
- [ ] Invite-only: a signed-out visitor is sent to sign-in; a signed-in user with a different email is refused; a matching user gets in
- [ ] Pasting 'a@x.com; b@x.com, c@x.com<TAB>d@x.com' adds 4 invitees and sends no email
- [ ] Repeated wrong passwords are slowed by rate limiting and logged
- [ ] Moving the item to another folder leaves its link working
- [ ] A deactivated workspace member can no longer open invite-only items

**Spec refs:** review.md §3 D1–D9, D11–D15, D18, review.md §3 G16, review.md §5 rules 8, 9, 15, review.md §6.1, §6.2, review.md §7 open Q3, Q12  
**Risks:** Email-only guest identity is easy to impersonate; REV-19 adds an optional verification policy. Open questions on guest rights and password rules: we choose guests may post, reply, mention, attach and edit or delete their own comments in the same session, and a minimum password length with rate limiting.

### REV-04: Comment threads, anchors and resolution

Let reviewers pin feedback with a screenshot to the exact slide or lesson, and let anyone resolve it.

**Features**

- Threads anchor to the current slide (slide content), current lesson (block courses, never a block) or a video time
- Sidebar follows slide or lesson changes
- Ordering switch between content order and time order
- Anchors use stable ids so reordered content keeps its threads; threads whose slide or lesson is gone group under 'location not found', never dropped
- Auto-screenshot of the content when a new thread starts; replies have none; the thread shows it with zoom
- Post with Enter or a post button, cancel discards; 1,500-character cap; emoji picker and device emoji keyboard
- Left-to-right and CJK scripts; text direction detected per comment
- Replies build a thread; authors edit and delete their own; the owner deletes anyone's; deleting the first comment deletes the thread; deletion is permanent and the confirm dialog suggests resolving
- Relative times with exact date and time on hover
- Anyone who can comment resolves or reopens; resolved hidden by default; per-user, per-item 'show resolved' shows them faded
- Two comment states only: open and resolved
- Version rules: comments only on the newest version; older versions read-only; version N shows its own comments plus all earlier ones
- Owner switch to turn comments off for an item, hiding sidebar and feedback page; switching back restores everything

**Done when**

- [ ] Comment on slide 3 and move to slide 4: the sidebar shows slide 4's threads; back on slide 3 the comment shows with its screenshot
- [ ] Republish with slides reordered: the thread stays on the same slide; republish with that slide deleted: it appears under 'location not found'
- [ ] A 1,501-character comment cannot be posted; Japanese and Chinese text round-trips intact
- [ ] Deleting a thread's first comment removes all its replies after confirmation
- [ ] On version 1 after version 2 exists, add, edit, delete, resolve and reopen are absent in the UI and refused by the API
- [ ] Version 3 shows threads from versions 1, 2 and 3, each labelled with its version
- [ ] Resolved threads vanish by default and reappear faded after 'show resolved', which persists across reload for that user and item
- [ ] With comments off the sidebar and feedback page disappear and the API refuses reads; on again, every thread returns

**Spec refs:** review.md §3 G1, G2, G4–G11, G17, review.md §3 I1–I6, review.md §3 J1–J5, review.md §3 C5, C6, review.md §4 Anchor, Thread, Comment, review.md §5 rules 1, 4, 5, 6, 7, 17, review.md §6.5, review.md §7 open Q6  
**Risks:** The shell cannot read a cross-origin frame, so screenshots depend on the player rendering itself to an image; fidelity for SVG, web fonts and video frames needs a test corpus.

### REV-05: Live updates and notifications

Show new feedback and new versions to open viewers instantly, and email people at the frequency they choose.

**Features**

- Push new, edited, deleted and resolved comments to everyone viewing the item without reload, across several app instances
- New-version event: open viewers get a refresh prompt; until they refresh, commenting and suggesting on the stale view is off
- Defaults: reviewers emailed at once about replies to their comments and about @mentions; the owner emailed about every comment
- Per-item level: my activity, all activity, or mute
- One global frequency: instant, hourly digest or daily digest, muted items excluded
- Notification settings need an account; guests still get discussion emails with working unsubscribe and mute links
- Changes to items in team folders send no notification
- Email templates and sending for review-request events used by REV-06

**Done when**

- [ ] Two browsers on one item: a comment posted in one appears in the other within 2 seconds without reload, also with 2 server instances behind a load balancer
- [ ] Publishing version 2 while a viewer is on version 1 shows a refresh prompt and disables their comment box until refresh
- [ ] A reviewer gets one instant email for a reply to their comment and none for unrelated comments; the owner gets one per comment
- [ ] With daily frequency, 5 comments produce one digest at the scheduled time; a muted item produces none
- [ ] A guest's unsubscribe link stops further mail for that item without signing in
- [ ] Moving or renaming an item in a team folder sends no email

**Spec refs:** review.md §3 F9, C7, review.md §3 L1–L7, review.md §5 rules 2, 18, review.md §6.6, §6.7, §6.8, review.md §7 open Q5  
**Risks:** Hocuspocus serves Yjs documents; comments need a plain pub/sub channel (Postgres LISTEN/NOTIFY or Redis) that scales across instances. Open Q5: we send no email on new versions, only the in-page prompt.

### REV-06: Review requests: assign, remind, track completion

Ask named people to review by a date, remind them, and see who has finished.

**Features**

- Request button in the item's top bar whose label shows the state: none assigned, in review, complete; assignees see 'you are assigned'
- Reviewer picker: last 5 added, then other recent reviewers, then workspace members; type or bulk-paste emails
- Request message with bold, italic, strikethrough, links, lists, line breaks and keyboard shortcuts
- Optional due date; reminders to unfinished reviewers the day before, on the day and the day after
- Personal link per reviewer by email; reviewers see the requester, due date and reviewer list
- Per-reviewer state: emailed, viewed, in progress (first comment), completed (finish); reopen returns to viewed
- Finish and reopen controls; only the requester is told when someone finishes
- Changing the due date emails every reviewer and leaves states alone
- Add or remove reviewers on an active request; delete a request (confirmed, cannot be undone)
- Re-request: same reviewers, editable message, emails everyone, resets everyone to emailed
- Any seat holder with access to the item can create or edit its requests
- Guests finish only through their personal link; signed-in users can also finish from the public link
- Request reviewers appear in the access list with a marker and gain invite-only access once they create an account with that email
- Per-language requests for language stacks (used by REV-16)

**Done when**

- [ ] A request for 3 reviewers with a due date emails each a personal link and the button reads 'in review'
- [ ] Opening a personal link sets that reviewer to viewed, a first comment sets in progress, finish sets completed and emails only the requester
- [ ] With a test clock, reminders go out on day −1, 0 and +1 only to unfinished reviewers and never twice
- [ ] Changing the due date emails all 3 and keeps their states; re-request resets all to emailed
- [ ] When every reviewer has finished the button reads 'complete'
- [ ] A guest on the public link has no finish control; on their personal link they do
- [ ] Deleting a request after confirmation removes it and all reviewer states

**Spec refs:** review.md §3 E1–E16, review.md §3 D11, J5, L6, review.md §4 ReviewRequest, ReviewerAssignment, review.md §5 rules 10, 11, 12, 13, review.md §6.8, review.md §7 open Q13, Q15  
**Risks:** Personal tokens are bearer credentials: scope them to one item and revoke with the request. Reminder 'days' use the requester's time zone. Open Q13: completed persists across new versions until a re-request.

### REV-07: Review library: areas, folders, trash and search

Give authors one place to find, organise and tidy their review items.

**Features**

- Private area per user and a Team area per workspace whose root every member can edit
- Nested folders up to 6 levels; a move that would go deeper lands in the 6th-level folder
- Breadcrumbs, collapsible folder-tree sidebar, selection toolbar, bulk move, drag and drop to move or to Deleted Items
- Rename, duplicate (new link, no comments), move, delete and restore items
- Deleted Items restores to the old place, or to Private if that place is gone; manual purge
- Search by title and date; filter by content type (slide course, block course, video), extensible for future types
- Paged lists that stay fast; full keyboard use
- Cards with title, thumbnail, author, type, review status and quick actions (open, copy link, new version, request review)
- Review is a library inside the unified server dashboard, not a separate app
- Item permission checks: owners and team editors view, publish versions, hide versions, change sharing, set passwords, copy links, rename and duplicate; only owners move, delete, restore versions and delete others' comments
- Reviewers never need a creator seat

**Done when**

- [ ] Moving a 3-level folder tree under a level-5 folder flattens the deeper content into level 6
- [ ] Bulk-selecting 10 items and dragging them into a folder moves all of them and their links still work
- [ ] Delete an item, delete its old folder, restore the item: it lands in Private
- [ ] With 5,000 items the first page loads in under 1 second on the reference VM; title search and type filter return correct results
- [ ] Every dashboard action works by keyboard alone and an axe scan reports no serious issues
- [ ] A team editor cannot delete an item they do not own and the API returns 403

**Spec refs:** review.md §3 B1–B12, review.md §3 P2, P4, P5, P12, review.md §5 rule 14, review.md §6.11, review.md §7 open Q1, Q2, Q8  
**Risks:** Folder permissions must come from the shared teams ACL service, not a Review-only copy. Open questions: we choose configurable trash retention, bulk delete allowed, and title/date search only.

### REV-08: Version history: hide, restore and project backups

Manage versions safely: hide old ones, restore an earlier one, keep project backups.

**Features**

- Hide any version except the current; reviewers no longer see it or its comments; owners and editors still see it and can unhide
- Restore an older version as current, owner only, with a confirmation naming what will be lost; newer versions are permanently deleted with their comments, backups, validation work and unimported suggestions; Hide is offered instead
- No single-version delete
- Project backup per version: native project file stored with the version; marker, download link and publish date and time in the version menu
- Backups downloadable by the owner or by creators on the same team
- Fast loading for items with 100 or more versions or comments

**Done when**

- [ ] Hide version 2 of 3: a reviewer's menu shows 1 and 3 and none of version 2's threads; the owner sees it marked hidden; hiding version 3 is refused
- [ ] Restore version 1 of 3 after confirmation: versions 2 and 3, their threads, backups and suggestions are gone from the database and object storage, and version 1 is current
- [ ] A team editor has no restore control and the API refuses with 403
- [ ] A backed-up version shows the marker; a reviewer without a creator seat gets no download
- [ ] An item with 150 versions and 500 comments opens in under 2 seconds on the reference VM

**Spec refs:** review.md §3 C2–C4, C8–C10, review.md §3 A8, A9, M7, R5, review.md §5 rule 3, review.md §6.10  
**Risks:** Cascade delete spans Postgres and S3: use tombstones plus a retryable sweep. Restores must emit audit events (REV-19).

### REV-09: Screenshot annotation tools

Let reviewers draw on the auto-screenshot to show exactly what they mean.

**Features**

- Pen control on a new thread opens markup over the auto-screenshot
- Tools: freehand pen, semi-transparent highlighter, rectangle, straight line, text label
- Stroke or outline width per tool; colour from a palette or hex code with adjustable opacity; recolour a selected mark
- Move, resize and rotate marks with handles
- Undo and redo with platform shortcuts; clear all marks or delete the selected mark
- Toolbar can be dragged out of the way
- Marks stored as vectors with the thread and flattened for exports; annotated threads show a badge
- Touch and pen input on tablets and phones

**Done when**

- [ ] Draw one mark with each tool, recolour one to a hex colour at 50% opacity, rotate the rectangle, undo twice, redo once: after reload the thread shows exactly those marks
- [ ] Ctrl+Z / Cmd+Z and Ctrl+Y / Cmd+Shift+Z work on Windows and Mac
- [ ] The annotated thread shows a badge in the sidebar and on the feedback page
- [ ] All tools work by touch on a tablet-sized viewport

**Spec refs:** review.md §3 H1–H9, review.md §4 Thread.annotation_layer, review.md §7 open Q11  
**Risks:** Any drawing library must be MIT or Apache compatible. Mobile layout of the tools is an open question; we design our own.

### REV-10: Mentions, attachments and unread tracking

Pull the right people into a thread, share files, and show signed-in users what is new.

**Features**

- @mention by name or email; candidates are everyone who commented on the item plus workspace members; guests can be mentioned
- While typing, a list shows who will be notified
- Up to 5 attachments per comment in object storage; click to download; people delete only their own uploads
- Admin-set attachment size cap and file-type allow-list
- Editing a comment can change its text, emoji, mentions and attachments
- Unread dot on each unread comment and a total on the feedback tab for signed-in users
- A comment is marked read when clicked or replied to; mark all as read
- Guests get no unread tracking

**Done when**

- [ ] Typing '@ali' lists matching commenters and members; posting notifies the mentioned person under REV-05 rules
- [ ] A guest who commented can be mentioned and receives an email
- [ ] A 6th attachment, an oversized file and a blocked file type are refused; another user cannot delete my attachment
- [ ] After user A posts 3 comments, user B sees 3 dots and a count of 3; clicking one leaves 2; mark all as read leaves 0

**Spec refs:** review.md §3 G12–G15, review.md §3 I2, review.md §3 K1–K3, review.md §4 Attachment, ReadState, review.md §7 open Q7  
**Risks:** Attachments are an upload vector: serve them from the isolated content origin as downloads only. Per-user read state grows with users times comments.

### REV-11: Team folder sharing and permissions

Share folders with named colleagues or the whole team, with owner and editor rights and clear inheritance.

**Features**

- Share a team folder with named members or the whole team as one group; no smaller groups
- Folder roles: owner (everything) and editor (view, create subfolders, add items, rename folders; cannot change permissions, move or delete folders)
- Explicit permissions travel with a moved folder; inherited ones are replaced by the new parent's; changing a folder rewrites inherited permissions on every subfolder, including other people's
- Unsharing (moving to Private) is owner-only and pulls other members' items back into their own Private areas
- Deleting a folder sends other members' items to their own Deleted Items
- Team-folder editors appear in item access lists with a folder marker and are removed only through folder sharing
- Team-folder editors can publish new versions of shared slide and course items
- No direct ownership transfer; an editor's duplicate belongs to them with no comments
- When a seat is removed, shared review items, backups and requests go to a named receiver; personal items are handed over or kept
- Workspace admins get no special folder access

**Done when**

- [ ] A folder with an explicit share to X moved under a parent shared with Y keeps X and gains Y; a folder with only inherited shares loses the old parent's
- [ ] An editor's attempt to delete or move a shared folder is refused
- [ ] The owner deletes a folder holding an item owned by B: the item is in B's Deleted Items
- [ ] The owner unshares a folder: B's items in it appear in B's Private area
- [ ] Removing user B with receiver C: B's shared items, backups and requests belong to C and every link still works
- [ ] An admin without a share cannot open a team folder

**Spec refs:** review.md §3 P1–P12, review.md §3 D12, D18, N10, O7, review.md §5 rule 16, review.md §6.9  
**Risks:** Must reuse the teams ACL and transfer services so Review, blocks and slides folders behave the same; cross-owner cascades need property-based tests.

### REV-12: Comment export

Take all feedback out of Review as a spreadsheet, a printable report or a complete data file.

**Features**

- Export all comments from every version of an item into one report, in the chosen order
- CSV columns: item, version, location (slide number and title, lesson title or video time), thread id, parent id, author name and email, created time, text, resolved state
- PDF with screenshots (annotated where marked), non-Latin and CJK fonts, and the correct time for each version
- Resolved comments appear in the PDF only while they are shown on screen
- Lossless JSON export with anchors, annotation vectors and attachment references
- Export needs a signed-in account

**Done when**

- [ ] A CSV for an item with 3 versions and Chinese, Japanese and German comments opens in a spreadsheet with every character intact and one row per comment
- [ ] PDF with resolved hidden omits resolved threads; with resolved shown, includes them
- [ ] A JSON export re-imported into a test fixture reproduces identical threads
- [ ] A guest sees no export control and the API refuses

**Spec refs:** review.md §3 M1–M4, review.md §4 Formats (comment export), review.md §7 open Q4  
**Risks:** Server-side PDF needs either headless Chromium in the container or a JS PDF library; CJK font fallback (Noto) adds image size.

### REV-13: Video review

Review standalone videos with comments pinned to the exact moment.

**Features**

- Upload MP4 or WebM as a new item or a new version of a video item
- Read duration and make a poster frame with the bundled ffmpeg
- Time-anchored threads shown together, newest first, each with a time link that seeks
- Screenshot of the frame taken when the reviewer starts typing
- Playback speed 0.5x to 2x; picture-in-picture; left and right arrows skip 5 seconds
- Playback resumes at the paused time after the viewer signs in
- Download the video as MP4
- Export the video as a SCORM 1.2, SCORM 2004, AICC or xAPI package with a watch-percentage completion threshold of 1–100, default 80
- Link unfurls show the video's duration

**Done when**

- [ ] An uploaded MP4 shows its poster and duration; a WebM uploads as version 2
- [ ] Pause at 01:23 and start typing: the thread is at 01:23 with that frame as screenshot; its time link later seeks to 01:23
- [ ] Arrow keys move ±5 seconds; the speed menu offers 0.5x to 2x
- [ ] Signing in mid-video resumes at the same time
- [ ] A SCORM 1.2 export with threshold 60 reports completed in Moodle after 60% watched and not before

**Spec refs:** review.md §3 A14, review.md §3 F10–F13, review.md §3 G3, G5, G6, review.md §3 M5, M6, D17, review.md §5 rule 22, review.md §4 Formats (video LMS export)  
**Risks:** Frame capture to canvas needs CORS headers on the media origin; other formats would need transcoding, which we skip. The LMS-export details come from a search summary only.

### REV-14: Blocks-editor integration: comments panel and slide embeds

Let block-course authors answer feedback in the editor and embed slide content picked from Review.

**Features**

- Comments panel lists comments for the chosen Review item, grouped by lesson, newest first; a lesson title jumps to that lesson
- Post, reply, edit or delete own comments, resolve and reopen, with live two-way sync
- Comments posted from the editor carry no screenshot
- Add an image from a comment to its lesson as a new image block at the bottom
- Picker when one course has several Review items
- Same panel runs in the desktop app over a local comment store (filled by REV-18)
- Browse slide-app items in Review from the course editor and embed the selected one
- An embed stays on the version chosen; a newer version shows 'newer version available' and needs re-selecting
- An embed keeps working after its Review item is deleted (package copied into the course)
- Embedding someone else's slide item needs editor rights on its team folder

**Done when**

- [ ] A reply posted in the editor panel appears on the Review page within 2 seconds, and the reverse
- [ ] Clicking a lesson title in the panel opens that lesson
- [ ] 'Add image to lesson' appends an image block at the end of the lesson
- [ ] A course with 2 Review items shows a picker that switches the list
- [ ] Embed version 2, publish version 3: the course still plays version 2 and offers the update; re-selecting switches to 3
- [ ] After the Review item is deleted the course still plays and exports the embed
- [ ] A user without editor rights on the folder does not see that slide item in the embed picker

**Spec refs:** review.md §3 O2–O6, O8–O10, review.md §5 rule 20, review.md §6.13, review.md §7 open Q9  
**Risks:** Embed tracking (open Q9) belongs in the shared exporter; copying embedded packages grows course size; the editor's insert-block API must be stable.

### REV-15: Slides-editor integration

Publish slide projects to Review and work through feedback inside the slides editor.

**Features**

- Publish the whole project, one scene or one slide
- Choose player and media quality at publish: video, audio and image compression, audio levelling
- Thumbnail defaults to the first slide; pick another slide or an image
- Optionally upload the project file with the version as a backup, always the whole project
- Publish locally to a zip for manual upload when direct publishing is blocked or the output needs editing
- Comments panel follows the selected slide; screenshots enlarge in a browser
- Post, reply, edit or delete own comments, resolve and reopen, with two-way sync
- Apply a comment's text to its slide in one step (undoable); insert a comment's image into the slide or download it
- Picker when one project has several Review items
- Review links survive Save As, file copy and server upload; they are dropped on save as template, sending to the team slide library, or importing slides into a new file
- Colleagues who receive the project file see linked comments unless the item has a password or is invite-only
- Older editor versions open these projects without the panel and keep the link data

**Done when**

- [ ] Publishing scene 2 with backup on: the version shows only scene 2's slides and the downloaded backup has every scene
- [ ] Selecting slide 5 shows slide 5's threads in the panel
- [ ] Applying a comment's text updates the slide and Undo reverts it
- [ ] Save As keeps the linked items; save as template drops them
- [ ] A colleague opening the file sees comments for an open-link item and none for an invite-only item
- [ ] A file saved by this release opens in the previous release, and the link data survives a save there

**Spec refs:** review.md §3 A5–A10, review.md §3 N1–N10, review.md §6.13  
**Risks:** Waits on the phase-5 slides editor. 'Apply text' is loosely specified; we define it as replacing the selected text object's content, with undo.

### REV-16: Language stacks and validator editing

Let language validators correct translated text beside a live preview, and let authors import their fixes.

**Features**

- A translated project publishes as one language stack tile holding the source and all or some target languages; republishing adds versions; duplicating or saving as a new file starts a new stack
- Stack overview with a language sidebar and a preview of each language
- Validation requested per target language through review requests, each showing request states
- Validators see only their own language as a separate item; only creators with rights see the stack; validators need only an email, or an account if invite-only
- Translation table pairs source and target segments beside a live preview; clicking a segment scrolls the preview to it; move by preview, navigation list or previous and next
- Edit a target segment in place; it saves on blur and the preview updates
- Apply an edit to every exact match of the same source text
- Separate entries for audio scripts, transcripts and captions
- Reset a segment to the original machine translation
- Markers for pending and imported suggestions; hover shows who last changed it and when
- Filters: edited by hand, edited from AI suggestions, imported, not yet imported, all edits, updates only; a marker shows an active filter
- Mark a lesson or slide as validated
- Validators of one language see each other's edits live
- Authors import suggestions per language in the blocks editor (course managers only) or per language or all at once in the slides editor
- Warning before publishing a new version while suggestions are pending, since they will be lost

**Done when**

- [ ] Publishing a course with French and German makes one stack tile; the French validator's link shows only French
- [ ] Clicking a target cell scrolls the preview; editing and clicking away saves and updates the preview
- [ ] 'Apply to all identical' updates all 3 matching segments
- [ ] Reset restores the machine translation and clears the pending marker
- [ ] The 'not yet imported' filter shows only pending edits
- [ ] After the author imports French suggestions, the course's French text matches and markers read imported
- [ ] Publishing with pending suggestions warns; after confirming, those suggestions are gone

**Spec refs:** review.md §3 Q1–Q16, Q20, review.md §4 LanguageStack, Segment, Suggestion, ValidationMark, review.md §5 rule 19, review.md §6.14  
**Risks:** Waits on phase-6 Translate. Segment ids must stay stable across versions, and the live preview needs the player to accept text overrides.

### REV-17: Update validation across versions

After a republish, show validators only what changed and keep earlier validation.

**Features**

- Compare each new version with the one just before it and flag changed segments
- Step-through of changes with a running count; arrow keys move between them
- Each change is edited (which validates it) or accepted as is, and can be reopened
- Validated lessons and slides carry forward across versions
- Updates-only filter
- Change detection is the only version comparison; there is no visual side-by-side

**Done when**

- [ ] Changing 4 source segments and republishing shows '4 changes'; editing 1 and accepting 3 brings the count to 0
- [ ] Reopening an accepted change puts it back in the count
- [ ] A slide validated in version 1 and unchanged in version 2 stays validated
- [ ] Detection compares with the previous version only, not older ones

**Spec refs:** review.md §3 Q17, Q18, C11, review.md §5 rule 19, review.md §6.14  
**Risks:** Relies on per-segment source fingerprints from the shared engine; whitespace-only changes need a defined rule.

### REV-18: Desktop review copy round trip

Let a desktop author without a server collect comments through a review copy and import them into the editor.

**Features**

- Export a review copy: the course in review mode plus an offline review shell, as a zip or folder that opens from disk or any static host
- Reviewers comment on slides or lessons with auto-screenshots, with no account and no server, giving a name and email at the first comment
- Comments kept in the browser and saved to a comments file the reviewer sends back
- The author imports one or more comment files; threads merge by id, duplicates are ignored, replies nest correctly
- Imported feedback shows in the editor's comments panel, where the author replies and resolves locally
- An updated review copy can carry the existing thread history
- Review copies and comment files carry project id and version; files from another project are refused and older versions flagged

**Done when**

- [ ] Open an exported copy from disk in Chrome, Firefox and Safari, leave 3 comments with screenshots, save the file; importing it shows 3 threads on the right lessons
- [ ] Importing the same file twice adds nothing
- [ ] Files from 2 reviewers merge into one list
- [ ] A comments file from another project is refused with a clear message
- [ ] The review copy makes no network requests

**Spec refs:** review.md §6 (intro: desktop edition creates review packages), studio/ARCHITECTURE.md Editions table (review-copy file round trip)  
**Risks:** Browsers restrict file:// pages differently (frames, storage, canvas), so the copy may need a single-origin build. This flow is our design, not reference behaviour.

### REV-19: Storage, retention and review policy

Let the company set limits, quotas, retention and review rules on its own server.

**Features**

- Configurable size cap per item or package (default 5 GB)
- Optional storage quota per workspace or group, counting review items, course packages, project backups and videos; usage shown in the admin console
- Configurable retention for Deleted Items and for removed users' personal content (default 180 days), with a scheduled purge
- Policies: invite-only as default for new items, guest comments forbidden, guest email verification required
- Audit events for sharing changes, password changes, version restores, owner deletions of others' comments and request deletions
- Review on or off for the organisation; content is kept while it is off
- One server is one data location; no regional split

**Done when**

- [ ] With a 1 GB quota, an upload that would exceed it is refused before transfer and usage shows totals by kind
- [ ] With invite-only default on, a new item starts invite-only; with guest comments forbidden, the per-item switch is locked off
- [ ] With guest verification on, a guest's first comment posts only after they click the emailed link
- [ ] Restoring a version writes an audit event with actor, item and removed versions
- [ ] The nightly job purges items deleted 181 days ago and keeps those deleted 179 days ago

**Spec refs:** review.md §3 R1, R2, R5, review.md §3 D13, D19, review.md §6.15, §6.16, review.md §7 open Q1  
**Risks:** Quota accounting must match real object-storage usage. Audit storage arrives in phase 7, so events must be recorded from the start and back-filled into it.

### REV-20: AI translation suggestions for validators

Offer validators AI suggestions on grammar, phrasing and untranslated text, using the company's own key or a local model.

**Features**

- Per-segment suggestions flag grammar, phrasing and untranslated text, with a reason shown
- Accept a suggestion, optionally for all identical segments, or dismiss it with a reason
- Suggestions and their accept or dismiss state are shared live across validators and carry over between versions until resolved
- Edits from AI suggestions are counted in the 'edited from AI suggestions' filter
- Uses the organisation's configured provider or a local model; hidden entirely when AI is off by policy

**Done when**

- [ ] With no provider configured, no AI suggestion UI appears
- [ ] With a local model configured, suggestions appear and can be accepted for all identical segments or dismissed with a reason
- [ ] A suggestion dismissed by one validator disappears for another validator within 2 seconds
- [ ] An unresolved suggestion is still present after a republish

**Spec refs:** review.md §3 Q13, Q19  
**Risks:** Quality varies by model and language pair; the reference offers it as a beta for a few pairs only.

### Deliberately out of scope

- Publishing from quiz/presentation apps and from screen-recorder apps (A1 in part, A13, A15): no such apps are planned; screencasts come in as uploaded video files (REV-13)
- 2026 deliverable types (guide, training deck, scenario, interactive video) in filters and cards (B9, B11): we have no such deliverables and how they anchor comments is unknown; the type filter is built to accept new types later
- Regional data centres, US or EU (D19): a self-hosted server is its own data location; sharing between servers is a later federation question
- Trial expiry, paid-plan lapse and the fixed 150 GB single-seat quota (R2, R3, R4): there are no plans or billing; admins set quotas and retention instead (REV-19)
- Visual side-by-side comparison of versions (C11): the reference has none; only translation change detection is built (REV-17)
- Comment assignee and priority (J4): the reference has only open and resolved; parity kept
- Group invitations to invite-only items and a viewer log for invite-only items (D9, D10): the reference has neither; review requests do the tracking
- Resume and learner progress or score tracking inside Review (F5, F8): deliberately not done, so every review starts from the beginning
- Direct publish and comment sync from the desktop app to a company server: deferred to phase 8 desktop-server sync; until then desktop users upload an exported zip (REV-01) or use the review copy round trip (REV-18)
- SSO, OIDC and MFA for authors and reviewers (§6.1): owned by the shared server identity layer in phase 7, not a Review epic
- Native mobile apps: Review runs in mobile browsers only (F1, S1)
- Vendor-hosted service: we host nothing; every company runs its own server

## Reach (self-hosted learning server)

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| RCH-01 | Workspace, roles and branding | mvp | server | L | M4 | ext:server-core (phase 3: accounts, sessions, SMTP, job queue, object storage) |
| RCH-02 | People, invitations and learner profiles | mvp | server | L | M4 | RCH-01, ext:server-core (phase 3: sign-in, password reset, email verification) |
| RCH-03 | Groups | mvp | server | M | M4 | RCH-01, RCH-02 |
| RCH-04 | Package upload and isolated content hosting | mvp | server | L | M4 | RCH-01, ext:engine-importers (package validator), ext:server-core (object storage) |
| RCH-05 | Training catalogue: publish workflow and per-item settings | mvp | server | L | M4 | RCH-04, RCH-01 |
| RCH-06 | Publish and submit from the authoring apps | mvp | both | M | M4 | RCH-05, RCH-08, ext:blocks-editor (phase 2), ext:engine-exporters, ext:server-core (personal access tokens), ext:slides-editor (phase 5, for the slides part) |
| RCH-07 | SCORM launch and tracking runtime | mvp | server | L | M4 | RCH-04, RCH-05, ext:engine tracking-runtime package (SCORM API bridge) |
| RCH-08 | Native course-app delivery and lesson tracking | mvp | server | L | M4 | RCH-05, ext:engine-player (native tracking adapter), ext:blocks-editor (phase 2) |
| RCH-09 | Enrolment and assignment engine | mvp | server | L | M4 | RCH-03, RCH-05 |
| RCH-10 | Learner portal (Learn page) | mvp | server | L | M4 | RCH-07, RCH-08, RCH-09, RCH-12 |
| RCH-11 | Due dates, reminders and email notifications | mvp | server | M | M4 | RCH-09, RCH-01, ext:server-core (SMTP, job queue) |
| RCH-12 | Certificates | mvp | server | M | M4 | RCH-01, RCH-05 |
| RCH-13 | Core reports and manual completion | mvp | server | XL | M4 | RCH-07, RCH-08, RCH-09 |
| RCH-14 | Libraries, topics and self-enrolment | v1 | server | M | M4b | RCH-05, RCH-09, RCH-10 |
| RCH-15 | Learning paths | v1 | server | L | M4b | RCH-05, RCH-09, RCH-12, RCH-13 |
| RCH-16 | Self-registration, share links, CSV import and custom profile fields | v1 | server | L | M4b | RCH-02, RCH-03, RCH-09 |
| RCH-17 | Group, question-level and usage reports | v1 | server | L | M4b | RCH-13, RCH-08, RCH-12 |
| RCH-18 | xAPI learning record store and cmi5 launcher | v1 | server | L | M4b | RCH-04, RCH-07, ext:engine tracking-runtime package (LRS and cmi5 core) |
| RCH-19 | Learner single sign-on and SCIM provisioning | v1 | server | L | M7 | RCH-02, RCH-03, ext:server-sso (phase 7: SAML and SCIM stack) |
| RCH-20 | Public REST API, API keys and webhooks | v1 | server | XL | M4b | RCH-02, RCH-03, RCH-09, RCH-13, RCH-15 |

### RCH-01: Workspace, roles and branding

Switch the learning server on for a company, give it the company's look, and enforce who can see and do what.

**Features**

- Learning-server module switched on per server; the person who switches it on becomes admin; exactly one owner (primary admin)
- An author without admin rights can ask for it to be switched on; all admins get an email
- Workspace settings: company name, logo (PNG, about 35 px tall), brand colour (preset or custom RGB), time zone, term start date, public base URL, sender display name
- Brand colour applied to logo area, buttons and favicon; logo on every page and every email; company name feeds certificates
- Roles: learner, reporter, manager, admin, owner, plus an author link for people who also author
- Capability matrix from the spec enforced in one central policy layer used by UI, API and exports
- Scopes: manager limited to assigned groups (at least one, never Everyone); reporter limited to assigned groups or Everyone
- Top navigation by role: Learn, Analyze, Manage, and a link to the course app for authors
- Deactivate: all learner access stops; people, records and reports kept for 6 months by default (operator-configurable), then purged; reactivation restores everything
- Ownership transfer by the owner in the app, or by a server-operator command when the owner is gone
- Retention settings: activity kept indefinitely by default, optional purge window set by the operator
- Admin screens in English with all strings externalised for later translation

**Done when**

- [ ] An automated matrix test exercises every capability row of the role table for every role and gets allow or deny exactly as specified, through both the UI routes and the API
- [ ] A manager assigned only group A gets not-found for a learner who is only in group B, in reports, user lists and exports
- [ ] Saving a manager with no groups, or with Everyone, is rejected with a clear message
- [ ] Changing the brand colour changes buttons, logo area and favicon on the next page load, and the logo appears in the next email sent
- [ ] In a deactivated workspace learners cannot open training; reactivation within the retention window restores every enrolment, completion and report row unchanged
- [ ] After an ownership transfer there is exactly one owner, the old owner is an admin, and both are emailed

**Spec refs:** reach.md §2 Roles and capability matrix, reach.md §3.A (A2-A5, A7), reach.md §3.Q (Q1-Q3), reach.md §3.N1, reach.md §4 Workspace entity, reach.md §6 audit-friendly soft deletion and 6-month retention, reach.md §7 Q-RETENTION  
**Risks:** One person can be both an author (server-core roles) and a learner-side staff role; the two role models must merge cleanly. Scope checks missed in a single query leak data, so policy must be central and tested per role.

### RCH-02: People, invitations and learner profiles

Let admins and managers bring people in by email, manage them, and let learners look after their own profile.

**Features**

- Invite one or many people by email in one batch; role per person (default learner); groups per person or for the whole batch
- Pending invitations tab: resend or delete one or many, export to CSV, 'Invited by' column showing the inviter or 'self-registered'
- Deleting a pending invitation breaks its emailed link
- Invitations expire after 14 days by default (operator-configurable); an expired link shows an error and the admin sends a new one
- People list: search by name or email, filter by role and group, sort by last activity, self-registered tag, paged
- Person record: first and last name (edited separately), email, role, groups, last active session, self-registered flag, custom profile answers
- Change role from the list; affected admins, managers and reporters are emailed
- Delete one person with confirmation; bulk delete the current page or everyone matching the filter (runs as a background job)
- Deleted people stay in reports flagged as deleted; re-inviting the same email restores earlier progress
- Export the people list (name, email, last active, role, groups) to CSV, honouring active filters
- Learner profile: photo (upload, zoom, reposition), display language, name, email change confirmed at the new address, password reset by emailed link
- Password rule: at least 8 characters with a lower-case letter, an upper-case letter and a digit, and not containing the person's name
- Admin 'erase personal data' action for privacy requests: irreversible, removes identity, keeps anonymised report counts

**Done when**

- [ ] A batch invite of 50 addresses with mixed roles creates 50 pending invitations; addresses already registered or duplicated in the batch are listed as skipped
- [ ] Opening the link of a deleted invitation shows the invalid-link page and creates no account
- [ ] A password containing the person's first or last name (any letter case) is rejected; 'Abcdefg1' is accepted for someone not named Abcdefg
- [ ] A deleted learner's rows still appear in reports marked deleted; re-inviting the same email and accepting restores their enrolments and completions
- [ ] Bulk deleting all 5,000 people matching a filter completes in the background and reports the exact count removed
- [ ] An email change takes effect only after the link sent to the new address is opened
- [ ] The people CSV contains exactly the filtered rows and columns
- [ ] An erased person cannot be restored by re-invitation and no longer appears by name anywhere

**Spec refs:** reach.md §3.B (B1-B12, B14-B15), reach.md §3.T1, T4, reach.md §5 R-PEOPLE 21, reach.md §7 Q-INVITE-EXPIRY, Q-RETENTION  
**Risks:** Soft deletion keyed by email conflicts with uniqueness rules and with privacy erasure; restore-on-reinvite and erase must be designed together.

### RCH-03: Groups

Sort people into groups so training, managers and reports can work per team.

**Features**

- Create a group by unique name; rename or delete it
- Built-in Everyone group holding all current and future people; cannot be renamed or deleted
- Group page tabs: details, members, assigned training
- Add existing people by name, or new people by email (they get an invitation and join on acceptance)
- Members list: sort by name, email or role; search; filter by role; 50 per page
- Remove a member without deleting their account; bulk remove the current page or everyone matching the filter
- Export members (names and emails) to CSV
- Groups list: search; sort by name, creation date or member count
- Assign managers and reporters to groups
- Groups owned by an identity provider are marked and their membership is read-only in the app

**Done when**

- [ ] Everyone cannot be renamed or deleted through the UI or the API, and includes a person created a second ago without any membership row being written
- [ ] Adding a new email to a group sends one invitation; the person appears as a member only after accepting
- [ ] Sorting 500 groups by member count, including groups of 10,000 members, returns in under 1 second
- [ ] Membership edits on an identity-provider group are refused with a message naming the identity provider
- [ ] Removing a member leaves their account, other memberships and completed history intact

**Spec refs:** reach.md §3.D (D1-D8, D12-D13), reach.md §4 Group and Membership entities  
**Risks:** Member counts for huge groups and Everyone must come from aggregates, not row counts at read time.

### RCH-04: Package upload and isolated content hosting

Accept any standard course package, store it safely, and serve it from its own locked-down web origin.

**Features**

- Upload a SCORM 1.2 or SCORM 2004 (2nd, 3rd, 4th edition) zip up to 5 GB, one at a time, resumable after network drops; folders and non-zip files refused
- Manifest parsing and launch-file discovery through the shared package validator; problems shown in plain words
- xAPI and cmi5 zips accepted once RCH-18 is in place (our answer to Q-XAPI-IMPORT)
- Multi-SCO packages: each SCO listed as a lesson
- Package properties (standard, edition, launch file, tracking parameters) shown read-only
- Upload new version: applies at once to unpublished items; published items need 'publish new version'; enrolments and completion kept, progress restarts; older version files removed
- Uploading as a new item keeps no enrolments or history
- Isolated content origin with its own cookies, static and CDN-cacheable delivery, byte-range support for media
- Per-workspace content security policy for hosted packages: default allows only the package's own origin and our tracking endpoints; violations logged
- Safe unpacking: path traversal and decompression-bomb protection, file-count and size limits

**Done when**

- [ ] A 4.5 GB zip uploaded over a connection dropped twice completes, and its launch file is identified
- [ ] A folder upload, or a zip without a manifest, fails with a named reason and leaves nothing stored
- [ ] Every SCORM 1.2 and 2004 package in the conformance corpus imports with the correct launch file and lesson list
- [ ] A hosted package script that calls a third-party host is blocked by the default policy and logged, while its own-origin requests succeed
- [ ] A browser test shows content-origin cookies are unreadable from the app origin and the reverse
- [ ] After 'upload new version' on a published item, learners stay on the old version until 'publish new version'; then their enrolment and completion remain and progress starts over
- [ ] A zip containing '../' paths or a 1,000:1 compression bomb is rejected without writing outside its storage prefix

**Spec refs:** reach.md §3.H (H1, H5, H9, H13), reach.md §4 Content hosting, reach.md §5 R-COMP 5-6, R-TRK 36, reach.md §6 content store, isolated origin, resumable upload, reach.md §7 Q-XAPI-IMPORT, standards.md §3.10 S-2  
**Risks:** A separate content host name complicates single-VM installs (needs a second DNS name or wildcard); 5 GB uploads hit reverse-proxy body limits; untrusted zips are an attack surface.

### RCH-05: Training catalogue: publish workflow and per-item settings

Let admins review incoming training, set how it is completed and when it is due, and put it live or take it down.

**Features**

- Course list with states: unpublished, new changes, live, offline, removed; filters; CSV export of ID, title, owner, enrolee count, last activity
- Content types: course (several lessons), microlearning (one lesson), slide-app course, imported package
- Admin preview of the live version or the newest submitted version; previews never count as learner activity or usage
- Publish with settings: completion requirement for course-app items (percentage viewed, passing a chosen quiz lesson, both, or none; no quiz option for microlearning)
- Duration estimate shown to learners (default 30 minutes, editable); completion celebration on or off
- Certificate on or off and which design; due date: none, a fixed date, or N days after enrolment
- Library visibility, libraries and topics (fields appear once RCH-14 ships)
- Cover image (upload or pick, with alt text) and description for slide-app and imported items; course-app items take cover from the course theme
- Republish rules: in-progress learners see new content at once; completed learners keep completion; a lowered pass mark only helps after a retake; changing every lesson resets a hand-edited duration
- Take offline (blocks everyone, including enrolled learners) or bring back live
- Remove: cancels all enrolments, deletes the live version, discards pending changes, tags report rows 'deleted'; it returns only by resubmission, without old statistics
- Item page tabs: individually enrolled learners and groups; enrolee count covers both

**Done when**

- [ ] An enrolled learner opening an offline item sees an unavailable message; bringing it back live restores access with progress intact
- [ ] Removing an item ends its enrolments, marks its report rows deleted, and a later resubmission creates an item with no earlier statistics
- [ ] After republishing, an in-progress learner sees the new lesson content on next open and a completed learner is still complete
- [ ] A '7 days after enrolment' rule gives each learner a due date 7 days after their own enrolment day in the workspace time zone
- [ ] An admin preview creates no session, attempt or usage record
- [ ] The course-list CSV matches the filtered list row for row

**Spec refs:** reach.md §3.H (H1, H7-H8, H10-H11, H14), reach.md §3.I (I1, I3-I10), reach.md §5 R-COMP 3-4, reach.md §4 Item and Item version entities  
**Risks:** Republish semantics depend on stable lesson and quiz IDs from the course format; a mistake here silently loses learner progress.

### RCH-06: Publish and submit from the authoring apps

Let authors send finished courses straight from the blocks and slides editors, in the browser or on the desktop, to the learning server.

**Features**

- 'Publish to learning server' in the blocks editor in the browser and in the desktop app; later in the slides editor
- Desktop setting: server URL plus a personal access token created on the server, with a test-connection button
- Authors without admin rights submit for review: the blocks editor picks one admin to notify and may add a note; slides-editor submissions email all admins
- Admins who also author publish directly without a review step
- The blocks editor refuses to submit while any lesson is empty and names that lesson
- Slides-editor output is always SCORM 2004 4th edition; title up to 80 characters; whole project, one scene or one slide
- A stable project identifier ties republishes to the same item, which then shows 'new changes'
- Each submission raises a 'course submitted' event for webhooks once RCH-20 exists
- The notified admin's email links straight to the preview

**Done when**

- [ ] Publishing the same blocks project twice gives one item showing 'new changes', not two items
- [ ] A project with an empty lesson cannot be submitted, and the message names the empty lesson
- [ ] A desktop app with a revoked token gets a clear 'token revoked' message and no partial upload is left on the server
- [ ] The admin chosen at submission receives exactly one email with a working preview link
- [ ] Slides editor (after phase 5): a project published as 'one scene' arrives as a SCORM 2004 4th edition item that launches and tracks in RCH-07

**Spec refs:** reach.md §3.H (H2-H4, H6), reach.md §2 Flow steps 3-4, reach.md §6 Desktop ↔ server  
**Risks:** The slides editor arrives after this phase, so its half lands later. Desktop publishing must reuse server-core tokens, not grow a second sign-in system ahead of phase-8 sync.

### RCH-07: SCORM launch and tracking runtime

Launch SCORM packages for learners and store every bit of their progress reliably, including on sudden tab close.

**Features**

- Launch page that hosts the package frame on the content origin with SCORM 1.2 and SCORM 2004 API objects
- Full CMI data model stored per learner and attempt; saved on commit and on finish; values buffered between commits never lost
- Exit-time saves survive tab close through beacon-style posts
- Suspend data accepted well beyond SCORM 1.2's 4,096 characters (default cap 64 KB, configurable)
- Exit = suspend means every relaunch resumes the same attempt; a new attempt starts only on retake or reset
- Multi-SCO packages: each SCO is a lesson the learner picks; no automatic movement between SCOs; completion follows the package's own rules
- Imported packages open in a new window, with a clear message when pop-ups are blocked
- Session rows per launch (duration, lessons, score); sessions under 10 seconds dropped from activity but counted for usage; previews never tracked
- Package status mapped to exactly three report values: not started, in progress, complete; score and pass kept separately
- Handles SCORM 1.2 truncated question text and SCORM 2004's missing passing score
- Client batches value writes; server persists on commit and finish; any commit cadence accepted (Q-PERIODIC)

**Done when**

- [ ] Replaying the recorded course-app and slide-app SCORM 1.2 call sequences (R-TRK 29-32) produces the expected stored state
- [ ] Closing the tab immediately after the last interaction loses no committed or buffered value, in a headless browser test
- [ ] 64 KB of suspend data round-trips intact on relaunch
- [ ] Relaunching a suspended package resumes at the stored location in the same attempt; 'start again' creates attempt 2
- [ ] On the small setup (2 vCPU, 4 GB), 1,000 simulated learners committing every 20 seconds keep 95th-percentile commit time under 300 ms
- [ ] A 6-second session creates no activity row but marks the learner active for the usage report

**Spec refs:** reach.md §3.U (U2-U4), reach.md §3.N11, reach.md §5 R-TRK 29-35, R-RPT 15, reach.md §6 SCORM run-time bridge, scaling-relevant behaviour, reach.md §7 Q-PERIODIC, standards.md §3.10 S-1, S-3, S-4  
**Risks:** Exit-time bursts and chatty packages drive load; full SCORM 2004 sequencing beyond learner choice is deferred and some multi-SCO packages may expect it.

### RCH-08: Native course-app delivery and lesson tracking

Serve blocks-editor courses directly with our player and track them lesson by lesson, with quiz answers and media positions.

**Features**

- Course-app items are served as course data plus the shared player from the content origin, with no zip in between
- Tracking endpoints for lesson completed, progress percentage, quiz results per question, media positions and session time
- Progress percentage = completed required lessons divided by required lessons (our answer to Q-RISE-PCT); the percentage requirement is met when the last required lesson completes
- Resume at the top of the last lesson reached; audio and video resume at the saved position
- Completion: microlearning when all content is viewed; course when its requirement is met and the learner presses finish
- Quiz attempts stored per item version, attempt number, per-question answer, score and pass
- 'Start again' keeps the item under Completed
- Republish keeps completed lessons whose identifiers are unchanged

**Done when**

- [ ] A 10-lesson course with a percentage requirement completes exactly when the last required lesson completes and the learner presses finish
- [ ] Closing the course mid-lesson 4 and reopening lands at the top of lesson 4; a video resumes within 2 seconds of its saved point
- [ ] A 5-question quiz taken three times stores per-question answers for each attempt and identifies the best attempt
- [ ] After a 60-second network drop during a lesson, queued progress saves on reconnect with no duplicate session rows
- [ ] The same course exported as SCORM and run in RCH-07 reaches the same completion result as the native version

**Spec refs:** reach.md §3.U1, reach.md §3.I1, N8-N9, N11-N12, reach.md §5 R-COMP 2, R-LEARN 11-12, reach.md §6 native tracking endpoints, reach.md §7 Q-RISE-TRACK, Q-RISE-PCT  
**Risks:** The reference protocol is unknown, so this is our own design; it must agree with the SCORM/xAPI exports of the same course or reports will disagree.

### RCH-09: Enrolment and assignment engine

Decide who has which training, through people, groups and Everyone, without slowing down at large scale.

**Features**

- Manual enrolment of people or groups, also on unpublished items (visible once published)
- Group enrolment including Everyone; members inherit all of a group's training, including items assigned before they joined
- Groups chosen at invitation enrol the person when they accept
- Rules evaluated lazily so Everyone and large groups never expand into per-person rows until a learner opens something
- Enrolment record: target (item or path), person or group, source (direct, group, self, link, API, import, sign-in claim, CSV), enrolled-at, due-at, enrolled-by
- Due date counted from each learner's own enrolment day (join day for group inheritance) in the workspace time zone
- Unenrol a person or a group; removing training from a group unenrols its members
- Leaving a group (our answer to Q-GROUP-LEAVE): unenrols from that group's not-started training; started and completed training keeps its progress and history
- Item learner tab lists individual enrolments only; group enrolments appear on the groups tab
- Enrolment events feed enrolment emails (RCH-11) and webhooks (RCH-20)

**Done when**

- [ ] Assigning an item to Everyone in a 100,000-person workspace finishes in under 1 second and writes a constant number of rows
- [ ] A person who joins a group a week after an assignment sees all of its items with due dates counted from their join day
- [ ] A learner enrolled directly and through a group appears once in reports with both sources recorded
- [ ] Removing an item from a group removes it from members' Learn pages; members who had completed it stay complete in reports
- [ ] A manual enrolment on an unpublished item appears for the learner the moment the item is published

**Spec refs:** reach.md §3.L (L1-L4), reach.md §3.D9-D11, reach.md §3.I6, M1, reach.md §5 R-PEOPLE 20, R-DUE 9, reach.md §6 rule engine for enrolment inheritance, reach.md §7 Q-GROUP-LEAVE  
**Risks:** Lazy evaluation makes reports harder to aggregate; the access check must be one shared function used by Learn, launch, reports and API.

### RCH-10: Learner portal (Learn page)

Give every learner one clean page to find their training, take it, see what is due and collect certificates.

**Features**

- Learn page: sidebar with counts and assigned items newest first with 'show more'; My Learning with In progress and Completed; Favourites
- In-progress cards: cover, title, average completion time, due date, progress bar once started; sort by due date (default), enrolment date (default when nothing is due) or title
- Completed cards: final quiz score, completion date, certificate link
- Due status: 'no due date'; an hour counter when under 24 hours left or under 24 hours overdue; 'N days overdue' beyond that; overdue items stay completable
- Heart toggle to favourite any item, enrolled or not
- Start, resume and 'start again'; completion screen with optional celebration and certificate download
- Deep links to a training item: signed-out visitors sign in first and land on it; it opens only if the learner is enrolled or it is visible in their library
- Learn-area text externalised for 20 languages, English at first release; follows the learner's profile language with per-string English fallback
- Language picker on training when the course carries translations
- Responsive layout, full keyboard use and screen-reader support (WCAG 2.2 AA)

**Done when**

- [ ] An item due in 20 hours shows an hour counter; one 3 days overdue shows '3 days overdue' and still opens
- [ ] With no due dates, the In progress list sorts by enrolment date
- [ ] Retaking a completed item keeps it under Completed
- [ ] The certificate downloads from the completion screen, the card and the sidebar, and is absent when the requirement is unmet and no attempts are left
- [ ] Automated accessibility checks report zero serious violations on Learn pages, and the full take-a-course flow works by keyboard alone
- [ ] Switching the profile language to French shows the Learn area in French where strings exist and English for the rest

**Spec refs:** reach.md §3.N (N1-N6, N11-N15), reach.md §3.E9-E10, reach.md §3.I4, reach.md §5 R-DUE 9-10, R-LEARN 12  
**Risks:** Twenty language catalogues need translators or AI-assisted translation review; content translations depend on Translate (phase 6), so the picker stays hidden until then.

### RCH-11: Due dates, reminders and email notifications

Tell learners and staff by email when training is assigned, coming due, overdue or done, on a schedule the company sets.

**Features**

- Scheduled due-soon and overdue reminders in the workspace time zone; timing and frequency set workspace-wide; reminders cannot be switched off
- Our defaults (Q-REM): due-soon 3 days and 1 day before; overdue 1 day after, then every 7 days, at most 4 overdue reminders
- Emails: welcome/registration, enrolment (listing the training), coming due, overdue, completion, role change, API key created (to creator and owner)
- Admin preview of every email; replace subject and body text; placeholders for learner name, training name and due date
- Custom welcome text only for people invited from the app, with the inviter's name and email appended
- Default emails in the learner's language; customised emails go out as written; previews in English
- Logo and brand colour in every email
- Bounces and complaints mark the address undeliverable on the person's record
- Each reminder sent at most once per enrolment and window, even across restarts
- No automatic notice when an item a learner took is updated

**Done when**

- [ ] With the workspace in Asia/Karachi time, the due-soon email goes out on the configured day in that time zone, not in UTC
- [ ] Restarting the server during a reminder run sends no duplicate reminder
- [ ] A customised subject with all three placeholders renders the right learner name, training name and due date
- [ ] A learner whose language is German receives default emails in German and customised emails as written
- [ ] Completing an item cancels its pending reminders
- [ ] Trying to disable reminders is impossible from the UI and the settings API

**Spec refs:** reach.md §3.M (M1-M7, M10), reach.md §3.D11, B15, reach.md §5 R-DUE 9, R-NOTIFY 26, reach.md §6 scheduler and email sender, reach.md §7 Q-REM  
**Risks:** Self-hosters' SMTP setups vary widely; deliverability and bounce feedback depend on their mail provider.

### RCH-12: Certificates

Give learners a certificate for finished training, using a standard or company-designed layout.

**Features**

- Standard certificate in every workspace: training title, learner name, completion date, company name
- Custom designs: always title, learner name and completion date; optional logo (defaults to workspace logo), company name, duration, quiz score, start date
- Rename, edit and delete designs; mark one as the default for future publishing without changing existing items
- Deleting a design in use falls back to the standard certificate; deletion cannot be undone
- PDF output, landscape, A4 or Letter by workspace setting, no expiry (our answer to Q-CERT)
- Quiz score printed is the score when the requirement was first met
- Issued-certificate record per completion; admins download any learner's certificate from reports
- Path certificates for learning paths (used by RCH-15)
- Original layouts only; no vendor artwork

**Done when**

- [ ] A learner who first passes with 80% and later retakes with 95% gets a certificate showing 80%
- [ ] Deleting a design used by 3 items switches those 3 items to the standard certificate
- [ ] Setting a new default design leaves existing items' designs unchanged
- [ ] Names in Arabic, Chinese and Polish render correctly and the PDF text is selectable
- [ ] A learner given a manual completion can download their certificate

**Spec refs:** reach.md §3.O (O1-O5), reach.md §3.I5, Q3, reach.md §5 R-LEARN 13, reach.md §7 Q-CERT  
**Risks:** Server-side PDF rendering with full script and font coverage adds a heavy dependency (headless browser or PDF library) to the Docker image.

### RCH-13: Core reports and manual completion

Show admins, managers and reporters who started, finished and passed what, and let them record offline completions.

**Features**

- Analyze dashboard tiles (all time): published items including offline, total users, completions, learning hours
- Activity report: one row per session (learner, training, lessons, quiz score, date, active time, status); sortable; search; default last 90 days; click-through to learner, course or quiz; CSV export
- Learner report: everyone ever registered, deleted people flagged; ring of completed, in progress, not started; learning hours; status tab with enrolment date and self-enrolled flag, overdue in red; expandable rows with the latest 15 sessions; activity tab; CSV export
- Course report: lessons, ring, hours, average quiz score; status tab filtered by period, group and learner; custom profile fields in row details and CSV; activity tab
- Quiz colours: red failed, green passed, black when the quiz is done but the item is still in progress
- Progress percentage hidden for slide-app and imported items
- Manual completion: date (default today), time spent (at least 1 minute, added to existing), quiz score if required; the learner then counts as active and can download the certificate
- Managers and reporters see only their groups' learners and items, everywhere including totals and exports
- Status values are exactly: not started, in progress, complete
- Session rows written at commit; aggregates refreshed in the background, at most 5 minutes behind
- Deleted people and items stay in reports, flagged; a removed item's report can be deleted
- Exports in CSV (our answer to Q-EXPORT), streamed for large tables

**Done when**

- [ ] With 1 million session rows, the first page of the activity report loads in under 1 second
- [ ] A 200,000-row CSV export streams without the server using more than 256 MB extra memory
- [ ] A completion appears in learner and course reports within 5 minutes
- [ ] A manual completion of 30 minutes adds 30 minutes to the learner's existing time and unlocks their certificate
- [ ] A reporter scoped to group A sees no learner outside group A in any tab, total or export
- [ ] A deleted item's rows show the deleted tag, and deleting that item's report removes them

**Spec refs:** reach.md §3.P (P1-P4, P6, P10-P13), reach.md §3.H12, reach.md §3.T1, T3, reach.md §5 R-COMP 8, R-RPT 15, 17-18, reach.md §6 report pipeline and exports, reach.md §7 Q-EXPORT  
**Risks:** Report queries over lazily evaluated enrolments are the main performance risk; pre-aggregation must stay correct when people, groups and items are deleted or restored.

### RCH-14: Libraries, topics and self-enrolment

Let learners browse and pick training themselves from libraries organised by topic.

**Features**

- Default library: cannot be renamed or deleted, always live, open to everyone except excluded groups or people
- Custom libraries: create, name, add courses and learning paths, add groups and people, switch live or offline, delete (content is kept)
- Learners see only libraries they can access and self-enrol from them; 'self-enrolled' recorded and shown in reports
- Content assigned to Everyone stays available to people excluded from its library
- Unlisted items are visible only to enrolled learners on their Learn page
- Topics: create, rename, delete (removed from all items); searchable list; no manual ordering
- Library sidebar topics ordered by item count, then alphabetically; topics with no content in the current library hidden
- Learning path topics kept separate from the topics of items inside the path
- Browse: search by full or partial title; sort newest first by publish or update date, or A-Z; filter by type, author and topic

**Done when**

- [ ] A person excluded from the default library cannot see it but still sees an item assigned to Everyone
- [ ] Self-enrolling from a library creates an enrolment with source 'self' that shows as self-enrolled in the learner report
- [ ] Deleting a custom library leaves its items published and enrolments intact
- [ ] Deleting a topic removes it from every item; the sidebar never shows a topic with zero items in the current library
- [ ] A partial-title search returns all matching items in the libraries the learner can access, and none from others

**Spec refs:** reach.md §3.J (J1-J8), reach.md §3.N7, reach.md §3.L2, reach.md §3.I7-I8  
**Risks:** Library access combines with group assignment and exclusions; the access rules must live in the RCH-09 access check, not be re-implemented here.

### RCH-15: Learning paths

Bundle several training items into an ordered path with its own enrolment, report and certificate.

**Features**

- Create a path: name, pick published items by search, reorder by drag, remove items
- Optional 'complete in order': each item unlocks after the previous one
- Per-item completion requirement and due period, edited from the path's item list
- Path duration summed at creation; later item length changes need a manual edit
- Cover photo, description, topics, library visibility, online/offline switch, share link and QR code
- Path certificate on or off; finishing a path gives only the path certificate
- Enrol people and groups (groups listed A-Z); Everyone enrols all current and future people
- Imported packages can sit in a path and still open in a new window
- A path is complete only when every item meets its requirement; path metrics unchanged on retake
- Path changes (our answer to Q-PATH-DUE): paths have per-item due periods only; adding an item enrols existing path learners in it and reopens completion; removing an item stops it counting
- Learning path report: roster with status, time to completion, enrolment date, last activity, next due date; per-item drill-down; courses tab; activity tab; PDF export

**Done when**

- [ ] With 'complete in order' on, item 2 is locked until item 1 is complete
- [ ] Finishing the last item of a path issues the path certificate and no item certificates
- [ ] Adding an item to a path whose learner was complete puts that learner back to in progress
- [ ] Retaking an item in a completed path does not change the path's time-to-completion or status
- [ ] The path report PDF matches the on-screen roster for the same filters

**Spec refs:** reach.md §3.K (K1-K9), reach.md §3.P8, T2, reach.md §5 R-LEARN 12, 14, reach.md §7 Q-PATH-DUE  
**Risks:** Path completion on content change is unspecified in the reference; our rule may surprise admins migrating from it, so the behaviour needs clear on-screen wording.

### RCH-16: Self-registration, share links, CSV import and custom profile fields

Let large numbers of people join and be described without one-by-one admin work.

**Features**

- Custom learner fields of type text or drop-down; label and each option up to 50 characters, description up to 120, answer up to 200, up to 200 options
- Required fields must be filled before the learner record saves; fields show on sign-up, learner records, report row details and CSV exports
- Admins edit a learner's answers on the record; deleting a field deletes its answers, and re-creating the same name does not bring them back
- Self-registration switched on or off by owner or admin
- Workspace sign-up link and QR code: visitor types an email, gets an invitation automatically, joins as a learner tagged self-registered, no approval step
- Sign-up page with workspace logo and brand colour, custom title (up to 100 characters) and body (up to 600), plus custom fields
- Group sign-up link and QR code (file named after the group) adds new and existing people to that group (our answer to Q-LINK); not available for identity-provider groups
- Turning registration off stops new links; turning it back on invalidates old workspace links but keeps group links; deleting a group's links disables its sign-up; already-invited people can still finish
- Share URL and QR code for every item and path, on by default; existing users go straight in, new visitors can sign up if registration is on; path links only for visible items in the default library
- CSV import: template download; columns first name, last name, email, optional groups, optional 'Custom: <field>'; names and email required up to 50 characters, groups up to 100; learners only
- Import skips duplicate and existing emails, ignores group changes for existing people, and uses custom-field columns only to update existing learners
- Import preview shows how many learners will be added and which existing ones change, file replaceable; result shows imported, modified and error counts with a downloadable annotated error CSV
- On confirm, invitations go to all new learners; group-scoped import emails existing people about new group training

**Done when**

- [ ] A 10,000-row CSV with 50 duplicates and 20 bad emails previews the exact add and change counts, imports the rest, and the error CSV lists the 70 problem rows with reasons
- [ ] A required custom field blocks sign-up until answered, and its answer appears in the course report CSV
- [ ] Re-enabling self-registration makes an old workspace sign-up link fail while an existing group link still works
- [ ] A signed-out existing user following an item share link signs in and lands on that item
- [ ] Scanning a group QR code as an existing learner adds them to the group and its training

**Spec refs:** reach.md §3.C (C1-C6), reach.md §3.E (E1-E8, E11), reach.md §3.F (F1-F7), reach.md §5 R-PEOPLE 22-23, reach.md §7 Q-LINK  
**Risks:** Open sign-up links invite abuse; rate limits and an optional allowed-email-domain setting are likely needed even though the reference has no approval step.

### RCH-17: Group, question-level and usage reports

Give deeper views: how each team is doing, how each quiz question performed, and how many people actually learn each month.

**Features**

- Group report: progress breakdown and cumulative hours; learners tab (last 10 items per learner), courses tab, activity tab; filters; PDF export
- Question-level report for the quiz set as the completion requirement: answer distribution per question, each learner's answers, attempts menu (best attempt by default), version selector, CSV export
- Survey and essay answers left out of averages; quizzes with only ungraded questions labelled 'Survey'; duplicate question titles excluded
- Changing the requirement quiz hides the old quiz's data; each version keeps its own attempts
- Usage report for capacity planning: term split into 30-day windows from term start (leftover days join the last window); unique active people per window and term total; filter by group
- Active means: started the first lesson of a course or path, opened a microlearning, resumed earlier training, or got a manual completion; viewing an outline does not count; all roles count; deleted people still counted
- Shared PDF rendering for reports (same service as certificates)

**Done when**

- [ ] The group report PDF matches on-screen numbers for the same filters
- [ ] A question answered A by 6 learners and B by 4 shows a 60/40 split, and the default attempt shown is each learner's best
- [ ] Switching the requirement quiz hides the old quiz's question data; switching back shows it again
- [ ] A learner active on days 3 and 25 of one window counts once; one active in two windows counts once in each
- [ ] Viewing only a course outline does not make a learner active

**Spec refs:** reach.md §3.P (P5, P7, P9), reach.md §3.T1-T2, reach.md §5 R-USAGE 19, R-RPT 16, reach.md §6 usage metering  
**Risks:** Question-level data depends on stable question identifiers across versions from the course format and on SCORM interaction data that packages report inconsistently.

### RCH-18: xAPI learning record store and cmi5 launcher

Host xAPI and cmi5 courses and record their statements inside the learning server, with optional forwarding to a company's own record store.

**Features**

- xAPI endpoints: statements, activity state, activity profile, agent profile; versions 1.0.3 and 2.0
- Per-launch credentials scoped to one learner, registration and activity, passed on the launch URL (our answer to Q-LRS)
- Accepts the observed pattern: resume-state fetch first, then statements with the package's own IDs; resume state written whenever the package chooses (Q-SL-RESUME)
- cmi5 launcher: launch URL, one-time token fetch, LaunchData state, launched, abandoned, waived and satisfied statements, move-on evaluation, return URL
- xAPI (tincan.xml) and cmi5 (cmi5.xml) zip upload alongside SCORM
- Statements mapped into Reach attempts, sessions, completion and scores so reports treat them like any other item
- Optional forwarding of statements to a company's external record store
- Slides-editor output that carries its own record-store credentials keeps working

**Done when**

- [ ] The ADL LRS conformance suite passes for xAPI 1.0.3
- [ ] The cmi5 CATAPULT LMS test suite passes
- [ ] Launching an xAPI course records its 'attempted' and 'experienced' statements and shows the learner as in progress
- [ ] Credentials from one launch cannot read or write another learner's state (401 or 403)
- [ ] With forwarding switched on, every statement reaches the external store, with retries if it is down

**Spec refs:** reach.md §3.U5, reach.md §4 Formats (xAPI launch), reach.md §5 R-TRK 33, reach.md §6 xAPI LRS endpoints, reach.md §7 Q-LRS, Q-XAPI-IMPORT, Q-SL-RESUME, standards.md §3.10 S-5, S-6  
**Risks:** Statement volume grows fast and needs its own storage and indexing plan; mapping free-form xAPI to the three report statuses loses detail.

### RCH-19: Learner single sign-on and SCIM provisioning

Let learners sign in with the company's identity provider and keep people and groups in sync from it.

**Features**

- SAML 2.0 sign-in for learners with any identity provider, switched on by the owner; metadata upload and a test-login button; sign-in started from either side
- Required attributes: first name, last name, email, unique name ID; optional avatar URL and groups
- SAML learners appear in the people list after their first sign-in
- Group claim applied at every sign-in: groups matched by name and created if missing; an app-deleted group comes back if still in the claim
- SCIM 2.0 users and groups: given name, family name and user name (email) required; optional avatar and external ID; people appear as soon as provisioned (our answer to Q-SCIM: groups push supported)
- Identity-provider users cannot edit name or password in the app and carry an ID badge
- SCIM users removed only through the identity provider; SAML users removed there first, then in the app
- Manually added learners coexist and are never touched by the identity provider
- No built-in multi-factor sign-in for these users; it is left to the identity provider
- Google or other OpenID Connect sign-in; Google-authenticated people cannot change their email
- Idempotent upserts keyed by external ID and email, so delayed or repeated events are safe

**Done when**

- [ ] Signing in through a test identity provider with a groups claim of 'Sales' creates the person and the Sales group and enrols them in Sales training
- [ ] Deleting 'Sales' in the app and signing in again with the same claim brings the group back
- [ ] A SCIM create followed by the same create again yields one person, and a SCIM delete removes them while their report history stays flagged
- [ ] An identity-provider learner's name and password fields are read-only in the profile
- [ ] A manually invited learner is unaffected by any SCIM sync

**Spec refs:** reach.md §3.G (G1-G10), reach.md §3.B13, reach.md §3.D13, E5, reach.md §5 R-PEOPLE 24, reach.md §6 Auth and idempotent upserts, reach.md §7 Q-SCIM, teams-collab.md §3.S  
**Risks:** Identity providers differ in attribute names and group claims; needs a test matrix against at least two open-source identity providers.

### RCH-20: Public REST API, API keys and webhooks

Let HR systems and other tools read and change the same data, and react to events as they happen.

**Features**

- JSON REST API over HTTPS with bearer API keys; dated version header (missing means the first version, unknown gives 400); version echoed in responses; published OpenAPI document
- Cursor paging with a 'nextUrl' (null at the end) and 'limit' 1-100, default 50, up to 2,000 on report and webhook lists
- Errors: 400 with a list of code and message; per-resource not-found codes; 409 for duplicate webhook targets
- Resources: courses (list, get, filter by type), course enrolments, favourites, groups (create, read, update, delete, filter by name), group memberships, invitations, learning paths and their courses, path enrolments, reports (activity, course, learner, path, group), users (list, get, filter by email, delete), managers' and reporters' groups, webhooks
- Enrol or unenrol people or groups on courses and paths; 'everyone' is a valid group ID
- User deletion through the API only for plain learners (not identity-provider managed, not staff, not the owner)
- Completion import: started and completed times; one record per person and item, repeat calls overwrite; creates the enrolment if missing; tied to the live version; duration = completed minus started; required quiz set to 100% for course-app items; no score for packages; accepted asynchronously
- API keys: named, unlimited, value shown once, list with creator, created and last-used dates; revoke one or all with type-to-confirm; revocation immediate and permanent; creation emails creator and owner
- Rate limits with standard headers (our answer to Q-RATE; operator-configurable)
- Webhooks: unique target URL, event list, optional shared secret shown only at creation, API version
- Events: course completed (with quiz pass and score), course submitted for review, enrolments created (course or path, people and/or groups, who enrolled), user created
- Envelope: event ID, created time, type, webhook ID, API version, data; signature header = hex HMAC-SHA1 of the body with the shared secret
- Only HTTP 200 acknowledges; anything else retried 14 more times over 48 hours (15 attempts); delivery log with manual redeliver

**Done when**

- [ ] A request without a version header gets the first version; an unknown version gets 400 with a code and message
- [ ] Paging through 10,000 users with limit 100 returns each user exactly once and ends with nextUrl null
- [ ] Importing the same completion twice keeps one record with the second call's dates and creates the enrolment if it was missing
- [ ] A revoked key fails on its very next request
- [ ] A webhook receiver answering 500 gets exactly 15 attempts within 48 hours, and each signature verifies with the shared secret
- [ ] Registering the same target URL twice returns 409
- [ ] Deleting an SSO-managed user or an admin through the API is refused with a clear error code

**Spec refs:** reach.md §3.R (R1-R7), reach.md §3.S (S1-S6), reach.md §3.L5, M2, reach.md §5 R-COMP 7, R-API 27-28, reach.md §6 webhook dispatcher, reach.md §7 Q-RATE, Q-API-VER  
**Risks:** HMAC-SHA1 is weak by today's standards; we match it for compatibility and can add a SHA-256 header alongside. A large public API surface becomes a long-term compatibility promise.

### Deliberately out of scope

- US/EU data regions with separate web and API hosts and region pinning (A1, §6): each self-hosted server is its own region; data stays where the company deploys it
- Plan-limit usage banners and admin emails near a seat limit (A6): a free self-hosted product has no plans or seat limits; the usage report itself is kept in RCH-17
- Trial-workspace CSV row cap (F8): there are no trials
- Subdomain derived from the organisation name and in-app subdomain change with a 30-day redirect (A1, Q4, R-PEOPLE 25): the host name is set in server configuration by the operator, and old-host redirects belong in their reverse proxy
- In-app custom domain validation with CNAME/CAA records and automatic certificates (Q5): a deployment concern handled by the Docker Compose reverse proxy and the Helm chart (phase 7), not a Reach screen
- Custom sender address verified through DKIM and return-path records (Q6): the sender is an SMTP setting in server core; DKIM is set up at the company's own mail provider
- Microsoft Teams and Slack direct messages and link preview cards (M8, M9, Q-SLACK): deferred, because each company must register its own bot app and email already covers every reminder; revisit as an optional module after v1
- Zapier connector (S7): would need an app listing we would have to run on a third-party platform; the API and signed webhooks cover the same triggers and actions, and community connectors can come later
- Several separate workspaces on one server (multi-tenant subdomain routing): one workspace per deployment for now; revisit for service providers hosting many companies
- Offline learner download (N16): the reference is online-only too, and the desktop app is for authors
- AICC package upload: not supported by the reference; legacy format; an AICC endpoint stays a later option in the standards work
- 'LMS export settings' panel under item descriptions (Q-LMS-EXPORT): purpose unknown; skipped until specified
- Usage beacon to the authoring vendor (R-TRK 36): never emitted by our apps; the default content security policy blocks such beacons in hosted packages
- Copying the reference's delays (SSO user events arriving 5-10 minutes late, reports up to 5 minutes behind): not goals; 5 minutes is treated as an upper bound
- Exact wire compatibility with the reference API paths and version dates (Q-API-VER): our API follows the same behaviour rules under its own documented paths; a compatibility layer can be considered later
- Classroom scheduling, a complex rules engine and paid catalogue sales: deliberately excluded by the product's purpose
- Ownership transfer as a vendor-support-only operation (A5): replaced by owner self-service and a server-operator command in RCH-01

## Translate and AI (Course Suite working name): AI authoring help, multi-language courses, language validation and the learner tutor

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| LOC-01 | AI provider layer and key handling | mvp | shared-engine | L | M6 | Phase 0 foundations/CI, Server core (phase 3) for the org-level key store |
| LOC-02 | AI policy, usage log and quotas | v1 | both | M | M6b | LOC-01, Server core (phase 3), Teams admin console (AI policy and group quota screens) |
| LOC-03 | Reference sources for AI | v1 | both | L | M6b | LOC-01, LOC-09, Blocks editor (phase 2) |
| LOC-04 | Text assistant in the Blocks editor | mvp | both | M | M6 | LOC-01, Blocks editor (phase 2) |
| LOC-05 | Course draft wizard | v1 | both | L | M6b | LOC-01, LOC-03, LOC-04, LOC-07 (image option only), Blocks editor snapshots |
| LOC-06 | Block and question generation in the Blocks editor | v1 | both | L | M6b | LOC-01, LOC-03, LOC-04, Blocks editor block catalogue and quiz (phase 2) |
| LOC-07 | Image generation and editing | v1 | both | L | M6b | LOC-01, Blocks editor media and placeholders (phase 2) |
| LOC-08 | Narration and voice library | v1 | both | L | M6b | LOC-01, Blocks editor audio (phase 2), Shared engine narration record |
| LOC-09 | Captions and alt-text suggestions | mvp | both | M | M6 | LOC-01, Blocks editor media library and caption editor (phase 2), Shared engine accessibility checker |
| LOC-10 | AI tools in the Slides editor | v1 | both | L | M6b | LOC-01, LOC-04, LOC-06, LOC-07, LOC-08, Slides editor (phase 5) |
| LOC-11 | Chat assistant that edits the project | later | both | XL | LATER | LOC-01, LOC-02, LOC-04, LOC-07, LOC-08, LOC-09, Shared engine command and undo API, Slides editor (phase 5) |
| LOC-12 | Sound effects and presenter avatars | later | both | M | LATER | LOC-01, LOC-02, LOC-08 |
| LOC-13 | Learner AI tutor | v1 | both | L | M6b | LOC-01, LOC-02, Server core (phase 3), Shared engine player plugin slot, Blocks editor course settings (phase 2) |
| LOC-14 | Translation runs | mvp | both | L | M6 | LOC-01, Shared engine multi-language format and segment model, Blocks editor (phase 2) |
| LOC-15 | Glossaries | mvp | both | M | M6 | LOC-14 |
| LOC-16 | Multi-language editing and publishing in the Blocks editor | mvp | both | L | M6 | LOC-14, Blocks editor (phase 2), Shared engine multi-language player and exporters |
| LOC-17 | Multi-language editing in the Slides editor | v1 | both | L | M6c | LOC-14, LOC-16, Slides editor (phase 5) |
| LOC-18 | Source updates and language lifecycle | mvp | both | M | M6 | LOC-14, LOC-16 |
| LOC-19 | XLIFF and Word translation exchange | mvp | both | L | M6 | Shared engine segment model, LOC-16 |
| LOC-20 | Language validation and AI translation checks | v1 | server | XL | M6c | LOC-14, LOC-16, LOC-18, Review (phase 3): review links, guest validators, versions, comments, Server core co-editing (Yjs + Hocuspocus) |

### LOC-01: AI provider layer and key handling

One place every AI and machine-translation feature calls, using the author's own key or a local model on desktop and one company key on the server.

**Features**

- Capability registry: text generation, JSON-schema structured output, tool calling, machine translation, speech-to-text, text-to-speech, sound effects, image generation/editing, vision (describe image), embeddings
- One provider config per capability; a capability with no provider shows its controls as unavailable with a 'set up a provider' link
- First adapters: any OpenAI-compatible chat API (covers Ollama, llama.cpp server, vLLM, LM Studio), Anthropic, DeepL, LibreTranslate/Argos, whisper.cpp; later adapters arrive with the epics that need them
- Desktop: keys stored in the OS keychain, never in project files, settings exports, logs or crash reports; connection test and model list per provider
- Server: one org key per capability, encrypted at rest; every provider call is made server-side; browsers and published packages never receive a key
- Structured output validated against a JSON schema, one automatic repair retry, then a typed failure (never a partial insert)
- Streaming, cancellation, timeouts, per-provider concurrency limit and rate-limit backoff
- Provenance stored with every generated item: provider, model, settings, prompt template version, time
- Usage event per call (tokens, characters, audio seconds, images) handed to metering
- No prompt or output content logged by default; an opt-in debug log
- Original, versioned prompt templates that a company can override; output language defaults to the current working language
- Providers and region are the company's choice (data residency is configuration, not a vendor promise)

**Done when**

- [ ] An automated matrix runs the same rewrite request against a stub OpenAI-compatible server and a stub Anthropic endpoint in CI; a manual checklist confirms a real local Ollama model and a real cloud key
- [ ] After configuring keys, a scan of project files, app logs, crash dumps and an exported SCORM package finds no key material
- [ ] On the server edition, browser network traffic during any AI action contains no provider key and goes only to the company server
- [ ] Cancelling a streaming request stops provider traffic within 1 second and leaves the document unchanged
- [ ] A malformed JSON response is retried once, then surfaces a typed error and inserts nothing
- [ ] With no network and no local model, every AI control shows as unavailable with a reason and non-AI editing is unaffected

**Spec refs:** specs/localization-ai.md §1, §3.1, §6 (desktop edition, data residency), §8 BYO key and local-model mapping and provider-layer rules  
**Risks:** Local models vary widely in JSON and tool-calling reliability; some Linux desktops lack a keychain (needs an encrypted-file fallback with a warning); provider APIs change often, so adapters need contract tests on recorded fixtures; licences of any optional model download must be checked before offering it.

### LOC-02: AI policy, usage log and quotas

Let a company control who can use AI and translation, see what it uses, and cap it, in place of vendor credits.

**Features**

- Enforce the org AI policy (everyone, chosen groups, no one; at least one group stays on; default for new groups) in every AI and Translate entry point and on the server API
- Users without AI access see AI controls hidden or disabled with a reason; the server refuses their calls regardless of client
- Optional per-group quotas in tokens, characters (translation, speech) and minutes (audio, video), with low-quota warnings and a hard stop at zero
- At zero quota, existing translations can still be edited, validated and published; only new AI work stops
- Usage log per call and per translation run: user, group, course, languages, characters or tokens, provider, model, UTC time; CSV export
- Cost estimate before large jobs (translation run, narration batch, avatar video) from admin-entered unit prices
- Desktop: local usage meter per provider with optional price per unit and CSV export
- Thumbs up/down feedback on AI outputs, with optional comment, kept in the company's own store (or locally on desktop), never sent elsewhere
- Experimental-features switch (chat assistant) and labs switch (avatars) per organization and per app

**Done when**

- [ ] A user in a group with AI off is refused by the API when calling it directly, and sees no working AI controls
- [ ] Setting the policy to 'specific groups' with zero groups enabled is rejected
- [ ] A group with a 10,000-character translation quota can run a 9,000-character job, sees a warning at the configured threshold, and is blocked from a further 2,000-character job with a clear message
- [ ] The usage CSV has one row per call with UTC timestamps and its totals match the totals shown in the UI
- [ ] Giving feedback makes no outbound request other than to the company's own server

**Spec refs:** specs/localization-ai.md §3.1, §3.20, §6 (policy, audit and usage), specs/teams-collab.md R5, R6, R22, B6  
**Risks:** Policy and quota screens belong to the Teams admin console, so ownership must stay split (screens there, enforcement and metering here); cost estimates are only as good as admin-entered prices; character counts must match how each provider bills.

### LOC-03: Reference sources for AI

Authors upload reference material once per course and every AI generation can draw on it.

**Features**

- Course-level source library reused by drafts, block and question generation, summaries and the slide-editor quiz
- Source types: PDF, Word, PowerPoint (including speaker notes), Excel, plain text, CSV, caption files (VTT/SRT), Course Suite project files (text only), audio and video (transcribed first), public web URLs
- Per-source instructions (for example 'use only chapter 3')
- Default limits: PDF up to 1 GB and 200,000 extracted characters; configurable by the server admin
- Public URLs only: pages needing a login, behind a paywall or disallowed for crawlers are refused with a reason
- Chunking and retrieval so large sources still ground answers; keyword retrieval works offline, embeddings optional
- Generated output records which source passages it drew on
- Extract images from PDF, Word and PowerPoint sources and offer them for placement (last slice)
- Sources stored with the project (desktop: project folder; server: object storage) and removable at any time

**Done when**

- [ ] A 150-page PDF, a PPTX with speaker notes and an MP3 lecture can be added and their extracted text viewed; the PPTX notes are included
- [ ] A PDF over 200,000 extracted characters is refused with the limit stated
- [ ] A URL that returns a login wall or is disallowed by robots rules is refused with a specific message; a public page is accepted
- [ ] Removing a source removes it from all later generations
- [ ] The whole flow works offline with a local model and keyword retrieval

**Spec refs:** specs/localization-ai.md §3.1 (source content), §2 AI authoring flow, §5 rule 16 (PDF limit)  
**Risks:** PDF and PPTX parsing fidelity varies; URL fetching must respect crawler rules and not become a scraper; retrieval quality decides answer quality on small local models; image extraction is the least reliable slice.

### LOC-04: Text assistant in the Blocks editor

Draft and polish course text in place, with every result reviewed before it lands.

**Features**

- Write new text from a prompt at the cursor or on an empty line, using surrounding lesson text (and course sources once LOC-03 lands)
- Rewrite a selection: change tone, shorten, lengthen, adapt for an audience, fix grammar, improve readability, expand
- Reformat a selection into a list or table, add bold, or add emoji
- Edit a whole block with an instruction, then replace it or insert the revision below; the block keeps its sources
- Lesson summary paragraph with optional focus areas and writing style
- Course summary lesson: summary paragraph, talking points, a curated note and a closing message; regenerate with a focus
- Generation history per action with a counter and back/forward
- Output in any language the model supports, defaulting to the current working language
- Stop generating at any time; closing the panel discards unapplied output; each insert or replace is one undo step

**Done when**

- [ ] 'Shorten' on a selected sentence replaces only the selection, keeps formatting outside it, and one undo restores the original
- [ ] Edit-block 'replace' and 'insert below' both work and the original block's source references stay attached
- [ ] Course summary lesson is added as a new final lesson with all four parts; 'regenerate with focus' changes only that lesson
- [ ] Stop halts output within 1 second; closing the panel leaves the course JSON byte-identical
- [ ] Works end to end with a local model and no network

**Spec refs:** specs/localization-ai.md §3.2, §2 AI authoring flow  
**Risks:** Replacing part of rich text must not damage surrounding formatting; small local models often ignore length and tone instructions.

### LOC-05: Course draft wizard

Turn a brief and reference sources into a complete first-draft course the author then edits.

**Features**

- Step 1: free-text brief plus optional sources, each with its own instructions
- Step 2: AI recommends a length preset with a reason; the author can override it
- Length presets: single lesson (under 5 min), short (1-3 lessons, under 30 min), standard (4-8 lessons, 1-2 h), extended (10+ lessons, 3 h+)
- Step 3: course details (duration, topic, tone, audience, goals, objectives), each editable by hand or with AI, reorderable and regenerable; export details to PDF or Word
- Step 4: outline with overview, lesson titles, descriptions, key topics and a cover image; add, delete and reorder lessons
- Step 5: interactive blocks or text only, with or without images, with or without a final quiz
- Lessons generate one at a time; the author can edit the first lesson while the rest generate
- With images on, each lesson opens with a banner image block followed by 2-3 images each followed by a paragraph
- Cancelling deletes every lesson generated so far; regenerating the outline overwrites the draft; the outline stays reachable from snapshots
- The wizard never generates audio

**Done when**

- [ ] From a one-paragraph brief and a PDF, choosing 'short' produces 1-3 lessons that open in the editor as ordinary, schema-valid blocks
- [ ] Edits made to lesson 1 while lesson 2 generates are kept after generation finishes
- [ ] Cancelling at lesson 3 of 6 leaves no generated lessons in the course and a snapshot holding the outline exists
- [ ] 'Text only' produces no image blocks; 'final quiz' adds one quiz lesson that passes the course-format validator
- [ ] Course details export opens as a valid PDF and a valid DOCX

**Spec refs:** specs/localization-ai.md §3.3, §5 rule 14  
**Risks:** Multi-step generation is slow on local models; outline-to-block mapping must always yield schema-valid blocks; the image option depends on LOC-07 and must degrade to text only.

### LOC-06: Block and question generation in the Blocks editor

Generate, convert and import individual blocks, quizzes and knowledge checks.

**Features**

- Single blocks: generate a block by picking a source (lesson text, uploaded sources or general knowledge), taking a suggested topic or typing one, picking a block type, reviewing an outline or draft, refining by prompt and inserting
- Single blocks: stop generating to give new instructions; closing the panel discards the work
- Single blocks: convert a block to another type (text to statement, timeline, table, knowledge check, or image-with-text with a generated image); the result appears below the original
- Importing: 'magic import' of pasted formatted text keeps the wording exactly and turns headings into structure, targeting process, accordion, tabs and 11 more block types
- Importing: import a document as a lesson with its text unchanged
- Importing: paste or upload existing questions to make a quiz with wording unchanged
- Questions: quiz from lesson content with 3-25 questions, optional topics and difficulty; editable afterwards
- Questions: knowledge check from lesson content by topic and type (multiple choice, multiple response, fill-in-the-blank, matching); revise or convert to another type; inserted at the end of the lesson
- Questions: convert existing questions into knowledge checks
- Every generated block or question passes the course-format validator before insert

**Done when**

- [ ] Magic import of a pasted document with 3 headings yields blocks whose text, after stripping markup, equals the pasted text character for character
- [ ] Quiz generation refuses counts outside 3-25 and produces exactly the requested count, each multiple-choice item with exactly one correct answer
- [ ] Converting a knowledge check from multiple choice to matching keeps the topic and inserts the new block below the original
- [ ] A schema failure shows an error and inserts nothing

**Spec refs:** specs/localization-ai.md §3.2 (convert, magic import, document import), §3.3 (single block), §3.4, §5 rule 16  
**Risks:** Models paraphrase, so 'wording kept exactly' needs a deterministic check and fallback; target block types depend on the Blocks editor catalogue being final.

### LOC-07: Image generation and editing

Make and edit original course images with the company's or author's own image model.

**Features**

- Text-to-image with our own original style presets or a custom style (medium, art style, detail level, colour, lighting, extra modifiers)
- Orientations: landscape 16:9, square 1:1, portrait 9:16
- Four candidates per run by default; pick one
- Up to four reference images per prompt, added from file, media library or clipboard
- Expand a short idea into a detailed prompt
- Iterative editing by follow-up prompt: retry, compare versions, enlarge, download, insert; 'start over' clears the history
- 'Replace with AI' on any image placeholder
- Theme colours generated from an image or a prompt
- Prompts with offensive or legally protected terms are refused before any provider call (company-editable list) and provider refusals are shown clearly
- Default to the newest configured model with a switch back to the previous one
- Providers: BYO cloud image APIs, or a local ComfyUI/diffusers endpoint with a permissively licensed model
- Prompt, model, style and seed (when available) saved with the asset; alt text prefilled from the prompt and marked for review

**Done when**

- [ ] A 16:9 prompt returns 4 candidates with a 16:9 aspect ratio; the chosen one inserts into an image block with alt text prefilled and marked pending
- [ ] Adding a fifth reference image is prevented
- [ ] A follow-up edit creates a new version that can be compared with the previous one; 'start over' empties the history
- [ ] A prompt with a blocked term is refused and the stub provider receives no request
- [ ] A manual verification run works against a local ComfyUI endpoint; CI uses a stub

**Spec refs:** specs/localization-ai.md §3.5, §5 rule 16, §8 (image row)  
**Risks:** Local image models need a GPU and large downloads; many open image models are non-commercial, so licences must be checked; content screening is imperfect and must stay company-configurable.

### LOC-08: Narration and voice library

Generate narration from scripts with the chosen voice provider, keeping it regenerable in every language.

**Features**

- Voices: picker filterable by provider, gender, age, language, accent and use case, with traits and a preview; shows the configured provider's whole catalogue
- Voices: favourites and an 'in this project' view
- Voices: model tiers mapped per provider (for example most expressive, expressive, consistent, fast), each showing its language count and character limit
- Voices: settings where the provider supports them, with defaults stability 0.50, speed 1.00, similarity 1.00, style exaggeration 0, speaker boost on; unsupported settings hidden
- Voices: delivery control through inline tags for emotion and effects where the model supports them, plus punctuation for pauses and emphasis; tags checked per model
- Scripts: type it, pull the block's text, use slide notes, use the AI script writer (write or rewrite), or write a script from an image
- Scripts: length limited per model (5,000 characters by default, up to 10,000 where the model allows)
- Generating: background job with cancel; earlier outputs kept in a history and the author picks one to insert
- Generating: a transcript (Blocks) or captions (Slides) made from the script automatically and updated when narration is regenerated
- Generating: narration on question feedback
- Generating: replace a voice everywhere it is used, and see where each voiceover is used
- Generating: learners can change playback speed but get no download control
- Generating: if a voice is retired or the provider removed, existing audio keeps playing as ordinary audio and regeneration asks for a replacement voice
- Generating: local voices via Piper or Kokoro as an optional download; cloud voices (ElevenLabs, Azure, Google, OpenAI) with the user's or company's key
- Generating: each narration item stores script, voice, model and settings so Translate can regenerate it per language

**Done when**

- [ ] Generating with stability 0.3 stores 0.3 in the narration record and the audio plays in a published SCORM package
- [ ] A 5,001-character script is refused for a 5,000-limit model with the limit named
- [ ] Regenerating narration updates the transcript or captions to match the new script
- [ ] 'Replace voice everywhere' lists every use first, then changes the voice on all of them
- [ ] A project whose voice provider was removed still plays all existing narration
- [ ] With a local Piper voice installed and no network, narration generates

**Spec refs:** specs/localization-ai.md §3.6 (narration), §4 narration item, §5 rule 16, §8 (TTS row)  
**Risks:** Providers differ in tags, settings and tiers, so the picker must be capability-driven; catalogues retire voices; permissive local voices are fewer and less natural; non-commercial voice-clone models must stay out of the default install.

### LOC-09: Captions and alt-text suggestions

AI help for accessibility: captions for audio and video and alt text for images, reviewed before use.

**Features**

- Captions: speech-to-text captions for audio (OGG, WAV, MP3) and video (MP4, MOV, AVI) in the language spoken in the media; offline with whisper.cpp or with a cloud speech-to-text key
- Captions: start from an import prompt, media tools, the context menu, the media library, the accessibility checker (one file or all) or the chat assistant
- Captions: background job with a status indicator and notification; failures show a specific error and a retry
- Captions: AI captions open in the caption editor and must be approved before publishing; publish links to the checker listing unapproved captions
- Alt text: suggestions for non-text objects except audio, flagged as not recommended for interactive objects
- Alt text: suggest automatically on import (setting), on demand per object, or in bulk for every asset without alt text
- Alt text: a suggestion stays pending and marked until the author edits and applies it, applies it to all copies of the asset, or deletes it
- Alt text: suggestions are written in the project's language

**Done when**

- [ ] A 2-minute MP4 with English speech gets a caption track whose cues fall within the media duration and exports as valid WebVTT
- [ ] Publishing with one unapproved AI caption is blocked with a link to the checker; approving it lets publish proceed
- [ ] Dropping the network mid-job with a cloud provider shows a specific error and the retry succeeds once the network returns
- [ ] Bulk alt text on a course with 10 images lacking alt text creates 10 pending suggestions and applies none until the author acts; 'apply to all copies' sets it on every use of that asset
- [ ] In a French project, alt-text suggestions are in French

**Spec refs:** specs/localization-ai.md §3.7, §5 rule 13, §8 (captions and alt-text rows)  
**Risks:** Speech-to-text accuracy varies by language and audio quality; long media needs chunking; small local vision models write weak alt text.

### LOC-10: AI tools in the Slides editor

Bring text, question and image AI to the slide editor with its slide-specific behaviour.

**Features**

- Write and rewrite text in text boxes with a generation history counter and back/forward; no tables or emoji in slide text
- Slide summaries from selected slides with bullet count, tone and audience; in the story view the summary is added as a new scene
- Question slides generated from selected slides, inserted after the selection, with adjustable topic and answers
- Rewrite existing multiple-choice and multiple-response questions in place or below; the author is warned that triggers and objects do not carry over
- Quiz from selected slides with topic, difficulty and objectives, grounded in course sources; output to new slides or a question bank; each question links back to its slide
- Apply question settings across many slides at once
- Image extras: keep all candidates, combine two images, aspect-ratio control while editing, enhance; the prompt becomes the image's pending alt text
- Narration from slide notes and scripts from images, with captions (via LOC-08)

**Done when**

- [ ] A 4-bullet summary of 3 selected slides in story view creates a new scene holding one slide with 4 bullets
- [ ] A quiz sent to a question bank from 5 slides creates a bank whose questions each reference an existing slide id
- [ ] Rewriting a multiple-choice question 'below' creates a new question slide and leaves the original slide and its triggers untouched
- [ ] Combining two images creates a new asset and keeps both originals

**Spec refs:** specs/localization-ai.md §3.2 (slide history, slide summaries), §3.4 (slide-editor items), §3.5 (slide-editor extras), §3.6 (script sources)  
**Risks:** Needs the Slides editor's scenes, question slides and question banks to be stable first.

### LOC-11: Chat assistant that edits the project

Authors ask in plain language and the assistant makes reviewed, undoable edits across a lesson, a course or a slide project.

**Features**

- Course-wide edits (Blocks editor, first slice): scope is one lesson or the whole course
- Course-wide edits: the assistant restates its understanding and waits for confirmation before changing anything
- Course-wide edits: changes shown on the page; keep, edit or revert per block, or Confirm all / Undo all
- Course-wide edits: closing the chat without choosing keeps the changes, with an org setting to make undo the default instead
- Course-wide edits: skips media, embed, code, custom, avatar, scenario and embedded-slide blocks, and alt text, captions, feedback, narration scripts and transcripts
- Slides assistant: requests that edit images, audio, sound effects, voiceovers, captions, animations (including motion paths and scripted entrances), narration sync, theme colours, shapes, layers, variables, triggers, slide properties, masters and layouts, questions and quizzes
- Slides assistant: apply question settings across many slides; navigate and reorganize the project; open slides in tabs; give visual guidance by highlighting the interface
- Slides assistant: preview stays available while chatting; one-click reset clears the chat; behind the experimental-features switch
- Every assistant turn is one undo step; edits go only through the engine's validated command API
- 'Simple mode' for local models with weak tool calling: one proposed change at a time

**Done when**

- [ ] 'Make every lesson intro friendlier' on a 5-lesson course shows the restated plan, changes only text blocks after confirmation, and Undo all returns the course JSON byte-identical
- [ ] Code and embed blocks are never modified (verified by diff)
- [ ] 'Show layer Hint when the learner clicks Help' creates a trigger that runs correctly in the real player preview
- [ ] A malformed tool call from the model is rejected by the command API, reported, and the project stays valid

**Spec refs:** specs/localization-ai.md §3.2 (course-wide chat edits), §3.4 (chat question settings), §3.8, §5 rule 15, §8 (tool-calling row)  
**Risks:** Needs a complete, stable engine command API; local-model tool calling is unreliable; broad edits risk silent damage, so diff review and full undo are mandatory; the vendor's keep-on-close default is less safe than undo.

### LOC-12: Sound effects and presenter avatars

Generate short sound effects and talking-presenter videos through the company's chosen providers.

**Features**

- Sound effects: describe the sound in up to 450 characters (English recommended)
- Sound effects: duration 0.5-22 s or automatic, plus a prompt-influence slider
- Sound effects: four variants per run, each with a caption; pick and insert; usable on question feedback
- Sound effects: BYO commercial API; open models only as an optional add-on after a licence check
- Avatars: talking-presenter video from a script in blocks, custom blocks and slides; insert from placeholders
- Avatars: opt-in labs switch per app; videos up to 5 minutes; usage and cost estimate shown before generating; failed runs not counted
- Avatars: background rendering with progress, cancel and notification
- Avatars: presenters only from the provider's licensed catalogue or the company's own; no vendor characters

**Done when**

- [ ] A 451-character sound-effect prompt is refused; a 3 s request returns 4 variants each 3 s within 0.1 s
- [ ] An avatar script estimated over 5 minutes is refused before submission with the estimate shown
- [ ] A failed avatar job records zero usage
- [ ] With the labs switch off, no avatar controls appear

**Spec refs:** specs/localization-ai.md §3.6 (sound effects), §3.9, §5 rule 16, §8 (sound effects and avatars rows), §7 Q12  
**Risks:** Few permissively licensed open sound or avatar models; avatar inputs and outputs are unknown (spec §7 Q12); presenter likeness and consent issues; high cost per minute.

### LOC-13: Learner AI tutor

A chat helper inside the published course that answers questions about that course, served by the company's own server.

**Features**

- Author: per-course switch in course settings, the publish menu and AI settings
- Author: custom button text, tooltip and input placeholder (tooltip and placeholder live in the label set), and a logo in the chat header
- Author: endpoint URL (company server or stand-alone tutor proxy) and a per-course revocable token written into the package; never a provider key
- Author: switching it off takes effect at the next publish; revoking the token stops a published copy immediately
- Learner: button at the lower right opens a chat popover in preview and in published output
- Learner: if never opened, the chat opens once on the learner's first scroll down in a lesson
- Learner: ready prompts (explain more simply, search the course, summarize) plus free text
- Learner: new chat, minimize, thumbs up/down per answer; thumbs down asks for a comment
- Learner: replies in the learner's current language and text direction
- Learner: responsive, touch-friendly, keyboard and screen-reader accessible
- Learner: the button hides when the endpoint is unreachable
- Server: answers grounded in published course text, transcripts and code-block text through retrieval; no web browsing; any general-knowledge fallback is labelled
- Server: never reveals quiz or knowledge-check answers (answers kept out of the index and replies screened)
- Server: each turn takes the question, earlier turns, course context, lesson position and locale, and streams the answer
- Server: chats are private to the learner; authors get no transcripts; retention is configurable; rate limits per token and per learner
- Server: runs in the server edition or as a small stand-alone Docker tutor proxy for LMS-only deployments, so desktop authors can use it too

**Done when**

- [ ] A package with the tutor off makes zero requests to the tutor endpoint and fetches no tutor code on page load
- [ ] A package with the tutor on contains the endpoint URL and token but no provider key
- [ ] Across a scripted set of 20 probing prompts, no quiz answer string appears in any reply
- [ ] In a course published in Arabic, the tutor replies in Arabic and the popover lays out right to left
- [ ] After the course token is revoked, the button hides on the next load
- [ ] Keyboard only: open, type, send and hear the reply with a screen reader (axe scan plus a manual NVDA check)

**Spec refs:** specs/localization-ai.md §2 tutor flow, §3.10, §4 tutor wire shape, §5 rule 12, §6 tutor runtime endpoint, §7 Q4-Q5  
**Risks:** LMS-hosted packages need a reachable endpoint and CORS from arbitrary LMS domains; learners may try prompt injection to extract answers; the token can be copied from the package, so rate limits and revocation matter; context selection, rate limits and history persistence are open (spec §7 Q4).

### LOC-14: Translation runs

Machine-translate a course into many languages in one run and keep them as one multi-language project.

**Features**

- Setting up: start from the course tile or editor toolbar (Blocks) or the Localization menu (Slides)
- Setting up: confirm the source language and choose targets from a type-to-filter list with regional variants (for example Latin American Spanish, Canadian French, Brazilian Portuguese, Chinese variants)
- Setting up: formality formal, informal or automatic (default); changes forms of address only; not applied to English, Haitian Creole, Hebrew, Maltese, Somali or Swahili
- Setting up: lookup showing, per source language, which targets support glossary, formality and right-to-left with the configured providers
- Setting up: a main MT provider with fallback providers for languages it lacks; an LLM can act as the MT engine; local engines (LibreTranslate/Argos, OPUS-MT) work offline
- Setting up: Serbian output uses Latin script when paired with English and Cyrillic otherwise (overridable)
- Coverage: block and slide text, captions, transcripts, alt text, every question in a bank (not only drawn ones), resource titles and custom-block text
- Coverage: text variable values including defaults, adjust-variable values and trigger-condition values, with a report of triggers to check
- Coverage: captions on source-language videos appear in every target language
- Coverage: a run report lists what is not translated: text inside images or video, embeds, attached or linked files, recorded or imported narration, code blocks, custom label sets
- Coverage: inline formatting kept through tag placeholders; failed segments retried one by one and listed
- Running: background job with a progress timeline, cancel, retry and a notification; all languages land in one project and its tile shows the language count
- Running: AI narration regenerated in each target language from its stored voice settings (once LOC-08 is present)
- Running: translating again into an existing language overwrites it after confirmation; a pre-translation snapshot is taken automatically

**Done when**

- [ ] Translating a 200-segment Blocks course into French and German gives a 3-language project where every segment has a machine entry and bold and link positions are preserved
- [ ] A question bank of 12 with 5 drawn yields 12 translated questions per language
- [ ] Choosing formality with Hebrew as a target shows it as not applicable and sends no formality parameter
- [ ] Cancelling mid-run leaves no half-translated language in the project
- [ ] With a local LibreTranslate and no network, an English-to-Spanish run completes
- [ ] Code-block text is byte-identical in every language

**Spec refs:** specs/localization-ai.md §2 translation flow, §3.11, §3.12, §5 rule 5, §8 (machine translation row)  
**Risks:** Quality and language coverage depend on the configured provider; an LLM used as MT can drop inline tags, so placeholder validation is required; translated trigger-condition values can silently break logic; the full language and pair list is provider-dependent (spec §7 Q11).

### LOC-15: Glossaries

Keep brand and technical terms right in every language.

**Features**

- File: one UTF-8 CSV per glossary; row 1 holds language codes (source first, then targets); each later row is one term
- File: a blank target cell means no rule; the same term in every column means do not translate
- File: validation refuses terms starting with =, +, @ or -, any HTML, entries of 200 bytes or more, and files over 10 MB, with a row-level error report
- Applying: longest match wins on overlap; case matters for proper nouns; engines may inflect a term to fit grammar
- Applying: provider-native glossaries used where available, otherwise placeholder protection or prompt instructions; a post-run report lists glossary misses
- Applying: one glossary per course, applied to every later run including updates and newly added languages
- Applying: changing a course's glossary requires retranslating every language, overwriting current translations, after confirmation
- Library (server): admins manage up to 15 glossaries per organization (configurable); the first upload becomes the default and the default can be changed; deleting removes it for everyone
- Library: a new version replaces the terms and must keep the same source language; glossaries can be renamed in place
- Library (desktop): a local glossary library of CSV files

**Done when**

- [ ] A CSV containing the term '=SUM' is refused with its row number; a 10.5 MB file is refused
- [ ] With 'Course Suite' identical in all columns, no target contains a translated form of it
- [ ] With overlapping terms 'data' and 'data protection', the 'data protection' rule applies
- [ ] A new version whose first column is a different source language is refused
- [ ] A target language added later uses the course glossary without re-selecting it

**Spec refs:** specs/localization-ai.md §3.16, §3.15 (glossary change), §4 glossary CSV, §5 rule 6  
**Risks:** Placeholder protection blocks inflection while prompt-based enforcement is not guaranteed, so a miss report is essential; CSV formula-injection rules must also apply to every CSV we export.

### LOC-16: Multi-language editing and publishing in the Blocks editor

Fix and finish each language inside one project, then publish all languages together.

**Features**

- Working language: a dropdown switches the working language and the real-player preview shows that language
- Working language: content, new blocks and theme changes are made in the source; text edits, media swaps and label changes are made per target
- Working language: adding, moving or deleting blocks, lessons or sections in any language applies to all; items added in a target are copied untranslated and flagged
- Per language: replace audio, video, images, resource links and files; replacement unlinks from the source and offers 'revert to source'
- Per language: replacing a video drops its captions after offering a VTT export
- Per language: each language gets the built-in label set for that language; a custom label set can be assigned per language
- Direction: left-to-right and right-to-left languages mix in one project; right-to-left is edited left-to-right and shown right-to-left in preview, review and output
- Direction: overflow list per language with jump-to-problem
- Reuse: copying lessons between multi-language courses copies matching languages, gives extra languages the source text, and gives a plain course only the source
- Reuse: an embedded multi-language slide project links its matching language versions automatically
- Reuse: a warning to fix the number of drawn questions before validation
- Publish dialog: all languages or a subset, with a translated course title per language
- Publish dialog: LMS output as one package with a launch-time language chooser or one package per language; web as one package; PDF as one PDF per language
- Publish dialog: share link with the chooser and a default-language setting

**Done when**

- [ ] Deleting a lesson while working in German removes it from English and French too
- [ ] A block added while working in French appears in English with French text, flagged untranslated
- [ ] Replacing an image in Spanish leaves English unchanged; 'revert to source' restores the English image in Spanish
- [ ] An English and Arabic course publishes as one SCORM 2004 package; in Moodle the chooser appears, Arabic renders right to left, and the LMS records cmi.learner_preference.language as 'ar'
- [ ] Per-language publishing produces a folder with one subfolder per language, each importable into Moodle

**Spec refs:** specs/localization-ai.md §3.13, §3.18, §4 multi-language project and published package, §5 rules 3, 4, 7, 10, 11  
**Risks:** Per-language overrides multiply stored assets; the multi-language package layout is our own design (spec §7 Q1); editing right-to-left text left-to-right may confuse authors.

### LOC-17: Multi-language editing in the Slides editor

The same multi-language workflow for slide projects, with slide-specific rules.

**Features**

- Working-language switch with preview per language
- A new text box added in a target language also creates an untranslated source box
- Per-language replacement of pictures on slides, layers and masters, audio, video, player resources, resource links and files, each with 'revert to source'
- Per-language object timing that detaches from the source timeline, with 'revert to source timeline'
- Trigger editor offers the engine's 'current language is X' condition and the built-in right-to-left variable
- Layout checker lists text overflow per language; double-click jumps to it; quick fixes shrink the font or grow the box; autofit follows the source
- Right-to-left: text alignment mirrored except centred text; sidebar and player direction follow the language
- Custom label set per language
- Delete a language; deleting every target returns the project to a single language
- Publish options as in LOC-16 plus video and document outputs as one file per language

**Done when**

- [ ] Adding a text box while working in Japanese creates a matching untranslated box in the English source
- [ ] The checker lists a German text box that overflows; 'shrink font' fixes it and it leaves the list
- [ ] A trigger 'if current language is fr, show layer FR' works in French preview and not in English
- [ ] In Arabic, left-aligned source text shows right-aligned and centred text stays centred

**Spec refs:** specs/localization-ai.md §3.13 (slide-editor items), §3.15 (delete language), §3.18, §5 rules 4, 7  
**Risks:** Layers, masters and timelines multiply override cases; how progress is keyed when switching language mid-course is unknown (spec §7 Q2-Q3).

### LOC-18: Source updates and language lifecycle

Keep translations in step with a changing source and manage languages over time.

**Features**

- Updates: source text edits are detected automatically and marked; 'Update translation' retranslates only changed segments for every target
- Updates: any edit inside a segment retranslates the whole segment (one block's text or one text shape)
- Updates: target-language edits and imported validator suggestions never trigger an update
- Updates: narration is regenerated in the source first, then the update regenerates it per language
- Updates: duplicating or sending the project is blocked while updates are pending
- Updates: the cost estimate counts only changed segments
- Lifecycle: archive a language (Blocks), then restore or permanently delete it; retranslating an archived language deletes the archived copy
- Lifecycle: delete a language (Slides); deleting every target returns to a single-language project
- Lifecycle: snapshots on publish and on demand; the pre-translation snapshot can only be restored as a new course
- Lifecycle: 'Save language as' makes a stand-alone single-language copy unlinked from the source
- Lifecycle (server): managers add, archive and import languages; editors edit content only

**Done when**

- [ ] Editing 3 of 200 source segments marks exactly 3 stale and the update sends exactly 3 segments per target language to the provider (verified with a stub)
- [ ] A French author edit survives a later source edit and update elsewhere in the course
- [ ] Duplicate is disabled with a reason while stale segments exist
- [ ] Archive then restore brings back the language with all its edits; permanent delete removes it
- [ ] An editor sees no add, archive or import actions and the API refuses them

**Spec refs:** specs/localization-ai.md §3.14, §3.15, §4 segment and snapshots, §5 rules 1-2  
**Risks:** Segment identity must survive copy, paste and block conversion or updates will over- or under-translate; concurrent source edits during live co-editing on the server.

### LOC-19: XLIFF and Word translation exchange

Hand translation to people and CAT/TMS tools by file, with or without AI.

**Features**

- Export XLIFF 1.2 or 2.0, one file per target language; the author picks the version and the source-language code
- Inline formatting kept as XLIFF inline tags when 'include formatting' is on; plain text otherwise
- Import only into the project the file came from (matched by project id and segment ids); a wrong file gets a clear 'does not match' error
- Works on multi-language projects: export any language and import into that language, keyed by segment id
- Covers right-to-left languages, survey blocks, question-bank questions and captions; code blocks excluded; variable names never exported (values are)
- Labels exported separately with the same language code as the content
- Word (DOCX) export with a translation column, either with slide and layer screenshots or as one table for CAT tools; import applies basic character formatting
- Import preview shows changed, missing and unknown segment counts before applying; import is one undo step
- Slides editor: option to import into a copy of the project

**Done when**

- [ ] Exporting and re-importing an untouched XLIFF 1.2 and 2.0 file leaves the project JSON unchanged
- [ ] Exported files validate against the XLIFF 1.2 and 2.0 schemas and round-trip through an open-source CAT tool such as OmegaT
- [ ] Importing a file from another project shows 'does not match' and changes nothing
- [ ] A bold word survives a round trip in which the translator reorders the sentence
- [ ] A single-table DOCX export opens in Word and LibreOffice and an edited translation imports with bold and italic kept

**Spec refs:** specs/localization-ai.md §3.19, §4 exchange formats  
**Risks:** Inline-tag round trips through third-party CAT tools are fragile; DOCX screenshots depend on the engine rendering slides to images.

### LOC-20: Language validation and AI translation checks

Native speakers check translations inside the real course and the author imports their fixes.

**Features**

- Sending: publish the language stack to review with all or some languages; republishing adds a version to the same stack
- Sending: one review request per language; validators need only an email address and see only their language
- Sending: language status shows request review, in review or review complete
- Validator table: live course preview beside a table of source and target segments, navigated by lesson or slide
- Validator table: clicking a target cell scrolls the preview to it; typing updates the preview live; clicking away saves
- Validator table: every saved edit is a suggestion with not-imported/imported status, who and when on hover, and reset to the machine translation
- Validator table: filters for manual edits, edits from AI suggestions, imported, unimported, all edits and updated segments only
- Validator table: 'apply to all identical' when the same source text appears elsewhere
- Validator table: mark lessons or slides validated; 'Finish review' signals completion without locking anything
- Validator table: comments tab per lesson or slide
- Validator table: 'validate updates' steps through changed segments only, with arrow keys
- Validator table: separate entries for audio scripts, transcripts and captions; light or low-contrast text gets a background fill
- Validator table: suggestions sync live across validators
- AI checks: flag grammar, phrasing and untranslated text per segment with the configured LLM, with an explanation for each flag
- AI checks: accept (optionally for all identical segments) or dismiss with a reason; shared live and carried across versions until resolved
- Import: the author imports suggestions per language or for all languages; unwanted segments are reset first
- Import: importing a narration-script suggestion regenerates that narration
- Import: warnings that publishing a new version before import drops pending suggestions, and that restoring an older version deletes newer versions with their comments, validation and suggestions

**Done when**

- [ ] A guest validator invited for German cannot load French segments (the API refuses) and needs no password
- [ ] Two validators on the same language see each other's suggestions within 2 seconds
- [ ] After 3 source segments change and the stack is republished, 'validate updates' visits exactly those 3
- [ ] Importing German suggestions changes only German segments, marks them imported, and does not mark them stale
- [ ] Republishing with unimported suggestions shows a blocking warning with their count
- [ ] Accepting an AI check 'for all identical' updates the target of every identical source segment in that language

**Spec refs:** specs/localization-ai.md §2 translation flow steps 5-8, §3.17, §5 rules 8-9, §6 guest validators and real-time review state, specs/review.md §Q  
**Risks:** The split with the Review backlog (links, guests, versions, comments) must be agreed before building; a live preview of a large course beside an editable table is performance-sensitive; AI check quality varies by language pair; desktop authors rely on LOC-19 files or Review's review-copy round trip instead.

### Deliberately out of scope

- Vendor credits, prepaid pools and plan rules (2 credits per source character per language, a paid plan or credits to publish translations, free republishing within a billing period, no new translation after plan expiry, glossaries kept after a plan lapses): we host and sell nothing. Optional per-group quotas and usage logs replace them (LOC-02).
- Vendor-run AI processing, its US/EU region split and its data-retention promises: each company chooses its own providers and region. Our only commitment is no content logging by default (LOC-01).
- AI controls that stay visible but do nothing when AI is off: deliberately not copied. We hide or disable them with a reason (LOC-02, teams-collab R6).
- The vendor's own voice catalogue (21 ready voices, 40 vendor voices, 5,000+ community voices, a cap of 10,000 favourites) and model-tier names tied to one voice vendor: the picker shows whatever catalogue and tiers the configured provider offers (LOC-08).
- The vendor's three named image styles and its specific image models: we ship our own original style presets and the company picks the models (LOC-07). The vendor rule that the same prompt never reproduces an image is not copied, and seeds are kept where the provider allows.
- English-only alt-text suggestions: a vendor limitation we deliberately do not copy. Suggestions are written in the project language (LOC-09).
- Vendor gaps we do not copy: no XLIFF or Word on multi-language projects, no right-to-left, survey, question-bank or caption support in file exchange. LOC-19 supports all of these.
- AICC language reporting: AICC is not one of the planned export formats (SCORM 1.2/2004, xAPI, cmi5, web).
- Translation memory and connectors to outside translation-management systems: the vendor does not offer them and parity does not need them. XLIFF 1.2/2.0 covers the hand-off to CAT and TMS tools. A candidate after v1.
- HTML-based translation import and export: the vendor lists it only as planned and its format is unknown (spec §7 Q10). Deferred until a need beyond XLIFF and Word appears.
- Language handling in the learner portal (profile language, switching mid-course without losing progress, per-question reports that keep the answer language): owned by the Reach backlog. The engine needs are listed here.
- Review links, guest identity, review versions, comment threads and the desktop review-copy round trip: owned by the Review backlog. LOC-20 builds the translation table, AI checks and suggestion import on top of them.
- Admin-console screens for AI policy and group quotas: owned by the Teams backlog. LOC-02 enforces and meters.
- Anonymized tutor insights for authors: the vendor lists them only as planned. Learner chats stay private and no author reporting on them is built.
- The vendor's hosted tutor service and the per-course vendor key in packages: never matched. Packages carry only a company endpoint and a revocable token (LOC-13).
- Compatibility with older vendor app versions that treat AI audio as plain audio: not applicable. Our format stores AI narration as ordinary audio plus provenance, so any player version plays it.
- Large model weights (LLM, image, avatar) bundled in installers: left out for installer size and licence reasons. Users connect their own local runtime (such as Ollama or ComfyUI), and small permissively licensed models (whisper, Piper voices) are optional downloads.
- Voice cloning and non-commercially licensed audio or image models in the default install: licence and consent risk. They are available only through a company's own provider key.

## Teams and collaboration platform

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| TEAM-01 | Organisation, accounts and role model | mvp | server | L | M3 | ext:phase-0 foundations (repos, CI, Docker Compose image) |
| TEAM-02 | Admin console and people management | mvp | server | M | M3 | TEAM-01 |
| TEAM-03 | Invitations and bulk import | mvp | server | M | M3 | TEAM-01, TEAM-02 |
| TEAM-04 | Groups, group managers and quotas | v1 | server | M | M3c | TEAM-01, TEAM-02, TEAM-03 |
| TEAM-05 | Private and team areas: folders, sharing and dashboard | mvp | server | XL | M3 | TEAM-01, ext:blocks editor dashboard (phase 2) |
| TEAM-06 | Course collaborators, roles and send a copy | mvp | both | M | M3 | TEAM-05 |
| TEAM-07 | Live co-editing with presence and section locks | mvp | server | XL | M3 | TEAM-06, ext:shared engine course format with CRDT mapping (phase 1), ext:blocks editor (phase 2) |
| TEAM-08 | Snapshots and version history | mvp | both | M | M3 | TEAM-05, ext:shared engine player preview and export events (phase 1) |
| TEAM-09 | Leaving members and ownership transfer | mvp | server | L | M3b | TEAM-02, TEAM-05, TEAM-06 |
| TEAM-10 | Shared question banks | v1 | server | M | M3c | TEAM-05, TEAM-07, ext:blocks editor question banks |
| TEAM-11 | Block template library | v1 | both | M | M3c | TEAM-05, ext:blocks editor (phase 2) |
| TEAM-12 | Brands and fonts | v1 | both | L | M3c | TEAM-02, TEAM-05, ext:shared engine theme model |
| TEAM-13 | Shared slide library | v1 | both | L | M5c | TEAM-05, ext:slides editor (phase 5) |
| TEAM-14 | Content library, stock search and team assets | v1 | both | L | M5c | TEAM-01, ext:library repo original assets, ext:blocks editor (phase 2), ext:slides editor (phase 5) |
| TEAM-15 | Project backups and storage | v1 | both | M | M5c | TEAM-05, TEAM-04, ext:Review core (phase 3), ext:slides editor (phase 5) |
| TEAM-16 | AI policy, module switches, integrations and labs | v1 | server | M | M6b | TEAM-02, TEAM-04, ext:AI provider layer (phase 6) |
| TEAM-17 | Single sign-on, SCIM and two-factor sign-in | v1 | server | L | M7 | TEAM-01, TEAM-03 |
| TEAM-18 | Audit log and change notifications | v1 | server | M | M7 | TEAM-01 |
| TEAM-19 | Desktop fleet deployment and update policy | v1 | desktop | M | M7 | ext:phase-0 installers and auto-updater |
| TEAM-20 | Desktop connection to a company server and sync | later | both | XL | M8 | TEAM-07, TEAM-11, TEAM-12, TEAM-13, TEAM-15, TEAM-17 |

### TEAM-01: Organisation, accounts and role model

Give a self-hosted server one organisation, local sign-in accounts and a role model that every other team feature checks against.

**Features**

- First-run setup creates the organisation; the first account becomes owner and primary admin
- Exactly one primary admin; can hand the role to another admin from the console
- Server command-line admin reset and recovery when nobody can sign in
- Local email + password accounts, password reset by email, sign out everywhere
- User record: email (login id), first/last name, organisation, country, phone, console language, avatar, email preferences, status, last login in UTC
- Membership roles: creator, localization, primary admin, admin, group manager (per group), portal admin, portal manager (per group), portal reporter (per group)
- A default group exists from day one
- Central permission check that implements the full role-to-task matrix
- Admin roles never include authoring: admins without the creator role cannot open team folders or authoring apps
- One creator membership per person per server
- Identity data stays on the company server; no central identity service
- SMTP settings and an outbound email service with templates and delivery-failure capture
- Object storage adapter (S3/MinIO) for logos, fonts, assets, backups and library entries
- Domain event hook that audit log and notifications subscribe to later

**Done when**

- [ ] A fresh Docker Compose install runs setup, creates the organisation and makes the first account owner and primary admin; a second setup run is refused
- [ ] Table-driven tests cover every row of the role-to-task matrix for primary admin, admin, group manager and creator through the public API
- [ ] An admin without the creator role is refused by team-folder and authoring endpoints; granting creator gives access without signing in again
- [ ] The primary admin hands the role to another admin; the CLI reset restores a primary admin on a server with no working admin sign-in
- [ ] Password reset email reaches a local SMTP catcher; a rejected recipient is recorded as a delivery failure
- [ ] Granting a second creator membership to the same person on one server is refused

**Spec refs:** teams-collab.md §2 Roles, Flow 1, teams-collab.md A7, A11, teams-collab.md D4, D5, D6, teams-collab.md R3, S10, teams-collab.md T3, T4, teams-collab.md R21, teams-collab.md §4 Organization, User, Membership, teams-collab.md §6 accounts, email delivery, object storage  
**Risks:** The role matrix is consumed by every later epic; getting group-scoped and portal roles wrong forces rework, so the permission check must be one owned module with exhaustive tests. Self-hosters' SMTP setups vary widely.

### TEAM-02: Admin console and people management

Let admins see everyone in the organisation, find people fast, and change their roles in one place.

**Features**

- Console shell with sections: Profile, People, Groups, Invites, AI, Integrations, Brands and fonts, Modules, Security/SSO, Storage, Audit log, Support (each section appears as its epic lands)
- Open the console from the web dashboard avatar or a direct sign-in page
- Instance summary: organisation name, server version, author and member counts (replaces the vendor subscription page)
- Rename the organisation (primary admin and admins)
- People list sorted by first name with role badges
- Live search by name or email as you type
- Combined filters by role and group, with one action to clear them all
- Tabs by role: admins and group managers see People, Groups, Invites; portal admins see no Groups; plain creators see only name, counts and the member list
- Click a member to edit in a side panel; tick several members and edit them together
- Admins can give themselves the creator role
- Removing a person who is also an admin removes the admin roles in the same action
- Removing the creator role hands off to the content-transfer flow
- Member CSV export: email, status, translation permission, groups, manage role, groups managed, portal role, last login (UTC), plus user id and created date
- Support section links to project docs and the issue tracker

**Done when**

- [ ] The people list sorts by first name, shows role badges, and narrows on each keystroke of a name or email
- [ ] Filtering creator + admin returns only members holding both; clear-all resets the list
- [ ] A plain creator sees only organisation name, counts and the member list; a portal admin sees no Groups tab
- [ ] Bulk-editing three selected members adds a role to all three in one save
- [ ] The member CSV holds one row per member and per pending invitee with every listed column and last login in UTC
- [ ] Removing a member who is also an admin asks once and removes all their roles

**Spec refs:** teams-collab.md A1-A8, teams-collab.md C9, teams-collab.md D1-D3, teams-collab.md E1-E2, teams-collab.md R1, R2, R11, teams-collab.md §4 Formats: Member CSV export  
**Risks:** Console sections owned by later epics must plug in without reshaping the shell; define the section registry early.

### TEAM-03: Invitations and bulk import

Bring people into the organisation by email, one at a time or from a spreadsheet, with the right roles from the start.

**Features**

- Invite several emails at once with the same permissions
- Three permission families per invite: Create (creator, localization), Manage (admin, group manager + groups), Distribute (portal roles)
- Distribute is offered only when the learner portal module is on
- Pick a group when inviting
- Invite email; a second email when a member later gets the creator role
- Accept or decline from the account page; accepting a new address sets up the account
- Invites tab: email, permissions, inviter, sent date, expiry date
- Resend and cancel; group managers touch only Create invites for their groups, portal admins only Distribute invites
- Invites expire 90 days after sending
- Bounced invitation emails show a status and a one-click resend
- Invite statuses: pending, accepted, declined, cancelled, expired, bounced
- Bulk CSV import: download a sample, upload by picker or drag-and-drop, row validation
- Error report CSV with row number and reason for each bad row
- CSV columns: email, first_name, last_name, creator, localization, admin, group_manager_groups, group, portal_role, portal_groups

**Done when**

- [ ] Inviting three emails creates three pending invites, each showing inviter, sent date and an expiry exactly 90 days later
- [ ] Distribute options are absent while the learner portal module is off
- [ ] Accepting grants exactly the invited roles and group; declining marks the invite declined
- [ ] The expiry job marks invites older than 90 days expired and they can no longer be accepted
- [ ] A hard-bounced invite shows a bounced status and resends in one click
- [ ] A 10-row CSV with 2 bad rows imports 8 invites and offers an error CSV naming both rows and reasons
- [ ] A group manager cannot resend or cancel an invite outside their groups or a non-Create invite

**Spec refs:** teams-collab.md §2 Flow 2-3, teams-collab.md B4, teams-collab.md C1-C8, teams-collab.md R5, teams-collab.md §4 Invite entity, Formats: Member CSV import  
**Risks:** Bounce detection depends on what the self-hoster's SMTP relay reports; synchronous rejections are reliable, asynchronous bounces may need an optional inbound hook.

### TEAM-04: Groups, group managers and quotas

Sort authors into departments or sites, hand day-to-day running to group managers, and optionally cap what each group uses.

**Features**

- A default group holds every author not placed in a custom group
- Create, rename and delete groups; deleting asks for confirmation
- Move members between groups the actor manages; remove-from-group returns them to the default group
- Group managers manage one or more assigned groups only and cannot grant admin or portal roles
- Optional author quota per group, with remaining unallocated quota shown on the form
- Optional AI and translation usage quota per group
- Optional storage quota per group
- Groups tab in the console with member counts and managers

**Done when**

- [ ] The default group cannot be deleted and receives members removed from a custom group
- [ ] Deleting a custom group asks for confirmation and moves its members to the default group
- [ ] A group manager can add, move and remove members only in their own groups; granting admin or portal roles is refused
- [ ] With an author quota of 5, a sixth creator invite into that group is refused with a clear message
- [ ] An AI quota on a group blocks further AI requests from its members once reached and shows usage so far

**Spec refs:** teams-collab.md §2 Flow 4, teams-collab.md B1-B7, teams-collab.md D4 (group rows), teams-collab.md Q7, teams-collab.md §4 Group entity, teams-collab.md §6 Quotas  
**Risks:** Quota enforcement points live in other epics (invites, storage, AI layer); each needs a single check owned here to avoid drift.

### TEAM-05: Private and team areas: folders, sharing and dashboard

Keep each author's private work apart from the company's shared work, and let teams share folders with clear roles.

**Features**

- Content registry for every shareable type: course, microlearning, question bank, block template, slide-library project, review item, label set, brand, font
- Each item records owner, personal or shared scope, folder, last updated by, deleted date, original location
- Content becomes shared when it gets a collaborator, sits in a team folder, or is a shared template or library project
- Shared content belongs to the organisation; only the owner can make it personal again by moving it to Private
- Unlimited folders with a nesting limit per area (blocks content 5 levels; Review 6 levels with deeper levels flattened on move)
- Share entries for a person or the Everyone group, which includes people who join later
- Explicit permissions survive moves; inherited ones are replaced by the new parent's
- Changing a folder's sharing rewrites inherited permissions on all its subfolders, including ones owned by others
- Unshare or delete of a folder sends other people's items to their own Private or Deleted area
- Deleted area; restore returns an item to its original place, or to Private if that place is gone
- Purge of deleted items after a configurable period
- Folder and item task matrices for owner, manager and editor
- Team folders are visible only to creators of the organisation
- Sidebar areas: All Content, Shared With Me, My Shortcuts, Private, Team, Deleted
- My Shortcuts with its own folders; removing a shortcut never removes the item; go to location
- Grid or list, title search, remembered sort, type filter, multi-select author filter in team folders
- Cards: cover, title, lesson count, last modified, owner avatar on shared items; 16 per page
- Bulk move and bulk delete
- Folder share dialog: search members, pick editor or manager, add Everyone, remove
- The same folder service backs Review team folders

**Done when**

- [ ] Adding a collaborator or moving an item into a team folder marks it shared; only the owner can move it back to Private, which removes every collaborator
- [ ] Scenario tests for every inheritance rule pass: explicit survives a move, inherited is replaced, a sharing change rewrites subfolders owned by others
- [ ] Deleting a folder sends items owned by others to their own Deleted area; restore returns an item to its old folder or to Private when that folder is gone
- [ ] A member who joins after an Everyone share can open the folder
- [ ] Creating a folder beyond the nesting limit is refused
- [ ] An end-to-end browser test covers grid/list, search, remembered sort, type and author filters, 16-card paging, bulk move and bulk delete
- [ ] Removing a shortcut leaves the item in place; go to location opens its real folder
- [ ] An admin without the creator role cannot list team folders

**Spec refs:** teams-collab.md §2 Flow 5, teams-collab.md F1-F6, teams-collab.md K1-K16, teams-collab.md R1, R6, R7, R8, R12, teams-collab.md §4 Content item, Folder, Share entry, teams-collab.md §6 Item and folder ACL service, retention of deleted items  
**Risks:** Inheritance and cascade rules are easy to get subtly wrong and hard to fix after data exists; the desktop Private/Deleted dashboard is owned by the Blocks editor backlog and this epic must extend it, not fork it. Nesting limit meaning (count vs depth) is decided here as depth.

### TEAM-06: Course collaborators, roles and send a copy

Let a course owner bring in co-authors with set roles, hand over ownership, or send an independent copy instead.

**Features**

- Collaborate panel in the editor and in course settings: add people by email
- No limit on collaborators
- Invitee gets an email; the course appears in their Shared With Me with the owner's avatar
- Item roles: owner, manager, editor; new collaborators start as editor
- Course role matrix enforced in the server and shown in the UI (publish, export, settings, send a copy, duplicate, move, text labels, guest review links, quick-share metrics, transfer, delete/restore, remove collaborators)
- Owner hands ownership to an existing collaborator; others keep their roles
- Owners cannot leave their own course; managers can
- No read-only course role; viewers are sent to Review
- Author byline: any collaborator picks who is shown as author on the cover page, or hides it
- Send an independent copy to another author on the server; copies never merge and a returned copy is a new item
- Copy lineage kept on the server only, visible to admins
- Desktop: send a copy writes a project file with a new project id

**Done when**

- [ ] Adding a collaborator by email sends an email, shows the course in their Shared With Me with the owner's avatar, and gives them the editor role
- [ ] API tests prove every row of the course role matrix (editors cannot publish, export, change settings or send a copy; managers cannot delete or transfer; only the owner edits text labels)
- [ ] An owner's leave request is refused until ownership is transferred; after transfer, other collaborators keep their roles
- [ ] The chosen byline name appears on the published cover page; hidden byline leaves no author name; no user ids appear in the export
- [ ] A sent copy is independent: edits to either side never reach the other
- [ ] A desktop copy file opens as a new project with a different project id

**Spec refs:** teams-collab.md §2 Flow 6, teams-collab.md H1-H5, H12-H15, teams-collab.md I1-I3, teams-collab.md R11, R12, teams-collab.md §4 Collaborator entity  
**Risks:** Byline rendering and id stripping belong to the shared player and exporters; this epic only sets the value. Immediate ejection on removal depends on the co-editing channel (TEAM-07).

### TEAM-07: Live co-editing with presence and section locks

Several authors edit one course at the same time, see who is where, and never overwrite each other's lesson.

**Features**

- Real-time co-editing over Yjs and Hocuspocus; changes appear for everyone at once
- Connection-level permission check against the item role on every session
- Course document stored in PostgreSQL and compacted back to the course JSON format
- Presence: who is in the course and which lesson, with avatars or initials
- One editor at a time for the course title and description, each section header, and each lesson
- Held parts grey out and show the holder's avatar; the outline shows the holder and their last edit time
- Take control of a held part, with advice to contact the holder first; the previous holder is locked out
- Synced edits of the previous holder are kept on take-over; edits not yet synced are rejected and the user is told
- Anyone adds sections or lessons; deletes are blocked only on parts someone else holds
- Reordering the outline is never blocked
- Per-lesson last updated by and time
- Removing a collaborator or deactivating a user ejects them from the open editor at once
- Locks release after a disconnect timeout; reconnect resumes the session
- Lock service also serves non-CRDT documents (question banks)
- Lock policy is a server setting so true simultaneous in-lesson editing can be switched on later

**Done when**

- [ ] Two browsers on one course: a change in one appears in the other within one second on a local network
- [ ] While A holds a lesson, B cannot type in it and sees A's avatar and last edit time
- [ ] B takes control: A's lesson turns read-only and A sees who took it
- [ ] Reordering lessons succeeds while other lessons are held
- [ ] Removing B as collaborator sends B back to the dashboard within two seconds
- [ ] Restarting the server loses no synced change
- [ ] Ten simultaneous editors on one course stay in sync in an automated load test

**Spec refs:** teams-collab.md §2 Flow 6, teams-collab.md H6-H11, H13, H16, teams-collab.md L5 (lock service reuse), teams-collab.md R9, R10, teams-collab.md §4 Edit lock entity, teams-collab.md §6 Real-time co-editing, Lock and take-over service, teams-collab.md §7 Q3, Q4  
**Risks:** Largest technical risk in the product: CRDT mapping of the course format, compaction, and lock/CRDT interplay. Decision taken: CRDT underneath with per-lesson exclusive locks on top, matching the vendor model.

### TEAM-08: Snapshots and version history

Give authors a safety net: named and automatic saved states they can preview and restore.

**Features**

- Save a named snapshot from the title menu, only when something changed since the last one
- Automatic snapshots on publish to Review or the learner portal, LMS export, and creating or updating a quick-share link
- History list showing manual and automatic snapshots with trigger, author and time
- Preview a snapshot read-only in the real player, then restore, or restore directly
- Restoring first saves an automatic snapshot of the current state and reaches every co-editor
- Rename and delete snapshots
- Copy a deleted lesson or section back from a snapshot
- Desktop: snapshots stored next to the project file
- Retention setting: manual snapshots kept, automatic ones pruned past a configurable count

**Done when**

- [ ] Save snapshot is disabled until the course changes after the last snapshot
- [ ] Publish to Review, LMS export and quick-share link creation each add one automatic snapshot labelled with its trigger
- [ ] Previewing a snapshot opens it read-only in the player; restore replaces the course for all co-editors and leaves a pre-restore snapshot
- [ ] A lesson deleted today can be copied back from yesterday's snapshot
- [ ] Desktop snapshots survive an app restart
- [ ] Automatic snapshots beyond the configured count are pruned; manual ones remain

**Spec refs:** teams-collab.md J1-J5, teams-collab.md R17, teams-collab.md §4 Snapshot entity, teams-collab.md §6 Snapshot and version store, teams-collab.md §7 Q10  
**Risks:** Snapshot storage grows fast for media-heavy courses; snapshots must reference stored assets rather than copy them.

### TEAM-09: Leaving members and ownership transfer

When someone leaves, their work stays with the company and goes to one named person, with every link still working.

**Features**

- Remove one or many people in one action
- All their content goes to exactly one receiving creator; it cannot be split
- Receiver field defaults to the person doing the removal and filters as you type
- Only accepted, active creators can receive
- Include personal content checkbox, on by default
- Third choice: park content as unowned; admins assign unowned content directly later
- Receiver gets full control of courses, microlearning, label sets, block templates, review items with backups, review requests and slide-library projects
- Collaborator roles, folder share settings and every public or review link stay as they were
- Personal content left behind is held for a configurable period (default 180 days): view links work, nobody edits, collaborators lose access
- A person re-added within the hold period gets full control back
- When the hold ends, content moves to the unowned list for an admin to assign or purge
- Removed person and receiver both get an email; the removed person loses privately shared review links
- Removal ends the person's sessions and open editors at once
- No delete-content option during removal
- Atomic transfer job that writes a transfer record
- Moving a person to another server via a content export and import bundle

**Done when**

- [ ] Removing two people requires one receiver, defaulting to the actor; pending invitees are not offered
- [ ] With personal content included, every item type of both people moves to the receiver
- [ ] After transfer, collaborators, folder shares and public and review links return the same content as before
- [ ] Without personal content, those items are view-only for the hold period; re-adding the person within it restores control
- [ ] Unowned content appears in an admin list and can be assigned to any creator
- [ ] Removal ends the person's sessions within one minute and emails both people
- [ ] A failure injected mid-transfer leaves every item with its original owner

**Spec refs:** teams-collab.md §2 Flow 9, teams-collab.md D2, teams-collab.md G1-G9, G11-G13, teams-collab.md S8, teams-collab.md R2, R3, R4, teams-collab.md §4 Transfer record, Retention hold, teams-collab.md §6 Ownership transfer job, Retention jobs  
**Risks:** Transfer touches every content type, including ones built later (slide library, Review backups); each new type must register with the transfer job or it will be silently left behind.

### TEAM-10: Shared question banks

Let teams keep question banks in shared folders with view-or-edit roles so many courses can draw from them.

**Features**

- Question banks tab with personal folders: create, rename, move, duplicate into the same folder, delete, restore
- Share by moving a bank or folder into a team folder; a bank moved into an existing folder takes its roles
- Four folder roles: owner, manager, editor, viewer (read and use questions in courses)
- Everyone is added by default to new shared bank folders
- Editing status shows who has a bank open
- Take control discards the other person's unsaved changes and makes you the editor
- Hovering last updated shows who last edited
- Remove from Team returns a bank you own to your personal area
- No direct ownership transfer; banks move only when their owner is removed

**Done when**

- [ ] Moving a personal bank into a team folder gives it that folder's roles; a new shared bank folder already lists Everyone
- [ ] A viewer can add bank questions to a course but cannot edit them; an editor cannot delete or change sharing; a manager cannot move to personal or delete
- [ ] While A has a bank open, B sees Editing with A's name; B's take control discards A's unsaved changes and turns A read-only
- [ ] Hovering last updated names the last editor
- [ ] Remove from Team returns an owned bank to the owner's personal area

**Spec refs:** teams-collab.md L1-L8, teams-collab.md R12, teams-collab.md §6 Shared libraries API  
**Risks:** The bank editor itself belongs to the Blocks editor backlog; this epic must reuse it rather than rebuild it.

### TEAM-11: Block template library

Let authors save groups of blocks as reusable templates and share them with the whole team.

**Features**

- Select blocks in a lesson and save them as a template, name up to 42 characters
- Share with team at save or later; sharing reaches the whole organisation only
- Rename, share and delete your own templates; course managers and admins with the creator role can rename and delete shared ones
- Inserting copies the blocks into the lesson; later edits never change the template
- Inserted blocks take the course's theme fonts and keep their own bold, size, colour and lists
- Templates cannot be edited after saving
- No direct ownership transfer; templates move only when the owner is removed
- Library search by name, filter by author, sort by name or date
- Templates live in a library, available in every course
- Desktop: personal template library as local files, with export and import

**Done when**

- [ ] A 43-character name is refused; a 42-character name saves
- [ ] A shared template appears for every creator; an unshared one only for its owner
- [ ] Inserting into a course with different theme fonts uses the course fonts and keeps the template's bold, size, colour and lists
- [ ] Editing inserted blocks leaves the template unchanged; the template offers no edit action
- [ ] Search, author filter and both sorts return the expected templates
- [ ] A desktop template appears in every local course and round-trips through export and import

**Spec refs:** teams-collab.md M1-M9, teams-collab.md R15, teams-collab.md §4 Block template entity  
**Risks:** Personal template basics may also appear in the Blocks editor backlog; coordinate so one owner builds the save/insert path.

### TEAM-12: Brands and fonts

Apply one company look (colours, logo, fonts) across courses without ever changing content behind an author's back.

**Features**

- Brands: unique name, primary colour (picker, hex, eyedropper), extra colours, logo, heading font, body font
- Extra brand colours appear as presets in every colour picker
- Logo guidance shown at upload (square, little whitespace, transparent)
- Organisation fonts: .woff upload, named, edit and delete; not listed in the per-course theme font menu
- Unlimited brands, sortable by modified, created or title
- One default brand, applied only to newly created content
- Applying a brand from the theme menu overwrites logo, colours and fonts; per-course overrides stay possible
- Apply a brand to many dashboard items at once where the user is owner or manager; brand name shown on each card
- Editing a brand shows an update-available banner in each course with a review of the differences; accept or ignore
- Deleting a brand leaves courses as they were
- Setting for who manages brands: everyone (default) or admins only
- Personal theme fonts: .woff only, regular required, bold and italic optional, usable in all the author's courses
- Editing a personal font updates every course using it; deleting it reverts them to the default font
- Brands apply to the blocks editor first; the slides editor uses brand colours as presets when it ships
- Desktop: local brand files; brand export and import as JSON plus a font zip

**Done when**

- [ ] A second brand with an existing name is refused; extra colours show as presets in every colour picker
- [ ] The default brand reaches a new course only; changing or deleting the default leaves existing courses unchanged
- [ ] Editing a brand raises update-available in courses using it, with a difference review; accept applies, ignore keeps the course as is
- [ ] Bulk apply works only on items the user owns or manages and shows the brand name on each card
- [ ] A .woff2 upload is refused and regular is required; editing a personal font restyles every course using it, deleting reverts them
- [ ] With admins-only brand management, a creator cannot create or edit brands
- [ ] A brand exported on desktop imports on the server with identical values, and the reverse

**Spec refs:** teams-collab.md K18, teams-collab.md N1-N15, teams-collab.md R13, R14, teams-collab.md §4 Brand, Font entities, Formats: Brand file, teams-collab.md §7 Q5, Q6, Q7  
**Risks:** Brand revision tracking and the difference review need the theme model to be diffable; font licensing of uploaded fonts is the organisation's responsibility and should be stated in the UI.

### TEAM-13: Shared slide library

Let slide-editor authors share whole projects, scenes or chosen slides with the team and reuse them in new work.

**Features**

- Share from the slides editor: whole project, current scene or selected slides
- Create a new library project or replace one you own; a replaced project stays in its folder
- Save into a chosen or newly typed folder; otherwise into All Projects
- Library browser from the editor ribbon and the start screen
- Starting a new project from the library inherits content, slide size and player settings
- Live search by title or author
- Project view (first-slide thumbnail, title, slide count) and slide view (all slides per project); start screen shows project view only
- Sort newest first, alphabetical, or recently used
- Folders in alphabetical order plus All Projects and Deleted Items; anyone can add folders
- Thumbnail zoom by slider or Ctrl+wheel
- Details pane for projects and slides: title, author, last updated, slide count, dimensions, folder link
- Insert one whole project in project view, or any multi-selection in slide view
- Drag projects onto folders; rename by context menu or hover
- Permissions: everyone shares, creates and renames folders, moves projects, deletes empty folders; owners replace, delete and restore their own; admins with the creator role do it for anyone
- Deleted Items: permanent delete and Empty act on your own deletions; a deleted folder's projects go to Deleted Items
- A removed member's library projects stay available to the team
- Inserted library slides are plain copies with no link back
- Desktop: personal local library with the same browse, search and insert

**Done when**

- [ ] Sharing selected slides creates a library project; replacing an owned project keeps it in its folder; replacing someone else's is refused
- [ ] A new project started from the library has the source's slide size and player settings
- [ ] Search, both views, three sorts and thumbnail zoom work in an end-to-end test
- [ ] Deleting a folder moves its projects to Deleted Items; Empty removes only the user's own deletions
- [ ] An admin with the creator role restores another author's deleted project
- [ ] Changing a library project after insert changes nothing in courses that used it
- [ ] A removed member's projects remain listed
- [ ] The desktop personal library inserts slides offline

**Spec refs:** teams-collab.md §2 Flow 7, teams-collab.md O1-O16, teams-collab.md R16, teams-collab.md §4 Slide library project entity, Formats: Slide library entry, teams-collab.md §7 Q1  
**Risks:** Blocked until the slides editor and its project format exist; masters and player settings carried by library entries must stay compatible as that format evolves.

### TEAM-14: Content library, stock search and team assets

Give authors original templates, characters and media to search and insert from both editors, plus a company asset library.

**Features**

- Ships only original templates and characters from the project's own library repo, as versioned asset packs
- Search from inside both editors, with tags in several languages
- Templates adapt to any slide size; 4:3 and 16:9 are tested
- Inserting an asset copies it into the course with a note of its source and licence
- Published output loads only local copies
- Desktop caches used assets for offline use
- Server fetches remote assets through a proxy and keeps a copy in the company's own storage
- Optional stock connectors to free-API providers using the company's or author's own API key, with attribution stored per asset
- Stock connectors are enabled only for providers that pass a licence review
- Team asset library: admins and creators upload logos, photos and characters into shared folders

**Done when**

- [ ] A search in either editor returns original templates and characters from the installed pack, including a match on a non-English tag
- [ ] An inserted asset carries its source and licence note, and the published course makes no external request for it
- [ ] A template placed on 4:3 and 16:9 slides lays out without manual fixes
- [ ] With a company key, a stock connector shows results with attribution and stores inserted media in company storage; with no key the connector is hidden
- [ ] Assets uploaded to the team asset library appear for every creator in both editors
- [ ] Desktop inserts cached assets with the network off

**Spec refs:** teams-collab.md P1-P3, P5-P9, teams-collab.md §7 Q17  
**Risks:** Each stock provider's API terms (attribution, hotlinking, use in open-source apps) need a licence read before its connector ships; the original asset packs are content work in the library repo, not code.

### TEAM-15: Project backups and storage

Keep slide-editor project files safe on the server next to each Review version, and keep local project files safe on disk.

**Features**

- Publishing a slides project to Review can upload the whole project file as a backup, even when publishing one scene or slide
- Not offered for manual uploads to Review
- Version list marks backed-up versions with an icon, download link and publish date and time
- Only signed-in creators of the organisation see and download backups
- Backups in team folders stay with the organisation when their owner leaves
- When Review deletes newer versions on restore, their backups go with them; hidden versions keep theirs
- Backups are ordinary project files that open in the desktop app, including recent older versions
- Storage usage per user and per group, with optional limits set by the self-hoster
- Server honours the project id on upload, so a copied file updates the same item and a save-as creates a new one
- Desktop: atomic save (write then replace) and a warning with copy-locally advice for projects on network drives

**Done when**

- [ ] Publishing one scene with backup on stores the full project file on that Review version, shown with icon, link and date and time
- [ ] Reviewers and guests never see the backup option; a signed-in creator downloads it
- [ ] The downloaded backup opens in the current and previous desktop release
- [ ] Restoring an older version in Review deletes newer versions' backups; hidden versions keep theirs
- [ ] A group over its storage quota cannot upload more backups
- [ ] A desktop save interrupted mid-write leaves the previous file intact; a project on a network path shows the warning

**Spec refs:** teams-collab.md §2 Flow 8, teams-collab.md Q1-Q9, teams-collab.md R18, R23, teams-collab.md §4 Review version entity, Formats: Project backup, Project identity, teams-collab.md §6 Object storage  
**Risks:** Review's destructive restore and version list are owned by the Review backlog; this epic adds only the backup layer and must not duplicate version handling.

### TEAM-16: AI policy, module switches, integrations and labs

Let admins decide who may use AI, which parts of the suite are switched on, and which outside services are connected.

**Features**

- AI access modes: Everyone (default), Specific groups, No one
- No one asks for confirmation and hides every AI control; the server also refuses AI requests
- Group mode: per-group toggles, enable all, disable all, search, filter by access, default for new groups, at least one group stays on
- Company-wide AI model and key configuration; keys never sent to browsers
- Integrations: connect and disconnect content sources (cloud drives) and AI models
- AI and translation usage per user and per group, with CSV export
- Turn translation access on or off for a creator
- Module switches for the whole organisation: web blocks editor, Review, slide library, text-to-speech, AI, learner portal
- Content in a switched-off module is kept but unreachable until switched back on
- Labs: each creator turns experimental features on or off for themselves (desktop settings too)

**Done when**

- [ ] Choosing No one asks for confirmation, removes AI controls from both editors for everyone, and AI API calls are refused
- [ ] In group mode the last enabled group cannot be switched off; a new group gets the configured default
- [ ] The usage CSV lists AI and translation usage per user and group for a chosen date range
- [ ] Switching the slide library off hides it and its content; switching it on shows everything unchanged
- [ ] A saved AI key is shown masked and never appears in browser network traffic
- [ ] A Labs toggle changes the feature for that creator only

**Spec refs:** teams-collab.md B6, teams-collab.md D4 (AI, credits, portal, translation rows), teams-collab.md R4-R9, teams-collab.md Q10, teams-collab.md R22, teams-collab.md §6 Module flags  
**Risks:** Hiding AI everywhere requires every editor feature to read one capability flag; scattered checks will leak buttons.

### TEAM-17: Single sign-on, SCIM and two-factor sign-in

Let companies sign authors in through their own identity provider, provision people automatically, and secure local accounts.

**Features**

- SAML 2.0 single sign-on for authors and admins, both SP- and IdP-initiated
- Self-service setup from IdP metadata XML or issuer, SSO URL and signing certificate
- Test-login button and a staging test mode before SSO is enforced
- Email is the identifier and must match the IdP
- SSO belongs to the organisation, not to an email domain
- Sign-in: type email, go to the IdP, return signed in
- Just-in-time sign-in creates an identity but no membership; optional auto-join to the default group, off by default
- IdP removal blocks sign-in at once even if the person is still a member; admins then decide their content
- Password is managed by the IdP for SSO users
- SCIM 2.0 provisioning and deprovisioning
- TOTP two-factor for local accounts, with an admin setting to require it
- Protocol field ready for OIDC later

**Done when**

- [ ] Against a local test IdP container, SP- and IdP-initiated logins sign in an invited member matched by email
- [ ] Uploading metadata XML fills issuer, URL and certificate; the test-login button reports success or the exact failure
- [ ] A non-member's first SSO sign-in creates no membership unless auto-join is on
- [ ] A SCIM deprovision ends the user's sessions within one minute and prompts an admin to decide their content
- [ ] A local account with TOTP enrolled cannot sign in without a valid code
- [ ] SSO users see no password fields in their profile

**Spec refs:** teams-collab.md §2 Flow 10, teams-collab.md R3, teams-collab.md S1-S11, teams-collab.md R19, teams-collab.md §4 SSO config entity, teams-collab.md §6 SSO, SCIM, TOTP  
**Risks:** SAML has no push for IdP removal; immediate blocking relies on SCIM or short session lifetimes with re-validation. SAML libraries need careful signature validation to avoid known attack classes.

### TEAM-18: Audit log and change notifications

Give self-hosters a tamper-resistant record of who changed access and content, and optional alerts on shared work.

**Features**

- Audit events for role changes, invites, removals, transfers, take-overs, deletions, restores, SSO, AI policy, module and brand changes
- Each event records actor, action, target, before and after, and time
- Append-only store; no edit or delete through the API
- Audit log section in the console: filter by actor, action and date; CSV export
- Transfer records viewable from the audit log
- Configurable audit retention
- Optional notifications for changes to shared items, collaborator additions and take-overs, off by default
- Per-user notification choice: email digest or in-app

**Done when**

- [ ] Each listed action writes exactly one audit event with actor, target, before and after, and time
- [ ] API attempts to change or delete audit events are refused
- [ ] Console filters by actor, action and date and exports matching events as CSV
- [ ] With notifications off (default) no messages are sent; a user who opts in gets one digest for changes to items they collaborate on

**Spec refs:** teams-collab.md K17, teams-collab.md §4 Audit event, Transfer record, teams-collab.md §6 Audit log, Notifications, teams-collab.md §7 Q12  
**Risks:** Earlier epics must emit events through the shared hook from day one, or the audit log will have gaps for actions built before it.

### TEAM-19: Desktop fleet deployment and update policy

Let IT departments install and control the desktop app across many machines.

**Features**

- Installer packages for endpoint-management tools: Windows MSI, macOS PKG, Linux packages
- Install-folder parameter for silent installs
- Machine policy keys: switch off update checks, block non-admin installs and updates, switch off auto-update and hide its toggle, usage-analytics opt-out (accepted; the app sends none)
- Policy sources: Windows registry, macOS configuration profile, Linux JSON file
- Per-user keys: interface language and desktop notifications; user settings beat machine settings
- Auto-update on by default from public releases, roughly monthly
- Fully offline use with no sign-in or licence clock

**Done when**

- [ ] MSI, PKG and Linux packages install silently into a chosen folder
- [ ] With the auto-update-off policy, the app never checks for updates and the toggle is hidden
- [ ] A user-level language key overrides the machine default
- [ ] With no policy, the app finds and installs a newer public release
- [ ] With update checks off, the app makes no network requests at all

**Spec refs:** teams-collab.md R10, R12, R13, teams-collab.md §6 Desktop enterprise policy  
**Risks:** MSI and PKG signing depends on the open code-signing decision; unsigned packages are blocked by many fleets.

### TEAM-20: Desktop connection to a company server and sync

Let a desktop author sign in to their company server and keep projects and personal libraries in sync with the team.

**Features**

- Sign in to a company server through the system browser with a loopback redirect, SSO included
- Open the admin console from the desktop app menu
- Sync desktop projects with server projects, offline edits merged on reconnect
- Push personal templates, brands, fonts and slide-library entries to team libraries and pull team libraries down
- Publish a slides project to server Review with its project backup from the desktop
- Removal or deactivation on the server revokes desktop access at next contact; local files stay
- Server module switches hide matching features in the connected app

**Done when**

- [ ] A desktop user signs in through the system browser, including through SSO, and returns signed in
- [ ] A course edited offline on desktop and online on the server merges without losing either side's changes
- [ ] A personal brand pushed to the team appears in the server brand list, and a team template pulled down works offline
- [ ] After server-side removal, the desktop app loses server access on its next contact while local files remain
- [ ] Switching a module off on the server hides it in the connected desktop app

**Spec refs:** teams-collab.md §1 Purpose, teams-collab.md G11, teams-collab.md O1-O14 (Y), teams-collab.md Q1, Q10, teams-collab.md R2, teams-collab.md S6, teams-collab.md §6 Desktop sign-in, Sync protocol  
**Risks:** Sync protocol is unplanned (phase 8); offline merging of whole projects and media at scale needs a design spike before sizing is reliable.

### Deliberately out of scope

- Subscriptions, seat licensing, buying seats, price quotes, billing, invoices and credit purchases (A8, A9, R1 Subscription/Credits/Billing): free software; replaced by an instance summary and optional group quotas
- Licence reassignment limit of twice the seat count per year (A10): vendor-commercial rule with no equivalent in free software
- Temporary group-manager workaround for taking a leaver's seat (G10): there are no seats
- Offline licence clock of 99 days (30 on trial) (R10): the desktop app is fully offline with no licence check
- SSO on free trials (S11): there are no trials; replaced by an SSO test mode in TEAM-17
- Support-request-only changes of owner or primary admin, and the advice to keep spare admins (D5, D6): replaced by in-console handover and a CLI recovery in TEAM-01
- Vendor support channels (R11): replaced by links to project docs and the issue tracker
- Vendor proprietary slide templates, characters and the vendor's stock-library feed (P1): never shipped under clean-room rules; only original assets and opt-in stock connectors
- Vendor rule that library assets may be used only in courses made with the vendor's apps (P4): our assets are openly licensed
- Vendor data regions, region choice at account creation and central identity service (T1, T3 region switching, T4): each self-hosted server is its own region and keeps identity locally
- Multiple organisations or workspaces per server and switching between them (A12, D4 multi-team row, open question 13): deferred; one organisation per server first, with an organisation id kept on every record so it can be added later
- External Connections and collaboration across teams or servers (H2 external part, K1 External Connections, T2, open questions 8 and 16): deferred until after desktop sync; needs a federation design
- Read-only course viewer collaborator role (H15, open question 15): not in the reference behaviour; viewers use Review; revisit after Review ships
- Content-auditor role letting non-creator admins inspect team content (open question 14): deferred; admin roles never imply authoring (R21)
- Account and team ids, quick-share ids, copy lineage, hosted AI-tutor keys and vendor analytics frames inside published output (U2, U4, U5, open question 18): deliberately not matched (R20, no telemetry)
- Vendor 150 GB storage cap for single-user plans (Q7 vendor limit): storage limits are the self-hoster's choice
- Learner SSO, portal domain, learner-portal owner powers and portal admin/manager/reporter behaviour: owned by the Reach backlog; this product only stores the roles
- Reviewer role behaviour, Review's owner/editor matrix and destructive restore UI: owned by the Review backlog; it reuses the TEAM-05 folder service and TEAM-15 backups
- Starting translations with the localization role: owned by the Translate backlog; this product only grants and revokes the role

## Standards: exporters, player run-time, LMS/LRS (SCORM 1.2, SCORM 2004 2nd/3rd/4th, xAPI 1.0.3/2.0, cmi5, AICC, plain web; built-in LMS-lite, LRS and cmi5 launcher for the server edition)

| Id | Epic | Priority | Edition | Size | Milestone | Depends on |
|---|---|---|---|---|---|---|
| STD-01 | Tracking core and resume codec | mvp | player | M | M1 | — |
| STD-02 | Package builder, validation and web export | mvp | shared-engine | M | M1 | STD-01 |
| STD-03 | Standards CI harness | mvp | shared-engine | M | M1 | — |
| STD-04 | SCORM 1.2 end to end | mvp | shared-engine | M | M1 | STD-01, STD-02, STD-03 |
| STD-05 | SCORM 2004 4th edition end to end | mvp | shared-engine | M | M1 | STD-04 |
| STD-06 | xAPI package and player reporting | mvp | shared-engine | M | M1 | STD-01, STD-02, STD-03 |
| STD-07 | cmi5 single-AU package and player | mvp | shared-engine | M | M1 | STD-06 |
| STD-08 | Publish settings panel | mvp | both | M | M2 | STD-02 |
| STD-09 | Question-level reporting | v1 | shared-engine | M | M2b | STD-04, STD-05, STD-06, STD-07 |
| STD-10 | Player tracking options | v1 | player | M | M2b | STD-04, STD-05, STD-06, STD-07 |
| STD-11 | Exporter advanced options | v1 | shared-engine | M | M2b | STD-05, STD-07, STD-08 |
| STD-12 | xAPI outside an LMS and dual reporting | v1 | shared-engine | M | M2b | STD-04, STD-06, STD-08 |
| STD-13 | AICC package and HACP adapter | later | shared-engine | M | LATER | STD-01, STD-02, STD-04 |
| STD-14 | Server SCORM host and LMS-lite | v1 | server | L | M4 | STD-04, STD-05 |
| STD-15 | Server LRS core | v1 | server | L | M4b | STD-06 |
| STD-16 | Server LRS full conformance and forwarding | v1 | server | L | M4b | STD-15 |
| STD-17 | Server cmi5 launcher | v1 | server | L | M4b | STD-07, STD-15 |
| STD-18 | Server SCORM 2004 multi-SCO sequencing | later | server | L | LATER | STD-14 |
| STD-19 | LMS integration matrix and legacy conformance | v1 | shared-engine | M | M2b | STD-03, STD-05 |

### STD-01: Tracking core and resume codec

Give the player one standard-neutral tracking model and a compact resume format that every LMS/LRS adapter translates from.

**Features**

- Internal status always keeps completion and success separately, plus score (raw/min/max/scaled), progress, session and total time, bookmark and language
- Adapter interface: initialize, read resume, write resume, report status/score, commit, terminate; one adapter per standard
- Resume payload is versioned, keyed by stable ids (never positions), compressed and encoded in characters safe for suspend_data
- Hard caps per target: 4,096 chars (SCORM 1.2), 4,000 (2004 2nd ed), 64,000 (2004 3rd/4th ed)
- Overflow drops parts in a fixed order: scroll positions, then media positions, then visited flags of finished scenes
- Restores slide/lesson position, variables, slide states, answers and question draws
- Resume from an older publish ignores ids that no longer exist instead of failing
- Resume write debounced about 0.5 s after the last change; never written when nothing changed
- Session time accumulates across saves
- Review mode is a read-only flag every adapter honours: nothing new is written
- Standalone web adapter keeps resume in browser storage when no LMS/LRS is present, and still runs when storage is blocked
- Player sends no telemetry: network traffic goes only to the LMS/LRS the customer configured
- Size estimator used by publish to warn the author before the cap is hit

**Done when**

- [ ] Round-trip property test over 10,000 random states decodes to identical state; a payload written by format version N still decodes after a bump to N+1
- [ ] Reference course in test-courses (120 slides, 60 variables, 3 quizzes) fits 4,096 chars or drops parts strictly in the documented order, and the publish estimate is within 10% of the real size
- [ ] With an injected fake clock, a burst of changes within 0.5 s yields exactly one write and an unchanged state yields zero writes
- [ ] Network capture of a full run in every adapter shows requests only to the package's own files and the configured LMS/LRS origin
- [ ] Standalone mode resumes at the same slide with the same variables after a browser reload; with storage blocked the course runs from the start with no uncaught errors
- [ ] Republishing with one slide deleted and resuming an old payload lands the learner on the nearest valid position without an error

**Spec refs:** standards.md 4.2, standards.md 4.3, standards.md 3.6 P-4, standards.md 3.7 P-7, P-8, standards.md 5 rules 4, 5, 15, 16  
**Risks:** The resume format becomes a long-lived compatibility contract with every course already in an LMS, so it must be versioned from day one; some LMSs mangle or escape certain characters in suspend_data, so the encoding must be tested against real LMSs; 4,096 chars is tight for large slide courses.

### STD-02: Package builder, validation and web export

One publish pipeline that turns a project into a validated package for any standard, on desktop and on the server.

**Features**

- Pipeline: collect course files and player, write the standard's descriptor and launch page, zip (32-bit or zip64 as needed)
- Launch page boots the player with the standard fixed at publish
- Stable identifiers stored in the project: manifest identifier, xAPI/cmi5 activity IRI; author-editable, generated by default, unchanged across republishes
- Plain web export: no tracking, resume in browser storage
- Validation before the download is offered: descriptor schema check, every file listed, size limits, resume-cap estimate
- Desktop writes the package to disk; the server runs the same pipeline as an export job and offers the download only after validation passes
- Reproducible output: same project and options give the same file list and descriptors

**Done when**

- [ ] Publishing an unchanged project twice yields identical identifiers and descriptors
- [ ] Validation rejects a package with a missing listed file or an invalid descriptor and names the file or element at fault
- [ ] Web export runs from a local folder and from a static web server with no console errors and no requests beyond its own files
- [ ] A course over 4 GB or 65,535 files is written as zip64 and opens in standard unzip tools
- [ ] Desktop and server export of the same project produce the same file list and descriptors

**Spec refs:** standards.md 2 flow steps 2-3, standards.md 3.1 E-6, standards.md 3.3 E-16, standards.md 3.4 E-19, standards.md 3.6 P-1, standards.md 6 export jobs, standards.md 1 plain web  
**Risks:** Schema files for each standard must be redistributable inside packages; identifier stability breaks LMS history if an author copies a project, so duplicate-project must offer to regenerate ids.

### STD-03: Standards CI harness

Catch any change in what our courses say to an LMS or LRS on every engine, player or exporter change.

**Features**

- Headless browser host using scorm-again (MIT) for SCORM 1.2 and 2004 that logs every API call with arguments and results
- Golden call-order tests for launch, start button, slide change, resume write, 60 s save and exit sequences
- Injectable fake clock for the 0.5 s debounce and 60 s save rules
- Local LRS in a container for xAPI and cmi5 runs until our own LRS is ready
- ADL CATAPULT content test suite run against our cmi5 packages
- Moodle in Docker: automated SCORM 1.2 import, learner launch and status/score read-back
- Conformance corpus in the test-courses repo: one course per feature (quiz, multiple quizzes, long resume, every interaction type)
- Failure output shows the call-log diff against the golden

**Done when**

- [ ] CI fails when any single SCORM call is reordered, added, removed or changes value against the golden
- [ ] Moodle job imports a SCORM 1.2 zip, launches it as a test learner and reads back status and score from Moodle
- [ ] CATAPULT content suite runs headless and its report is stored as a CI artifact
- [ ] The standards job runs on every pull request touching engine, player or exporters and finishes in under 20 minutes

**Spec refs:** standards.md 3.11 T-2, T-4, T-6, T-7, standards.md 5, standards.md 6 CI farm  
**Risks:** Browser-driven Moodle launches are prone to flakiness; goldens for score, pass/fail and interaction order rest on a static read only (open question 1) and will change once a controlled quiz run is specified; CATAPULT needs its own LRS setup.

### STD-04: SCORM 1.2 end to end

Courses export as SCORM 1.2 and launch, resume, score and exit in an LMS exactly as LMSs expect.

**Features**

- imsmanifest.xml at the zip root with the ADL 1.2 schema files beside it
- Manifest: one organization, one visible item, one SCO webcontent resource pointing to the launch page; every file listed
- Inline LOM metadata: title, version, status, typical learning time, rights
- adlcp:masteryscore written when the author sets a passing score
- API discovery: parent frame chain, then opener chain, for the API object, with a bounded number of levels
- Launch order: LMSInitialize, read mode, browse sets browsed, read status, not attempted becomes incomplete, exit set to suspend, read suspend data
- Start-screen button reports incomplete
- Every 60 s: session time (HHHH:MM:SS.SS) then commit
- Status in the author's wording pair (passed/incomplete, passed/failed, completed/incomplete, completed/failed), words mapped one-to-one
- Score raw 0-100 with min 0 and max 100
- Commit right after completion; finishing with no status marks completed
- Exit order: status, pending data and commit, session time, exit value, commit, LMSFinish, hand control back (close window or goodbye page)
- Exit value empty when the learner reached the end, otherwise suspend
- Exit hooked to page-hide as well as unload; the player's exit button uses the same path
- Review mode writes nothing; browse mode reports browsed
- Bookmark per app: slide-style output keeps position only in suspend data; blocks-style output also writes lesson_location on every lesson open
- After every call, read the last error; on a failed save show a non-blocking message and retry at the next commit

**Done when**

- [ ] Headless call log matches the launch and exit goldens exactly
- [ ] Manifest validates against the ADL SCORM 1.2 schemas
- [ ] In Moodle, a learner who closes mid-course and relaunches returns to the same slide with the same variables
- [ ] A passed quiz with wording passed/incomplete shows passed and the score in Moodle's report
- [ ] A review-mode launch makes zero LMSSetValue calls
- [ ] A simulated commit error shows a non-blocking message, the course stays usable and the next commit retries
- [ ] Removing the course frame (page-hide without unload) still commits status and resume data

**Spec refs:** standards.md 3.1 E-1..E-6, standards.md 3.6 P-3, standards.md 3.7 P-6..P-11, P-14..P-17, P-20, standards.md 4.1, standards.md 5 rules 2-9, 11-13, 15, 17  
**Risks:** LMS frame and pop-up layouts vary and can defeat API discovery; lesson_location is capped at 255 chars; the browse-mode branch is from a static read only.

### STD-05: SCORM 2004 4th edition end to end

Courses export as SCORM 2004 4th edition with separate completion and success, scaled score and large resume data.

**Features**

- Full ADL/IMS schema set at the root (content packaging, adlcp, adlseq, adlnav, imsss, LOM), schemaversion 2004 4th Edition
- LOM metadata in a separate metadata.xml referenced from the manifest
- One organization, one visible item, one SCO resource
- Default sequencing: choice and flow on, tracked, completion and objectives not set by content; objectives not global to system
- API discovery for API_1484_11 through parent and opener chains
- Launch order: Initialize, read success, read completion, not attempted becomes incomplete, exit suspend, read mode, read suspend data, read success and completion again; no reads of location, learner name/id, entry or launch data
- Start-screen button reports success unknown and completion incomplete
- Passed and failed also set completion completed; completed sets only completion; reset sets success unknown and completion incomplete
- Score raw/min/max plus scaled = raw / max
- Session time as ISO 8601 duration every 60 s, then commit
- Resume up to 64,000 chars; bookmark per app via cmi.location
- cmi.learner_preference.language written from the course language
- Exit value normal at the end, otherwise suspend; same exit order, page-hide hook and review-mode rule as SCORM 1.2
- Error handling via GetLastError with non-blocking notice and retry

**Done when**

- [ ] Headless call log matches the 2004 launch golden exactly, including the absence of the excluded reads
- [ ] Manifest and metadata.xml validate against the 4th-edition schema set
- [ ] Passing a quiz at 80/100 reports success passed, completion completed, raw 80 and scaled 0.8
- [ ] Session times summed across saves equal elapsed time within 1 s
- [ ] A 50,000-char resume state round-trips in the scorm-again 2004 host
- [ ] A review-mode launch makes zero SetValue calls

**Spec refs:** standards.md 3.2 E-8..E-12, standards.md 3.6 P-3, standards.md 3.7 P-6..P-17, P-20, standards.md 4.1, 4.2, 4.3, standards.md 5 rules 1, 3-10, 12-13, 15, 17  
**Risks:** Moodle has no SCORM 2004 support, so the MVP verifies only in scorm-again until ILIAS joins (STD-19); LMSs may override reported status when thresholds exist; incumbent 3rd/4th-edition manifests were never seen (open question 4).

### STD-06: xAPI package and player reporting

Courses export as xAPI and send correct statements and resume state to any LRS, 1.0.3 or 2.0.

**Features**

- tincan.xml at the root: course activity (id, name, description, launch file) and one module activity per slide/lesson
- Activity id is an author-chosen IRI, generated by default, stable across republishes
- LRS settings from launch-link query parameters (endpoint, auth, actor, registration) or a page hook that supplies the learner
- Missing endpoint, auth or actor turns reporting off with one console error; the course still runs
- Statements: attempted at course start (completion false on first attempt), experienced per slide, left with duration, completed/passed/failed with duration and completion, quiz result with scaled/raw/min/max score and success
- Context: registration in every statement when given; parent and grouping set to the course activity
- Statement language from the current course language
- Resume, cumulative time, bookmark and preferences kept in LRS State documents per learner + activity + registration
- Retry failed sends at 100, 400, 400, 600, 600 ms, then an offline banner and retry until sent, in original order
- Works with xAPI 1.0.3 and 2.0 LRSs (version header, timestamp format)

**Done when**

- [ ] Against the CI LRS, a scripted run produces the golden statement sequence (verbs, object ids, result fields, context)
- [ ] Every statement validates against the xAPI schema for both 1.0.3 and 2.0
- [ ] Cutting the network mid-course shows the offline banner; restoring it delivers every queued statement in order with no duplicates (stable statement ids)
- [ ] Relaunching with the same registration resumes from the State document
- [ ] A launch link without auth sends no requests, logs one console error and the course runs

**Spec refs:** standards.md 3.3 E-15, E-16, standards.md 3.8 X-1..X-7, standards.md 4.3, standards.md 4.4, standards.md 4.5  
**Risks:** No run against a real LRS has been observed (open question 3); the launch-link convention puts credentials in the URL; LRS support for 2.0 varies; the offline queue is lost if the tab closes before reconnecting unless it is persisted.

### STD-07: cmi5 single-AU package and player

Courses export as a cmi5 package and follow every cmi5 launch, statement and state rule so cmi5 LMSs accept them.

**Features**

- cmi5.xml at the zip root: course id, title, description and one AU with id, title, description, url, launch method, move-on, mastery score, activity type, launch parameters, entitlement key
- Author move-on choices: Passed, Completed, Completed and passed, Completed or passed, Not applicable
- Launch: read endpoint, fetch, actor, registration and activityId from the URL; POST once to the fetch URL for a token; read LMS launch-data state and learner preferences; send initialized first
- Keeps its own committed-status state document and launch-mode list; derives entry as first time, resume or review
- Normal mode only may send completed, passed, failed and score; Browse and Review send only initialized and terminated
- Mastery score from launch data decides passed vs failed from the scaled score
- Completed sent before passed/failed; each cmi5 verb at most once per session; never both passed and failed; nothing after terminated
- Allowed statements between initialized and terminated: attempted, experienced and left per slide, with a 0-100 progress extension on all but completed
- Terminated carries total session duration; exit goes to returnURL when given
- Bookmark and suspend data in the AU's own State documents

**Done when**

- [ ] ADL CATAPULT content test suite passes all mandatory tests for the single-AU package
- [ ] The fetch URL is called exactly once per launch; a fetch failure stops reporting and shows an error
- [ ] A Browse-mode launch sends exactly initialized then terminated
- [ ] Unit and golden tests show a second passed, or failed after passed, in one session is refused
- [ ] Exit navigates to returnURL when present

**Spec refs:** standards.md 3.4 E-19, E-20, E-22, standards.md 3.9 C-1..C-9, standards.md 4.3, 4.4, standards.md 5 rule 14  
**Risks:** No incumbent cmi5 package was observed (open question 2); cmi5 IEEE publication status is unverified (open question 8); LMS cmi5 support is uneven.

### STD-08: Publish settings panel

Let authors pick the output standard and its reporting options in one panel shared by both editors and both editions.

**Features**

- Choose SCORM 1.2, SCORM 2004, xAPI, cmi5 or web (AICC and auto appear when their epics ship)
- Status wording pair, passing score and tracking source (slides/lessons viewed, a quiz result, or a trigger)
- Edit identifiers, title, description and LOM metadata
- cmi5 move-on and mastery score
- Live resume-size estimate and validation results before export
- Settings saved in the project and reused on republish
- Same React component in the desktop app and the server web UI
- Keyboard and screen-reader accessible

**Done when**

- [ ] Each MVP package type can be produced from the Blocks editor with defaults and no other required input
- [ ] Settings persist in the project file and a republish uses them unchanged
- [ ] Incoherent choices are flagged (for example move-on Passed on a course with no scored quiz)
- [ ] The panel passes automated WCAG 2.1 AA checks and is fully operable by keyboard
- [ ] The same component renders in the desktop app and in the server web UI

**Spec refs:** standards.md 2 users and flow step 1, standards.md 3.4 E-22, standards.md 3.7 P-10, standards.md 4.2 publish warning  
**Risks:** Option sprawl as v1 options arrive; the editors' teams must agree where tracking source lives in the course format.

### STD-09: Question-level reporting

Send every answer to the LMS or LRS in the form each standard expects, so admins see per-question results.

**Features**

- SCORM interactions of type true-false, choice, fill-in, long fill-in, matching, sequencing, Likert, numeric and performance
- Fields: id, type, time/timestamp, weighting, learner response, result, latency, description (2004), correct pattern, objective id
- Per-standard formats and limits: 1.2 identifiers and responses up to 255; 2004 ids up to 4,000 and typed response formats
- Over-long values truncated or encoded without breaking the response format
- xAPI answered statement per question with response, success and duration; Likert rows as separate statements
- tincan.xml lists one cmi.interaction activity per question with its type and choices
- cmi5 answered statements as allowed statements

**Done when**

- [ ] For each of the 9 interaction types, golden call logs are accepted by scorm-again 1.2 and 2004 with no errors
- [ ] A 300-character fill-in answer is stored in SCORM 1.2 without an LMS error
- [ ] xAPI answered statements validate and their interaction definitions match tincan.xml
- [ ] Moodle's report shows per-question responses for a SCORM 1.2 quiz

**Spec refs:** standards.md 3.7 P-12, standards.md 3.3 E-15, standards.md 3.8 X-2, standards.md 3.9 C-7, standards.md 4.1, standards.md 4.2 interaction limits, standards.md 4.4  
**Risks:** The runtime order of score, pass/fail and interaction writes is from a static read only (open question 1); goldens may need revision once the study team specifies a controlled quiz run.

### STD-10: Player tracking options

Universal build, LMS-only switch and multi-quiz scoring rules for authors who need them.

**Features**

- Auto mode: one universal package that detects its standard at launch
- Detection order: AICC launch parameter, then endpoint + fetch (cmi5), endpoint only (xAPI), API_1484_11 (2004), API (1.2), otherwise standalone web
- Only-run-inside-an-LMS switch shows an error page instead of running standalone
- Multiple tracked quizzes: the first final status sticks until that quiz is retried
- Best score only: never send a lower later score

**Done when**

- [ ] One universal package picks the right mode in 5 of 5 hosts: scorm-again 1.2, scorm-again 2004, CATAPULT cmi5, an xAPI launch link and a plain browser
- [ ] With the LMS-only switch on, opening outside an LMS shows the error page and sends nothing
- [ ] Retaking a quiz with a lower score leaves the LMS score unchanged when best-score is on
- [ ] With two tracked quizzes, failing the second after passing the first keeps passed until the first is retried

**Spec refs:** standards.md 3.6 P-1, P-2, P-5, standards.md 3.7 P-18, P-19  
**Risks:** A universal zip carries several descriptors and some LMSs may pick the wrong one; the AICC branch stays inert until STD-13 ships.

### STD-11: Exporter advanced options

Older SCORM 2004 editions, LMS-side thresholds and navigation, and multi-AU cmi5 for LMSs and authors that need them.

**Features**

- SCORM 2004 edition choice: 2nd (CAM 1.3), 3rd or 4th, each with its own schema set and schemaversion
- 2nd edition uses the 4,000-char resume cap
- Hide LMS navigation UI (4th edition adlnav presentation: previous, continue, exit, abandon)
- adlcp:completionThreshold and imsss:minNormalizedMeasure when the author sets thresholds; player reports progress measure so the LMS can decide
- Optional adl.nav.request suspendAll on exit, off by default
- cmi5 one AU per lesson, with nestable blocks and objectives
- Standalone cmi5.xml for remotely hosted AUs

**Done when**

- [ ] Each edition's manifest validates against its own schema set
- [ ] A 2nd-edition export of an oversized course shows the 4,000-cap warning at publish
- [ ] A multi-AU cmi5 package passes the CATAPULT content suite and each lesson reports separately
- [ ] A threshold export makes the scorm-again host derive completion from the reported progress measure

**Spec refs:** standards.md 3.2 E-7, E-13, E-14, standards.md 3.4 E-19, E-20, E-21, standards.md 4.1 navigation, standards.md 4.3  
**Risks:** Exact behaviour of hiding LMS navigation is unknown (open question 5); whether the incumbent ever writes adl.nav.request is unknown (open question 9); multi-AU splits one resume state across several AUs.

### STD-12: xAPI outside an LMS and dual reporting

Courses hosted on any web server can report to an LRS, and LMS courses can stream xAPI to a second LRS in parallel.

**Features**

- Publish-time LRS endpoint and credentials for courses hosted outside an LMS
- Credentials never visible in plain text in the package; per-launch tokens from the company's own server preferred over shipped secrets
- LMS + LRS mode: SCORM or cmi5 to the LMS plus a parallel xAPI stream to a second LRS
- Author-defined custom statements from triggers: any verb, any object, with parent and grouping set to the course
- Learner identity from a page hook when there is no launch link

**Done when**

- [ ] Searching the package finds no credential in plain text or base64
- [ ] In SCORM 1.2 + LRS mode the scorm-again call log still matches its golden while the LRS receives the xAPI stream
- [ ] A custom-statement trigger sends the configured verb and object and the statement validates
- [ ] A page hook supplying the learner produces statements with that actor

**Spec refs:** standards.md 3.3 E-17, E-18, standards.md 3.8 X-1, X-2, standards.md 4.4 author trigger  
**Risks:** Any secret shipped in a static package is recoverable whatever the encoding, so this must be documented and token issuance preferred; dual reporting doubles network traffic and failure modes.

### STD-13: AICC package and HACP adapter

Export for LMSs that still require AICC HACP launch.

**Features**

- AICC course files: course, AU, descriptor and course structure, plus optional objectives, prerequisites and completion files
- Answer ids sanitised to AICC-safe characters
- Player HACP adapter: reads the session id and AICC URL launch parameters; GetParam at launch, PutParam on save and exit, ExitAU
- Same status, score and resume semantics as SCORM 1.2

**Done when**

- [ ] Moodle imports the AICC package and records status, score and resume for a test learner
- [ ] Sanitised answer ids contain only allowed characters and stay unique
- [ ] The universal build (STD-10) detects an AICC launch

**Spec refs:** standards.md 3.5 E-23, E-24, standards.md 3.6 P-2, standards.md 3.11 T-4, standards.md 4.5, standards.md 7 open question 6  
**Risks:** The AICC body no longer exists and demand is uncertain (open question 6); browsers often block HACP's cross-domain form posts.

### STD-14: Server SCORM host and LMS-lite

The server edition imports, launches and tracks SCORM packages itself, for testing and for companies without an LMS.

**Features**

- Package import: unzip, validate the manifest against schemas, pick the default organization and launch href
- Rejects unsafe zips (path traversal, oversized expansion)
- Launch host page exposing the SCORM 1.2 and 2004 API objects to the launched frame or window via scorm-again (MIT)
- Per learner + attempt storage of the full CMI data model with a commit endpoint
- LMS-lite: course catalogue, enrolment, launch, attempts and status/score reports, as the data layer Reach builds on
- Publish from an editor straight to the server and get a launch link
- Runs our packages and third-party single-SCO packages

**Done when**

- [ ] Our 1.2 and 2004 packages and a third-party single-SCO sample from test-courses import and run
- [ ] A learner resumes on a second browser or device where they left off
- [ ] The report shows status, score and time per attempt
- [ ] Commits from two tabs of the same attempt never corrupt stored data
- [ ] A zip containing a path-traversal entry is rejected with a clear message

**Spec refs:** standards.md 3.10 S-1, S-2, S-3, standards.md 6 LMS-lite, standards.md 2 hosted link  
**Risks:** Needs server core accounts and tenants (phase 3); overlaps Reach, so Reach must own assignment UX and this epic only the runtime and data; interaction data can grow storage quickly.

### STD-15: Server LRS core

A built-in LRS that our xAPI and cmi5 courses can report to without any third-party service.

**Features**

- Statements resource: store, get by id, list, voiding
- State resource with concurrency control
- Basic auth credentials per tenant with read and write scopes; admin creates and revokes them
- xAPI 1.0.3 and 2.0 version handling
- PostgreSQL storage indexed by learner, activity and registration
- Admin can copy the LRS endpoint to register it in an external LMS

**Done when**

- [ ] Our xAPI and cmi5 packages produce the same statement goldens against this LRS as against the CI LRS
- [ ] Wrong credentials get 401 and no tenant can read another tenant's statements or state
- [ ] 10,000 statements ingest at 200 or more statements per second on the small setup (2 vCPU, 4 GB) [target, to be measured]

**Spec refs:** standards.md 3.10 S-5, standards.md 6 built-in LRS, standards.md 2 self-hosted admin  
**Risks:** Needs server core tenants (phase 3); if build cost exceeds the estimate, embedding an existing Apache-2.0 LRS is the fallback.

### STD-16: Server LRS full conformance and forwarding

The built-in LRS passes the ADL conformance suite and can forward statements to a company's external LRS.

**Features**

- Activity Profile, Agent Profile, Activities, Agents and About resources
- Statement queries with every filter, paging and consistent-through header
- Attachments and signed statements
- Passes the ADL LRS conformance suite for 1.0.3 and 2.0
- Per-tenant forwarding to an external LRS with retry and a durable backlog

**Done when**

- [ ] ADL LRS conformance suite passes 100% for 1.0.3 and 2.0 in CI
- [ ] Forwarded statements reach the external LRS within 60 s
- [ ] A 1-hour external outage loses no statements and the backlog drains in order afterwards

**Spec refs:** standards.md 3.10 S-5, standards.md 3.11 T-3, standards.md 6 built-in LRS, forwarding  
**Risks:** The ADL suite is large and strict, and edge cases (attachments, signed statements) take time; forwarding must not duplicate statements on retry.

### STD-17: Server cmi5 launcher

The server edition launches cmi5 courses and decides when each AU is satisfied, as a cmi5 LMS must.

**Features**

- Imports cmi5 packages (zip or standalone cmi5.xml)
- Builds launch URLs with endpoint, fetch, actor, registration and activityId
- One-time fetch token endpoint
- Launch-data state with launch mode, mastery score, returnURL and entitlement key; learner preferences
- Launched, abandoned, waived and satisfied statements
- Move-on evaluation per AU, block and course
- returnURL hand-back after exit

**Done when**

- [ ] ADL CATAPULT LMS test suite passes
- [ ] CATAPULT sample courses run end to end
- [ ] A fetch token works once; a second use is refused
- [ ] A session that ends without terminated gets abandoned
- [ ] Satisfied is sent exactly when the move-on rule is met

**Spec refs:** standards.md 3.10 S-6, standards.md 3.11 T-2, standards.md 4.3, standards.md 6 cmi5 launcher  
**Risks:** cmi5 publication status unverified (open question 8); the abandoned rule needs reliable session timeouts on the server.

### STD-18: Server SCORM 2004 multi-SCO sequencing

Run third-party SCORM 2004 packages with several SCOs, navigation and rollup on the server.

**Features**

- Choice and flow navigation between SCOs
- Rollup of completion, success and score to the course
- Table of contents and previous/continue controls in the host page
- Built on scorm-again's sequencing support

**Done when**

- [ ] Public multi-SCO samples from test-courses navigate by choice and flow and roll up to the right course status
- [ ] Our single-SCO packages behave exactly as before

**Spec refs:** standards.md 3.10 S-4  
**Risks:** SCORM 2004 sequencing is complex and only matters for third-party packages, since our exporters write one SCO; depends on scorm-again's sequencing quality.

### STD-19: LMS integration matrix and legacy conformance

Prove our packages in real LMSs beyond Moodle and publish an honest compatibility table.

**Features**

- ILIAS in Docker as the SCORM 2004 integration target
- ADL SCORM 1.2 and 2004 4th-edition conformance suites run on a Windows VM as a release check
- Public compatibility table: each LMS and standard tested, with version and date
- New LMS targets added to CI as packages for them become a priority

**Done when**

- [ ] ILIAS job imports a 2004 4th-edition package and records completion, success and score for a test learner
- [ ] Every release record includes ADL SCORM suite results, or states why the suite could not run
- [ ] The docs site lists every LMS and standard combination tested, with dates

**Spec refs:** standards.md 3.11 T-1, T-5, standards.md 6 CI farm, standards.md 7 open question 7  
**Risks:** The ADL SCORM suites need Windows and old Internet Explorer and their download location is unconfirmed (open question 7), so they may not run at all; ILIAS certification comes from secondary sources only.

### Deliberately out of scope

- Server AICC HACP endpoint (S-7): deferred; the AICC body no longer exists, and AICC export alone covers LMSs like Moodle that still use it; revisit only on customer demand
- Vendor-style player telemetry to a metrics host: deliberately never built; our player talks only to the customer's LMS/LRS (rule 16)
- Base64 storage of LRS credentials as protection: not replicated, because it offers none; we use tokens or documented risk instead (E-17)
- Multi-SCO package authoring and custom SCORM 2004 sequencing rules: our exporters write one SCO with default sequencing; multi-SCO is only consumed by the server (STD-18, later)
- adl.nav.request on by default: off by default, because the incumbent package seen did not use it (open question 9)
- Fully automated ADL SCORM conformance suites in CI: they need Windows and old Internet Explorer, so they run as a release check instead (STD-19)
- Course assignment, reminders, certificates and the learner portal UX: owned by the Reach backlog; this backlog supplies only the SCORM/xAPI/cmi5 runtime and data layer
- Video and PDF outputs: listed in the architecture but owned by the editor backlogs, not by standards packaging
- Hosted LRS or LMS service run by us: we host nothing; companies run the server edition themselves
- Claims of IEEE cmi5 (9274.3.1) conformance: none until its publication status is verified (open question 8)

