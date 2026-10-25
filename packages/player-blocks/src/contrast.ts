// Text on a block's own background colour (rise.md rule 18, UI-BLOCKS-EDITOR-R19, R22): automatic
// contrast picks white or black text, whichever keeps the higher contrast ratio with the colour.
// One of the two is always 4.58:1 or more (WCAG 2.2 relative luminance), so text stays at 4.5:1.

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
