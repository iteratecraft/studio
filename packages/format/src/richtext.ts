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
