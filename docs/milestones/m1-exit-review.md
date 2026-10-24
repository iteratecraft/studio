# M1 exit review

Review of every M1 task in [ROADMAP.md](../../ROADMAP.md) (M1-01 to M1-31) against the "done when"
items of its epic in [BACKLOG.md](../../BACKLOG.md), checked against `main` at `fc02c91` plus this
change (M1-31).

How to read it:

- **Met:** a test whose title states the item exists and passed in the run listed at the end.
- **Partly:** part of the item is proven, or it is proven by a stand-in (a fixture, a fake, our own
  test host) rather than the thing the item names. What is missing is said.
- **Not met:** nothing in `studio` proves it.
- **Not verified:** this review could not check it.
- **(local)** after a proof: the test needs a `test-courses/` checkout. CI on `main` does not check it
  out (the step in `.github/workflows/ci.yml` is commented out and waits for a `TEST_COURSES_TOKEN`
  secret), so in CI these tests skip or run over the format's fixtures only. Open PR #25 replaces that
  step with one that checks the corpus out with a read-only deploy key in the
  `TEST_COURSES_DEPLOY_KEY` secret; that secret does not exist yet, so #25's CI runs take the skip
  path too.
- **PR #25** (M1-21, the Moodle job) was opened after this review was first written and is not
  merged. Where it bears on an item, the item keeps its result on `main` and a note says what #25's
  head `6b07a2b` shows, from its CI run 40118239132 and its review.
- The proof is named by file and test title. This review matched titles to items and read test
  bodies only where an item's wording needed it; a title that overstates its body would not be
  caught here.
- PR numbers come from the merge commits in `git log`.

## Summary

| Area | Tasks | Delivered | Done-when items |
|---|---|---|---|
| Format, ids, publish settings | M1-01 to M1-04 | yes | 2 met, 2 partly |
| Quiz model, labels | M1-05, M1-06 | yes | 4 met |
| Tracking core, resume codec | M1-07, M1-08 | yes | 2 met, 4 partly |
| Player shell, blocks, progress, quiz, lifecycle | M1-09 to M1-13 | yes | 7 met, 3 partly |
| Package reader, test LMS | M1-14, M1-15 | yes | 1 met, 1 not met, 1 later |
| Package builder, web output | M1-16, M1-17 | yes | 3 met, 2 not met |
| SCORM 1.2 | M1-18, M1-19 | yes | 4 met, 3 not met |
| Standards harness | M1-20 | yes | 2 met, 2 not met |
| Moodle job | M1-21 | **no** (open in #25) | see M1-18/19 and M1-20 |
| SCORM 2004 | M1-22, M1-23 | yes | 4 met, 1 partly, 1 not met |
| xAPI | M1-24, M1-25 | yes | 4 met, 1 partly |
| cmi5 | M1-26, M1-27 | yes | 4 met, 1 not met |
| Corpus | M1-28 | yes | 2 partly |
| Accessibility baseline | M1-29 | yes | 1 met, 1 partly |
| No-network guarantee | M1-30 | yes | 2 met |
| Demo and exit review | M1-31 | this change | — |

The M1 exit criteria are checked one by one at the end, under [M1 exit criteria](#m1-exit-criteria).
Four of them are not met: Moodle, ILIAS, an open-source LRS and the CATAPULT content tests. A fifth
item, the player performance budget, is not set.

## Tasks

### M1-01, M1-01b: course format ADR, loader and outbound ADRs (#5)

- **Delivered:** `docs/adr/0002-course-format.md`, `0003-classic-script-loader.md`,
  `0004-outbound-connections.md`, `0005-standalone-web-progress.md` (the D-6 default).
- **No epic done-when items** of their own; the ADRs are enforced by the code of M1-02/03, M1-09,
  M1-16 and M1-30, checked below.
- **Open:**
  - D-5 (co-editing granularity) is still undecided; the roadmap line says so.
  - All four ADRs still say **Status: Proposed** although they were merged. Not verified whether the
    lead meant merging as acceptance (PR #5 says so); the status lines were not updated.

### M1-02, M1-03, M1-04: Blocks course schema, migrations and ids, publish settings (#10)

- **Package:** `@course-suite/format` (MIT).
- **Entry points:** `courseSchema`, `validateCourse`, `openCourse`, `serializeCourse`, `migrate`,
  `MIGRATIONS`, `SCHEMA_VERSION`, `newProjectId`, `newContentId`, `withNewProjectId`, `activityIri`;
  generated types in `src/course.ts` (`pnpm format:types`).

ENG-02 done when:

| Item | Result | Proof |
|---|---|---|
| 20+ valid and 20+ invalid fixtures pass or fail with path-precise errors | Met | `packages/format/src/validate.test.ts`: 22 "valid documents" cases, 65 "invalid documents report the exact path" cases, 18 "reference integrity" cases |
| Serialise, parse, serialise is byte-identical; unknown fields survive a round trip | Met | `packages/format/src/open.test.ts` "serialise, open, serialise is byte-identical" (3 courses), "extension data survives verbatim", "a newer MINOR opens read-write and keeps unknown fields and its version" |
| Copy keeps ids; save-as mints a new project id; ids unchanged after export and import | Partly | Save-as: `packages/format/src/ids.test.ts` "save as gets a new project id and keeps every content id". Export keeps ids: `packages/exporters/src/builder.test.ts` "gives the player the course without ext data…". No copy operation and no import from a package exist yet (editor work, M2) |
| A scan of exported packages finds no server-only metadata or internal ids | Partly | `ext` is stripped from what the player gets (`builder.test.ts`, above). Server-only metadata lives outside the course document by design (ADR-0002) and no server exists yet. No test scans a built package for it |

### M1-05: shared quiz and result model (#11)

- **Package:** `@course-suite/format`.
- **Entry points:** `scoreAttempt`, `isCorrect`, `isPassed`, `quizResult`, `drawAttempt`, `drawFrom`,
  `shuffle`, `toInteraction`, `interactionId`, `answerId`, `plainText`, `DEFAULT_PASSING_SCORE`.

ENG-05 done when (the model's share; the rest is under M1-11/12):

| Item | Result | Proof |
|---|---|---|
| Rule 11 examples and the AICC fallback pass; ids stay within SCORM 1.2 limits | Met | `packages/format/src/quiz.test.ts` "interaction ids" and "answer ids" groups, "[rise:R11] AICC answer ids are passed through", "the longest id fits the SCORM 1.2 limit of 255 characters" |
| Best score never decreases; unanswered questions are wrong | Met | `quiz.test.ts` "[rise:R8] the best score never goes down", "[rise:R15] questions left unanswered when time runs out count as wrong" |

### M1-06: label sets and the learner-text lint (#11)

- **Package:** `@course-suite/labels` (MIT); lint rule `tools/lint/learner-text.grit` wired in
  `biome.json`.
- **Entry points:** `english` (109 keys, one per entry of `LABEL_KEYS`), `resolveLabels`, `formatLabel`, `checkLabelSet`, `LABEL_KEYS`.

ENG-09 done when:

| Item | Result | Proof |
|---|---|---|
| Lint fails on a hard-coded string fixture | Met | `tools/lint/learner-text.test.ts` "hard-coded learner-facing text in a player package fails lint" |
| Overriding a label changes both the visible text and the screen-reader announcement | Met (unit level) | `packages/labels/src/index.test.ts` "an overridden label is what the player formats, visible text and screen-reader text alike". No browser test overrides a label |

### M1-07, M1-08: tracking core and resume codec (#12)

- **Package:** `@course-suite/tracking` (MIT).
- **Entry points:** `createTracker`, `TrackingAdapter`, `createMemoryAdapter` (debug adapter),
  `encodeResume`, `decodeResume`, `pruneResume`, `checkResume`, `RESUME_CAPS`, `DROP_ORDER`,
  `RESUME_FORMAT`.

STD-01 done when:

| Item | Result | Proof |
|---|---|---|
| Round trip over 10,000 random states; a payload of format N decodes after a bump to N+1 | Partly | `packages/tracking/src/resume.test.ts` "10,000 random states decode to the same state and package version". Only one format version exists, so N to N+1 is untested; a newer format is reported as "newer" and not read ("a payload from a newer format is reported as newer, not read") |
| Reference course (120 slides, 60 variables, 3 quizzes) fits 4,096 chars or drops in order; publish estimate within 10% | Partly | A synthetic stand-in: `resume.test.ts` "a large finished course fits SCORM 1.2's cap, losing only visits of finished scenes" and "parts drop in the fixed order". The corpus `long-resume` course is not measured through a full run. `checkResume` exists but `buildPackage` does not call it, so there is no publish-time estimate or author warning |
| A burst within 0.5 s gives one write; an unchanged state gives none | Met | `packages/tracking/src/tracker.test.ts` "[standards:R4] a burst of changes is written once, 0.5 s after the last change", "an unchanged state is never written" |
| A full run in every adapter requests only package files and the LMS/LRS | Met | `packages/conformance/e2e/no-network.e2e.ts`, every output from file and http (M1-30) |
| Standalone mode resumes after a reload; blocked storage runs from the start | Partly | Changed by ADR-0005 (D-6): Blocks web output keeps no progress. The debug adapter does it: `tracker.test.ts` "a reload resumes from the same storage", "blocked storage does not stop the course". `packages/conformance/e2e/scorm12.e2e.ts` "[standards:P-4] without an LMS a SCORM 1.2 package still runs and keeps nothing" |
| Republish with one slide deleted, resume lands on the nearest valid position | Partly | `resume.test.ts` "ids removed by a republish are ignored instead of failing"; `packages/player-blocks/src/runtime.test.ts` "a new session resumes progress, quiz draws and the page, without content an update removed". The removed page is not the bookmark there, so "nearest valid position" is not tested |

### M1-09, M1-10: Blocks player shell and walking-skeleton blocks (#15)

- **Package:** `@course-suite/player-blocks` (MIT); browser tests in `@course-suite/player-blocks-harness`.
- **Entry points:** `./boot` (the IIFE the exporters bundle), `indexPage`, `courseDataScript`,
  `decodeCourseData`, `createLoader`, `pagesOf`, `pageHash`, `parseRoute`. Blocks rendered: text,
  heading, image with alt text, continue, single-choice and multiple-response knowledge checks.

ENG-04 done when:

| Item | Result | Proof |
|---|---|---|
| Corpus courses open from file:// and over HTTP; a missing data file shows the error after 10 s | Met | `packages/conformance/e2e/no-network.e2e.ts` runs every corpus course from file and http (local); `packages/player-blocks-harness/e2e/loader.e2e.ts` "a missing data file shows a clear error", "course data that never arrives shows the error screen after the timeout"; `packages/player-blocks/src/data.test.ts` "the course data has 10 seconds to load" |
| Keyboard-only runs complete every corpus course; zero serious axe violations at three widths | Partly | axe: `packages/player-blocks-harness/e2e/a11y.e2e.ts` at 320, 768 and 1280 px for the fixtures and every corpus course (local). Keyboard: `keyboard.e2e.ts` covers the fixture courses only, not every corpus course |
| Network log shows only same-origin, LMS and configured LRS requests | Met | `no-network.e2e.ts` (M1-30) |
| The bundle builds as an MIT package with no editor or server imports | Met | `pnpm check:deps` (the `mit` tag allows only `mit` dependencies) and `pnpm check:licences` |

### M1-11, M1-12: progress engine and quiz lesson runtime (#16)

- **Package:** `@course-suite/player-blocks`.
- **Entry points:** `createProgress`, `requirement`, `requiresCorrect`, the quiz screens in
  `src/quiz.ts`.

ENG-05 done when (runtime share):

| Item | Result | Proof |
|---|---|---|
| 2/3 = 67%, 13/20 = 65%, 1/4 = 25%, 1/2 = 50% | Met | `packages/player-blocks/src/progress.test.ts` "[rise:R5] 2 of 3 blocks is 67% and 13 of 20 is 65%", "1 of 4 lessons is 25% and 1 of 2 is 50%"; `packages/format/src/quiz.test.ts` scoring cases |
| Best score never decreases across retries; timer expiry marks unanswered questions wrong | Met | `progress.test.ts` "[rise:R8] the best score is kept across retries", "[rise:R15] questions left unanswered at submit (the timer ran out) are wrong"; `packages/player-blocks-harness/e2e/quiz.e2e.ts` "the timer submits at zero with unanswered questions wrong" |
| Drawn question order is saved and survives resume | Met | `progress.test.ts` "random draws: the drawn questions and their order are saved and survive a resume" |

### M1-13: player lifecycle, state snapshot, debug adapter (#16)

- **Package:** `@course-suite/player-blocks`.
- **Entry points:** `startRuntime`, `courseStatus`, `RESUME_DELAY_MS` (100 ms), `COMMIT_INTERVAL_MS`
  (20 s).

ENG-06 (06a, Blocks profile) done when:

| Item | Result | Proof |
|---|---|---|
| Snapshot then restore is the identity across the corpus | Partly | `progress.test.ts` "snapshot then restore is the identity, through the SCORM 1.2 resume codec" on a built test course; `player-blocks-harness/e2e/lifecycle.e2e.ts` "snapshot and restore: a new visit resumes…". Not run over each corpus course |
| Fake-clock tests prove debounce and commit intervals per profile | Met for Blocks | `runtime.test.ts` "[rise:R3] the saved state is written 0.1 s after the last change", "[rise:R4] session time is written and committed every 20 seconds". The Slides profile is M5 (ENG-06b) |
| Notices are announced by screen readers and never block | Partly | `lifecycle.e2e.ts` "a state too large to save shows a notice that is announced, never blocks and can be dismissed" checks a live region; no screen reader was run |

### M1-14, M1-15: package reader and test LMS host (#7, follow-ups in #8)

- **Package:** `@course-suite/conformance` (Apache-2.0, test-only).
- **Entry points:** `readZip`, `readPackage`, `parseScormManifest`, `parseTincanXml`, `parseCmi5Xml`,
  `startTestLms`, `runPackage`, `runXapiPackage`, `createMemoryLrs`, `statementProblems`.

ENG-03 done when:

| Item | Result | Proof |
|---|---|---|
| Traversal, bomb, symlink and duplicate-name zips are rejected with a reason | Met | `packages/conformance/src/zip.test.ts` "rejects the unsafe name ../evil.js" and 16 more names, "rejects symbolic links", "rejects names that collide, ignoring case", "rejects an entry whose inflated-to-compressed ratio is too high", "rejects archives that inflate past the total cap…" |
| Public ADL and CATAPULT sample packages parse, launch and produce a trace | Not met | Only hand-written SCOs (`packages/conformance/e2e/run-package.e2e.ts`) and our own packages are launched |
| The same host package runs unchanged inside the server in M4 | Later | M4 |

### M1-16, M1-17: package builder and Blocks web output (#14, #17)

- **Package:** `@course-suite/exporters` (Apache-2.0); the player bundle is built by
  `packages/exporters/scripts/bundle-player.ts`.
- **Entry points:** `buildPackage`, `blocksPlayer`, `webExporter`, `writeZip`, `findOutboundUrls`,
  `isAllowed`, `BLOCKS_LAUNCH_PAGE`.

STD-02 done when:

| Item | Result | Proof |
|---|---|---|
| Publishing an unchanged project twice gives identical identifiers and descriptors | Met | `packages/exporters/src/builder.test.ts` "builds byte-identical packages from the same input"; `scorm12.test.ts` / `scorm2004.test.ts` "keeps it across republishes"; `xapi.test.ts` / `cmi5.test.ts` "stay the same on every republish" |
| Validation rejects a missing listed file or an invalid descriptor and names the file or element | Met | `scorm12.test.ts` and `scorm2004.test.ts` "names a listed file that is missing…", "names the element at fault in an invalid manifest"; `xapi.test.ts`, `cmi5.test.ts` "check names…" |
| Web export runs from a folder and a static server with no console errors and no outside requests | Met | `packages/conformance/e2e/web.e2e.ts` "[rise:R20] web output runs from a folder…", "web output runs from a static web server…" |
| Over 4 GB or 65,535 files is written as zip64 | Not met | ZIP64 is not written; `packages/exporters/src/zip.test.ts` "refuses more entries than a ZIP without ZIP64 holds" |
| Desktop and server export give the same file list and descriptors | Not met | Neither app exists yet (M2, M3) |

### M1-18, M1-19: SCORM 1.2 exporter and runtime adapter (#14, #17)

- **Packages:** `@course-suite/exporters` (`scorm12Exporter`, `SCORM12_SCHEMAS`, `scormIdentifier`),
  `@course-suite/tracking` (`createScorm12Adapter`, `findScorm12Api`, `timespan`).

STD-04 done when:

| Item | Result | Proof |
|---|---|---|
| Headless call log matches the launch and exit goldens exactly | Met | `packages/conformance/e2e/standards.e2e.ts` SCORM 1.2 goldens under `packages/exporters/test/golden/scorm12/` (fixtures in CI, corpus local) |
| Manifest validates against the ADL SCORM 1.2 schemas | Not met | The check is structural (`scorm12.test.ts`); no XSD validation (see #14) |
| In Moodle, a relaunch returns to the same place with the same state | Not met | No Moodle job on `main` (M1-21). Shown in the test LMS: `scorm12.e2e.ts` "a learner completes a lesson, closes, relaunches, resumes at that lesson and passes". Open #25: in Moodle 5.3, for `fixtures/sample` and `fixtures/full`, the cover offers to resume at the lesson left, and Moodle's bookmark and suspend data equal what the test LMS keeps after the same path; the corpus courses did not run there (no deploy key) |
| A passed quiz with passed/incomplete shows passed and the score in Moodle's report | Not met | Moodle (M1-21). In the test LMS: same test as above. Open #25 reads Moodle's SCORM tracks, not its report or gradebook pages. Its quiz-course tests assert `passed` 100 and `failed` 0, but the course has a mastery score, so Moodle derives that status itself: #25's review showed those two tests still pass when our package reports `completed` instead of `passed`. The `fixtures/full` comparison with the test LMS did catch that break |
| A review-mode launch makes zero LMSSetValue calls | Met | `scorm12.e2e.ts` "[standards:R15] [standards:P-14] a review-mode launch makes zero LMSSetValue calls" |
| A simulated commit error shows a non-blocking message, the course goes on, the next commit retries | Met | `packages/tracking/src/scorm12.test.ts` "a refused commit is reported, the course goes on and the next commit retries"; `runtime.test.ts` "an LMS call that throws shows the save-failed notice once and never stops the course" |
| Removing the course frame still commits status and resume data | Met | `scorm12.e2e.ts` relaunch test closes the frame (`closeSco`) and asserts the exit order; `lifecycle.e2e.ts` "page-hide ends the session" |

### M1-20: standards CI harness (#17, extended by #19, #21, #23)

- **Package:** `@course-suite/conformance`, `e2e/standards.e2e.ts`; goldens in
  `packages/exporters/test/golden/{scorm12,scorm2004,xapi,cmi5}/`.

STD-03 done when:

| Item | Result | Proof |
|---|---|---|
| CI fails when any SCORM call is reordered, added, removed or changed | Met | `standards.e2e.ts` compares the whole call list with `toEqual` and shows the diff |
| Moodle job imports a SCORM 1.2 zip, launches it and reads back status and score | Not met | M1-21. Open #25 adds the job `moodle (SCORM 1.2 end to end)` (ubuntu-latest, the approved Linux exception), green in run 40118239132 with 4 tests: `fixtures/sample`, `fixtures/full`, quiz pass, quiz fail. Limits are under M1-18/19 |
| CATAPULT content suite runs headless with its report stored | Not met | Not run anywhere |
| Runs on every pull request touching engine, player or exporters, under 20 minutes | Met | `pnpm test:e2e` runs on every pull request; the CI job has `timeout-minutes: 20`; the last three `main` runs took 3 to 9 minutes |

### M1-21: Moodle end-to-end job — not delivered (open in #25)

- **Not on `main`** at `fc02c91`. PR #25 (branch `m1/moodle-e2e`, head `6b07a2b`) is open and not
  merged; its review asks for two fixes before merge.
- What #25's CI shows: Moodle 5.3 in Docker on ubuntu-latest; SCORM 1.2 packages of the two format
  fixtures and a quiz course uploaded, launched, left, relaunched, resumed and finished by a learner
  in Chromium; status, bookmark, score and suspend data read back from Moodle's SCORM tracks.
- What it does not show: the corpus courses in Moodle (the deploy key does not exist yet); the
  status word our package sends, in the quiz-course tests (see M1-18/19); Moodle's report and
  gradebook pages; a local run (only CI ran it).
- Its items stay not met under M1-18/19 and M1-20 until #25 merges.

### M1-22, M1-23: SCORM 2004 4th edition exporter and runtime adapter (#19)

- **Packages:** `@course-suite/exporters` (`scorm2004Exporter`, `SCORM2004_SCHEMAS`,
  `SCORM2004_METADATA`), `@course-suite/tracking` (`createScorm2004Adapter`, `findScorm2004Api`,
  `duration`).

STD-05 done when:

| Item | Result | Proof |
|---|---|---|
| Call log matches the 2004 launch golden, including the absence of the excluded reads | Met | `standards.e2e.ts` SCORM 2004 goldens; `packages/tracking/src/scorm2004.test.ts` "a relaunch reads back status and saved state, never the location, learner, entry or launch data" |
| Manifest and metadata.xml validate against the 4th-edition schema set | Not met | Structural checks only (`scorm2004.test.ts`); no LOM or 4th-edition XSD validation |
| Passing at 80/100 reports passed, completed, raw 80 and scaled 0.8 | Met | `packages/conformance/e2e/scorm2004.e2e.ts` "…resumes at that lesson and passes at 80 out of 100" |
| Session times summed across saves equal elapsed time within 1 s | Partly | `tracker.test.ts` "[standards:R5] every 60 s session time is written, then committed, and accumulates" under a fake clock; not measured in the 2004 host |
| A 50,000-char resume state round-trips in the scorm-again 2004 host | Met | `scorm2004.e2e.ts` "the SCORM 2004 host keeps 50,000 characters of suspend data…" |
| A review-mode launch makes zero SetValue calls | Met | `scorm2004.e2e.ts` "[standards:R15] [standards:P-14] a review-mode launch writes nothing once the mode is read" |

### M1-24, M1-25: xAPI exporter and runtime adapter (#21)

- **Packages:** `@course-suite/exporters` (`xapiExporter`, `TINCAN_XML`), `@course-suite/format`
  (`activityIri`), `@course-suite/tracking` (`createXapiAdapter`, `readXapiLaunch`, `createLrs`,
  `RETRY_DELAYS_MS`, `REQUEST_TIMEOUT_MS`).

STD-06 done when:

| Item | Result | Proof |
|---|---|---|
| Against the CI LRS, a scripted run gives the golden statement sequence | Met (in-memory LRS) | `standards.e2e.ts` xAPI goldens under `packages/exporters/test/golden/xapi/` |
| Every statement validates against the xAPI schema for 1.0.3 and 2.0 | Partly | Each golden statement passes `statementProblems` for 1.0 and 2.0 (`standards.e2e.ts`, `packages/conformance/src/xapi-statement.test.ts`); these are our own rules, a subset of the specification, not the ADL schema |
| Cutting the network shows the offline banner; restoring delivers every queued statement in order, once | Met | `packages/conformance/e2e/xapi.e2e.ts` "[standards:X-5] with the network cut the offline banner shows…" |
| Relaunching with the same registration resumes from the State document | Met | `xapi.e2e.ts` "…closes, relaunches, resumes from the LRS state and passes" |
| A launch link without auth sends no requests, logs one console error, the course runs | Met | `xapi.e2e.ts` "[standards:X-1] a launch link without credentials sends no requests…" |

### M1-26, M1-27: cmi5 exporter and runtime adapter (#23)

- **Packages:** `@course-suite/exporters` (`cmi5Exporter`, `CMI5_XML`, `cmi5MoveOn`),
  `@course-suite/tracking` (`createCmi5Adapter`, `readCmi5Launch`, `MOVE_ON`).

STD-07 done when:

| Item | Result | Proof |
|---|---|---|
| ADL CATAPULT content test suite passes all mandatory tests | Not met | Not run |
| The fetch URL is called exactly once per launch; a fetch failure stops reporting and shows an error | Met | `standards.e2e.ts` cmi5 goldens assert one fetch with a token; `packages/conformance/e2e/cmi5.e2e.ts` "a fetch URL that gives no token stops reporting, shows the notice and the course runs" |
| A Browse-mode launch sends exactly initialized then terminated | Met | `cmi5.e2e.ts` "a Browse launch sends exactly initialized then terminated and writes no state" |
| A second passed, or failed after passed, in one session is refused | Met | `packages/tracking/src/cmi5.test.ts` "[standards:C-5] [standards:C-6] [standards:C-8] [standards:R14] completed, then passed, then terminated; a second passed and a failed after passed" |
| Exit navigates to returnURL when present | Met | `cmi5.e2e.ts` "…passes and returns to the LMS" |

### M1-28: conformance corpus v1 (#13)

- **Delivered:** six courses in `iteratecraft/test-courses` `blocks/`: `text-only`, `gated-continue`,
  `quiz-pass-fail`, `multi-quiz`, `long-resume`, `restricted-navigation`; loader
  `loadBlocksCorpus` in `@course-suite/conformance`.

ENG-37 done when:

| Item | Result | Proof |
|---|---|---|
| Every numbered behaviour rule maps to at least one corpus course or test | Partly | `pnpm report:trace`: 35 of 179 rules overall; for the M1 specs, standards.md 17 of 17 and rise.md 18 of 22 (see [Traceability](#traceability)) |
| The corpus validates against the current schema on every PR | Partly | `packages/conformance/src/corpus.test.ts` "… opens, validates and has its media" (local); it skips in CI until the test-courses checkout is enabled |

### M1-29: player accessibility baseline, axe in CI (#20)

- **Package:** `@course-suite/player-blocks-harness`, `e2e/a11y.e2e.ts` and `e2e/keyboard.e2e.ts`.

| Item (ENG-04) | Result | Proof |
|---|---|---|
| Zero serious axe violations at three widths | Met for the blocks the player draws | `a11y.e2e.ts` "WCAG 2.2 A and AA on every page" at 320, 768 and 1280 px (fixtures in CI, corpus local), and "the checks catch a violation" |
| Keyboard-only runs complete every corpus course | Partly | `keyboard.e2e.ts` journeys over the fixture courses only |

### M1-30: no-network guarantee for every output (#22)

- **Package:** `@course-suite/conformance`, `e2e/no-network.e2e.ts`, `test/no-network.ts`.

| Item | Result | Proof |
|---|---|---|
| STD-01 / ENG-04: requests go only to the package's files and the LMS/LRS the launch names | Met | Every exporter × every fixture (and corpus course, local) × file and http, through a full journey and a relaunch: "[standards:R16] … a full journey requests only the package and its launch endpoint" |
| The suite catches each kind of leak | Met | "… the suite catches an outside font / a tracking pixel / a remote script / a CSS import / a prefetch / a beacon sent as the page closes / a WebSocket", for every output from file and http |

### M1-31: M1 demo and exit review (this change)

- **Demo:** `pnpm demo:m1` runs `packages/conformance/demo/m1.ts`.
  - It builds the format's sample courses, plus every corpus course when `test-courses/` is present,
    in web, SCORM 1.2, SCORM 2004, xAPI and cmi5.
  - It writes each zip and its unpacked folder to the git-ignored `demo/` folder.
  - It serves an index page on `127.0.0.1` and prints the address; it opens nothing by itself.
  - Each Launch link starts a fresh test LMS and opens the course beside a live panel. SCORM shows
    every API call; xAPI and cmi5 show every statement the LRS stores, plus the completion, success
    and score reported. Ctrl+C stops it.
  - The test LMS's host page now posts each SCORM call to the page that frames it; nothing else in
    the test LMS changed.
- **Smoke test:** `packages/conformance/e2e/demo.e2e.ts`.
  - The index lists the sample course in all five outputs, and the zips and folders are written.
  - A web launch plays the course.
  - One launch of each of SCORM 1.2, SCORM 2004, xAPI and cmi5, walked through by the learner
    helper, shows the launch call or statement live and "completed" in the panel.
- **Review:** this document.

## M1 exit criteria

| Exit criterion (ROADMAP.md) | Result | Notes |
|---|---|---|
| At least 6 reference Blocks courses validate and play from `file://` and over the web | Met (local) | 6 corpus courses; `corpus.test.ts`, `no-network.e2e.ts`. In CI only the fixtures run |
| SCORM 1.2: launch, resume, pass, fail, score and exit verified end to end in Moodle | **Not met** | M1-21 not on `main`; verified in the scorm-again test LMS. Open #25 runs launch, resume, pass, fail, score and exit in Moodle 5.3 for the fixtures and a quiz course, with the limits under M1-18/19 |
| SCORM 1.2: golden traces match the spec rules | Met | `standards.e2e.ts` |
| SCORM 2004: golden trace matches; completion and success reported separately | Met | `standards.e2e.ts`, `scorm2004.e2e.ts` |
| SCORM 2004: runs in ILIAS | **Not met** | No ILIAS job (STD-19 is M2b) |
| xAPI: statements and resume accepted by an open-source LRS (1.0.3 and 2.0) | **Not met** | Only the in-memory test LRS, which accepts 1.0.3 and 2.0 (`xapi.e2e.ts` "an LRS that speaks only xAPI 1.0.3 accepts every statement and the state") |
| cmi5: the ADL CATAPULT content tests pass | **Not met** | Not run |
| Long-resume course under 4,096 characters, with the drop order and an author warning | Partly | Drop order and cap proven on a synthetic state; `checkResume` exists but is not called at publish; `long-resume` not measured through a full run |
| Zero third-party network requests | Met | `no-network.e2e.ts` |
| Zero serious axe violations | Met for the blocks drawn | `a11y.e2e.ts` |
| Performance budget for the player is set | **Not met** | No size or load-time budget exists in the repository |

## Traceability

`pnpm report:trace --specs C:/Users/LENOVO/Desktop/course-suite/specs-build`, run on this branch:

**35 of 179 rules covered (20%).**

| Spec | Rules | Covered | Uncovered |
|---|---|---|---|
| localization-ai | 16 | 0 | 16 |
| reach | 36 | 0 | 36 |
| review | 23 | 0 | 23 |
| rise | 22 | 18 | 4 |
| standards | 17 | 17 | 0 |
| storyline | 42 | 0 | 42 |
| teams-collab | 23 | 0 | 23 |

- The rise.md rules still uncovered are R9 (slide-app quiz reporting), R17 (stepped microlearning
  arrow), R19 (block limits) and R21 (code-block frame events). None belongs to an M1 task.
- The tool reads only the top-level specs. The `ui/` specs' `UI-…-Rn` ids are cited as plain text in
  test titles (for example UI-BLOCKS-R43, UI-ACCESSIBILITY-R39) and are not counted.

## Known gaps and follow-ups

Carried to later milestones or tasks:

- **Real LMSs and LRSs:**
  - Moodle job for SCORM 1.2 (M1-21, open in #25; after it, the corpus in Moodle and a quiz check
    Moodle cannot override).
  - ILIAS for SCORM 2004, and at least 3 more LMSs (STD-19, M2b; decision D-8).
  - An open-source LRS for xAPI 1.0.3 and 2.0 (STD-03 feature "local LRS in a container").
  - The ADL CATAPULT content suite for cmi5 (STD-03, STD-07).
- **Schema validation:**
  - No XSD validation of `imsmanifest.xml` (SCORM 1.2 and 2004).
  - No LOM schema validation of `metadata.xml`.
  - No official xAPI schema validation; statements are checked against our own rule subset.
- **Package formats:**
  - No ZIP64 writing or reading.
  - No public ADL or CATAPULT sample packages in the reader tests.
- **Resume:**
  - No publish-time size estimate or author warning in `buildPackage`.
  - No measured full run of `long-resume`.
  - No test of a format version bump.
  - No test of resuming when the bookmarked page was deleted.
- **Player:**
  - Interactive blocks are not rendered yet: accordion, tabs, flashcards, labeled graphic, process,
    sorting, scenario and others. Continue buttons that require them stay inactive, and axe and the
    journeys never see them.
  - No performance or size budget.
  - Keyboard journeys cover the fixtures, not every corpus course.
  - Snapshot identity is not run over each corpus course.
- **Tracking fields not written:**
  - Interaction latency, timestamp and description.
  - `cmi.learner_preference.language` and statement language from the course language.
  - cmi5 `launchParameters`, `entitlementKey` and AU `activityType`.
  - xAPI custom statements and the learner page hook.
  - SCORM 2004 E-13 (hide LMS navigation).
- **Accessibility:** no screen-reader runs (NVDA, Narrator, VoiceOver) and no manual 400% zoom run.
  axe covers only part of WCAG.
- **CI:**
  - The test-courses checkout is disabled on `main`, so the corpus goldens, corpus axe sweeps and
    corpus no-network runs pass only locally. Open #25 enables it behind the
    `TEST_COURSES_DEPLOY_KEY` deploy key, which the lead still has to create (`docs/ci.md` in #25).
  - Only Windows runs the product; macOS and Linux follow the platform order (ADR-0001). #25 adds
    one ubuntu-latest job that only hosts Moodle, the exception the lead approved.
  - #25 and this change both edit `.gitignore` and `packages/conformance/tsconfig.json` (one added
    line each); whichever merges second keeps both lines.
- **Known flaky test:** PR #22 reported
  `packages/conformance/e2e/scorm12.e2e.ts` "a learner completes a lesson, closes, relaunches…"
  failing 8 of 24 times when repeated at 8 workers. Not re-run for this review.
- **Decisions and docs:**
  - D-5 (co-editing granularity) is open.
  - ADR-0002 to ADR-0005 still say "Proposed".
  - D-15 (publish engine packages to npm) is due at the M1 exit.
- **Later by plan:**
  - The test LMS inside the server (M4).
  - Desktop and server export parity (M2, M3).
  - ENG-06b Slides profile (M5).

## Checks run for this review

On Windows 11, Node 24.13.1, pnpm 10.33.0, in this branch's worktree, with `test-courses/` linked
(so the corpus tests ran). The results of the full gate are in the pull request.

- `pnpm report:trace --specs C:/Users/LENOVO/Desktop/course-suite/specs-build`: the numbers above.
- Each package's Vitest suite with `--reporter=verbose` and each Playwright suite with `--list`, to
  read the test titles cited here.
- `packages/format`: 251 tests passed.
