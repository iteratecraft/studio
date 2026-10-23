import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildReport, findTags, parseRules } from "./trace.ts";

// The two rule formats the specs use: a numbered list, and `- R1.` bullets.
const NUMBERED = `# Spec: demo

## 3. Feature inventory

1. A feature, not a rule.

## 5. Behaviour rules worth matching exactly

**Group label**
1. First rule. [doc D1]
2. Second rule
   continues here.
    3. An indented line is not a rule.
10. Tenth rule | with a pipe.

---

## 6. Server needs

4. Not a rule either.
`;

const BULLETS = `# Spec: team

## 5. Behaviour rules

- R1. **Bold** first rule.
- R20. Twentieth rule.

### A subsection

- R21. Still inside, because a deeper heading does not end the section.

## 6. Next
- R22. Outside.
`;

// Built at run time so the real report does not list this file's sample tags as unknown.
const tag = (spec: string, id: string) => `[${spec}:${id}]`;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe("parseRules", () => {
  test("reads numbered rules only inside the rules section", () => {
    expect(parseRules("demo", NUMBERED)).toEqual([
      { spec: "demo", id: "R1", text: "First rule. [doc D1]" },
      { spec: "demo", id: "R2", text: "Second rule" },
      { spec: "demo", id: "R10", text: "Tenth rule | with a pipe." },
    ]);
  });

  test("reads R-numbered bullets up to the next heading of the same level", () => {
    expect(parseRules("team", BULLETS).map((r) => r.id)).toEqual(["R1", "R20", "R21"]);
  });

  test("finds nothing in a spec without a rules section", () => {
    expect(parseRules("readme", "# specs\n\n1. Not a rule.\n")).toEqual([]);
  });
});

describe("findTags", () => {
  test("finds every tag with its line", () => {
    const source = `test("${tag("demo", "R1")} first");\ntest("${tag("demo", "R02")}${tag("team", "R20")} both");`;
    expect(findTags("a.test.ts", source)).toEqual([
      { spec: "demo", id: "R1", where: "a.test.ts:1" },
      { spec: "demo", id: "R2", where: "a.test.ts:2" },
      { spec: "team", id: "R20", where: "a.test.ts:2" },
    ]);
  });
});

describe("buildReport", () => {
  const rules = [...parseRules("demo", NUMBERED), ...parseRules("team", BULLETS)];
  const tags = findTags(
    "a.test.ts",
    [tag("demo", "R1"), tag("team", "R20"), tag("team", "R99")].join(" "),
  );
  const report = buildReport(rules, tags, ["README.md"]);

  test("summarises coverage per spec", () => {
    expect(report).toContain("2 of 6 rules covered (33%).");
    expect(report).toContain("| demo | 3 | 1 | 2 |");
    expect(report).toContain("| team | 3 | 1 | 2 |");
    expect(report).toContain("No numbered rules found in: README.md.");
  });

  test("lists each rule as covered or uncovered, escaping table pipes", () => {
    expect(report).toContain("| R1 | a.test.ts:1 | First rule. [doc D1] |");
    expect(report).toContain("| R2 | **uncovered** | Second rule |");
    expect(report).toContain("| R10 | **uncovered** | Tenth rule \\| with a pipe. |");
  });

  test("lists tags that match no rule", () => {
    expect(report).toContain(`- \`${tag("team", "R99")}\` at a.test.ts:1`);
  });
});

describe("report:trace", () => {
  const script = join(import.meta.dirname, "trace.ts");
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

  test("skips with a clear message when the specs are absent", { timeout: 30_000 }, () => {
    const result = run("--specs", join(tmpdir(), "no-such-specs-dir"));
    expect(result.stdout).toContain("Spec directory not found");
    expect(result.status).toBe(0);
  });

  test("writes the report for a specs directory", { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-"));
    dirs.push(dir);
    writeFileSync(join(dir, "team.md"), BULLETS);
    writeFileSync(join(dir, "README.md"), "# specs\n");
    const out = join(dir, "report.md");
    const result = run("--specs", dir, "--out", out);
    expect(result.status).toBe(0);
    const report = readFileSync(out, "utf8");
    expect(report).toContain("| team | 3 |");
    expect(report).toContain("No numbered rules found in: README.md.");
  });
});
