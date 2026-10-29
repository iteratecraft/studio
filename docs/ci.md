# Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`. It has two jobs.

| Job | Runner | What it does |
|---|---|---|
| `check (windows-latest)` | Windows | Install, build, typecheck, lint, unit tests, guards, licences, the desktop app (Rust formatting and unit tests, release build, 15 MB size gate) and the browser tests (`pnpm test:e2e`, including a launch of the built desktop app): everything in the command table of `AGENTS.md` |
| `moodle (SCORM 1.2 end to end)` | Linux | Our SCORM 1.2 packages in a real Moodle (M1-21) |

The product is Windows-first (ADR-0001). The Moodle job and the host jobs below are the Linux jobs,
an exception the project lead approved: they only host third-party servers, whose containers need
Linux.

`.github/workflows/hosts.yml` (M2-21, D-26) runs beside CI on pull requests that change what goes
into a package (the format, labels, tracking, player, exporters, zip and fonts packages), the
conformance harnesses, the lockfile or the workflow itself; every night on `main`; and by hand. Its
three jobs run in parallel with each other and with CI. Without their caches (the first run after
a pin changes) each took on 2026-10-29: ILIAS 3 min 40 s, CATAPULT 3 min 35 s, SQL LRS 1 min 15 s;
the Windows `check` job takes about 19 minutes, so they never lengthen a pull request's checks.

| Job | Runner | What it does |
|---|---|---|
| `ilias (SCORM 1.2 and 2004 end to end)` | Linux | Our SCORM 1.2 and SCORM 2004 packages in a real ILIAS |
| `lrs (xAPI in SQL LRS)` | Linux | Our xAPI package against a real LRS, speaking xAPI 2.0 and 1.0.3 |
| `catapult (cmi5 content tests)` | Linux | Our cmi5 package in ADL CATAPULT's Content Test Suite; its reports are kept as the `catapult-cts-reports` artifact |

Two more workflows never run on pull requests: `release.yml` builds the Windows installer on a `v*`
tag or by hand, and `mirror-media-tool.yml` mirrors the media converter by hand (M2-19, D-49). Only
the project lead runs them; see [release.md](release.md). `apps/desktop/test/release.test.ts`, part
of `pnpm test`, pins their triggers, signing switch and draft-only release.

## Moodle end to end (M1-21)

The job starts Moodle with Docker Compose, builds SCORM 1.2 packages with our exporters and the
Blocks player, uploads each one as a SCORM activity in its own course, and drives a learner through
it in Chromium with Playwright. Then it reads what Moodle recorded from its SCORM tables.

- **Courses:** the format's test fixtures, the course corpus when the `test-courses` checkout is
  present (see below), and a short quiz course for the exact pass and fail checks.
- **Learner path:** launch, complete a lesson, open the next one, leave with Moodle's "Exit activity"
  button, relaunch, resume at that lesson, finish the course and pass its quiz. A second path fails
  the quiz.
- **Checks:** the status, bookmark and score Moodle keeps after each visit match what the
  conformance test LMS keeps after the same visits; in the test LMS the quiz course reports
  "passed" with score 100, or "failed" with score 0, and Moodle keeps the same; suspend data is
  kept; the total time grows; resuming continues the same attempt. The quiz course has a passing
  score, so its manifest carries a mastery score and Moodle derives passed or failed from the score
  itself; only the test LMS shows the status word the course sent.
- **SCORM 1.2 only.** Moodle does not implement SCORM 2004 sequencing fully, and it needs plugins for
  xAPI and cmi5 (standards.md T-4). SCORM 2004 runs in ILIAS, xAPI in SQL LRS and cmi5 in
  CATAPULT (below); the conformance hosts (`packages/conformance/e2e/standards.e2e.ts`) cover all four.
- **On failure, or when the job runs out of time,** it uploads the `moodle-e2e` artifact:
  Playwright traces and report, and the Moodle containers' logs (web server and PHP errors,
  database). Playwright stops after 25 minutes, or on CI after three failed tests, so the upload
  still fits in the job's 40 minutes.

### What runs

The harness is test-only and lives in `packages/conformance/moodle/`:

| File | Role |
|---|---|
| `compose.yaml` | PostgreSQL and Moodle's PHP and Apache image, both pinned by digest |
| `up.ts` | Downloads the Moodle release and checks its SHA-256, starts the containers afresh and installs Moodle from the command line |
| `config.php` | Moodle's configuration |
| `cli.php` | Creates the learner, uploads a package as an activity, and reads back the learner's tracks |
| `moodle.ts`, `moodle.e2e.ts` | The Playwright helpers and tests |

Moodle is version 5.3, the current long-term support release, on PHP 8.3 with PostgreSQL 17. To
upgrade, change the release URL and SHA-256 in `up.ts` (moodle.org publishes the SHA-256 beside each
download) and the image digests in `compose.yaml`. Pick only image digests published at least two
weeks earlier. CI caches the release and the images, keyed on those two files.

### Run it on your machine

You need Docker with Linux containers: Docker Desktop on Windows or macOS, or Docker Engine on
Linux. Build first, then:

```bash
pnpm --filter @course-suite/conformance exec playwright install --only-shell chromium
pnpm --filter @course-suite/conformance moodle:up      # a fresh Moodle, about five minutes
pnpm --filter @course-suite/conformance test:moodle
pnpm --filter @course-suite/conformance moodle:down    # removes the containers and their data
```

Moodle answers on `http://localhost:8250`; set `MOODLE_PORT` for both `moodle:up` and
`test:moodle` to use another port. Each run of `moodle:up` deletes the Moodle it started before.
You can rerun `test:moodle` against the same Moodle: every test makes its own course. To look
around, log in as `learner` / `Learner-pass-1`, or as `admin` / `Admin-pass-1`. These passwords
belong to a throwaway local test site; never reuse them.

## Hosts beyond Moodle (M2-21)

Each job builds its packages the way the editor's publish panel exports them
(`packages/conformance/test/hosts.ts`: `exportCourseOf`, so the saved settings over the panel's
defaults) from a short quiz course with two lessons and a one-question quiz that decides passed or
failed (`packages/conformance/test/compost.ts`). Every image is pinned by digest and every download
by SHA-256 or commit; pick only digests published at least two weeks earlier. CI caches the
downloads and images, keyed on the files that pin them. `THIRD_PARTY_NOTICES.md` lists each host
and its licence; none of them ships with anything we build.

### ILIAS (SCORM 1.2 and 2004)

ILIAS 11.5 (the packaged release, SHA-256 in `ilias/up.ts`) on PHP 8.4 with Apache and MariaDB 11.8.
ILIAS publishes no container image, so `ilias/Dockerfile` builds the web server from PHP's official
image with the extensions ILIAS's installation guide asks for (imagick from PECL at a pinned
version). `up.ts` unpacks the release, installs ILIAS with its command-line setup
(`ilias/config.json`), creates the learner and turns learning progress on for SCORM modules, as a
site that grades SCORM does (without it ILIAS launches a module with no credit, and its SCORM 1.2
player drops every status and score); `cli.php` uploads a package as a SCORM learning module
the way ILIAS's upload form does, and reads the learner's tracking (SCORM 1.2: `scorm_tracking`;
SCORM 2004: `cmi_node`).

- **Learner paths,** for SCORM 1.2 and SCORM 2004 each: complete a lesson, open the next, leave the
  player for the dashboard, relaunch, resume at that lesson and pass the quiz; and fail the quiz.
- **Checks:** after each visit, the completion and success status, bookmark, raw score and suspend
  data ILIAS keeps equal what the conformance test LMS keeps after the same visits.
- Run it locally: `ilias:up` (about ten minutes the first time: it builds the web server image),
  `test:ilias`, `ilias:down`. ILIAS answers on `http://localhost:8260` (`ILIAS_PORT` for both);
  the learner is `learner` / `Learner-pass-1`. After editing `ilias/Dockerfile`, rebuild with
  `docker compose -f packages/conformance/ilias/compose.yaml build`.

### SQL LRS (xAPI)

SQL LRS 0.9.9 by Yet Analytics (Apache-2.0), chosen because it is small (one container, its own
SQLite store, no other service), permissively licensed, runs headless, and speaks both xAPI 2.0 and
1.0.3, which it can also be held to (`LRSQL_SUPPORTED_VERSIONS`). CATAPULT's own setup uses it too.
`lrs/compose.yaml` starts two: one with both versions, one with 1.0.3 only.

- **Learner paths,** against each LRS: complete a lesson, close the course, relaunch with the same
  registration, resume from the LRS's State document and pass the quiz; and fail the quiz.
- **Checks:** the statements the LRS stores for the registration are the ones the test LMS's
  in-memory LRS receives from the same visits, in the same order, with the same verbs, objects and
  results (passed or failed with the score); the course makes no request outside its package and
  the LRS; the page logs no error.
- Run it locally: `lrs:up`, `test:lrs`, `lrs:down`. The LRSs answer on `http://localhost:8270/xapi/`
  and `http://localhost:8271/xapi/` (`LRS_PORT`, `LRS103_PORT`).

### CATAPULT (cmi5)

ADL CATAPULT 1.0.8 (Apache-2.0; the commit just before its tag, whose player lockfile does not
build, see `catapult/up.ts`): its Content Test Suite (CTS) and the cmi5 player the CTS launches
courses through, which checks every request an AU makes against the cmi5 requirements. `up.ts`
checks CATAPULT out at its pinned commit and `catapult/compose.yaml` builds the CTS and the player
with CATAPULT's own Dockerfiles (their base images pinned by digest through build contexts), with
MySQL 8.0 as CATAPULT uses it, SQL LRS as the player's LRS and nginx giving both one origin.

- **Runs,** through the CTS's REST API and Chromium, each in its own imported course and
  conformance test: a learner completes a lesson and closes the course, is launched again (a second
  session of the same registration), resumes at that lesson and passes the quiz; and a learner fails
  the quiz.
- **Checks:** in every session, no request broke a cmi5 requirement and the cmi5-defined statements
  arrive in order (initialized, terminated; then initialized, completed, passed, terminated; or
  initialized, failed, terminated); the relaunched cover's resume link goes to the lesson the first
  session left open; the LRS holds passed or failed once, with the score (scaled, raw, min and max
  on passed); the CTS reports the passed AU conformant and the failed one pending, as the course
  moves on only when passed. The tests read the statements from the player's SQL LRS, which
  `compose.yaml` also publishes on `http://localhost:8281/xapi/` (`CATAPULT_LRS_PORT`).
- **Report:** the CTS's report of each test, in the shape of the file its "Download" button saves,
  goes to `catapult/reports/` and is kept as the `catapult-cts-reports` artifact on every run.
- Run it locally: `catapult:up` (it needs git; about ten minutes the first time: it builds both
  images), `test:catapult`, `catapult:down`. The CTS answers on `http://localhost:8280`
  (`CATAPULT_PORT`); sign in as `admin` / `Admin-pass-1`.

## Player performance budget (M2-21)

Two checks in the Windows `check` job keep the player small and quick (ENG-04, D-26):

- **Size:** `packages/exporters/src/player-budget.test.ts` (in `pnpm test`) fails when the player
  script or style sheet, gzip-compressed, grows past its budget: 87 KiB and 13 KiB, the sizes on
  2026-10-29 (76,930 B and 11,130 B) plus 15 %.
- **First render and memory:** `packages/conformance/e2e/performance.e2e.ts` (in `pnpm test:e2e`)
  opens a large course from disk (100 lessons, 820 blocks) five times and fails when a median
  exceeds its budget:

  | Measure, until the cover is in the page | Windows runner, 2026-10-29 | Budget |
  |---|---|---|
  | Main-thread busy time (Chrome's `TaskDuration`) | 188 ms | 380 ms, twice |
  | Script time (Chrome's `ScriptDuration`) | 17 ms | 50 ms, three times |
  | Wall-clock time until the begin link is in the page | 150 ms (120 to 168 ms in other runs) | 340 ms, twice the slowest |
  | JavaScript heap in use after a garbage collection | 3,039,356 B (3.039 to 3.050 MB in every load) | 3,500,000 B, plus 15 % |

  Busy time leaves out the gaps between the page's tasks, which a shared runner's load stretches
  most; the wall clock also sees waiting that costs no CPU. The heap does not vary, so its
  margin is small. A second test injects 250 ms of blocking work at start-up and 512 KiB of
  retained memory, and fails unless the script and heap budgets catch them on any machine; on the
  runner the main-thread and wall-clock budgets catch the blocking work too (461 ms and 433 ms). A
  much faster or a heavily loaded machine moves the time figures: each run prints what it measured.

Raise a budget only with a reviewed reason in the pull request.

## Course corpus in CI

The corpus (M1-28) lives in the private repository `iteratecraft/test-courses`. Both jobs check it
out into `test-courses/` at the commit pinned in `ci.yml`, with a read-only deploy key held in the
studio secret `TEST_COURSES_DEPLOY_KEY`. Without that secret the checkout is skipped with a notice
and CI stays green: the corpus tests skip, and the Moodle job uses only the format's fixtures. This
is always the case on pull requests from forks, which receive no secrets.

### Create the deploy key (project lead)

1. Make a key pair with no passphrase, outside any repository:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "studio CI, read-only" -f test-courses-deploy
   ```

2. Add the public half to `iteratecraft/test-courses` as a deploy key **without write access**:
   Settings, Deploy keys, Add deploy key, paste `test-courses-deploy.pub`, leave "Allow write
   access" unticked. Or:

   ```bash
   gh repo deploy-key add test-courses-deploy.pub -R iteratecraft/test-courses --title "studio CI (read-only)"
   ```

3. Store the private half as the Actions secret `TEST_COURSES_DEPLOY_KEY` of `iteratecraft/studio`:
   Settings, Secrets and variables, Actions, New repository secret. Or:

   ```bash
   gh secret set TEST_COURSES_DEPLOY_KEY -R iteratecraft/studio < test-courses-deploy
   ```

4. Delete both files from your machine. To rotate the key, repeat these steps and remove the old
   deploy key.

CI never prints the key: GitHub masks secret values in logs, and the workflow passes it only to the
checkout step.

To move studio to newer fixtures, bump `ref` in both checkout steps of `ci.yml` in a reviewed pull
request.
