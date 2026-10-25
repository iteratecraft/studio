// Prints the gzip size of the built pages (`pnpm --filter @course-suite/web build` first), split
// into React, React Aria, the kit, the preview's player (loaded when a preview opens) and the pages'
// own code (see the chunk groups in vite.config.ts). The same gzip level a web server or installer would use: 9, the best.
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const assets = join(import.meta.dirname, "..", "dist", "assets");
const files = readdirSync(assets).filter((name) => /\.(js|css)$/.test(name));
if (files.length === 0) throw new Error(`No built files in ${assets}; run the build first`);

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const sizes = files.map((name) => {
  const bytes = readFileSync(join(assets, name));
  return { name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
});
const total = (list: typeof sizes) => list.reduce((sum, file) => sum + file.gzip, 0);
const of = (...groups: string[]) => total(sizes.filter((f) => groups.includes(groupOf(f.name))));
const groupOf = (name: string) => /^(react|react-aria|kit|player)-/.exec(name)?.[1] ?? "page";

for (const file of sizes)
  console.log(
    `${file.name.padEnd(36)} ${kb(file.raw).padStart(10)} raw ${kb(file.gzip).padStart(10)} gzip`,
  );
console.log(
  `\nReact plus the kit (react, react-aria, kit): ${kb(of("react", "react-aria", "kit"))} gzip`,
);
console.log(`The preview's player, loaded when a preview opens (player): ${kb(of("player"))} gzip`);
console.log(`Everything built: ${kb(total(sizes))} gzip`);
