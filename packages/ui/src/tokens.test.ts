// Contrast of the colour tokens in both themes (WCAG 2.2: 1.4.3 text 4.5:1, 1.4.11 controls and
// focus rings 3:1). axe checks the rendered gallery too; this also covers states it never renders.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
// The first declaration of each colour is the light-dark() pair in :root.
const tokens = new Map(
  [...css.matchAll(/--cs-([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/g)].map(
    ([, name, light, dark]) => [name, { light, dark }] as const,
  ),
);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const TEXT = 4.5;
const UI = 3;
// [foreground, background, minimum]: every pairing the component styles use.
const PAIRS: [string, string, number][] = [
  ...["bg", "surface", "raised", "hover", "accent-soft"].flatMap(
    (bg): [string, string, number][] => [
      ["text", bg, TEXT],
      ["text-muted", bg, TEXT],
    ],
  ),
  ...["bg", "surface", "raised"].flatMap((bg): [string, string, number][] => [
    ["accent", bg, TEXT],
    ["danger", bg, TEXT],
    ["success", bg, TEXT],
    ["control-border", bg, UI],
    ["focus", bg, UI],
  ]),
  ["on-accent", "accent", TEXT],
  ["on-accent", "accent-hover", TEXT],
  ["on-danger", "danger", TEXT],
  // Tooltips and toasts are inverted; focus rings inside a toast take its text colour.
  ["bg", "text", TEXT],
];

describe("colour tokens", () => {
  test("every pair names a token with a light and a dark value", () => {
    for (const [fg, bg] of PAIRS) {
      expect(tokens.has(fg), fg).toBe(true);
      expect(tokens.has(bg), bg).toBe(true);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test.each(PAIRS)(`${theme}: %s on %s reaches %s:1`, (fg, bg, minimum) => {
      const ratio = contrast(tokens.get(fg)?.[theme] ?? "", tokens.get(bg)?.[theme] ?? "");
      expect(ratio).toBeGreaterThanOrEqual(minimum);
    });
  }
});
