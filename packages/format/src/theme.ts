// The course theme (ENG-08, BLK-09; rise.md 3E, rule 18; blocks-editor.md 2.18): its defaults, the
// bundled fonts and their recommended pairings, the layout style presets, and the colours the player
// draws from the theme colour. Automatic contrast keeps every generated text colour at 4.5:1 on what
// it sits on and theme-coloured buttons at 3:1 on the page; the editor offers the nearest colour that
// passes when the author's own choice does not.
import { contrastRatio, luminance, textOn } from "./contrast.js";
import type { FontRef, Theme } from "./course.js";

/** The suggested theme colours (blocks-editor.md 2.18, T7). */
export const THEME_COLORS = ["#4baaf4", "#285f9f", "#7837a8", "#d84738", "#ff631e", "#25bb64"];
export const DEFAULT_THEME_COLOR = "#ff631e";

export type BuiltinFontId = Extract<FontRef, { kind: "builtin" }>["id"];

/** The bundled open-licence (OFL-1.1) families, Latin subsets (D-45); the schema lists the same ids. */
export const BUILTIN_FONTS: readonly { id: BuiltinFontId; name: string; kind: "sans" | "serif" }[] =
  [
    { id: "inter", name: "Inter", kind: "sans" },
    { id: "montserrat", name: "Montserrat", kind: "sans" },
    { id: "noto-sans", name: "Noto Sans", kind: "sans" },
    { id: "open-sans", name: "Open Sans", kind: "sans" },
    { id: "work-sans", name: "Work Sans", kind: "sans" },
    { id: "crimson-pro", name: "Crimson Pro", kind: "serif" },
    { id: "literata", name: "Literata", kind: "serif" },
    { id: "noto-serif", name: "Noto Serif", kind: "serif" },
  ];

/**
 * Recommended heading and body pairings (T8); the first is the default, the classic style's sans
 * heading with a serif body (blocks-editor.md 2.18).
 */
export const FONT_PAIRINGS: readonly [heading: BuiltinFontId, body: BuiltinFontId][] = [
  ["noto-sans", "noto-serif"],
  ["montserrat", "literata"],
  ["work-sans", "crimson-pro"],
  ["inter", "inter"],
  ["open-sans", "open-sans"],
  ["montserrat", "open-sans"],
  ["literata", "noto-sans"],
  ["inter", "literata"],
];

export type FontRole = "heading" | "body" | "ui";

/** The font of each role: the theme's, else the default pairing; the interface follows the heading. */
export function fontsOf(theme: Theme | undefined): Record<FontRole, FontRef> {
  const [heading, body] = FONT_PAIRINGS[0] as [BuiltinFontId, BuiltinFontId];
  const fonts = theme?.fonts;
  const headingFont = fonts?.heading ?? { kind: "builtin", id: heading };
  return {
    heading: headingFont,
    body: fonts?.body ?? { kind: "builtin", id: body },
    ui: fonts?.ui ?? headingFont,
  };
}

/** The default font of a role, which a custom font the library no longer has falls back to. */
export const defaultFont = (role: FontRole): FontRef => fontsOf(undefined)[role];

/** A font's key: its bundled id, or `custom-<id>`. Unique, so it also names the family in a package. */
export const fontKey = (font: FontRef): string =>
  font.kind === "builtin" ? font.id : `custom-${font.id}`;

/** The cover and lesson header layouts of each layout style (T3, UI-BLOCKS-EDITOR-R43). */
export const LAYOUT_STYLES = {
  classic: { cover: "split-left", headers: "light" },
  rounded: { cover: "split-right", headers: "tint" },
  bold: { cover: "full-image", headers: "theme" },
} as const satisfies Record<
  NonNullable<Theme["layout"]>,
  {
    cover: NonNullable<NonNullable<Theme["cover"]>["layout"]>;
    headers: NonNullable<NonNullable<Theme["headers"]>["layout"]>;
  }
>;

/**
 * `theme` in layout style `style`: its cover and header layouts, nothing else. Colour, fonts and
 * navigation stay as they are (UI-BLOCKS-EDITOR-R43, BLK-09).
 */
export function withLayoutStyle(theme: Theme, style: keyof typeof LAYOUT_STYLES): Theme {
  const preset = LAYOUT_STYLES[style];
  return {
    ...theme,
    layout: style,
    cover: { ...theme.cover, layout: preset.cover },
    headers: { ...theme.headers, layout: preset.headers },
  };
}

const WHITE = "#ffffff";
const BLACK = "#000000";

const hex = (channels: number[]) =>
  `#${channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
const channels = (color: string) =>
  [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16));

/** `color` moved `amount` (0 to 1) of the way to `toward`, channel by channel. */
export function mix(color: string, toward: string, amount: number): string {
  const to = channels(toward);
  return hex(channels(color).map((c, i) => c + ((to[i] as number) - c) * amount));
}

/** The contrast ratio of two `#rrggbb` colours. */
export const contrastOf = (a: string, b: string): number =>
  contrastRatio(luminance(a), luminance(b));

/**
 * The colour nearest to `color` that keeps `ratio` against `against`: `color` itself when it does,
 * else `color` moved the least way toward black or white that does. Any ratio up to 4.5 can be met.
 */
export function nearestReadable(color: string, against: string, ratio: number): string {
  if (contrastOf(color, against) >= ratio) return color;
  let best: { amount: number; color: string } | undefined;
  for (const extreme of [BLACK, WHITE]) {
    if (contrastOf(extreme, against) < ratio) continue;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (contrastOf(mix(color, extreme, middle), against) >= ratio) high = middle;
      else low = middle;
    }
    // Rounding to whole channel values may land just short; step on until it holds.
    let candidate = mix(color, extreme, high);
    for (let step = high; contrastOf(candidate, against) < ratio && step < 1; ) {
      step = Math.min(1, step + 1 / 512);
      candidate = mix(color, extreme, step);
    }
    if (!best || high < best.amount) best = { amount: high, color: candidate };
  }
  return best?.color ?? (contrastOf(BLACK, against) >= contrastOf(WHITE, against) ? BLACK : WHITE);
}

/** White or black, for text on `background` with the contrast setting `contrast`. */
export const textColor = (background: string, contrast: Theme["contrast"] = "auto"): string =>
  textOn(background, contrast) === "light" ? WHITE : BLACK;

/** What the player draws from the theme colour. Every pair keeps its ratio under auto contrast. */
export interface ThemeColors {
  /** The theme colour, behind blocks and headers set to theme, and its text. */
  theme: string;
  themeText: string;
  /** A light tint of it, and its text (always automatic). */
  tint: string;
  tintText: string;
  /** Links, focus rings and marks on the page: 4.5:1 on white and on the player's panels. */
  accent: string;
  /** The current page's highlight in the outline, under the page's own text colour. */
  accentSoft: string;
  /** Filled buttons: 3:1 on the page and its panels under auto contrast, else the theme colour. */
  button: string;
  buttonText: string;
}

/**
 * The player's panel colour (`--panel` in player.css): the darkest light surface links and buttons
 * sit on, so a colour that keeps its ratio there keeps it on white too.
 */
export const PANEL = "#f4f5f7";

/** The colours of `theme` (rise.md 3E, rule 18; UI-BLOCKS-EDITOR-R45). */
export function themeColors(theme: Theme | undefined): ThemeColors {
  const color = theme?.color ?? DEFAULT_THEME_COLOR;
  const contrast = theme?.contrast ?? "auto";
  const tint = mix(color, WHITE, 0.85);
  const accent = nearestReadable(color, PANEL, 4.5);
  const button = contrast === "auto" ? nearestReadable(color, PANEL, 3) : color;
  return {
    theme: color,
    themeText: textColor(color, contrast),
    tint,
    tintText: textColor(tint),
    accent,
    accentSoft: mix(accent, WHITE, 0.88),
    button,
    buttonText: textColor(button, contrast),
  };
}

/** The colour of an overlay over a cover image, and the text drawn on it. */
export function overlayColors(
  overlay: NonNullable<Theme["cover"]>["overlay"],
  theme: Theme | undefined,
): { color: string; text: string } {
  const colors = themeColors(theme);
  if (overlay?.color === "light") return { color: WHITE, text: BLACK };
  if (overlay?.color === "theme") return { color: colors.theme, text: colors.themeText };
  return { color: BLACK, text: WHITE };
}

/** The cover overlay when the theme sets none (blocks-editor.md 2.18). */
export const DEFAULT_OVERLAY = { color: "dark", opacity: 50 } as const;

/**
 * The lowest overlay opacity, in whole percent, that keeps `text` at 4.5:1 over any picture under
 * an overlay of `color`, or undefined when even a solid overlay does not.
 */
export function overlayFloor(color: string, text: string): number | undefined {
  // The worst picture is all white under light text and all black under dark text.
  const worst = luminance(text) > 0.5 ? WHITE : BLACK;
  for (let percent = 0; percent <= 100; percent++) {
    if (contrastOf(text, mix(worst, color, percent / 100)) >= 4.5) return percent;
  }
  return undefined;
}
