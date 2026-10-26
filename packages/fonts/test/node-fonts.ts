// Fonts for tests and scripts in Node.js: the bundled families read from this package's files, and
// one custom font of a pretend author library, `testfont01` ("Test Hand"), made of the Literata
// files. Any other custom font is missing, as one deleted from the library is.
import { readFile } from "node:fs/promises";
import type { FontRef } from "@course-suite/format";
import { type FontFiles, readBuiltinFont } from "../src/index.js";

const read = async (url: string) => new Uint8Array(await readFile(new URL(url)));

export const TEST_CUSTOM_FONT = { kind: "custom", id: "testfont01", name: "Test Hand" } as const;

export async function nodeFonts(font: FontRef): Promise<FontFiles | undefined> {
  if (font.kind === "builtin") return readBuiltinFont(font.id, read);
  if (font.id !== TEST_CUSTOM_FONT.id) return undefined;
  // A library font comes without a licence file: its licence is the author's business.
  const { licence: _, ...files } = await readBuiltinFont("literata", read);
  return { ...files, name: TEST_CUSTOM_FONT.name };
}
