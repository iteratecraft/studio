// Colours of a block's settings (rise.md rule 18, 3D, UI-BLOCKS-EDITOR-R19, R22): automatic contrast
// picks white or black text on a block's own background colour, whichever keeps the higher
// contrast ratio with it. One of the two is always 4.58:1 or more (WCAG 2.2 relative luminance), so
// text stays at 4.5:1. The player draws blocks by these rules and the editor checks against them.

/** WCAG 2.2 relative luminance of a `#rrggbb` colour. */
export function luminance(color: string): number {
  const channel = (at: number) => {
    const value = Number.parseInt(color.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.2 contrast ratio of two relative luminances. */
export const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The text for a background: the author's fixed choice, or for "auto" the one that reads best. */
export function textOn(
  color: string,
  contrast: "auto" | "light" | "dark" = "auto",
): "light" | "dark" {
  if (contrast !== "auto") return contrast;
  const background = luminance(color);
  return contrastRatio(background, 1) >= contrastRatio(background, 0) ? "light" : "dark";
}

/** The surface a block's text sits on when the block has no colour of its own. */
export const SURFACE = "#ffffff";

/**
 * Whether a block's accent colour may stand in for the theme's (rise.md 3D, BLK-03): it colours
 * links and marks on `surface`, so it must keep 4.5:1 there; text on the accent itself is white or
 * black, whichever reads best (textOn).
 */
export const accentReadable = (accent: string, surface = SURFACE): boolean =>
  contrastRatio(luminance(accent), luminance(surface)) >= 4.5;
