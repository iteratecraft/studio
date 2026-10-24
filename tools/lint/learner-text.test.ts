// Proves that `pnpm lint` fails on learner-facing text hard-coded in player code (ENG-09), using the
// repository's own Biome overrides in a scratch folder with fixture files.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

// Each line marked `// flagged` must be reported; every other line must not be.
const FIXTURE = `
export function render(el: any, labels: any, n: number) {
  el.textContent = "Submit"; // flagged
  el.innerText = 'Next question'; // flagged
  el.innerHTML = "<b>Well done</b>"; // flagged
  el.title = "Close"; // flagged
  el.ariaLabel = \`Question \${n}\`; // flagged
  el.placeholder = "Type here"; // flagged
  el.setAttribute("aria-label", "Open menu"); // flagged
  el.setAttribute("alt", "A diagram"); // flagged
  el.append("Hello"); // flagged
  el.insertAdjacentText("beforeend", "Done"); // flagged
  el.ownerDocument.createTextNode("Loading"); // flagged
  el.after(new Text("Saved")); // flagged
  alert("Something went wrong"); // flagged
  el.textContent = "Résumé"; // flagged
  el.textContent = labels["quiz.submit"];
  el.textContent = "";
  el.textContent = " • ";
  el.ariaLabel = \`\${n}/\${labels.total}\`;
  el.setAttribute("class", "menu is-open");
  el.setAttribute("aria-label", labels["outline.show"]);
  el.classList.add("is-open");
  el.dataset.state = "open";
  el.append(el.firstChild);
  throw new Error("render failed: no root element");
}
`;
const flaggedLines = FIXTURE.split("\n").flatMap((line, i) =>
  line.endsWith("// flagged") ? [i + 1] : [],
);

const scratch = mkdtempSync(join(tmpdir(), "learner-text-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }));

/** Lints FIXTURE saved at `path` with the repository's overrides; returns the lines the rule reports. */
function lint(path: string): number[] {
  const config = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8"));
  const overrides = config.overrides.map((o: { plugins?: string[] }) => ({
    ...o,
    ...(o.plugins && { plugins: o.plugins.map((p) => resolve(repoRoot, p).replaceAll("\\", "/")) }),
  }));
  const dir = mkdtempSync(join(scratch, "case-"));
  writeFileSync(join(dir, "biome.json"), JSON.stringify({ root: true, overrides }));
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), FIXTURE);
  const run = spawnSync(process.execPath, [biome, "lint", "--reporter=github", path], {
    cwd: dir,
    encoding: "utf8",
  });
  if (/Failed to compile|rule errored/.test(run.stdout + run.stderr)) {
    throw new Error(`The learner-text rule did not load:\n${run.stdout}${run.stderr}`);
  }
  return [...run.stdout.matchAll(/^::error title=plugin,file=[^,]*,line=(\d+)/gm)].map((m) =>
    Number(m[1]),
  );
}

test("hard-coded learner-facing text in a player package fails lint", () => {
  expect(lint("packages/player-blocks/src/render.ts")).toEqual(flaggedLines);
  expect(flaggedLines).toHaveLength(14);
});

test("the rule covers every player package", () => {
  expect(lint("packages/player-slides/src/frame/render.ts")).toEqual(flaggedLines);
});

test("tests and packages that are not players may hold text", () => {
  expect(lint("packages/player-blocks/src/render.test.ts")).toEqual([]);
  expect(lint("packages/labels/src/render.ts")).toEqual([]);
});
