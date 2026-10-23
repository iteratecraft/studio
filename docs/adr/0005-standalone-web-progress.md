# ADR-0005: Learner progress in standalone web output

- **Status:** Proposed (records the default of decision D-6; the project lead confirms before M1-17)
- **Date:** 2026-10-23
- **Deciders:** project lead
- **Roadmap / spec ids:** D-6, M1-17; rise.md §4 "Published web package"; storyline.md §4 "Learner
  resume data"

## Context

Web output is a course published without an LMS, opened from disk or a plain web server. The two apps
behave differently there in the specs:

- **Blocks:** if no parent frame offers an LMS interface, the course keeps nothing (rise.md §4
  "Published web package").
- **Slides:** resume data goes to the LMS when one is present, otherwise to browser local storage, with
  cookies as the fallback (storyline.md §4 "Learner resume data").

## Decision

Follow the specs, per app:

- **Blocks web output keeps no progress outside an LMS.** No local storage, session storage, IndexedDB
  or cookies; every visit starts fresh.
- **Slides web output may resume from browser storage** when no LMS is present, as the spec describes.
  Only the player's loader touches storage, and only for resume data.

## Consequences

- Blocks web output stores nothing on the learner's device, which keeps it simple for privacy reviews.
- Learners of long Blocks courses published as plain web output lose their place between visits;
  authors who need resume publish to an LMS standard.
- Follow-ups: Blocks web output profile (M1-17) and its test that storage stays empty; Slides web
  resume and its storage-key and size rules (M5b).

## Alternatives considered

- **Browser storage for both apps:** departs from the Blocks spec and leaves learner data on shared
  machines.
- **No storage for either app:** departs from the Slides spec and breaks resume for slide courses
  shared as plain web pages.
