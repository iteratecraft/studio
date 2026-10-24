// Post-build scan for outbound URLs (ADR-0004): a package may load its own files, the LMS or LRS
// supplied at launch and endpoints the author configured, and nothing else. This finds absolute and
// protocol-relative URLs written in the package's text files and reports every one not allowed.
//
// shortcut: a text scan, so a URL assembled at run time or encoded (for example in base64) passes;
// the no-network browser tests (M1-30) catch what the package actually requests.
import type { Problem } from "./result.js";

/** Files a browser reads as text. Media and fonts are skipped. */
const TEXT = /\.(?:html?|xhtml|js|mjs|cjs|css|json|svg|xml|txt|vtt|webmanifest)$/i;
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

/** One problem per file and URL that is neither allowed nor a namespace name. */
export function findOutboundUrls(
  files: Iterable<readonly [string, Uint8Array]>,
  allowed: readonly string[],
): Problem[] {
  const permitted = [...NAMESPACE_URIS, ...allowed];
  const problems: Problem[] = [];
  for (const [path, data] of files) {
    if (!TEXT.test(path)) continue;
    for (const url of new Set(urlsIn(utf8.decode(data)))) {
      if (isAllowed(url, permitted)) continue;
      problems.push({
        file: path,
        message: `names '${url}', which is not the package, the LMS or an address the author configured (ADR-0004)`,
      });
    }
  }
  return problems;
}
