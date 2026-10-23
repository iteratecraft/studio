// Clean-room and trademark guard (M0-05). Rejects files that point at the private research
// repository, use vendor trademarks outside docs, or look like a vendor player bundle. The rules,
// their allow-list and sample violations live in clean-room.config.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Scan = "content" | "path" | "both";

export interface Rule {
  id: string;
  description: string;
  scan: Scan;
  patterns: string[];
  examples: { content?: string[]; path?: string[] };
}

export interface Config {
  rules: Rule[];
  allow: { rule: string; path: string; reason: string }[];
  allowText: { rule: string; pattern: string; reason: string }[];
}

export interface Finding {
  path: string;
  /** 0 when the file path itself matched. */
  line: number;
  rule: string;
  match: string;
}

/** Repository-relative, with forward slashes, as git prints it. */
export const CONFIG_PATH = "tools/clean-room-guard/clean-room.config.json";
const SCANS: readonly Scan[] = ["content", "path", "both"];

export function loadConfig(root: string): Config {
  const config = JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8")) as Config;
  const ids = new Set(config.rules.map((rule) => rule.id));
  // A malformed rule would silently check nothing, so refuse it.
  for (const rule of config.rules) {
    if (!SCANS.includes(rule.scan)) throw new Error(`${rule.id}: scan must be one of ${SCANS}`);
    if (rule.patterns.length === 0) throw new Error(`${rule.id}: needs at least one pattern`);
  }
  for (const entry of [...config.allow, ...config.allowText]) {
    if (!ids.has(entry.rule)) throw new Error(`allow-list names unknown rule "${entry.rule}"`);
    if (!entry.reason) throw new Error(`allow-list entry for "${entry.rule}" needs a reason`);
  }
  return config;
}

function firstMatch(patterns: RegExp[], text: string): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return undefined;
}

/** Checks the given repository-relative paths under `root`. */
export function checkFiles(root: string, paths: string[], config: Config): Finding[] {
  const rules = config.rules.map((rule) => ({
    ...rule,
    regexes: rule.patterns.map((pattern) => new RegExp(pattern, "i")),
    allowPaths: config.allow.filter((a) => a.rule === rule.id).map((a) => new RegExp(a.path)),
    allowText: config.allowText
      .filter((a) => a.rule === rule.id)
      .map((a) => new RegExp(a.pattern, "gi")),
  }));
  const findings: Finding[] = [];

  for (const path of paths) {
    if (path === CONFIG_PATH) continue; // the config has to name what it forbids
    const active = rules.filter((rule) => !rule.allowPaths.some((allow) => allow.test(path)));

    for (const rule of active.filter((r) => r.scan !== "content")) {
      const match = firstMatch(rule.regexes, path);
      if (match) findings.push({ path, line: 0, rule: rule.id, match });
    }

    const contentRules = active.filter((rule) => rule.scan !== "path");
    if (contentRules.length === 0) continue;
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(root, path));
    } catch (error) {
      // Deleted in the working tree but still in the index: nothing left to scan.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    // shortcut: binary files get path rules only; scan their strings if a vendor binary slips past.
    if (bytes.subarray(0, 8000).includes(0)) continue;

    bytes
      .toString("utf8")
      .split(/\r?\n/)
      .forEach((text, index) => {
        for (const rule of contentRules) {
          const visible = rule.allowText.reduce((line, allow) => line.replace(allow, " "), text);
          const match = firstMatch(rule.regexes, visible);
          if (match) findings.push({ path, line: index + 1, rule: rule.id, match });
        }
      });
  }
  return findings;
}

/** Tracked files plus new files git does not ignore, so a local run also sees uncommitted work. */
export function repoFiles(root: string): string[] {
  const args = ["ls-files", "-z", "--cached", "--others", "--exclude-standard"];
  const output = execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  return output.split("\0").filter(Boolean);
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "..");
  const config = loadConfig(root);
  const files = repoFiles(root);
  const findings = checkFiles(root, files, config);
  const describe = new Map(config.rules.map((rule) => [rule.id, rule.description]));
  for (const f of findings) {
    const where = f.line ? `${f.path}:${f.line}` : f.path;
    console.error(`${where}: [${f.rule}] "${f.match}". ${describe.get(f.rule)}`);
  }
  if (findings.length > 0) {
    console.error(
      `\nclean-room guard: ${findings.length} finding(s) in ${files.length} files. Remove them, or ` +
        `add an allow entry with a reason to ${CONFIG_PATH}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`clean-room guard: ${files.length} files checked, no findings.`);
  }
}
