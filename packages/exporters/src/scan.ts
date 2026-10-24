// Post-build scan for outbound URLs (ADR-0004): a package may load its own files, the LMS or LRS
// supplied at launch and endpoints the author configured, and nothing else. The player's own pages,
// scripts and styles are read in full; media and other markup only for what a browser loads from
// them, since namespace names, metadata and text in an SVG or caption file are never fetched.
//
// shortcut: a text scan, so a URL assembled at run time or encoded (for example in base64) passes;
// the no-network browser tests (M1-30) catch what the package actually requests.
import type { Problem } from "./result.js";

/** The player's pages, scripts and styles: every URL written in them counts. */
const CODE = /\.(?:html?|xhtml|js|mjs|cjs|css)$/i;
/** Markup and styles a browser loads further files from. Captions, text and binary media load nothing. */
const MARKUP = /\.(?:html?|xhtml|svg|xml|css)$/i;
const ABSOLUTE = /\b(?:https?|wss?|ftp):\/\/[^\s"'`<>()[\]{}\\]+/gi;
// `//host/...` only where markup or CSS loads it; elsewhere it is far more often a comment.
const PROTOCOL_RELATIVE =
  /(?:\b(?:src|href|action|poster|srcset|data)\s*=\s*["']?|\burl\(\s*["']?|@import\s+["'])(\/\/[^\s"'`<>()\\]+)/gi;
const TRAILING = /[.,;:!?]+$/;

/** XML and DOM namespace names: identifiers that player code uses, never fetched. */
export const NAMESPACE_URIS: readonly string[] = [
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/XML/1998/namespace",
  "http://www.w3.org/2000/xmlns/",
];

/** Every absolute or protocol-relative URL in `text`, in order of appearance. */
export function urlsIn(text: string): string[] {
  const found: [number, string][] = [];
  for (const match of text.matchAll(ABSOLUTE)) found.push([match.index, match[0]]);
  for (const match of text.matchAll(PROTOCOL_RELATIVE)) {
    found.push([match.index, match[1] ?? ""]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, url]) => url.replace(TRAILING, ""));
}

const TAG = /<\??([\w.:-]+)([^>]*)>/g;
const LOAD_ATTRIBUTE = /\s(?:[\w.-]+:)?(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CSS_LOAD =
  /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;
const EXTERNAL = /^(?:(?:https?|wss?|ftp):)?\/\//i;

/**
 * Every absolute or protocol-relative URL a browser would fetch for markup or CSS: `href`,
 * `xlink:href` and `src` values (not on links, which are navigation, ADR-0004), `url()` and `@import`.
 * `xmlns:*` declarations, metadata and text content are never fetched, so they are not read.
 */
export function loadsIn(text: string): string[] {
  const values: (string | undefined)[] = [];
  for (const [, name = "", attributes = ""] of text.matchAll(TAG)) {
    if (/^(?:[\w.-]+:)?a$/i.test(name)) continue;
    for (const match of attributes.matchAll(LOAD_ATTRIBUTE)) values.push(match[1] ?? match[2]);
  }
  for (const match of text.matchAll(CSS_LOAD))
    values.push(match.slice(1).find((v) => v !== undefined));
  return values.map((value) => (value ?? "").trim()).filter((value) => EXTERNAL.test(value));
}

/** True when `url` is `allowed` or lies under it (the next character starts a path, query or fragment). */
export function isAllowed(url: string, allowed: readonly string[]): boolean {
  return allowed.some(
    (prefix) =>
      url === prefix ||
      (url.startsWith(prefix) &&
        (prefix.endsWith("/") || /^[/?#]$/.test(url[prefix.length] ?? ""))),
  );
}

const utf8 = new TextDecoder("utf-8");

const SCRIPT_OR_PAGE = /\.(?:html?|xhtml|js|mjs|cjs)$/i;
const MODULE_CODE: [RegExp, string][] = [
  [/<script\b[^>]*\btype\s*=\s*["']?module\b/i, "a module script tag"],
  [/\bimport\s*\(/, "import("],
  [/\bimport\.meta\b/, "import.meta"],
];

/**
 * One problem per page or script that uses module loading, which Chromium blocks under `file://`
 * (ADR-0003: shipped code is classic scripts only).
 */
export function findModuleCode(files: Iterable<readonly [string, Uint8Array]>): Problem[] {
  const problems: Problem[] = [];
  for (const [path, data] of files) {
    if (!SCRIPT_OR_PAGE.test(path)) continue;
    const text = utf8.decode(data);
    for (const [pattern, what] of MODULE_CODE) {
      if (pattern.test(text)) {
        problems.push({
          file: path,
          message: `uses ${what}; a package ships classic scripts only, so it opens from disk (ADR-0003)`,
        });
      }
    }
  }
  return problems;
}

/**
 * One problem per file and URL that is neither allowed nor a namespace name. Files in `media` (the
 * course's media) are read only for what a browser loads from them, never in full.
 */
export function findOutboundUrls(
  files: Iterable<readonly [string, Uint8Array]>,
  allowed: readonly string[],
  media: ReadonlySet<string> = new Set(),
): Problem[] {
  const permitted = [...NAMESPACE_URIS, ...allowed];
  const problems: Problem[] = [];
  for (const [path, data] of files) {
    const scan =
      CODE.test(path) && !media.has(path) ? urlsIn : MARKUP.test(path) ? loadsIn : undefined;
    if (scan === undefined) continue;
    for (const url of new Set(scan(utf8.decode(data)))) {
      if (isAllowed(url, permitted)) continue;
      problems.push({
        file: path,
        message: `names '${url}', which is not the package, the LMS or an address the author configured (ADR-0004)`,
      });
    }
  }
  return problems;
}
