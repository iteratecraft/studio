// axe-core checks for the gallery: the same set-up as the player's browser tests (M1-29,
// packages/player-blocks-harness/e2e/axe.ts): WCAG 2.0, 2.1 and 2.2 level A and AA rules and the
// same axe-core version from the pnpm catalog. That package is test-only and apps may not import
// it (ADR-0001), so the few lines are repeated here. axe-core is MPL-2.0 and stays a devDependency.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";

declare global {
  interface Window {
    axe?: { run(context: Document, options: RunOptions): Promise<AxeResults> };
  }
}

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

const WCAG_A_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * One line per violation, of any impact: rule, what it asks, and where. The kit's bar (no serious
 * or critical violation) is met by expecting none at all.
 */
export async function violations(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => "axe" in window))) await page.evaluate(axeSource);
  // Wait for running animations, so colours and positions are the settled ones; endless ones,
  // such as a busy progress bar, never settle.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
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
    rule.nodes.map((node) => `${rule.id} (${rule.impact}, ${rule.help}): ${node.target.join(" ")}`),
  );
}
