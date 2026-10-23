// Licence gate (roadmap M0-04, ADR-0001 "Licences"). Run it with `pnpm check:licences`; add
// `--write` to regenerate the dependency list in THIRD_PARTY_NOTICES.md.
//
// (a) Every workspace package's `license` field matches ADR-0001: MIT for the course-shipped set
//     below, Apache-2.0 for everything else. Course-shipped packages carry their own MIT LICENSE.
// (b) Every production dependency, direct or transitive, has a reviewed licence. GPL, AGPL, SSPL,
//     BUSL, CC-BY-NC and unknown or unreviewed licences fail everywhere. LGPL is accepted in the
//     apps and tools but fails in course-shipped packages, because those ship inside every course.
// (c) The generated block in THIRD_PARTY_NOTICES.md lists every production dependency and repeats
//     any NOTICE file it ships (Apache-2.0 section 4(d)). A stale block fails the check.
//
// Reviewed exceptions live in exceptions.json next to this file, as an array of
//   { "name": "pkg", "licence": "<exact licence string reported>", "inCourses": false,
//     "reason": "who reviewed it, when, and why it is acceptable" }
// `inCourses: false` covers the package only outside course-shipped packages. An exception that no
// longer matches any dependency fails the check, so the list cannot go stale.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// The course-shipped (MIT) set from ADR-0001. Change it only together with the ADR.
const COURSE_SHIPPED = ["packages/format", "packages/player-blocks", "packages/tracking"];

// Accepted everywhere: permissive licences whose only condition is keeping the notice.
const PERMISSIVE = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
]);
const DENIED = /^(A?GPL|SSPL|BUSL|CC-BY-NC)/i; // GPL, AGPL, SSPL, BUSL, CC-BY-NC (any version)
const COURSE_DENIED = /^LGPL/i;

const NOTICES_FILE = "THIRD_PARTY_NOTICES.md";
const START = "<!-- licence-gate:start -->";
const END = "<!-- licence-gate:end -->";

type Installed = { name: string; license: string; paths: string[] };
type Exception = { name: string; licence: string; inCourses: boolean; reason: string };

const root = realpathSync.native(join(import.meta.dirname, "..", ".."));
const write = process.argv.includes("--write");
const problems: string[] = [];

function pnpm(args: string[]): string {
  // pnpm sets npm_execpath for the scripts it runs; calling it directly avoids a shell on Windows.
  const execPath = process.env.npm_execpath;
  if (!execPath) throw new Error("Run this through pnpm: pnpm check:licences");
  const [command, prefix] = /\.[cm]?js$/.test(execPath)
    ? [process.execPath, [execPath]]
    : [execPath, []];
  const run = spawnSync(command, [...prefix, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed:\n${run.stderr}`);
  return run.stdout;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function relativeDir(path: string): string {
  return relative(root, realpathSync.native(path)).split(sep).join("/") || ".";
}

/** Why `licence` is not acceptable, or undefined when it is. */
function rejection(licence: string, inCourses: boolean): string | undefined {
  const tokens = licence.replace(/[()]/g, " ").trim().split(/\s+/);
  const ids = tokens.filter((_, i) => i % 2 === 0);
  const operators = new Set(tokens.filter((_, i) => i % 2 === 1));
  // A plain id, or ids joined only by OR or only by AND. Anything else needs a human review.
  if (
    tokens.length % 2 === 0 ||
    operators.size > 1 ||
    [...operators].some((op) => !/^(OR|AND)$/.test(op))
  ) {
    return `"${licence}" is not a licence expression the gate can judge`;
  }
  const reasons = ids.map((id) => {
    if (DENIED.test(id)) return `${id} is not allowed`;
    if (COURSE_DENIED.test(id))
      return inCourses ? `${id} is not allowed in course-shipped packages` : undefined;
    return PERMISSIVE.has(id) ? undefined : `${id} is not a reviewed licence`;
  });
  return operators.has("OR") && reasons.includes(undefined) ? undefined : reasons.find(Boolean);
}

function scan(filters: string[]): Installed[] {
  const args = [
    ...filters.flatMap((name) => ["--filter", name]),
    "licenses",
    "list",
    "--json",
    "--prod",
  ];
  const output = pnpm(filters.length > 0 ? args : ["-r", ...args]).trim();
  if (output === "No licenses in packages found") return [];
  return Object.values(readJsonText(output) as Record<string, Installed[]>).flat();
}

function readJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected output from pnpm licenses list:\n${text}`);
  }
}

function readExceptions(): Exception[] {
  const file = join(root, "tools", "licence-gate", "exceptions.json");
  const list = readJson(file);
  if (!Array.isArray(list)) throw new Error(`${file} must be a JSON array`);
  return list.filter((entry, i) => {
    const e = entry as Partial<Exception>;
    const valid =
      typeof e.name === "string" &&
      typeof e.licence === "string" &&
      typeof e.inCourses === "boolean" &&
      typeof e.reason === "string" &&
      e.reason.trim() !== "";
    if (!valid)
      problems.push(`exceptions.json entry ${i} needs name, licence, inCourses and a reason`);
    return valid;
  }) as Exception[];
}

// (a) Workspace package licences.
const workspace = readJsonText(pnpm(["ls", "-r", "--json", "--depth", "-1"])) as {
  name: string;
  path: string;
}[];
const dirs = new Map(workspace.map((pkg) => [relativeDir(pkg.path), pkg]));
for (const [dir, pkg] of dirs) {
  const expected = COURSE_SHIPPED.includes(dir) ? "MIT" : "Apache-2.0";
  const { license } = readJson(join(pkg.path, "package.json")) as { license?: unknown };
  if (license !== expected) {
    problems.push(`${dir}: license is ${JSON.stringify(license)}, ADR-0001 requires "${expected}"`);
  }
  const licenceFile = join(pkg.path, "LICENSE");
  const text = existsSync(licenceFile) ? readFileSync(licenceFile, "utf8").trimStart() : "";
  if (expected === "MIT" && !text.startsWith("MIT License")) {
    problems.push(`${dir}: a course-shipped package needs its own MIT LICENSE file`);
  }
  if (dir === "." && !text.startsWith("Apache License")) {
    problems.push("LICENSE at the repository root must be the Apache License 2.0");
  }
}
for (const dir of COURSE_SHIPPED) {
  if (!dirs.has(dir))
    problems.push(`${dir}: listed as course-shipped but is not a workspace package`);
}

// (b) Production dependency licences.
const courseNames = COURSE_SHIPPED.flatMap((dir) => dirs.get(dir)?.name ?? []);
const key = (dep: Installed) => `${dep.name}\u0000${dep.license}`;
const shippedInCourses = new Set((courseNames.length > 0 ? scan(courseNames) : []).map(key));
const dependencies = scan([]);
const exceptions = readExceptions();
const usedExceptions = new Set<Exception>();
for (const dep of dependencies) {
  const inCourses = shippedInCourses.has(key(dep));
  const reason = rejection(dep.license, inCourses);
  if (!reason) continue;
  const exception = exceptions.find(
    (e) => e.name === dep.name && e.licence === dep.license && (e.inCourses || !inCourses),
  );
  if (exception) usedExceptions.add(exception);
  else {
    problems.push(
      `${dep.name} (${dep.license})${inCourses ? ", shipped in courses" : ""}: ${reason}. ` +
        "Remove it, or add a reviewed exception to tools/licence-gate/exceptions.json",
    );
  }
}
for (const e of exceptions) {
  if (!usedExceptions.has(e))
    problems.push(`exceptions.json: ${e.name} (${e.licence}) is no longer needed; remove it`);
}

// (c) THIRD_PARTY_NOTICES.md generated block.
const rows = new Set<string>();
const notices = new Map<string, string>();
for (const dep of dependencies) {
  for (const path of dep.paths) {
    const { version } = readJson(join(path, "package.json")) as { version?: string };
    const id = `${dep.name} ${version ?? "(no version)"}`;
    rows.add(
      `| ${dep.name} | ${version ?? ""} | ${dep.license} | ${shippedInCourses.has(key(dep)) ? "yes" : "no"} |`,
    );
    const noticeFile = ["NOTICE", "NOTICE.md", "NOTICE.txt"]
      .map((f) => join(path, f))
      .find(existsSync);
    if (noticeFile) notices.set(id, readFileSync(noticeFile, "utf8").replace(/\r\n/g, "\n").trim());
  }
}
const block = [
  "",
  "## Production dependencies",
  "",
  "Generated by `pnpm check:licences --write`; do not edit by hand. Each package's own licence text",
  "ships with it.",
  "",
  ...(rows.size === 0
    ? ["There are no third-party production dependencies yet."]
    : [
        "| Package | Version | Licence | Ships in courses |",
        "|---|---|---|---|",
        ...[...rows].sort(),
      ]),
  ...[...notices.keys()]
    .sort()
    .flatMap((id) => ["", `### NOTICE of ${id}`, "", "````text", notices.get(id), "````"]),
  "",
].join("\n");
const noticesPath = join(root, NOTICES_FILE);
const current = readFileSync(noticesPath, "utf8");
const start = current.indexOf(START);
const end = current.indexOf(END);
if (start < 0 || end < start) {
  problems.push(`${NOTICES_FILE}: the ${START} ... ${END} markers are missing`);
} else {
  const next = `${current.slice(0, start + START.length)}\n${block}\n${current.slice(end)}`;
  if (next !== current && write) {
    writeFileSync(noticesPath, next);
    console.log(`Updated ${NOTICES_FILE}.`);
  } else if (next !== current) {
    problems.push(`${NOTICES_FILE} is out of date; run pnpm check:licences --write`);
  }
}

if (problems.length > 0) {
  console.error(`Licence gate failed:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `Licence gate: ${dirs.size} workspace packages, ${dependencies.length} production dependency ` +
    `licence entries (${shippedInCourses.size} in courses), no issues found.`,
);
