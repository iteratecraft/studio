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
| oEmbed endpoint of the media host | Title, thumbnail and embed code for a pasted media link | Only when the author pastes or refreshes a link | Setting "Fetch link details"; when off, the author enters embed code by hand |
| Web font catalogue | List and download fonts the author picks; they are then stored in the project and shipped in the package | Only when the author opens the catalogue or picks a font | Setting "Online fonts"; system, bundled and uploaded fonts still work |
| AI providers (own key, company key or local model) | Writing help, translation, generation | Only on an author's AI action, and only once a provider is configured | No provider is configured by default; removing it turns AI off |
| Company server (publish, sync; ENG-41, M8) | Publish and sync projects | Only after the author signs in to a server URL | Sign out |

- **No telemetry by default.** Opt-in telemetry, if ever wanted, needs a new ADR.
- Preview may load third-party media that the author embedded; that is the author's own content.
- A new destination needs a row here, with purpose and off switch, before its code is merged.
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
