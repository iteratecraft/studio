# Running build agents clean-room

Roadmap ids: M0-14 (build-agent configuration) and M0-15 (build copy of the specs). The rules are in
[CLEAN-ROOM.md](../CLEAN-ROOM.md); this page is how a lead sets up a machine so an AI build agent
cannot break them by accident.

A build agent's context must never hold study material. Three things put it there by default on a
machine that also does study work, and each has a control below:

| Leak | Control |
|---|---|
| The REA MCP server, browser-capture tools and study skills are configured for the study sessions | A separate agent configuration, with REA and browser capture denied |
| The private research checkout sits next to `studio` | A build workspace without it, plus deny rules for reading it |
| Specs cite vendor help pages and courses on the web by URL | A build copy of the specs with every URL reduced to an id, plus a web allow-list |

## 1. A build workspace

Build agents work in a folder that holds only what they may read:

```text
C:\build\course-suite\
  studio\   a clone of studio (worktrees go in a sibling wt\ folder)
  specs\    the build copy of the specs (step 3), not a clone of the specs repository
```

There is no research checkout in it, and no clone of the original specs. Because the build copy sits
at `..\specs`, `pnpm report:trace` finds it with no flags.

This is the control that matters. The deny rules in step 2 are a second line: they catch a tool
call, not a determined shell command. A build agent must never be started in a folder that contains
a research checkout.

## 2. A separate agent configuration

Claude Code reads its user settings, MCP servers, skills and memory from its configuration folder.
Pointing build sessions at their own folder means none of the study team's servers, skills or
memory load into them, and nobody's own settings change.

1. Create the folder and copy the example settings into it:

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude-build"
   Copy-Item studio\docs\build-agent-settings.json "$env:USERPROFILE\.claude-build\settings.json"
   ```

   In the copy, replace `//c/REPLACE/WITH/PATH/TO/research` with the real path of every research
   checkout on the machine, in the form `//c/Users/<name>/.../research` (drive letter, forward
   slashes). The relative rules only match from the session's own folder.

2. Start every build session, including the lead session that spawns build agents or workflows,
   with that folder:

   ```powershell
   $env:CLAUDE_CONFIG_DIR = "$env:USERPROFILE\.claude-build"
   cd C:\build\course-suite\studio
   claude
   ```

   Sign in once in that configuration. Subagents and workflow agents inherit the configuration of
   the session that starts them, so a build workflow started from a study session is not clean-room.

3. Do not add the REA server, a browser-capture server or the reverse-engineering skill to this
   configuration. `/mcp` in a build session must not list them.

[`build-agent-settings.json`](build-agent-settings.json) is ready to copy. It:

- turns off bypass-permissions mode (`disableBypassPermissionsMode`), so a session cannot be started
  or switched into a mode that skips these rules;
- blocks the `rea` and `claude-in-chrome` MCP servers (`deniedMcpServers`) and denies their tools
  (`mcp__rea`, `mcp__claude-in-chrome`), in case another settings layer adds them back;
- denies the `reverse-engineer-anything` skill;
- denies reading or editing the research checkout by absolute path (filled in above),
  `../research/**` and any `research` folder under the workspace, and `git clone` /
  `gh repo clone` of a research repository, in Bash and PowerShell;
- denies `WebSearch`, and `WebFetch` on the vendor's domains;
- allows `WebFetch` without asking only on an allow-list: the npm registry, nodejs.org and the
  documentation sites of the tools studio uses (pnpm, Turborepo, TypeScript, Biome, Vitest,
  Playwright).

Build agents get no other web access. A `WebFetch` to any other host asks first, and the answer is
always no: course hosts are never named in studio, so the allow-list is the rule, not a list of
hosts to avoid. Add a host to the allow-list only for the documentation of a dependency, in a
reviewed change. `github.com` is not on it, because a `WebFetch` rule matches a whole domain and
cannot be narrowed to `github.com/iteratecraft`; agents reach iteratecraft repositories with `git`
and `gh`. A shell command such as `curl` is not a `WebFetch` call; that gap is covered by the build
copy and by the rules agents follow, not by settings.

## 3. The build copy of the specs

The study team or the lead makes the build copy from a checkout of the specs repository, outside
any build session:

```powershell
cd <a studio clone outside the build workspace>
pnpm specs:build-copy --from <path to the specs checkout> --out C:\build\course-suite\specs
```

It copies every `.md` file in `--from` and replaces each URL, in rule text and in the Sources
sections, with a stable id such as `[url-3f9a1c2b]`. Source labels (`D7`, `S1`, `E2`) and every other
character stay as they are, so rule numbers, rule tags and spec citations are unchanged. The id is
the start of the URL's SHA-256: the same URL has the same id in every file and in every later copy,
and the study team finds the URL behind an id by hashing the URLs of the original specs. The
command refuses an `--out` that is the `--from` folder, is inside it or holds it, comparing real
paths, so a case variant, junction or symlink cannot get past it. It prints the hosts it removed;
none of them may be on the web allow-list.

It writes each output as a new file and renames it into place, so an `--out` file hard-linked to a
spec is replaced, never written through. It copies only the `.md` files directly in `--from` and
deletes nothing in `--out`, so a spec
removed from the specs stays in an existing build copy: delete `--out` before a refresh. Refresh the
build copy whenever the specs change. Build agents read only the copy.

## Not covered here

- The sandbox settings (`sandbox.filesystem.denyRead`, `sandbox.network.deniedDomains`) would also
  stop shell commands, but they are not in the example: they are untested on Windows and their
  network allow-list would block package installs unless it is tuned. Revisit when macOS and Linux
  join (ADR-0001).
- The settings example has been checked against the published Claude Code settings schema, not in a
  live session. Check in the first live build session that `deniedMcpServers` takes effect outside
  managed settings (the `mcp__` deny rules cover it if not), that the absolute and relative
  `research` rules block a `Read`, that a `WebFetch` to a host off the allow-list asks, and that
  `disableBypassPermissionsMode` refuses `--dangerously-skip-permissions` and hides bypass mode
  from the mode switch.
