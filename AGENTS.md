# Agent rules for `studio`

These rules apply to every contributor, human or AI agent. Read `ARCHITECTURE.md`, `CLEAN-ROOM.md`
and the line of `ROADMAP.md` for your task before you start. Decisions live in `docs/adr/`.

## Clean-room (mandatory)

You are on the **build team**. You implement from the public specs and open standards only.

- Never open, clone or quote the private `research` repository, and never put its files in your
  context.
- Never use REA or any reverse-engineering, decompiling or browser-capture tool.
- Never fetch the vendor's websites, help pages or the course hosts named in spec sources.
- Never copy vendor code, text, images, templates, characters, icons or label wording.
- Never use vendor trademarks in names, UI or docs, beyond plain "compatible with" statements.
- If a spec is unclear, ask for the spec to be fixed. Do not go and look at the vendor's product.
- Run in the build-agent configuration and read the build copy of the specs:
  [docs/build-agents.md](docs/build-agents.md).
- Course fixtures live in the private `iteratecraft/test-courses` repository and follow its
  provenance policy: only packages we authored, ADL/CATAPULT samples and open-source tool output.
  Clone it into `test-courses/` at the root of studio (git-ignored) to run the corpus tests; without
  it they skip.

## Write the least code that fully works

Before writing code, stop at the first rung that holds:

1. Does this need to exist at all?
2. Is it already in this codebase? Use it the way the surrounding code does.
3. Does the standard library do it?
4. Does a native platform feature do it?
5. Does an installed dependency do it?
6. Can it be one line a reader understands at a glance?
7. Only then: the minimum code that works, plus one small test if it has logic.

Read the code you touch first. Never cut validation, error handling, security or accessibility. End
every report or PR with what you skipped or did not verify. The full skill is in
`.claude/skills/ponytail/SKILL.md`.

## Platforms

Windows 10/11 x64 first, then macOS 13+, then Linux (ADR-0001). Only Windows is built, tested and
supported for now, but write cross-platform code: `path.join`, no shell-specific scripts, LF endings.

## Layout, layers and licences

- `packages/format` and `packages/labels` <- engine packages (`player-blocks`, `tracking`, `exporters`, `conformance`) <-
  `packages/ui` <- `apps/*`. Import only from layers to your left; import other packages by name, never by relative
  path. `conformance` is test-only: `ui` and apps never import it (ADR-0001). `pnpm check:deps`
  enforces this.
- Anything that ships inside a published course is MIT and may depend only on MIT packages. Everything
  else is Apache-2.0. A new package needs a `turbo.json` with one layer tag (`format`, `engine`, `ui`
  or `app`), plus `mit` if it is MIT. An MIT package declares everything it ships under
  `dependencies`; its `devDependencies` and `peerDependencies` hold only test tooling (`vitest`).
- Pin exact dependency versions. A version shared by several packages goes in the pnpm `catalog`.

## Commands

Node 24.2 or later within 24 (`.nvmrc`) and pnpm (`packageManager` in `package.json`). Set
`TURBO_TELEMETRY_DISABLED=1` in your shell; CI sets it too (ADR-0001).

| Command | What it does |
|---|---|
| `pnpm install` | Install locked dependencies |
| `pnpm build` | Build every package (Turborepo) |
| `pnpm typecheck` | TypeScript strict check |
| `pnpm lint` | Biome lint and format check, including the rule against hard-coded learner text in `packages/player-*` (`tools/lint/`; `pnpm exec biome check --write .` fixes formatting) |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright browser tests (first run: `pnpm --filter @course-suite/web exec playwright install --only-shell chromium`) |
| `pnpm demo:m1` | Builds the sample and corpus courses in every output into `demo/` and serves them in the local test LMS with a live call and statement panel (M1-31); prints the address, Ctrl+C stops it |
| `pnpm check:deps` | Dependency-direction and licence-layer check |
| `pnpm check:clean-room` | Clean-room and trademark guard (rules and allow-list in `tools/clean-room-guard/clean-room.config.json`) |
| `pnpm report:trace` | Markdown report of spec rules covered by tagged tests (`--specs <dir>`, default `../specs`, skipped only when the default is absent; `--out <file>`) |
| `pnpm specs:build-copy --from <dir> --out <dir>` | Build copy of the specs with every URL replaced by a stable id (lead or study team only, see `docs/build-agents.md`) |
| `pnpm format:types` | Regenerate `packages/format/src/course.ts` from `course.schema.json` after a schema change (a test fails while it is stale) |
| `pnpm check:licences` | Package licences, production dependency licences and `THIRD_PARTY_NOTICES.md` (`--write` regenerates it) |
| `pnpm --filter @course-suite/desktop build:app` | Builds the desktop executable after `pnpm build` (needs `rustup` and the Visual Studio C++ build tools; ADR-0006); `check:size` then gates it at 15 MB. See `apps/desktop/README.md` |

Run all of them before you open a PR. The Moodle end-to-end tests (`moodle:up`, `test:moodle`) need
Docker and run in their own CI job; see [docs/ci.md](docs/ci.md).

## Pull requests

- Conventional Commit subjects and PR titles (`feat:`, `fix:`, `chore:`, `docs:`...).
- **Cite the spec rule ids and roadmap ids** your change implements (for example `M0-02`, a spec rule
  id from `specs`) in the PR body, and tag tests with the spec rule ids they cover: `[rise:R11]` in a
  test title means rule 11 of `rise.md`.
- The PR body says what and why, which checks you ran with their real results, and what is not
  verified.
- Never merge your own PR, never push to `main`, never force-push someone else's branch.
