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

/** A link address the player keeps: web and mail addresses only. */
export const isSafeLink = (href: string): boolean => /^(https?:|mailto:)/i.test(href.trim());
