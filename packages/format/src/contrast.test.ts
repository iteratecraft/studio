import { expect, test } from "vitest";
import { accentReadable, contrastRatio, luminance, textOn } from "./contrast.js";

const WHITE = 1;
const BLACK = 0;
const ratio = (color: string) =>
  contrastRatio(luminance(color), textOn(color) === "light" ? WHITE : BLACK);

test("[rise:R18] UI-BLOCKS-EDITOR-R19: automatic contrast keeps text at 4.5:1 on 1,000 custom colours and every grey", () => {
  // A fixed sweep, the same on every run: an even spread over the colour cube.
  const colors: string[] = [];
  for (let i = 0; i < 1000; i += 1) {
    const value = Math.floor((i * 16777215) / 999);
    colors.push(`#${value.toString(16).padStart(6, "0")}`);
  }
  for (let g = 0; g < 256; g += 1) colors.push(`#${g.toString(16).padStart(2, "0").repeat(3)}`);
  for (const color of colors) expect(ratio(color), color).toBeGreaterThanOrEqual(4.5);
});

test("UI-BLOCKS-EDITOR-R19: a fixed light or dark choice is kept, whatever its contrast", () => {
  expect(textOn("#000000")).toBe("light");
  expect(textOn("#ffffff")).toBe("dark");
  expect(textOn("#000000", "dark")).toBe("dark");
  expect(textOn("#ffffff", "light")).toBe("light");
  expect(contrastRatio(luminance("#ffffff"), luminance("#000000"))).toBeCloseTo(21);
});

test("[rise:3D] BLK-03: a block's accent colour is used only where it keeps 4.5:1 on the block's surface", () => {
  expect(accentReadable("#1f5fbf")).toBe(true);
  expect(accentReadable("#ffeb3b")).toBe(false);
  expect(accentReadable("#ffeb3b", "#000000")).toBe(true);
  expect(accentReadable("#1f5fbf", "#2b3038")).toBe(false);
});
