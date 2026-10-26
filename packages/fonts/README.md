# @course-suite/fonts

The bundled fonts (M2-17, ENG-08, BLK-09, decision D-45): eight open-licence families as WOFF2
Latin subsets, each with a regular, a bold and an italic face (24 files, 451 KB), and the few lines
that address and read them. Apache-2.0 code, layer `engine`; the font files are under the SIL Open
Font License 1.1, each family's licence beside its files (`files/<id>/OFL.txt`; source and
copyright in `THIRD_PARTY_NOTICES.md`). The licence gate fails on a font file without its licence.

| Export | What it does |
|---|---|
| `BUILTIN_FONT_FILES` | The address of each face of each family, by `new URL(..., import.meta.url)`: bundlers turn them into asset files, Node.js into `file:` addresses |
| `readBuiltinFont(id, read)` | A family's name and the bytes of its faces, read with `read` (`fetchBytes` in a page, the file system in Node.js) |
| `fetchBytes(url)` | Reads a file of the page's own |
| `fontFormat(bytes)` | `woff`, `woff2` or undefined, by the file's signature |
| `FONT_FACES`, `FontFiles` | The faces a font may have (regular required, bold and italic optional) and the shape the exporters and the preview take |

The names, the schema's list of ids and the recommended pairings live in `@course-suite/format`
(`BUILTIN_FONTS`, `FONT_PAIRINGS`). The exporters embed only the fonts a course's theme uses.
`test/node-fonts.ts` is a font source for tests and scripts in Node.js, with one pretend library
font, `testfont01`.
