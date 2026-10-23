# ADR-0001: Toolchain, monorepo layout and supported platforms

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** project lead (decision D-3 in `ROADMAP.md`)
- **Roadmap / spec ids:** M0-01, M0-02, ENG-01

## Context

`studio` holds the shared engine, the desktop app, the server and the web UI in one repository
(`ARCHITECTURE.md`). Many agent teams work in it at once, so the toolchain must be fast, strict and
the same on every machine. Published courses carry some of our packages inside them, so their licence
must not put obligations on the companies that publish courses.

## Decision

### Toolchain

| Area | Choice | Pinned in |
|---|---|---|
| Runtime | Node.js 24, 24.2 or later (`import.meta.main`) | `.nvmrc` (`24`, latest 24.x), `engines` in `package.json` |
| Package manager | pnpm workspaces | `packageManager` in `package.json`, `pnpm-workspace.yaml` |
| Task runner | Turborepo (`build`, `typecheck`, `test`) | `turbo.json` |
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` | `tsconfig.base.json` |
| Unit tests | Vitest | pnpm `catalog` |
| Lint and format | Biome (one tool, one config) | `biome.json` |
| Browser tests | Playwright | added by M0-03 |
| Desktop installers | electron-builder | added by M0-08 |
| Server | Fastify | added by M0-10 |

- Dependency versions are exact, never ranges. A version shared by several packages lives once in the
  pnpm `catalog` in `pnpm-workspace.yaml`.
- Tools are added by the task that first needs them, not before.
- Every package declares what its code imports, including test libraries such as Vitest:
  `turbo boundaries` rejects an import of an undeclared package. Command-line tools that scripts only
  run and never import (`tsc`, `biome`) are declared once, in the root `package.json`.
- `pnpm lint` runs Biome once over the whole repository from the root, so it also covers root files.
  It is not a Turborepo task and packages have no `lint` script.
- **Biome instead of ESLint + Prettier.** It lints and formats with one dependency and one config file,
  and it does not need the TypeScript compiler API, which TypeScript 7 no longer offers as a stable
  interface. We give up ESLint's type-aware rules; `tsc` strict mode covers most of that ground.
- `"agentGuidance": false` in `turbo.json` keeps Turborepo from rewriting our `AGENTS.md`.
- **Turborepo telemetry is off for this project.** `turbo.json` has no setting for it, so CI (M0-03) sets
  `TURBO_TELEMETRY_DISABLED=1` in its environment. Contributors set the same variable in their own
  shell; we do not ask anyone to change machine-wide settings.

### Supported platforms, in rollout order

1. **Windows 10 and 11, x64.** The only supported OS until it is solid: the only one built, tested and
   supported for now.
2. **macOS 13 or later** (arm64 and x64).
3. **Linux** (Ubuntu 22.04 or later).

Code stays cross-platform from the start so the later platforms need no rewrite:

- Build paths with `path.join` / `path.resolve`, never by concatenating `/` or `\`.
- No shell-specific scripts: package scripts call Node tools directly; anything more is a Node script.
- Line endings are LF in the repository on every OS (`.gitattributes`, `.editorconfig`, Biome).

### Layout

```text
packages/format          course format                        MIT
packages/player-blocks   Blocks player runtime                MIT
packages/tracking        SCORM / xAPI / cmi5 runtime          MIT
packages/exporters       builds course packages               Apache-2.0
packages/ui              shared React UI for the apps         Apache-2.0
apps/desktop             Electron app                         Apache-2.0
apps/server              self-hosted server                   Apache-2.0
apps/web                 browser app                          Apache-2.0
tools/                   repository tooling and its tests     Apache-2.0
docs/adr/                architecture decision records
```

### Dependency direction

```text
format  <-  engine packages  <-  ui  <-  apps
            (player-blocks, tracking, exporters)
```

A package may import only from layers to its left. Engine packages may import each other. Apps never
import other apps. No package imports a file outside its own directory; it imports other packages by
name.

The direction is enforced by `pnpm check:deps`, which runs `turbo boundaries`. Each package's
`turbo.json` carries one layer tag (`format`, `engine`, `ui` or `app`), and the root `turbo.json`
lists which tags each layer may depend on. `tools/check-deps/check-deps.test.ts` proves the check fails
on each kind of forbidden import, and that every package carries exactly one layer tag.
`turbo boundaries` is marked experimental; if it changes or goes away, a script in `tools/` replaces it
and the same tests keep it honest.

**Known gap:** `turbo boundaries` checks specifiers it can read in the source. A package loaded at
run time through `createRequire(import.meta.url)("...")`, or through `import()` with a computed
specifier, gets past the check. Reviewers reject these in `packages/*` and `apps/*`
unless the target is declared and allowed for that layer.

### Licences

- **Every package shipped inside a published course is MIT:** today `format`, `player-blocks` and
  `tracking`; later also the learner labels, theme tokens, media player and slide runtime, each as its
  own package. MIT package folders carry their own `LICENSE`.
- **Everything else is Apache-2.0** (root `LICENSE`).
- An MIT package may depend only on other MIT packages. Its `turbo.json` carries the `mit` tag, which
  `check:deps` enforces, and the tests check that the tag matches the `license` field.
- Anything that ships in a course, such as theme tokens, goes in an MIT package, never in `ui`.

## Consequences

- One install (`pnpm install`) and one set of commands work from a clean clone.
- Adding a package means adding its `turbo.json` layer tag, or the tests fail.
- Only Windows is verified until the lead moves the rollout on; macOS and Linux bugs are accepted
  until then, but code that is Windows-only by construction is not.
- Follow-ups: CI (M0-03), the licence gate that scans built contents (M0-04), clean-room and trademark
  guards (M0-05).

## Alternatives considered

- **npm or Yarn workspaces:** pnpm is faster and its strict `node_modules` catches undeclared imports.
- **Nx:** more features than we need; Turborepo is smaller and caches the same tasks.
- **ESLint + Prettier:** two tools, several plugins and configs; see the Biome note above.
- **Jest:** needs extra transform setup for TypeScript and ESM, which Vitest handles out of the box.
- **A hand-written import checker:** `turbo boundaries` already covers imports, undeclared
  dependencies and files outside the package, in a dependency we have anyway.
