// Prints the gzip size of the built pages (`pnpm --filter @course-suite/web build` first), split
// into React, React Aria, the kit, the blocks editor with the engine packages it uses ("blocks"), the
// preview's player (loaded when a preview opens) and each page's own code (see the chunk groups in
// vite.config.ts), then what each page loads in all. The same gzip level a web server or installer
// would use: 9, the best.
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const dist = join(import.meta.dirname, "..", "dist");
const assets = join(dist, "assets");
const files = readdirSync(assets).filter((name) => /\.(js|css)$/.test(name));
if (files.length === 0) throw new Error(`No built files in ${assets}; run the build first`);

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const sizes = new Map(
  files.map((name) => {
    const bytes = readFileSync(join(assets, name));
    return [name, { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length }];
  }),
);
for (const [name, size] of sizes)
  console.log(
    `${name.padEnd(36)} ${kb(size.raw).padStart(10)} raw ${kb(size.gzip).padStart(10)} gzip`,
  );

const GROUPS = ["react", "react-aria", "kit", "blocks", "block-preview", "player"];
// A built name is the chunk's name, a dash and an 8-character hash.
const groupOf = (name: string) => name.replace(/-[\w-]{8}\.(js|css)$/, "");
console.log("");
for (const group of GROUPS) {
  const gzip = [...sizes]
    .filter(([name]) => groupOf(name) === group)
    .reduce((n, [, size]) => n + size.gzip, 0);
  console.log(`${group}: ${kb(gzip)} gzip`);
}

/** Every built file a page loads: its scripts and styles, and the chunks they import. */
function loadedBy(page: string): Set<string> {
  const html = readFileSync(join(dist, page), "utf8");
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name) || !sizes.has(name)) return;
    seen.add(name);
    if (name.endsWith(".js")) {
      for (const [, imported] of readFileSync(join(assets, name), "utf8").matchAll(
        /["'(]\.\/([\w.-]+\.(?:js|css))/g,
      ))
        visit(imported as string);
    }
  };
  for (const [, name] of html.matchAll(/assets\/([\w.-]+\.(?:js|css))/g)) visit(name as string);
  return seen;
}

for (const page of ["index.html", "editor.html", "preview.html"]) {
  const loaded = [...loadedBy(page)];
  const gzip = loaded.reduce((n, name) => n + (sizes.get(name)?.gzip ?? 0), 0);
  console.log(`${page} loads ${loaded.length} files: ${kb(gzip)} gzip`);
}
