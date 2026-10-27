import { readFile } from "node:fs/promises";
import { BUILTIN_FONTS } from "@course-suite/format";
import { expect, test } from "vitest";
import { nodeFonts, TEST_CUSTOM_FONT } from "../test/node-fonts.js";
import { BUILTIN_FONT_FILES, FONT_FACES, fontFormat } from "./index.js";

test("D-45: every bundled family has a woff2 regular, bold and italic face and its OFL licence, about 1 MB in all", async () => {
  let total = 0;
  for (const { id } of BUILTIN_FONTS) {
    for (const face of FONT_FACES) {
      const bytes = new Uint8Array(await readFile(new URL(BUILTIN_FONT_FILES[id][face])));
      expect(fontFormat(bytes), `${id} ${face}`).toBe("woff2");
      total += bytes.length;
    }
    const licence = await readFile(new URL(`../files/${id}/OFL.txt`, import.meta.url), "utf8");
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    // A Reserved Font Name would forbid shipping the subset under the family's own name.
    expect(licence.split("Reserved Font Name")).toHaveLength(2);
  }
  expect(total).toBeLessThan(1_000_000);
});

test("woff and woff2 are told apart by their signature; anything else is neither", () => {
  expect(fontFormat(new TextEncoder().encode("wOFF...."))).toBe("woff");
  expect(fontFormat(new TextEncoder().encode("wOF2...."))).toBe("woff2");
  expect(fontFormat(new TextEncoder().encode("\u0000\u0001\u0000\u0000"))).toBeUndefined();
  expect(fontFormat(new Uint8Array())).toBeUndefined();
});

test("D-45: the Node.js source reads bundled fonts with their licence and the one test library font; others are missing", async () => {
  const inter = await nodeFonts({ kind: "builtin", id: "inter" });
  expect(inter?.name).toBe("Inter");
  expect(inter?.bold?.length).toBeGreaterThan(1000);
  // OFL-1.1 section 2: the licence travels with the font.
  expect(new TextDecoder().decode(inter?.licence)).toContain("SIL OPEN FONT LICENSE Version 1.1");
  expect(new TextDecoder().decode(inter?.licence)).toContain("Inter Project Authors");
  expect((await nodeFonts(TEST_CUSTOM_FONT))?.name).toBe("Test Hand");
  expect((await nodeFonts(TEST_CUSTOM_FONT))?.licence).toBeUndefined();
  expect(await nodeFonts({ kind: "custom", id: "gonefont01", name: "Gone" })).toBeUndefined();
});
