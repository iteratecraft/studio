// The bundled fonts (D-45; ENG-08, BLK-09): eight open-licence (OFL-1.1) families as woff2 Latin
// subsets, each with a regular, a bold and an italic face, about 450 KB in all. The editor shows them
// and the exporters embed the ones a course uses. Their names and pairings are in
// @course-suite/format (BUILTIN_FONTS, FONT_PAIRINGS); each family's licence is files/<id>/OFL.txt.
//
// The files are addressed with `new URL(..., import.meta.url)`, which bundlers turn into asset files
// and Node.js into file: addresses, so this package reads nothing itself: the caller reads the bytes
// (fetch in a page, the file system in Node.js) and hands them to the exporters.
import { BUILTIN_FONTS, type BuiltinFontId } from "@course-suite/format";

/** The faces a font may have: regular is required, bold and italic are optional (rise.md 3E). */
export const FONT_FACES = ["regular", "bold", "italic"] as const;
export type FontFace = (typeof FONT_FACES)[number];

/** A font's name and the bytes of its faces (woff or woff2), as the exporters take it. */
export interface FontFiles {
  name: string;
  regular: Uint8Array;
  bold?: Uint8Array | undefined;
  italic?: Uint8Array | undefined;
  /** The licence that must travel with every copy (OFL-1.1 section 2), as text. */
  licence?: Uint8Array | undefined;
}

/** The address of each face of each bundled family. */
export const BUILTIN_FONT_FILES: Readonly<Record<BuiltinFontId, Record<FontFace, string>>> = {
  inter: {
    regular: new URL("../files/inter/regular.woff2", import.meta.url).href,
    bold: new URL("../files/inter/bold.woff2", import.meta.url).href,
    italic: new URL("../files/inter/italic.woff2", import.meta.url).href,
  },
  montserrat: {
    regular: new URL("../files/montserrat/regular.woff2", import.meta.url).href,
    bold: new URL("../files/montserrat/bold.woff2", import.meta.url).href,
    italic: new URL("../files/montserrat/italic.woff2", import.meta.url).href,
  },
  "noto-sans": {
    regular: new URL("../files/noto-sans/regular.woff2", import.meta.url).href,
    bold: new URL("../files/noto-sans/bold.woff2", import.meta.url).href,
    italic: new URL("../files/noto-sans/italic.woff2", import.meta.url).href,
  },
  "open-sans": {
    regular: new URL("../files/open-sans/regular.woff2", import.meta.url).href,
    bold: new URL("../files/open-sans/bold.woff2", import.meta.url).href,
    italic: new URL("../files/open-sans/italic.woff2", import.meta.url).href,
  },
  "work-sans": {
    regular: new URL("../files/work-sans/regular.woff2", import.meta.url).href,
    bold: new URL("../files/work-sans/bold.woff2", import.meta.url).href,
    italic: new URL("../files/work-sans/italic.woff2", import.meta.url).href,
  },
  "crimson-pro": {
    regular: new URL("../files/crimson-pro/regular.woff2", import.meta.url).href,
    bold: new URL("../files/crimson-pro/bold.woff2", import.meta.url).href,
    italic: new URL("../files/crimson-pro/italic.woff2", import.meta.url).href,
  },
  literata: {
    regular: new URL("../files/literata/regular.woff2", import.meta.url).href,
    bold: new URL("../files/literata/bold.woff2", import.meta.url).href,
    italic: new URL("../files/literata/italic.woff2", import.meta.url).href,
  },
  "noto-serif": {
    regular: new URL("../files/noto-serif/regular.woff2", import.meta.url).href,
    bold: new URL("../files/noto-serif/bold.woff2", import.meta.url).href,
    italic: new URL("../files/noto-serif/italic.woff2", import.meta.url).href,
  },
};

/**
 * The address of each bundled family's licence. Referenced here so a bundler copies it into the
 * app beside the fonts, as OFL-1.1 section 2 asks of every copy.
 */
export const BUILTIN_FONT_LICENCES: Readonly<Record<BuiltinFontId, string>> = {
  inter: new URL("../files/inter/OFL.txt", import.meta.url).href,
  montserrat: new URL("../files/montserrat/OFL.txt", import.meta.url).href,
  "noto-sans": new URL("../files/noto-sans/OFL.txt", import.meta.url).href,
  "open-sans": new URL("../files/open-sans/OFL.txt", import.meta.url).href,
  "work-sans": new URL("../files/work-sans/OFL.txt", import.meta.url).href,
  "crimson-pro": new URL("../files/crimson-pro/OFL.txt", import.meta.url).href,
  literata: new URL("../files/literata/OFL.txt", import.meta.url).href,
  "noto-serif": new URL("../files/noto-serif/OFL.txt", import.meta.url).href,
};

/** A bundled family's files and licence, read with `read` (fetch in a page, the file system in Node.js). */
export async function readBuiltinFont(
  id: BuiltinFontId,
  read: (url: string) => Promise<Uint8Array>,
): Promise<FontFiles> {
  const files = BUILTIN_FONT_FILES[id];
  const [regular, bold, italic, licence] = await Promise.all(
    [...FONT_FACES.map((face) => files[face]), BUILTIN_FONT_LICENCES[id]].map(read),
  );
  const name = BUILTIN_FONTS.find((font) => font.id === id)?.name ?? id;
  return { name, regular: regular as Uint8Array, bold, italic, licence };
}

/** Reads a file of the page's own with fetch: how a page reads the bundled fonts it ships. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} could not be read: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The format of font bytes by their signature: `woff`, `woff2`, or undefined for anything else. */
export function fontFormat(bytes: Uint8Array): "woff" | "woff2" | undefined {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  return tag === "wOFF" ? "woff" : tag === "wOF2" ? "woff2" : undefined;
}
