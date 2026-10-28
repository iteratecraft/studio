// Colour pairs as the player draws them (rise.md rule 18, ENG-08): the text colour of an element
// and the fill behind it, read from the page, and random theme colours for each contrast mode.
import { nearestReadable, type Theme, textColor } from "@course-suite/format";
import type { Page } from "@playwright/test";

/** A seeded generator, so a failing colour comes back on every run (mulberry32). */
export function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/**
 * Random theme colours for a contrast mode. Under light or dark text the panel offers the nearest
 * colour on which that text keeps 4.5:1 (ColorWithContrast), and the author is taken to accept it:
 * a manual choice that fails is the author's (blocks-editor.md 2.18, UI-BLOCKS-EDITOR-R19).
 */
export function themes(
  contrast: NonNullable<Theme["contrast"]>,
  count: number,
  seed: number,
): Theme[] {
  const next = random(seed);
  return Array.from({ length: count }, () => {
    const drawn = `#${Math.floor(next() * 0x1000000)
      .toString(16)
      .padStart(6, "0")}`;
    if (contrast === "auto") return { color: drawn };
    const color = nearestReadable(drawn, textColor(drawn, contrast), 4.5);
    return { color, contrast };
  });
}

/** The colour of each element matching `selectors`, and the fill behind it. */
export function pairs(page: Page, selectors: string[]) {
  return page.evaluate((list) => {
    const fillOf = (element: Element | null): string => {
      for (let at = element; at; at = at.parentElement) {
        const fill = getComputedStyle(at).backgroundColor;
        if (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") return fill;
      }
      return "rgb(255, 255, 255)";
    };
    return list.flatMap((selector) => {
      const [element, pseudo] = selector.split("::");
      return [...document.querySelectorAll(element as string)].map((found) => {
        const style = getComputedStyle(found, pseudo ? `::${pseudo}` : null);
        const own = style.backgroundColor;
        const fill = own === "rgba(0, 0, 0, 0)" ? fillOf(found) : own;
        return { selector, fill, text: style.color };
      });
    });
  }, selectors);
}

/** `rgb(r, g, b)` as getComputedStyle writes it, as `#rrggbb`. */
export const hex = (color: string) =>
  `#${(color.match(/\d+/g) ?? [])
    .slice(0, 3)
    .map((c) => Number(c).toString(16).padStart(2, "0"))
    .join("")}`;
