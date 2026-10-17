# Clean-room rules

This project rebuilds the *behaviour* of commercial e-learning tools. It never copies their code,
assets or text.

## Two roles that never mix

| | Study team | Build team |
|---|---|---|
| Works in | `research` (private) and `specs` | `studio` and the other public repos |
| May use REA | yes | **no** |
| May read decompiled or vendor code | only at an approved study level | **never** |
| Produces | Specs in plain language: what happens, when, with which inputs | Original code that meets the specs |

AI agents count as people here. A build agent's context must never include files from `research`.

## Specs must contain

- Behaviour, rules, formats and observable results, each with its source: a public doc URL, an open
  standard, or an REA Evidence ID kept in `research`.
- No vendor source or decompiled code, no copied help text, and no vendor images, templates,
  characters or icons.

## Never

- Bypass licence checks, DRM, encryption or sign-in.
- Connect to the vendor's servers except through normal use of a legitimately obtained account.
- Use vendor trademarks in product names, UI or marketing beyond "compatible with" statements.
- Ship vendor content-library assets.

## Allowed study levels

Levels 1–4 are approved (public docs, published public courses, community sample files, normal use
of a trial). Level 5 (decompiling) needs a separate, written decision.
