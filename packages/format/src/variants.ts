// The settings of the text and static block variants (BLK-04; rise.md 3C; blocks-editor.md 2.5,
// 2.7 to 2.11, 2.14): for each variant, the `variantSettings` it may hold, with the schema of each
// setting and its default. This closes `variantSettings` for these variants (ADR-0002, "Schema
// dialect"); the variants of other categories stay open until their own epics define them.
// Sibling variants that the editor switches between share one table, so a switch keeps every
// setting valid (UI-BLOCKS-EDITOR-R25). The validator checks documents against these tables and the
// player and the editor read settings through `variantSettings`, so the defaults live here only.
import type { Block, ContentItem } from "./course.js";
import { LINK_PATTERN } from "./richtext.js";

/** One setting: its JSON Schema (the subset the validator knows) and the value it has when unset. */
export interface Setting {
  schema: { readonly [keyword: string]: unknown };
  default?: unknown;
}

// The schemas carry no descriptions: the player ships these tables in every course, so what each
// setting means is said in a comment instead.
const int = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const choice = (...values: string[]) => ({ enum: values });
const FLAG = { type: "boolean" };
const COLOR = { $ref: "#/$defs/Color" };
/** Text on a colour: automatic keeps 4.5:1, or fixed light or dark. */
const CONTRAST = choice("auto", "light", "dark");
const SIZE = choice("small", "medium", "large");
const PIXELS = int(0, 100);

const TEXT: Record<string, Setting> = {
  // Level of the heading element; unset, 2 for headings and 3 for subheadings.
  headingLevel: { schema: int(2, 6) },
  // Columns the body text flows in.
  columns: { schema: int(1, 3), default: 1 },
  // Space after the heading, in pixels.
  headingSpace: { schema: PIXELS, default: 12 },
};

const COLUMNS: Record<string, Setting> = {
  // Columns shown, one item each; the items past them are kept, out of sight.
  columns: { schema: int(2, 4), default: 2 },
  // A picture above the text of each column, which learners may enlarge.
  images: { schema: FLAG, default: false },
  zoom: { schema: FLAG, default: true },
};

const TABLE: Record<string, Setting> = {
  // Space inside each cell.
  cellPadding: { schema: SIZE, default: "medium" },
};

const STATEMENT: Record<string, Setting> = {
  // The rule of the looks that have one (C and D): shown, its thickness and the space around it.
  divider: { schema: FLAG, default: true },
  dividerSize: { schema: int(1, 10), default: 3 },
  dividerSpace: { schema: PIXELS, default: 16 },
  // A note's size, colour (unset: the accent tint) and text on it, icon (built in, or the
  // block's own SVG in `media`) and its colour, and corner rounding in pixels.
  noteSize: { schema: SIZE, default: "medium" },
  noteColor: { schema: COLOR },
  noteContrast: { schema: CONTRAST, default: "auto" },
  noteIcon: { schema: FLAG, default: true },
  noteIconColor: { schema: COLOR },
  cornerRadius: { schema: int(0, 30), default: 4 },
};

const QUOTE: Record<string, Setting> = {
  // The photo of the person quoted (the item's `media`, 1:1) and its size in pixels.
  avatar: { schema: FLAG, default: true },
  avatarSize: { schema: int(32, 160), default: 64 },
  // The quotation mark of the looks that have one, a rule above the name, its thickness in
  // pixels, and the space above the name.
  quoteIcon: { schema: FLAG, default: true },
  divider: { schema: FLAG, default: false },
  dividerSize: { schema: int(1, 10), default: 3 },
  quoteSpace: { schema: PIXELS, default: 16 },
  // Quote on an image: alignment, and the colour laid over the image at an opacity in percent.
  align: { schema: choice("left", "center", "right"), default: "center" },
  overlay: { schema: COLOR, default: "#000000" },
  overlayOpacity: { schema: int(0, 100), default: 50 },
  // Quote carousel (our own option, rise.md open question 7): the look of every quote in it.
  look: { schema: choice("a", "b", "c", "d"), default: "a" },
};

const LIST: Record<string, Setting> = {
  // Space between a number, bullet or box and its text, in pixels.
  markerSpace: { schema: int(0, 60), default: 12 },
  // Colour of the numbers, bullets and boxes (unset: the accent), and of a number's text on it.
  markerColor: { schema: COLOR },
  markerContrast: { schema: CONTRAST, default: "auto" },
  // First number of a numbered list.
  start: { schema: int(0, 9999), default: 1 },
};

const IMAGE: Record<string, Setting> = {
  // Learners can enlarge the picture; rounding of its corners in pixels.
  zoom: { schema: FLAG, default: true },
  cornerRadius: { schema: int(0, 30), default: 0 },
  // Image beside text: the picture's side and size.
  position: { schema: choice("left", "right"), default: "left" },
  size: { schema: SIZE, default: "medium" },
  // Text on an image: the colour laid over the picture, at an opacity in percent.
  overlay: { schema: COLOR, default: "#000000" },
  overlayOpacity: { schema: int(0, 100), default: 50 },
  // Where the picture links to: a web page or a lesson of the course (2.10); unset, no link. A
  // linked picture opens its link instead of enlarging.
  link: { schema: { type: "string", pattern: LINK_PATTERN } },
};

const GALLERY: Record<string, Setting> = {
  zoom: { schema: FLAG, default: true },
  cornerRadius: { schema: int(0, 30), default: 0 },
};

const DIVIDER: Record<string, Setting> = {
  // A numbered divider counts on from the one above it, or starts again at its own number.
  restart: { schema: FLAG, default: false },
  start: { schema: int(1, 999), default: 1 },
};

/** D-24: the continue block's settings, as the reference courses use them. */
const CONTINUE: Record<string, Setting> = {
  // What the button waits for, its own label and the hint while it waits.
  completionType: { schema: choice("none", "block-above", "all-above"), default: "none" },
  buttonLabel: { schema: { type: "string" } },
  hintText: { schema: { type: "string" } },
};

// Multimedia (M2-13, BLK-05; blocks-editor.md 2.5, 2.12). Each variant has a table of its own: the
// editor does not switch among them.

/**
 * The embed providers (D-44) and the start of each one's player address, as their public embed
 * instructions give it: the published course frames only these players.
 */
export const EMBED_PROVIDERS = {
  YouTube: "https://www.youtube-nocookie.com/embed/",
  Vimeo: "https://player.vimeo.com/video/",
  Loom: "https://www.loom.com/embed/",
  // Dailymotion's documented embed address for a video id (its newer player takes the id in a
  // query instead; this one keeps the id in the path, where the check below can hold it).
  Dailymotion: "https://www.dailymotion.com/embed/video/",
} as const;

export type EmbedProvider = keyof typeof EMBED_PROVIDERS;

// The WHATWG URL parser every browser and Node.js provide; this package takes no DOM or Node types.
declare const URL: new (
  url: string,
) => Readonly<Record<"href" | "origin" | "pathname" | "username" | "password", string>>;

/**
 * The provider whose player `embedUrl` is (D-44), or undefined: the address, written exactly as the
 * URL parser writes it, is https on the provider's own host and port with no user name, and its
 * path is the player path and one video id; a query and a fragment (start times) may follow. A
 * named `provider` must be that one. The player frames only such an address, and the format
 * accepts no other.
 */
export function embedProvider(embedUrl: string, provider?: string): EmbedProvider | undefined {
  let url: InstanceType<typeof URL>;
  try {
    url = new URL(embedUrl);
  } catch {
    return undefined;
  }
  // The written form rules out dot segments, backslashes, a spelled-out port and the like.
  if (url.href !== embedUrl || url.username || url.password) return undefined;
  for (const [name, prefix] of Object.entries(EMBED_PROVIDERS) as [EmbedProvider, string][]) {
    const player = new URL(prefix);
    if (
      (provider === undefined || provider === name) &&
      url.origin === player.origin &&
      url.pathname.startsWith(player.pathname) &&
      /^[\w-]+$/.test(url.pathname.slice(player.pathname.length))
    ) {
      return name;
    }
  }
  return undefined;
}

/** Plain text, a paragraph per blank-line-separated part. */
const PLAIN = { type: "string", maxLength: 100_000 };

const AUDIO: Record<string, Setting> = {
  // Learners can skip ahead; off, seeking past what was played is undone and the block is done
  // once played through (UI-BLOCKS-EDITOR-R37).
  forwardSeeking: { schema: FLAG, default: true },
  // What is said, which learners open under the player.
  transcript: { schema: PLAIN },
};

const VIDEO: Record<string, Setting> = {
  ...AUDIO,
  cornerRadius: { schema: int(0, 30), default: 0 },
  // The picture shown until it plays: a media file of the course.
  poster: {
    schema: {
      type: "object",
      properties: { key: { $ref: "#/$defs/MediaKeyRef" } },
      required: ["key"],
      unevaluatedProperties: false,
    },
  },
};

const EMBED: Record<string, Setting> = {
  // What the author pasted (an address or embed code's frame address), to edit it again.
  url: { schema: { type: "string", maxLength: 2048 } },
  // The provider's player that the published course frames, https only (ADR-0004) and checked
  // against the provider by embedProvider, and the provider named on the button that loads it.
  embedUrl: { schema: { type: "string", pattern: "^https://[^\\s\"'<>]+$", maxLength: 2048 } },
  provider: { schema: choice(...Object.keys(EMBED_PROVIDERS)) },
  border: { schema: FLAG, default: false },
};

const ATTACHMENT: Record<string, Setting> = {
  // The file's name as learners download it, and its size in bytes.
  fileName: { schema: { type: "string", minLength: 1, maxLength: 255 } },
  fileSize: { schema: { type: "integer", minimum: 0 } },
};

const CODE: Record<string, Setting> = {
  // The code as plain text, shown as written, and its language's name shown above it (text only:
  // no colouring, BLK-05).
  code: { schema: PLAIN },
  language: { schema: { type: "string", maxLength: 40 } },
  // Long lines wrap; off, the code scrolls sideways.
  wrap: { schema: FLAG, default: false },
  // The snippet's colour and the text on it.
  background: { schema: COLOR, default: "#1f2430" },
  contrast: { schema: CONTRAST, default: "auto" },
};

const each = (table: Record<string, Setting>, ...variants: string[]) =>
  Object.fromEntries(variants.map((variant) => [variant, table]));

/**
 * The variants of each category whose settings are defined, by category and variant. A category
 * listed here has no other variants.
 */
export const VARIANTS: Readonly<Record<string, Readonly<Record<string, Record<string, Setting>>>>> =
  {
    text: {
      ...each(
        TEXT,
        "paragraph",
        "paragraph-with-heading",
        "paragraph-with-subheading",
        "heading",
        "subheading",
      ),
      columns: COLUMNS,
      table: TABLE,
    },
    statement: each(STATEMENT, "statement-a", "statement-b", "statement-c", "statement-d", "note"),
    quote: each(QUOTE, "quote-a", "quote-b", "quote-c", "quote-d", "on-image", "carousel"),
    list: each(LIST, "numbered", "bulleted", "checkbox"),
    image: each(IMAGE, "centered", "full-width", "image-text", "text-on-image", "banner"),
    gallery: each(GALLERY, "carousel", "grid-2", "grid-3", "grid-4"),
    divider: { ...each(DIVIDER, "line", "numbered", "spacer"), continue: CONTINUE },
    multimedia: {
      audio: AUDIO,
      video: VIDEO,
      embed: EMBED,
      attachment: ATTACHMENT,
      "code-snippet": CODE,
    },
  };

/** The setting table of a block's variant, or undefined where the format leaves it open. */
export const settingsTable = (block: Pick<Block, "category" | "variant">) =>
  VARIANTS[block.category]?.[block.variant];

/**
 * A block's variant settings with every default filled in, for the variants defined here; the
 * block's own settings otherwise. A valid document holds only values its table allows.
 */
export function variantSettings<T = Readonly<Record<string, unknown>>>(
  block: Pick<Block, "category" | "variant" | "variantSettings">,
): T {
  const table = settingsTable(block);
  const defaults = Object.entries(table ?? {}).flatMap(([name, setting]) =>
    setting.default === undefined ? [] : [[name, setting.default]],
  );
  return { ...Object.fromEntries(defaults), ...block.variantSettings } as T;
}

/**
 * Variants that span the page whatever the content width, their images cropped to fill it
 * (UI-BLOCKS-EDITOR-R27; blocks-editor.md 2.17 "full-bleed variants").
 */
export const FULL_BLEED: ReadonlySet<string> = new Set([
  "image/full-width",
  "image/text-on-image",
  "image/banner",
  "quote/on-image",
]);

/** Heading level of each text variant that shows a heading, when the author has not chosen one. */
const HEADING_LEVELS: Readonly<Record<string, number>> = {
  "paragraph-with-heading": 2,
  heading: 2,
  "paragraph-with-subheading": 3,
  subheading: 3,
};

/**
 * Whether a text variant has a heading, and the level it takes by default (rise.md 3C): 2 for a
 * heading, 3 for a subheading; undefined for a variant without one.
 */
export const defaultHeadingLevel = (block: Pick<Block, "category" | "variant">) =>
  block.category === "text" ? HEADING_LEVELS[block.variant] : undefined;

/**
 * The level of the heading element a block shows (2 to 6, the lesson title being the only level
 * 1): the author's choice, else its variant's default; undefined when the block shows no heading,
 * because its variant has none or its heading is empty. The player builds the element from it.
 */
export function headingLevel(block: Block): number | undefined {
  const fallback = defaultHeadingLevel(block);
  const item = block.items?.find((one): one is ContentItem => one.kind === "content");
  if (fallback === undefined || !item?.title) return undefined;
  const { headingLevel: level } = variantSettings<{ headingLevel?: number }>(block);
  return level ?? fallback;
}

/**
 * The deepest heading level the block at `index` of a lesson's `blocks` can take without skipping
 * a level (BLK-04 "the page heading outline stays valid"; WCAG 1.3.1; accessibility.md W18 "do
 * not skip levels"): one below the nearest heading above it, or 2 under the lesson title. The
 * editor offers no deeper level and warns when a move or a deletion leaves a heading too deep.
 */
export function deepestHeadingLevel(blocks: readonly Block[], index: number): number {
  for (let i = Math.min(index, blocks.length) - 1; i >= 0; i--) {
    const level = headingLevel(blocks[i] as Block);
    if (level !== undefined) return level + 1;
  }
  return 2;
}
