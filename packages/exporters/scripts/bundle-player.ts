// Embeds every file the exporters ship into dist/assets.js at build time, so building a package
// needs no file system and runs in a browser or a Web Worker as well as in Node.js (ADR-0006):
// - the Blocks player, bundled as one self-contained classic script (IIFE), never an ES module, so
//   a package opens from disk (ADR-0003), and its style sheet, each under a content-hashed name so a
//   republished package never runs a stale cached player;
// - the ADL SCORM 1.2 and SCORM 2004 4th edition schema files, unchanged.
// It runs before tsc, which takes the types from dist/assets.d.ts.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const { output } = await build({
  input: fileURLToPath(import.meta.resolve("@course-suite/player-blocks/boot")),
  platform: "browser",
  write: false,
  output: { format: "iife" },
});
const code = output[0].code;
// buildPackage rejects module script tags, import( and import.meta; this catches a stray static one.
const module = /^\s*(?:import|export)\s/m.exec(code);
if (module)
  throw new Error(`The player bundle is not a classic script: it contains "${module[0]}"`);

/** The file's text; refuses bytes that would not come back the same from it. */
function text(bytes: Uint8Array, name: string): string {
  const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const again = new TextEncoder().encode(decoded);
  if (again.length !== bytes.length || again.some((byte, i) => byte !== bytes[i]))
    throw new Error(`${name} does not survive a UTF-8 round trip`);
  return decoded;
}

/** `player.<first 10 hex digits of the SHA-256>.<extension>`, with the file's text. */
async function playerFile(extension: string, bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    name: `player.${hex.slice(0, 10)}.${extension}`,
    text: text(bytes, `player.${extension}`),
  };
}

function schemas(folder: string): Record<string, string> {
  const dir = new URL(`../schemas/${folder}/`, import.meta.url);
  return Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((name) => [name, text(readFileSync(new URL(name, dir)), name)]),
  );
}

const style = readFileSync(
  fileURLToPath(import.meta.resolve("@course-suite/player-blocks/player.css")),
);
const assets = {
  PLAYER_SCRIPT: await playerFile("js", new TextEncoder().encode(code)),
  PLAYER_STYLE: await playerFile("css", style),
  SCORM12_SCHEMA_TEXT: schemas("scorm12"),
  SCORM2004_SCHEMA_TEXT: schemas("scorm2004"),
};

const names = (record: Record<string, string>) =>
  Object.keys(record)
    .map((name) => JSON.stringify(name))
    .join(" | ");
const HEADER = "// Written by scripts/bundle-player.ts when this package builds. Do not edit.\n";
const dist = new URL("../dist/", import.meta.url);
mkdirSync(dist, { recursive: true });
writeFileSync(
  new URL("assets.js", dist),
  HEADER +
    Object.entries(assets)
      .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};\n`)
      .join(""),
);
writeFileSync(
  new URL("assets.d.ts", dist),
  `${HEADER}/** A file every package ships: its package path and its UTF-8 text. */
export interface EmbeddedFile {
  readonly name: string;
  readonly text: string;
}
export declare const PLAYER_SCRIPT: EmbeddedFile;
export declare const PLAYER_STYLE: EmbeddedFile;
export declare const SCORM12_SCHEMA_TEXT: Readonly<Record<${names(assets.SCORM12_SCHEMA_TEXT)}, string>>;
export declare const SCORM2004_SCHEMA_TEXT: Readonly<Record<${names(assets.SCORM2004_SCHEMA_TEXT)}, string>>;
`,
);
