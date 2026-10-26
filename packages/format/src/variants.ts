// The settings of the text and static block variants (BLK-04; rise.md 3C; blocks-editor.md 2.5,
// 2.7 to 2.11, 2.14): for each variant, the `variantSettings` it may hold, with the schema of each
// setting and its default. This closes `variantSettings` for these variants (ADR-0002, "Schema
// dialect"); the variants of other categories stay open until their own epics define them.
// Sibling variants that the editor switches between share one table, so a switch keeps every
// setting valid (UI-BLOCKS-EDITOR-R25). The validator checks documents against these tables and the
// player and the editor read settings through `variantSettings`, so the defaults live here only.
import type { Block } from "./course.js";

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
