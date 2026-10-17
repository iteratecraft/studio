# Course Suite: Architecture

Working name only. The real name is chosen before the first public release and must never include
"Articulate", "Storyline", "Rise", "Review 360" or "Reach 360".

**Goal:** a free, open-source rebuild of the whole Articulate 360 suite: Storyline, Rise, Review,
Reach, Localization and the AI features, with Frontline later. It ships as:

- **Desktop app** (Windows, macOS, Linux) for one author working offline.
- **Server edition** (self-hosted with Docker) for teams: co-editing, review links, and assigning and
  tracking courses for thousands of learners.
- **Later:** the desktop app can connect to a company's server and sync.

We host nothing. Companies run their own servers, sized to their own needs.

## Principles

1. **Local-first.** Desktop projects are files on disk, and the server edition runs on the company's
   own infrastructure.
2. **Published courses are static web files.** A SCORM 1.2/2004, xAPI or cmi5 zip is uploaded to any
   learning management system (LMS), and learners need only a browser.
3. **One engine, many apps.** The course format, player, trigger engine and exporters are shared by
   every app, on desktop and server alike.
4. **The editor previews with the real player,** so the preview and the published course never
   differ.
5. **Clean-room.** The study team observes with REA and writes specs; the build team implements from
   specs and open standards only. See `CLEAN-ROOM.md`.

## Editions

| Capability | Desktop | Server (self-hosted) |
|---|---|---|
| Slides editor (Storyline-like) | yes | yes, in the browser |
| Blocks editor (Rise-like) | yes | yes, in the browser |
| Live co-editing, shared projects, team library | no | yes |
| Review: comment through a link, no reviewer account needed | review-copy file round trip | yes |
| Reach: assign, track, report, certificates, reminders | no | yes |
| Users, roles, SSO, audit log | no | yes |
| SCORM / xAPI / cmi5 / web / video / PDF export | yes | yes |
| Translate (XLIFF plus AI translation) | yes | yes |
| AI assistant | user's own key or local model | one company-wide key |
| Sync with a company server | later phase | n/a |

## Layers

```text
Shared web UI (React): editors, review, admin, learner portal
Shared engine (TypeScript): course format (JSON Schema) · player (DOM/SVG, accessible) ·
  trigger/state/variable engine · exporters (SCORM 1.2/2004, xAPI, cmi5, web, video, PDF) ·
  importers (.story, PPTX, XLIFF) · AI provider layer
Desktop shell: Electron (one Chromium on every OS, so rendering is identical)
Server: Node.js + TypeScript · PostgreSQL · S3-compatible storage (MinIO when self-hosted) ·
  Yjs CRDT co-editing via Hocuspocus · learner tracking (xAPI statements, SCORM runtime)
Media: ffmpeg (bundled) · local text-to-speech (optional)
```

## Stack decisions

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript everywhere | One language for the player, editors, server and tooling |
| Desktop | Electron | No Rust to maintain; identical rendering on Windows and macOS |
| UI | React | Widely known; AI agents write it well |
| Server | Node.js (TypeScript) | Reuses engine code directly |
| Data | PostgreSQL + S3-compatible storage | Standard, and scales horizontally |
| Co-editing | Yjs + Hocuspocus (MIT) | CRDT: true simultaneous and offline-capable editing |
| Deploy | Docker Compose (small) and a Helm chart (large) | The company chooses its own size |
| Updates | GitHub Releases + auto-updater | No servers of our own |

## Scaling guide for self-hosters (estimates, to be load-tested)

| Size | Example | Setup |
|---|---|---|
| Small | Up to about 20 authors and 1,000 learners | One VM (2 vCPU, 4 GB) with Docker Compose |
| Medium | About 100 authors and 10,000 learners | 2–4 app instances, managed PostgreSQL, S3 and a CDN |
| Large | 100,000+ learners | Kubernetes Helm chart with autoscaling |

## Study (reverse engineering) with REA

Approved depth: **levels 1–3.** Level 4 was withdrawn after reading Articulate's terms (finding F-0001;
see CLEAN-ROOM.md).

| Level | Source | REA route |
|---|---|---|
| 1 | Articulate's public help docs and release notes | none (plain web pages) |
| 2 | Courses published on the public web with Storyline or Rise | `analyze_javascript_application`, `capture_browser_scenario` |
| 3 | Community-shared sample `.story` files | `open_binary` archive inventory |
| 4 | ~~Normal use of a trial~~ | **Withdrawn.** Terms §4.1(d) forbid using the services to build a competing product. |
| 5 | Decompiling Storyline (.NET) | **Not allowed.** |

Runtime captures run only on local `file:` copies, or with the player's analytics flag off, so that no
vendor telemetry is sent (finding F-0002).

Every finding goes into `research/FINDINGS.md` with REA Evidence IDs, marked observed, inferred or
unknown. Before any study starts, Articulate's Terms of Service and Acceptable Use Policy are read in
full.

## Build order

| Phase | Deliverable | Rough time |
|---|---|---|
| 0 | Repos, licences, CI building Windows and macOS installers | 1 week |
| 1 | Shared engine: course format, player, SCORM/xAPI/cmi5 export, tested in Moodle | 4–6 weeks |
| 2 | Blocks editor (Rise-like): **first desktop release** | 4–6 weeks (overlaps phase 1) |
| 3 | Server core: accounts, roles, shared projects, live co-editing, Review: **first server release** | 6–8 weeks |
| 4 | Reach: assign, track, reports, certificates, reminders | 6–8 weeks |
| 5 | Slides editor (Storyline-like) | 3–4 months (a second team can start after phase 2) |
| 6 | `.story` import, Translate, AI assistant | 2–3 months |
| 7 | SSO, audit logs, backups, Helm chart | 4–6 weeks |
| 8 | Desktop sync with a company server | to be planned |

## Repositories (planned GitHub organisation)

| Repo | Visibility | Contents |
|---|---|---|
| `studio` | public | Monorepo: engine, desktop app, server, web UI |
| `specs` | public | Clean-room behaviour specs. No vendor code or decompiled output. |
| `research` | **private** | REA evidence and study notes. Build agents never read it. |
| `library` | public | Original templates, characters and icons |
| `test-courses` | public | Sample projects and the conformance corpus |
| `website` | public | Docs and downloads |

## Licences

- Apps, engine and server: **Apache-2.0**
- Course player: **MIT**. It ships inside every published course, so it must not impose obligations on
  companies' content.

## Open decisions

- Product name and GitHub organisation name. The user creates the organisation.
- Code signing: Apple Developer (US$99 a year) and Windows signing (about US$10 a month).
- Level-5 study, after a legal review.
