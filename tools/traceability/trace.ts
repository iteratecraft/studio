// Spec traceability report (M0-06). Maps every numbered behaviour rule in the specs to the tests
// whose title carries its tag: `[rise:R11]` is rule 11 of rise.md, `[teams-collab:R20]` is R20 of
// teams-collab.md. Prints a Markdown report of covered and uncovered rules.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isEntryPoint, repoFiles } from "../clean-room-guard/guard.ts";

export interface SpecRule {
  spec: string;
  id: string;
  text: string;
}

export interface TestTag {
  spec: string;
  id: string;
  /** `path:line` of the tag. */
  where: string;
}

/**
 * Reads the rules under any heading that mentions "rules", up to the next heading of the same or a
 * higher level. A rule is an unindented `12. text` list item, or a `- R12. text` bullet.
 */
export function parseRules(spec: string, markdown: string): SpecRule[] {
  const rules: SpecRule[] = [];
  let sectionLevel = 0; // 0 = outside a rules section
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading?.[1] && heading[2] !== undefined) {
      const level = heading[1].length;
      if (sectionLevel === 0 || level <= sectionLevel) {
        sectionLevel = /\brules\b/i.test(heading[2]) ? level : 0;
      }
      continue;
    }
    if (sectionLevel === 0) continue;
    const item = /^(?:(\d+)|[-*]\s+R(\d+))\.\s+(.*)$/.exec(line);
    if (item) rules.push({ spec, id: `R${Number(item[1] ?? item[2])}`, text: item[3] ?? "" });
  }
  return rules;
}

const TAG = /\[([a-z0-9-]+):R(\d+)\]/g;
export const TEST_FILE = /\.(test|spec|e2e)\.[cm]?[jt]sx?$/;

// shortcut: a tag anywhere in a test file counts, not only inside a test title; parse titles with
// the TypeScript AST if tags start showing up in comments.
export function findTags(file: string, source: string): TestTag[] {
  return source.split(/\r?\n/).flatMap((line, index) =>
    [...line.matchAll(TAG)].map((m) => ({
      spec: m[1] ?? "",
      id: `R${Number(m[2])}`,
      where: `${file}:${index + 1}`,
    })),
  );
}

const cell = (text: string, max = 100) => {
  const short = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return short.replaceAll("|", "\\|");
};

export function buildReport(rules: SpecRule[], tags: TestTag[], emptySpecs: string[] = []): string {
  const key = (spec: string, id: string) => `${spec}:${id}`;
  const testsFor = new Map<string, string[]>();
  for (const tag of tags) {
    const list = testsFor.get(key(tag.spec, tag.id)) ?? [];
    list.push(tag.where);
    testsFor.set(key(tag.spec, tag.id), list);
  }
  const known = new Set(rules.map((r) => key(r.spec, r.id)));
  const specs = [...new Set(rules.map((r) => r.spec))];
  const covered = rules.filter((r) => testsFor.has(key(r.spec, r.id))).length;
  const percent = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const out = [
    "# Spec traceability",
    "",
    `${covered} of ${rules.length} rules covered (${percent(covered, rules.length)}%).`,
    "",
    "| Spec | Rules | Covered | Uncovered |",
    "|---|---|---|---|",
  ];
  for (const spec of specs) {
    const own = rules.filter((r) => r.spec === spec);
    const ok = own.filter((r) => testsFor.has(key(spec, r.id))).length;
    out.push(`| ${spec} | ${own.length} | ${ok} | ${own.length - ok} |`);
  }
  if (emptySpecs.length > 0) out.push("", `No numbered rules found in: ${emptySpecs.join(", ")}.`);

  for (const spec of specs) {
    out.push("", `## ${spec}`, "", "| Rule | Covered by | Rule text |", "|---|---|---|");
    for (const rule of rules.filter((r) => r.spec === spec)) {
      const tests = testsFor.get(key(spec, rule.id));
      out.push(
        `| ${rule.id} | ${tests ? cell(tests.join(", "), 400) : "**uncovered**"} | ${cell(rule.text)} |`,
      );
    }
  }

  const unknown = tags.filter((t) => !known.has(key(t.spec, t.id)));
  if (unknown.length > 0) {
    out.push("", "## Tags that match no spec rule", "");
    for (const tag of unknown) out.push(`- \`[${tag.spec}:${tag.id}]\` at ${tag.where}`);
  }
  return `${out.join("\n")}\n`;
}

if (isEntryPoint(import.meta)) {
  const root = join(import.meta.dirname, "..", "..");
  const { values } = parseArgs({
    options: { specs: { type: "string" }, out: { type: "string" } },
  });
  const specsDir = resolve(values.specs ?? join(root, "..", "specs"));
  if (!existsSync(specsDir) && values.specs) {
    // Only the default location may be absent; a path the caller named must exist.
    console.error(`Spec directory not found: ${specsDir}.`);
    process.exitCode = 1;
  } else if (!existsSync(specsDir)) {
    console.log(
      `Spec directory not found: ${specsDir}. Skipping the traceability report. ` +
        "Pass --specs <dir> to point at a checkout of the specs repository.",
    );
  } else {
    const rules: SpecRule[] = [];
    const emptySpecs: string[] = [];
    for (const name of readdirSync(specsDir)
      .filter((n) => n.endsWith(".md"))
      .sort()) {
      const found = parseRules(name.slice(0, -3), readFileSync(join(specsDir, name), "utf8"));
      if (found.length === 0) emptySpecs.push(name);
      rules.push(...found);
    }
    const tags = repoFiles(root)
      .filter((file) => TEST_FILE.test(file) && existsSync(join(root, file)))
      .flatMap((file) => findTags(file, readFileSync(join(root, file), "utf8")));
    const report = buildReport(rules, tags, emptySpecs);
    if (values.out) writeFileSync(values.out, report);
    else process.stdout.write(report);
  }
}
