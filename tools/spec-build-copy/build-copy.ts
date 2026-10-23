// Build copy of the specs (M0-15). Copies the spec Markdown files and replaces every URL, in the
// text and in the Sources sections, with a stable id such as `[url-3f9a1c2b]`, so build agents read
// the specs without links to vendor pages or the course hosts they cite. The id is the start of the
// URL's SHA-256: the same URL gets the same id in every file and in every later copy, and the study
// team can find the URL behind an id by hashing the URLs of the original specs.
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { isEntryPoint } from "../clean-room-guard/guard.ts";

// shortcut: a URL ends at whitespace, quotes, brackets, `|` or `*`, so a URL whose own path holds
// parentheses is cut short; the rest stays as plain text and the host is still removed.
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"'`|*]+/gi;
const TRAILING = /[.,;:!?]+$/;

export const urlId = (url: string) =>
  `url-${createHash("sha256").update(url).digest("hex").slice(0, 8)}`;

/** Replaces every URL in `markdown` with its id, and records each URL in `urls` by id. */
export function replaceUrls(markdown: string, urls = new Map<string, string>()): string {
  return markdown.replace(LINK, (match) => {
    const url = match.replace(TRAILING, "");
    const id = urlId(url);
    const known = urls.get(id);
    // Two URLs with one id would point a reader at the wrong source; refuse rather than guess.
    if (known !== undefined && known !== url) throw new Error(`${known} and ${url} share ${id}`);
    urls.set(id, url);
    return `[${id}]${match.slice(url.length)}`;
  });
}

export const host = (url: string) => /^(?:https?:\/\/)?([^/:?#]+)/i.exec(url)?.[1]?.toLowerCase();

// The real path of `path`, or of its nearest existing parent joined with the rest, so a case
// variant, junction or symlink resolves to the folder it names.
function realPath(path: string): string {
  const full = resolve(path);
  try {
    return realpathSync.native(full);
  } catch (error) {
    const parent = dirname(full);
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || parent === full) throw error;
    return join(realPath(parent), basename(full));
  }
}

// path.relative compares case-insensitively on Windows.
const contains = (outer: string, inner: string) => {
  const rel = relative(outer, inner);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** Copies every `.md` file directly in `from` to `out`, with its URLs replaced. */
export function buildCopy(from: string, out: string) {
  const [realFrom, realOut] = [realPath(from), realPath(out)];
  if (contains(realFrom, realOut) || contains(realOut, realFrom)) {
    throw new Error(
      `--out (${realOut}) and --from (${realFrom}) must not be or contain each other`,
    );
  }
  const files = readdirSync(from)
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length === 0) throw new Error(`No .md files in ${from}`);
  mkdirSync(out, { recursive: true });
  const urls = new Map<string, string>();
  for (const name of files) {
    // Write a new file and rename it into place: writing through an existing `out` file would also
    // change a spec it is hard-linked to, while a rename only replaces the link.
    const target = join(out, name);
    const temp = `${target}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, replaceUrls(readFileSync(join(from, name), "utf8"), urls), {
        flag: "wx",
      });
      renameSync(temp, target);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  return { files, urls };
}

if (isEntryPoint(import.meta)) {
  const { values } = parseArgs({ options: { from: { type: "string" }, out: { type: "string" } } });
  if (!values.from || !values.out) {
    console.error("Usage: pnpm specs:build-copy --from <specs dir> --out <dir>");
    process.exitCode = 1;
  } else {
    const { files, urls } = buildCopy(values.from, values.out);
    const hosts = [...new Set([...urls.values()].map(host))].sort();
    console.log(
      `spec build copy: ${urls.size} distinct URLs replaced in ${files.length} files, ` +
        `written to ${resolve(values.out)}.`,
    );
    // None of these may be on the web allow-list in docs/build-agent-settings.json.
    console.log(`Hosts removed: ${hosts.join(", ")}`);
  }
}
