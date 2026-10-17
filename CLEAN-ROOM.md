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

Levels 1–3 are approved: public docs, courses published on the public web, and community sample files.
Level 4 (using a trial) is **withdrawn**. Articulate's Terms §4.1(d) bar using the Services to build a
competing product, and trials fall under those terms (research finding F-0001). No project member
creates an Articulate account or trial. Level 5 (decompiling) is not allowed. Public docs are read
page by page, never bulk-crawled (AUP §4.2).
