// Prints the gzip size of the built gallery (`pnpm --filter @course-suite/web build` first), split
// into React, React Aria, the kit and the gallery's own code (see the chunk groups in
// vite.config.ts). The same gzip level a web server or installer would use: 9, the best.
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
const groupOf = (name: string) => /^(react|react-aria|kit)-/.exec(name)?.[1] ?? "gallery";

for (const file of sizes)
  console.log(
    `${file.name.padEnd(36)} ${kb(file.raw).padStart(10)} raw ${kb(file.gzip).padStart(10)} gzip`,
  );
console.log(
  `\nReact plus the kit (react, react-aria, kit): ${kb(total(sizes.filter((f) => groupOf(f.name) !== "gallery")))} gzip`,
);
console.log(`Whole gallery: ${kb(total(sizes))} gzip`);
