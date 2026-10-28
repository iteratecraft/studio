# Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`. It has two jobs.

| Job | Runner | What it does |
|---|---|---|
| `check (windows-latest)` | Windows | Install, build, typecheck, lint, unit tests, guards, licences, the desktop app (Rust formatting and unit tests, release build, 15 MB size gate) and the browser tests (`pnpm test:e2e`, including a launch of the built desktop app): everything in the command table of `AGENTS.md` |
| `moodle (SCORM 1.2 end to end)` | Linux | Our SCORM 1.2 packages in a real Moodle (M1-21) |

The product is Windows-first (ADR-0001). The Moodle job is the one Linux job, an exception the
project lead approved: it only hosts Moodle, whose containers need Linux.

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
  xAPI and cmi5 (standards.md T-4). Those standards are verified in the conformance hosts
  (`packages/conformance/e2e/standards.e2e.ts`); SCORM 2004 in a real LMS waits for ILIAS (T-5).
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
