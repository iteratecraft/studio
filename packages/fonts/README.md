# @course-suite/fonts

The bundled fonts (M2-17, ENG-08, BLK-09, decision D-45): eight open-licence families as WOFF2
Latin subsets, each with a regular, a bold and an italic face (24 files, 451 KB), and the few lines
that address and read them. Apache-2.0 code, layer `engine`; the font files are under the SIL Open
Font License 1.1, each family's licence beside its files (`files/<id>/OFL.txt`; source and
copyright in `THIRD_PARTY_NOTICES.md`). The licence gate fails on a font file without its licence.

| Export | What it does |
|---|---|
| `BUILTIN_FONT_FILES` | The address of each face of each family, by `new URL(..., import.meta.url)`: bundlers turn them into asset files, Node.js into `file:` addresses |
| `BUILTIN_FONT_LICENCES` | The address of each family's `OFL.txt`, the same way |
| `readBuiltinFont(id, read)` | A family's name, the bytes of its faces and its licence, read with `read` (`fetchBytes` in a page, the file system in Node.js) |
| `fetchBytes(url)` | Reads a file of the page's own |
| `fontFormat(bytes)` | `woff`, `woff2` or undefined, by the file's signature |
| `FONT_FACES`, `FontFiles` | The faces a font may have (regular required, bold and italic optional) and the shape the exporters and the preview take |

The names, the schema's list of ids and the recommended pairings live in `@course-suite/format`
(`BUILTIN_FONTS`, `FONT_PAIRINGS`). The exporters embed only the fonts a course's theme chose (none
by default: text is then in the learner's device fonts), each bundled family with its licence as
`fonts/<id>-OFL.txt` (OFL-1.1 section 2). `BUILTIN_FONT_LICENCES` addresses the licences the same
way as the faces, so a bundler copies them into the app beside the fonts; the licence gate fails an
app build output (`apps/*/dist`) that holds a bundled font without its family's licence.
`test/node-fonts.ts` is a font source for tests and scripts in Node.js, with one pretend library
font, `testfont01`.
