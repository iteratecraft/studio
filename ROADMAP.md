# Course Suite: Roadmap

How we get from an empty repo to a free, open-source suite: a desktop app plus a self-hosted server that
matches what Articulate 360 does. It covers both course editors (Slides and Blocks), Review, Reach,
Translate and AI, and team collaboration.

- Every work package lives in [BACKLOG.md](BACKLOG.md): 177 epics across 7 products and the shared engine.
- Behaviour comes only from the public [specs](https://github.com/iteratecraft/specs). See [CLEAN-ROOM.md](CLEAN-ROOM.md).
- Dates are **estimates in weeks from the M0 start**, assuming about 9 AI agent teams working in parallel
  under one human lead. With 6 teams, multiply by about 1.5.

## At a glance

| Milestone | What a user can do at the end | Edition | Release | Done by (est.) |
|---|---|---|---|---|
| **M0** Foundations | Contributors and agents build and test the monorepo on Windows, macOS and Linux | both | none | week 2 (core gates) |
| **M1** Engine + Blocks player + export | A reference course plays in our player and passes in Moodle as SCORM 1.2, plus SCORM 2004, xAPI and cmi5 in test hosts | engine | none | week 10 |
| **M2** Blocks editor MVP | An author installs the app, builds a responsive course, previews it and exports it to a training system | desktop | **Desktop 0.1** | week 18 |
| **M2b** Blocks complete | Remaining blocks, snapshots, XLIFF labels, accessibility checker, question-level reporting | desktop | Desktop 0.2 | week 24 |
| **M3** Server core | A company runs the server, invites authors, and several authors co-edit one course live in the browser | server | none | week 22 |
| **M3b** Review MVP | Reviewers open a link and pin comments with screenshots to slides or lessons | server | **Server 0.1** | week 29 |
| **M3c** Team libraries + Review v1 | Shared question banks, templates and brands; annotations, mentions and comment export | both | minor | week 35 |
| **M4** Reach MVP | Admins assign courses to learners, with tracking, due dates, reminders, certificates and reports | server | minor | week 38 |
| **M4b** Reach v1 + LRS + cmi5 | Learning paths, CSV import, API and webhooks, a built-in LRS and cmi5 launcher | server | minor | week 45 |
| **M5** Slides core (internal) | Slide projects with objects, layers, states, timeline, triggers and variables, playing in preview | both | none | week 33 |
| **M5b** Slides MVP | Graded quizzes, player designer, accessible output, publishing to all standards | both | **Slides release** | week 40 |
| **M5c** Slides v1 | Masters, themes, advanced objects, full quizzing, video and Word outputs, team integration | both | minor | week 48 |
| **M6** Translate + AI MVP | Own-key AI writing help, multi-language Blocks courses, glossary, XLIFF and Word round trip | both | minor | week 44 |
| **M6b** AI authoring + tutor | Course drafting from sources; generated questions, images and narration; learner tutor | both | minor | week 52 |
| **M6c** Slides languages + import | Multi-language slide projects, translation validation in Review, PowerPoint import | both | minor | week 56 |
| **M7** Enterprise | Single sign-on, provisioning, two-factor sign-in, audit log, quotas, Helm chart, scale tests | both | **1.0** | week 62 |
| **M8** Desktop ↔ server sync | Desktop authors sign in to their company server and sync projects, with offline edits merged | both | **1.1** | week 70 |
| Parked | Chat assistant that edits projects, avatars and sound effects, survey block, AICC, multi-SCO sequencing | — | — | after 1.1 |

**About 16 months to 1.1 with 9 teams; about 2 years with 6.** The first public download, Desktop 0.1,
comes at about week 18.

## What changed after the adversarial review

An independent reviewer judged the first draft "not ready to hand to build agents". The final pass
applied every point below. (The automated finalise step was interrupted by a usage limit, so the lead
applied these by hand.)

1. **Dates now follow the dependency chain.** The draft's own sizes put Desktop 0.1 at about week 17–20,
   not 13, and the Slides core at about week 31, not 27. All later dates moved. M0 task M0-13 builds a
   scheduler that recomputes dates from `depends_on`, so this cannot drift again.
2. **Desktop 0.1 is smaller.** It ships SCORM 1.2 and web output (plus xAPI if already passing), basic
   image and video import with thumbnails, and VTT captions only. Media renditions, watermarking,
   picture-in-picture and server-side media parts move to M2b or later.
3. **Circular dependencies are cut:**
   - ENG-26 becomes ENG-26a (minimal slide runtime: navigation, layer stack, on-demand slide data) and
     ENG-26b (lightbox, dialog behaviour, embed profile, answer resume, after ENG-28/30/31).
   - The language picker moves from ENG-31 into ENG-35, and ENG-35 splits into **ENG-35a** (Blocks
     multi-language delivery, after M2b) and **ENG-35b** (Slides, after ENG-31). Translating Blocks
     courses no longer waits for the Slides player.
   - Missing dependencies are added: ENG-24 → ENG-19 (Yjs mapping), ENG-28 → ENG-27 (timeline events),
     and the question-bank reference in ENG-02/ENG-05.
4. **Epics that spanned milestones are sliced per milestone,** each with its own acceptance: ENG-06a
   (Blocks profile, M1) / ENG-06b (Slides profile, M5), ENG-20a (lesson anchors, M3b) / ENG-20b (slide
   anchors, M5b), and likewise ENG-11, ENG-13, ENG-14 and ENG-16.
5. **New epics:**
   - **ENG-39 Security baseline** (M3, before Server 0.1): authentication and sessions, password hashing,
     lockout and rate limits, CSRF, secrets at rest, dependency scanning and an SBOM per release, a
     threat-model ADR, and a security advisory process.
   - **ENG-40 Docs and website** (from M2): user guide, downloads page, and self-hosting install, backup
     and upgrade guides.
   - **ENG-41 Desktop publish to server** (M4): server URL, personal access token in the OS keychain,
     API version negotiation, publish by stable project id. This is one-way; two-way sync stays in M8.
   - **ENG-42 Identity, directory and groups service** (M3): one service shared by Review and Reach, so
     single sign-on is built once in M7.
6. **Server data safety moves earlier.** PostgreSQL and object-storage backup and restore, forward-only
   migrations with an upgrade test from the previous release, and the self-hosting upgrade guide are
   now **M3 exit criteria**, before anyone stores real data on Server 0.1. Helm and autoscaling stay in
   M7.
7. **The audit log and load-test harness move from M7 to M3/M4.** M7 grows to 10 weeks.
8. **No outside party blocks a release.** "Passes an external security review" is replaced by an
   internal security checklist with automated isolation tests. External findings are tracked separately,
   and severity decides whether a release ships (decision D-17).
9. **Clean-room protection for build agents** (new M0 tasks M0-14 to M0-16):
   - Build agents run in a separate configuration with **no REA tools, no research checkout and a
     restricted web policy** (vendor domains and the course hosts named in spec sources are blocked).
   - Build agents read a **build copy of the specs** where source URLs are reduced to ids.
   - The `test-courses` repo has a **fixture provenance policy**: only packages we authored, ADL/CATAPULT
     samples and output of other open-source tools, each with its source and licence recorded. CI
     rejects zips containing vendor players.
   - The study team runs a **per-release originality audit**, outside `studio`, of shipped label text,
     templates and assets.
   - **.story import (inside ENG-36) is gated:** it starts only once the study team delivers a written
     spec with synthetic test files. PowerPoint and project-to-project import go ahead independently.
10. **Cross-cutting budgets and checks are added to acceptance:**
    - Performance: player size, first load on a mid-range phone, slide animation frame rate, and editor
      responsiveness on a 100-lesson course. Measured in CI, trend report per release.
    - Editor accessibility: keyboard and screen-reader end-to-end tests in the M2 and M5b exits, and
      canvas objects movable by keyboard.
    - Editor UI localisation: right-to-left layout and a pseudo-localisation check in ENG-12. A few
      original built-in learner label sets ship in M2b.
    - Network: an outbound-connections ADR lists every allowed destination and how to turn it off, and
      editor network assertions are in the M2 exit.
11. **Decisions moved earlier.** Co-editing granularity (D-5) is now decided at the **M1 start**, because
    the command layer with undo (ENG-10) ships before co-editing. Slide co-editing gets its own decision
    and design ADR before M5 (D-18).
12. **Every package that ships inside a published course is MIT** (format runtime, labels, theme tokens,
    media player and slide runtime, not only player and tracking). The licence gate scans built package
    contents, including fonts.
13. **Course scripts load without modules.** Chromium blocks module scripts and `import()` from
    `file://`, so an ADR in M1 sets a classic-script chunk loader, with a `file://` test for every lazy
    chunk.
14. **Credential handling is honest.** LRS credentials supplied at launch are the default. Authors get a
    warning when embedding credentials, which are documented as public, write-only and narrowly scoped.
    Tutor tokens are per course and revocable.

## Milestones in detail

### M0: Foundations (weeks 0–2, with the rest running alongside M1)

- **Goal:** anyone, human or agent, can clone `studio`, build it and test it on three operating systems.
- **Epic:** ENG-01. Only tasks M0-01 to M0-06 and M0-13 to M0-16 block M1. The Electron shell,
  installers and auto-update (M0-07 to M0-09) run alongside M1 and must finish before M2 starts. The
  server and web skeletons (M0-10, M0-11) must finish before M3.
- **Exit:**
  - CI green on Windows, macOS and Linux from a clean clone.
  - Licence, clean-room and trademark guards fail on their test fixtures.
  - The build-agent configuration is in place.
  - The traceability report and scheduler run.
  - The test-courses repo is pinned with its provenance policy.
  - By M2: installers on tag, and auto-update on Windows and AppImage. Unsigned macOS and .deb builds
    use "notify and download" with signed update metadata.

### M1: Engine, Blocks player and standards export (weeks 1–10)

- **Epics:** ENG-02, ENG-03, ENG-04, ENG-05, ENG-06a, ENG-09, ENG-37, STD-01 to STD-07.
- **Exit:**
  - At least 6 reference Blocks courses validate and play from disk (`file://`) and over the web.
  - **SCORM 1.2:** launch, resume, pass, fail, score and exit are verified end to end in Moodle, and the
    golden traces match the spec rules.
  - **SCORM 2004 4th edition:** golden trace matches; completion and success are reported separately;
    runs in ILIAS.
  - **xAPI:** statements and resume are accepted by an open-source LRS (1.0.3 and 2.0).
  - **cmi5:** the ADL CATAPULT content tests pass.
  - The long-resume course stays under 4,096 characters, with the drop order and an author warning.
  - Zero third-party network requests and zero serious axe violations.
  - Performance budget for the player is set.

### M2: Blocks editor MVP → Desktop 0.1 (weeks 5–18)

- **Epics:** ENG-07 (VTT captions only), ENG-08, ENG-10, ENG-11 (slice), ENG-12, ENG-13, ENG-14 (basic
  import only), ENG-15, ENG-40 (start), BLK-01 to BLK-10, STD-08.
- **Exit:**
  - A scripted end-to-end run on all three OS: create a course, add 3 lessons using every MVP block type
    and a quiz lesson, set theme and navigation, preview, export SCORM 1.2, and pass in Moodle, all
    offline.
  - Preview and export are pixel-identical for corpus courses.
  - A forced quit never corrupts a project, and undo/redo covers every MVP edit.
  - The editor is usable by keyboard and screen reader.
  - Editor network assertions pass.
  - Installers, release notes and a user guide are published.

### M2b: Blocks complete → Desktop 0.2 (weeks 18–24)

- **Epics:** ENG-16, ENG-17, BLK-11, BLK-15, BLK-16, STD-09 to STD-12, STD-19, plus media extras moved
  out of M2.
- **Exit:**
  - Parity blocks shipped with their limits enforced.
  - Named and automatic snapshots.
  - XLIFF 1.2 round trip is lossless, and original built-in label sets ship.
  - The accessibility checker runs in the editor and as a CLI.
  - Per-question interactions are reported in SCORM and xAPI.
  - A compatibility table is published from runs in at least 3 training systems beyond Moodle.

### M3: Server core (weeks 12–22)

- **Epics:** ENG-18, ENG-19, ENG-39, ENG-42, TEAM-01 to TEAM-03, TEAM-05 to TEAM-08, BLK-17, plus the
  audit-log and load-harness slices.
- **Exit:**
  - The single documented `docker run` command (and `docker compose up -d` for the PostgreSQL setup) on a 2 vCPU / 4 GB VM serves the browser Blocks editor, with first-run admin setup and no manual configuration.
  - Self-hosting meets every rule in ARCHITECTURE.md "Easy self-hosting", checked by a clean-machine CI job.
  - Roles are proven on every endpoint by tests.
  - Three authors co-edit one course live with locks, take-over and presence, and the convergence fuzz
    test is green.
  - Backup and restore drill passes, upgrade from the previous build loses no data, and the
    install/upgrade guide is published.
  - Security baseline tests are green.

### M3b: Review MVP → Server 0.1 (weeks 20–29)

- **Epics:** ENG-20a, REV-01 to REV-07, TEAM-09.
- **Exit:**
  - Versions can be published by upload and from the browser editor.
  - Share links work open, invite-only, password-protected and for email guests.
  - Comments anchor to a slide or lesson with an automatic screenshot.
  - Live updates and email digests work.
  - Review requests send reminders on day −1, 0 and +1.
  - Content is served from an isolated origin and passes the internal security checklist.

### M3c: Team libraries and Review v1 (weeks 29–35)

- **Epics:** ENG-21, ENG-22, REV-08 to REV-14, REV-18, TEAM-04, TEAM-10 to TEAM-12, BLK-14.
- **Exit:**
  - Shared banks, templates, brands and fonts work under their roles.
  - Annotations, mentions and attachments work.
  - Comments export to CSV, PDF (including CJK) and JSON.
  - Desktop review copies collect comments that import back.

### M4: Reach MVP (weeks 28–38)

- **Epics:** ENG-23, ENG-41, RCH-01 to RCH-13, STD-14, BLK-18. The Reach team starts ENG-23 and STD-14
  during M3c.
- **Exit:**
  - Third-party SCORM zips up to 5 GB are tracked with no data loss on tab close.
  - Blocks courses published from desktop and browser are tracked lesson by lesson.
  - Assignment, due dates, reminders, certificates (PDF slice) and reports work.
  - 1,000 concurrent learners run on the small profile.
  - Data retention and erasure rules are applied (decision D-19).

### M4b: Reach v1, LRS and cmi5 (weeks 38–45)

- **Epics:** RCH-14 to RCH-18, RCH-20, STD-15 to STD-17.
- **Exit:**
  - Learning paths, CSV import and custom fields work.
  - The built-in LRS passes the ADL LRS conformance suite.
  - The cmi5 launcher passes the CATAPULT LMS suite.
  - The REST API and signed webhooks work.

### M5: Slides core, internal (weeks 16–33)

- **Epics:** ENG-24 (owned by the Slides runtime team), ENG-25, ENG-26a, ENG-27, ENG-28, SLD-01 to SLD-07.
  ENG-29 (author JavaScript) and the long tail of events and actions move to M5c.
- **Scope:** a **fixed MVP event and action list** is agreed at the M5 start (D-20). This replaces
  "defined by the corpus".
- **Exit:**
  - A branching-scenario reference project is built end to end.
  - Every event and action on the fixed MVP list has a passing corpus slide.
  - Editor-versus-player pixel parity is green on three OS (a text-layout spike runs in the first 2
    weeks).
  - Animation frame-rate budget met.

### M5b: Slides MVP (weeks 33–40)

- **Epics:** ENG-26b, ENG-30, ENG-31, ENG-20b, ENG-06b, SLD-08 to SLD-11, BLK-12.
- **Exit:**
  - Graded question slides and result slides report to training systems.
  - The player designer works.
  - The reference course passes the accessibility checker and recorded NVDA, Narrator and VoiceOver
    walkthroughs.
  - Golden traces match the spec.
  - Blocks courses can embed slide projects.
  - Ships on desktop and in the browser.

### M5c: Slides v1 (weeks 40–48)

- **Epics:** ENG-29, ENG-32, ENG-33, SLD-12 to SLD-16, SLD-19 (only if D-18 approves slide
  co-editing), REV-15, TEAM-13 to TEAM-15, BLK-13.
- **Exit:**
  - Masters, themes, templates and original library assets.
  - Advanced objects.
  - Full quizzing with banks and question import.
  - MP4 and Word outputs.
  - Slide projects published to Review and Reach.

### M6: Translate + AI MVP (weeks 36–44)

- **Epics:** ENG-34, ENG-35a, LOC-01, LOC-04, LOC-09, LOC-14 to LOC-16, LOC-18, LOC-19.
- **Exit:**
  - Keys live in the OS keychain, or a local model is used, and the company key never reaches clients.
  - Every AI change is reviewed before it applies and is one undo step.
  - A course is translated into 5 languages, including one right-to-left, with the glossary enforced.
  - XLIFF and Word round trip.
  - One package carries a language chooser.

### M6b: AI authoring and tutor (weeks 44–52)

- **Epics:** LOC-02, LOC-03, LOC-05 to LOC-08, LOC-10, LOC-13, TEAM-16, BLK-19.
- **Exit:**
  - The draft wizard builds a course from a brief and sources.
  - Generation records provenance.
  - The tutor makes zero requests when off and never reveals assessment answers.
  - AI policy and quotas are enforced.

### M6c: Slides languages and import (weeks 48–56)

- **Epics:** ENG-35b, ENG-36 (PPTX and project import), SLD-17, SLD-18, LOC-17, LOC-20, REV-16, REV-17,
  REV-20.
- **Gate:** .story import ships only after the go decision D-9, based on the study team's spec. Its
  tests use synthetic files written from that spec. Real community samples are run only by the study
  team, outside `studio`.

### M7: Enterprise → 1.0 (weeks 52–62)

- **Epics:** ENG-38, TEAM-17 to TEAM-19, RCH-19, REV-19.
- **Exit:**
  - SAML single sign-on and SCIM for authors and learners, plus TOTP.
  - Quotas, retention and review policy.
  - The Helm chart autoscales.
  - Medium-profile load test passes.
  - Desktop fleet-install packages are available, with no telemetry.
  - The docs site is complete.
  - The internal security checklist is closed.

### M8: Desktop ↔ server sync → 1.1 (weeks 62–70)

- **Epic:** TEAM-20.
- **Exit:**
  - Desktop signs in through the system browser.
  - Projects and personal libraries sync both ways, and offline edits merge with no loss (fuzz test).
  - Non-CRDT conflicts show both versions.

### Parked until after 1.1

SLD-20 and LOC-11 (chat assistant that edits projects), LOC-12 (sound effects, avatars), BLK-20 (survey
block), STD-13 (AICC export), STD-18 (server multi-SCO sequencing). Each gets a scope decision at 1.1
planning.

## Critical path

1. **M0 core gates** (week 2) → ENG-02 course format → STD-01 tracking core and resume codec → STD-02
   package builder → STD-04 **SCORM 1.2 proven in Moodle** (about week 10).
2. ENG-10 command layer + ENG-12 host interface → BLK-01/02/03 → BLK-07/10 → **Desktop 0.1**
   (about week 18).
3. ENG-24 → ENG-25 (text-layout spike first) → ENG-26a → ENG-27 → ENG-28 → SLD-05 → **Slides core**
   (about week 33) → ENG-30 + ENG-31 → **Slides MVP** (about week 40) → Slides v1 (about week 48) →
   PowerPoint/.story import (about week 56).
4. Server chain: ENG-18 + ENG-19 + ENG-39 + ENG-42 → TEAM-05/07 → REV-01 to REV-04 → **Server 0.1**
   (about week 29) → RCH-04/07/09/13 → **Reach MVP** (about week 38).
5. TEAM-17/18 + ENG-38 → **1.0** (about week 62) → TEAM-20 → **1.1** (about week 70).

## Workstreams (one owner per epic)

| Workstream | Owns | Starts |
|---|---|---|
| Platform and release | ENG-01, ENG-38, ENG-40, installers, CI | M0 |
| Course format and editor core | ENG-02, ENG-10, ENG-11, ENG-16, ENG-19 mapping | M1 |
| Blocks player | ENG-04 to ENG-09 (Blocks slices) | M1 |
| Standards and conformance | STD-*, ENG-03, ENG-37 | M0 |
| Blocks editor | BLK-* (BLK-12/13 only here), ENG-12 to ENG-15 | week 5 |
| Server platform and teams | ENG-18, ENG-39, ENG-42, TEAM-* | week 12 |
| Review | ENG-20, ENG-21, REV-* | week 20 |
| Reach and learning records | ENG-23, ENG-41, RCH-*, STD-14 to STD-17 | week 28 |
| Slides runtime | ENG-24 to ENG-31 | week 16 |
| Slides editor | SLD-* (SLD-17 merged into ENG-36) | week 16 |
| Translate and AI | ENG-34, ENG-35, LOC-* | week 36 (ENG-34 contracts first) |
| Accessibility, security and clean-room QA | gates, audits, checklists | M1 |

## First tasks: M0 and M1

### M0

- [ ] **M0-01** Engineering conventions: ADR template and ADR-0001 (toolchain: pnpm workspaces + Turborepo, Vitest, Playwright, electron-builder, Fastify; the MIT set of course-shipped packages; supported OS list)
- [ ] **M0-02** Monorepo skeleton: packages `format`, `player-blocks`, `tracking`, `exporters`, `ui`; apps `desktop`, `server`, `web`; `tools`; dependency-direction check
- [ ] **M0-03** CI on Windows, macOS and Linux: lint, typecheck, unit tests, browser smoke test; required on `main`
- [ ] **M0-04** Licences and licence gate: Apache-2.0 root, MIT for every course-shipped package, NOTICE, scanner of built contents
- [ ] **M0-05** Clean-room and trademark guard in CI, PR template citing spec ids
- [ ] **M0-06** Spec traceability report: every numbered spec rule mapped to tagged tests
- [ ] **M0-07** Electron shell: context isolation, sandboxed renderer, strict CSP, allow-listed IPC *(before M2)*
- [ ] **M0-08** Installers on tag (Windows, macOS arm64/x64 dmg, AppImage, deb), signing wired but skipped without secrets *(before M2)*
- [ ] **M0-09** Auto-update from GitHub Releases: Windows and AppImage update in place; macOS and deb notify-and-download; signed metadata *(before M2)*
- [ ] **M0-10** Server skeleton: Fastify, /health, migrations; **one all-in-one image** (SQLite + local files by default, PostgreSQL + S3 by env vars), plus `compose.yaml`; documented single `docker run` command proven in CI *(before M3)*
- [ ] **M0-11** Web app and UI kit skeleton with design tokens and axe checks *(before M3)*
- [ ] **M0-12** `test-courses` repo scaffold, pinned in CI
- [ ] **M0-13** Scheduler: recompute milestone dates from `depends_on` and team count; publish in CI
- [ ] **M0-14** Build-agent configuration: no REA server, no research checkout, vendor domains and spec-source hosts blocked
- [ ] **M0-15** Build copy of specs with source URLs reduced to ids
- [ ] **M0-16** Fixture provenance policy for `test-courses`, with a CI check rejecting vendor players

### M1

- [ ] **M1-01** ADR-0002 course format: schema dialect, stable ids, versioning and migrations, extension namespace only for unknown fields, newer major versions open read-only
- [ ] **M1-01b** ADR: classic-script chunk loader for `file://`; ADR: outbound connections; decision D-5 co-editing granularity
- [ ] **M1-02** Blocks course schema package (ENG-02)
- [ ] **M1-03** Migrations, project identity, extension-field handling
- [ ] **M1-04** Publish settings and reserved fields in the schema
- [ ] **M1-05** Shared quiz and result model, interaction and answer id builders (ENG-05)
- [ ] **M1-06** Label set format, English built-in set, lint against hard-coded learner strings (ENG-09)
- [ ] **M1-07** Standard-neutral tracking core and adapter interface (STD-01)
- [ ] **M1-08** Resume codec: versioned, keyed by stable ids, compressed, size caps per standard, fixed drop order
- [ ] **M1-09** Blocks player shell (ENG-04): script-loaded data boot, cover, menu, lesson routing
- [ ] **M1-10** Walking-skeleton blocks: text, heading, image with alt text, continue button, multiple-choice check
- [ ] **M1-11** Progress engine (ENG-05)
- [ ] **M1-12** Quiz lesson runtime: paging, submit, results, retries, passing, timer, random draws
- [ ] **M1-13** Player lifecycle, state snapshot and restore, debug tracking adapter (ENG-06a)
- [ ] **M1-14** Package reader with safe unzip and manifest parsers (ENG-03)
- [ ] **M1-15** Test LMS host: SCORM 1.2/2004 API page on an MIT runtime in headless Chromium, call traces, in-memory LRS
- [ ] **M1-16** Package builder pipeline (STD-02)
- [ ] **M1-17** Blocks web output profile
- [ ] **M1-18** SCORM 1.2 exporter (STD-04)
- [ ] **M1-19** SCORM 1.2 runtime adapter with the Blocks profile
- [ ] **M1-20** Standards CI harness: corpus × standards on every engine, player or exporter PR
- [ ] **M1-21** Moodle end-to-end job in a container
- [ ] **M1-22** SCORM 2004 4th edition exporter (STD-05)
- [ ] **M1-23** SCORM 2004 runtime adapter
- [ ] **M1-24** xAPI exporter, with launch-supplied LRS credentials as the default (STD-06)
- [ ] **M1-25** xAPI runtime adapter
- [ ] **M1-26** cmi5 exporter (STD-07)
- [ ] **M1-27** cmi5 runtime adapter
- [ ] **M1-28** Conformance corpus v1: at least 6 reference Blocks courses (ENG-37)
- [ ] **M1-29** Player accessibility baseline, axe in CI
- [ ] **M1-30** No-network guarantee tests for every output
- [ ] **M1-31** M1 demo and exit review

## Top risks

| Risk | Mitigation |
|---|---|
| A build agent picks up research files, vendor code or copied help text | Separate build-agent config, build copy of specs, CI guards, fixture provenance policy, per-release originality audit |
| Slide text renders differently in editor, player and OS | One renderer, Electron's single Chromium, bundled fonts, text-layout spike first, pixel-parity suite on 3 OS |
| Slides scope explodes (47 events, 86 actions, 26 question types) | Registry-driven trigger engine, fixed MVP list, long tail moved to M5c |
| Real training systems differ from the standards | Golden traces, Moodle and ILIAS in CI, a matrix of 3+ more LMSs, fast patch releases |
| Courses exceed SCORM 1.2's 4,096-character resume limit | Compact codec, size warning at publish, long-resume corpus course |
| Co-editing loses work | Convergence fuzz tests, lossless JSON↔Yjs round trip, snapshots on publish, early D-5 |
| Hosted packages attack the server or other users | Isolated content origin, sandboxed frames, strict CSP, ENG-39 security baseline |
| The human lead becomes the review bottleneck | Small tasks with tests written first, automated gates, weekly demos, team count capped by D-14 |
| Licence problems in bundled parts (ffmpeg, runtimes, fonts, voices) | Licence gate on built contents, MIT-only course bundle, LGPL ffmpeg build, models as optional downloads |
| Unsigned installers scare users | D-2 before Desktop 0.1, signing already wired, published checksums |
| No vendor content library | Original asset work starts by M2b; blocks ship without characters if assets are late |

## Decisions needed (owner: project lead)

| Id | Decision | Default proposal | Needed by |
|---|---|---|---|
| D-1 | Product name (organisation **iteratecraft** is done) | — | before Desktop 0.1 |
| D-2 | Code signing: Apple about US$99/yr, Windows about US$10/mo | unsigned + checksums until funded | before Desktop 0.1 |
| D-3 | Toolchain (ADR-0001) | pnpm + Turborepo, Vitest, Playwright, electron-builder, Fastify | M0 start |
| D-4 | Desktop project file container | single zip-based file with autosave folder | before M2 |
| D-5 | Co-editing granularity for Blocks | one editor per lesson, with live presence | **M1 start** |
| D-6 | Standalone web output: keep progress in browser storage or not, per app | Blocks no, Slides yes (follow specs) | before M1-17 |
| D-7 | One organisation per server for 1.0 | yes; multi-org later | before M3 |
| D-8 | LMS test matrix beyond Moodle/ILIAS; free third-party test accounts OK? | yes, for testing only | before M2b |
| D-9 | .story import go/no-go | wait for the study spec | before M6c |
| D-10 | Project-editing chat assistant parked after 1.1 | yes | M6 |
| D-11 | First AI providers and local runtimes | one OpenAI-compatible API, Anthropic, Ollama, whisper.cpp, Piper | before M6 |
| D-12 | ffmpeg build and codecs bundled | LGPL build, royalty-free codecs plus OS decoders | before M2 |
| D-13 | Licences for test-courses and library repos; who makes original art | CC-BY-4.0 content, CC0 icons; AI-assisted original art | before M2b |
| D-14 | How many agent teams the lead can review at once | start with 6, raise when gates hold | M0 |
| D-15 | Publish engine packages to npm | after M1 exit | M1 exit |
| D-16 | Confirm parked list | yes | M1 |
| D-17 | Security review: budget, reviewer, release rule by severity | internal checklist; external review when funded | before Server 0.1 |
| D-18 | Slide co-editing: slide-level locks or CRDT | slide-level locks | before M5 |
| D-19 | Learner data retention and erasure | configurable, default keep, erase on request | before M4 |
| D-20 | Fixed MVP event and action list for Slides | — | M5 start |
| D-21 | Server support policy and diagnostics export | latest 2 minors; local diagnostics bundle | before Server 0.1 |
| D-22 | Stock-asset connectors licence read | — | before M5c |
| D-23 | LTI 1.3 support (common LMS launch method, not used by the reference product) | server edition, after 1.0 | 1.1 planning |

## How to read the backlog

[BACKLOG.md](BACKLOG.md) has one section per product, plus the shared engine. Each epic lists its
features, its "done when" checklist, its spec refs and its risks. An agent picking up work takes **one
task**, reads only the spec sections cited, writes tests first against the "done when" items, and links
the spec rule ids in its PR.
