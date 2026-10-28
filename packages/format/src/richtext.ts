// What a RichText fragment may hold (ADR-0002): the elements and link addresses the player shows,
// and so the only ones the editor writes. The player removes anything else from course text, and
// the editor normalises what it writes to the same list.

/** Elements kept, with their content. */
export const RICH_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "del",
  "em",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/** Elements dropped with everything inside them; any other element gives way to its content. */
export const RICH_TEXT_DROPPED: ReadonlySet<string> = new Set([
  "embed",
  "iframe",
  "noscript",
  "object",
  "script",
  "select",
  "style",
  "template",
  "textarea",
  "title",
]);

/** Attributes kept: `lang` and `dir` on any kept element, and `href` on a link to a safe address. */
export const RICH_TEXT_ATTRIBUTES: ReadonlySet<string> = new Set(["lang", "dir"]);

/**
 * A link to a lesson or quiz of the same course, or to one block of it (blocks-editor.md L6, L13,
 * UI-BLOCKS-EDITOR-R33): the player's own address of that page, `#/lessons/<id>`, optionally
 * followed by `/<block id>`.
 */
export const isLessonLink = (href: string): boolean =>
  /^#\/lessons\/[^/?#\s]+(\/[^/?#\s]+)?$/.test(href.trim());

/** The link to lesson or quiz `page`, or to its block `block`: the player's address of it. */
export const lessonLink = (page: string, block?: string): string =>
  `#/lessons/${encodeURIComponent(page)}${block === undefined ? "" : `/${encodeURIComponent(block)}`}`;

/** A link address the player keeps: web and mail addresses, and links to a lesson or a block. */
export const isSafeLink = (href: string): boolean =>
  /^(https?:|mailto:)/i.test(href.trim()) || isLessonLink(href);

/**
 * A relative address a button may go to (blocks-interactions.md 2.10, the schema's RelativeUrl): a
 * path next to the course's page, with no scheme, not starting with `//` (another host), `?` or
 * `#`, and no space, quote, angle bracket or backslash (which browsers read as a slash).
 */
export const RELATIVE_URL_PATTERN =
  "^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!//)[^\\s\\\\'\"<>?#][^\\s\\\\'\"<>]*$";

const RELATIVE_URL = new RegExp(RELATIVE_URL_PATTERN, "u");

/** Whether `href` is a relative address a button may go to (RELATIVE_URL_PATTERN). */
export const isRelativeLink = (href: string): boolean => RELATIVE_URL.test(href);

/**
 * A mail address a button may write to (2.10, the schema's Email): the HTML form's valid e-mail
 * address, with a dot in its domain.
 */
export const EMAIL_PATTERN =
  "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$";

const EMAIL = new RegExp(EMAIL_PATTERN, "u");

/** Whether `address` is a mail address a button may write to (EMAIL_PATTERN), at most 254 long. */
export const isEmail = (address: string): boolean => address.length <= 254 && EMAIL.test(address);

/**
 * A link a setting holds (an image's link, blocks-editor.md 2.10), as a JSON Schema pattern: a
 * web or mail address, or a link to a lesson or a block of one, as isSafeLink allows, with no
 * space in or around it.
 */
export const LINK_PATTERN =
  "^((?:[hH][tT][tT][pP][sS]?://|[mM][aA][iI][lL][tT][oO]:)\\S+|#/lessons/[^/?#\\s]+(/[^/?#\\s]+)?)$";
