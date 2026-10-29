// Player size budget (M2-21, D-26; ENG-04 "enforce a size budget in CI"): the Blocks player script
// and style sheet every package ships, gzip-compressed as a web server sends them, must stay within
// their budgets. Budgets: the sizes on 2026-10-29 (script 76,930 B, style sheet 11,130 B, gzip
// level 6) plus 15 %, rounded up to a whole KiB (docs/ci.md, "Player performance budget"). Raise one
// only with a reviewed reason in the pull request.
import { gzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { PLAYER_SCRIPT, PLAYER_STYLE } from "../dist/assets.js";

const BUDGET = { script: 87 * 1024, style: 13 * 1024 };

const gzipped = (text: string) => gzipSync(new TextEncoder().encode(text)).length;

test("M2-21 the player script stays within its gzip budget", () => {
  const size = gzipped(PLAYER_SCRIPT.text);
  expect(size, `${PLAYER_SCRIPT.name} is ${size} B gzipped`).toBeLessThanOrEqual(BUDGET.script);
});

test("M2-21 the player style sheet stays within its gzip budget", () => {
  const size = gzipped(PLAYER_STYLE.text);
  expect(size, `${PLAYER_STYLE.name} is ${size} B gzipped`).toBeLessThanOrEqual(BUDGET.style);
});
