// Automated accessibility checks for the player's browser tests (M1-29): axe-core's WCAG 2.0, 2.1
// and 2.2 level A and AA rules, and reflow (WCAG 1.4.10), at phone, tablet and desktop widths.
// axe-core is MPL-2.0, so it stays a devDependency of this test-only package and never reaches a
// course package.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";
import { expect } from "./fixture.ts";

declare global {
  interface Window {
    axe?: { run(context: Document, options: RunOptions): Promise<AxeResults> };
  }
}

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

/** Phone, tablet portrait and desktop; 320 px is the WCAG 1.4.10 reflow width (400 % zoom). */
export const WIDTHS = [320, 768, 1280] as const;

const WCAG_A_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** One line per failing element: rule, what it asks, and where. */
export async function violations(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => "axe" in window))) await page.evaluate(axeSource);
  // Wait for running animations, so colours and positions are the settled ones.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
  const results = await page.evaluate(
    (tags) =>
      window.axe?.run(document, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations"],
      }),
    WCAG_A_AA,
  );
  if (!results) throw new Error("axe-core did not load");
  return results.violations.flatMap((rule) =>
    rule.nodes.map((node) => `${rule.id} (${rule.help}): ${node.target.join(" ")}`),
  );
}

/**
 * Checks the page as it is now at every width: no WCAG 2.2 A or AA violation axe can find, and no
 * sideways scrolling (WCAG 1.4.10). Leaves the page at the last width.
 */
export async function expectAccessible(
  page: Page,
  state: string,
  widths: readonly number[] = WIDTHS,
): Promise<void> {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    // The layout follows a width change on the next frame (the outline opens or closes).
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(await violations(page), `${state} at ${width} px`).toEqual([]);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${state} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  }
}
