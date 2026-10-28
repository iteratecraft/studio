# ADR-0004: Outbound connections from the player and the editor

- **Status:** Proposed
- **Date:** 2026-10-23
- **Deciders:** project lead (accepts on merge)
- **Roadmap / spec ids:** M1-01b, M1-30, M2 exit (editor network assertions); rise.md §4 "Published
  web package"; storyline.md §4 "Published web package"

## Context

Published courses run on networks we do not control, often for employers with strict rules about where
learner data goes. The specs expect a package to load only its own files unless the author embeds
third-party media (rise.md §4 "Published web package"), and our player sends no telemetry by default
(storyline.md §4 "Published web package"). The editor has legitimate reasons to go online, so each one
must be listed, explained and switchable.

## Decision

### Player (everything inside a published course)

The player connects to nothing except:

1. **The package itself:** its own files, by relative path.
2. **The launch endpoint:** the LMS API the launch frame provides, or the LRS endpoint and cmi5 fetch
   URL supplied at launch.
3. **Endpoints the author configured:** an LRS set in the publish settings, embedded third-party media
   and web content, and later the learner tutor endpoint (M6b). A link the learner clicks opens a
   page; it is navigation, not a background connection.

No telemetry, analytics, error reporting, update checks, font services or CDNs: fonts and libraries
ship inside the package. M1-30 tests every output and fails on any request outside this list.

### Editor (desktop app and browser app)

| Destination | Purpose | When it connects | Off switch |
|---|---|---|---|
| Update check (GitHub Releases) | Offer new desktop versions | At start and once a day, desktop only | Setting "Check for updates"; an admin policy file can force it off |
| ~~oEmbed endpoint of the media host~~ | None: by D-44 the editor matches a pasted link against a short built-in provider list and calls no lookup service (`packages/blocks-editor/src/embed.ts`) | Never | n/a |
| Media converter download (GitHub Releases: the pinned build's own release, then this repository's mirror of it, D-43, D-49) | The pinned LGPL FFmpeg build that converts audio and video that is not web-ready (`apps/desktop/src-tauri/media-tool.json`) | Desktop only, once, after the author agrees when they first add such a file; the download is checked by SHA-256 | Answer "Not now": nothing is downloaded and the file is not added; web-ready files never need it |
| WebView2 bootstrapper (Microsoft: `https://go.microsoft.com/fwlink/p/?LinkId=2124703`, then Microsoft's download servers; M2-19) | The desktop installer (`webviewInstallMode` `downloadBootstrapper` in `apps/desktop/src-tauri/tauri.conf.json`) fetches Microsoft's WebView2 bootstrapper, which installs the WebView2 runtime the app's window is drawn with | Only while installing, and only on a machine without the WebView2 runtime (Windows 11 and an up-to-date Windows 10 have it); the app itself never fetches it. Once installed, Windows keeps the runtime up to date, not Course Suite | Install the WebView2 runtime first (Microsoft's standalone installer, for example by an administrator), and the installer connects nothing. For closed networks, an installer built with Tauri's `offlineInstaller` mode carries the whole runtime (about 127 MB more) and connects nothing; `embedBootstrapper` (about 1.8 MB more) skips the bootstrapper download, but the bootstrapper still downloads the runtime from Microsoft |
| Web font catalogue | List and download fonts the author picks; they are then stored in the project and shipped in the package | Only when the author opens the catalogue or picks a font | Setting "Online fonts"; system, bundled and uploaded fonts still work |
| AI providers (own key, company key or local model) | Writing help, translation, generation | Only on an author's AI action, and only once a provider is configured | No provider is configured by default; removing it turns AI off |
| Company server (publish, sync; ENG-41, M8) | Publish and sync projects | Only after the author signs in to a server URL | Sign out |

- **No telemetry by default.** Opt-in telemetry, if ever wanted, needs a new ADR.
- Preview may load third-party media that the author embedded; that is the author's own content.
  (M2-13: the desktop app's preview shows where an embed plays without loading it, as its content
  security policy allows no third-party frame.)
- An embed in a published course loads its provider's frame only when the learner asks for it
  (D-44); until then the package requests nothing from outside (M1-30 tests every output with an
  embed in it).
- A new destination needs a row here, with purpose and off switch, before its code is merged. Known
  rows still to come with their tasks: the stock media library searched from the editor (rise.md §3 C
  "Block library").
- The server edition's own outbound connections (mail, single sign-on, webhooks) are added to this ADR
  by ENG-39 before Server 0.1.

## Consequences

- Courses work on closed networks and from disk, and the destination list is the answer to an
  employer's security questionnaire.
- Packages carry their own fonts and libraries, so they are larger than CDN-based ones.
- Follow-ups: no-network tests for every output (M1-30); editor network assertions in the M2 exit;
  settings and the admin policy file in the desktop app (M2).

## Alternatives considered

- **Opt-out telemetry:** unacceptable to many employers and against the spec's default.
- **Hosted fonts and libraries in the player:** breaks courses offline and on closed networks, and sends
  learner traffic to third parties.
- **No editor network access at all:** loses updates, link details, online fonts and AI, which authors
  expect; each is off-switchable instead.
