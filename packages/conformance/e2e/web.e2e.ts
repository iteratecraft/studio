// Blocks web output profile (M1-17, STD-02; rise.md §4 "Published web package", ADR-0003 to 0005):
// a course built for plain web output opens from a folder and from a static web server, loads only
// its own files, logs no error and keeps nothing on the device.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { sampleCourse } from "@course-suite/format/test/courses";
import { DATA_FILE, pagesOf } from "@course-suite/player-blocks";
import { expect, type Page, test } from "@playwright/test";
import { readZip } from "../src/zip.js";
import { STORED, webZip } from "../test/blocks.js";

const course = sampleCourse();
let dir = "";
let names: readonly string[] = [];

test.beforeAll(async () => {
  const zip = readZip(await webZip(course));
  if (!zip.ok) throw new Error(JSON.stringify(zip.problems));
  names = zip.value.names;
  dir = mkdtempSync(join(tmpdir(), "web-output-"));
  for (const name of names) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), zip.value.read(name) as Uint8Array);
  }
});

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("[rise:R20] the package holds the index page, the data file, the hashed player and the media", () => {
  expect(names).toContain("index.html");
  expect(names).toContain(DATA_FILE);
  expect(names.filter((name) => /^player\.[0-9a-f]{10}\.(js|css)$/.test(name))).toHaveLength(2);
  expect(names.filter((name) => name.startsWith("media/")).length).toBeGreaterThan(0);
  // Plain web output has no descriptor (standards.md §1 "Plain web").
  expect(names).not.toContain("imsmanifest.xml");
});

/** Opens the course at `base` and walks into its second lesson; returns what went wrong. */
async function visit(page: Page, base: string): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("requestfailed", (request) => problems.push(`failed: ${request.url()}`));
  page.on("request", (request) => {
    if (!request.url().startsWith(base)) problems.push(`outside the package: ${request.url()}`);
  });
  const [first, second] = pagesOf(course);
  for (let time = 0; time < 2; time++) {
    await page.goto(`${base}index.html`);
    // Every visit starts fresh: nothing was kept from the one before (ADR-0005).
    await page.getByRole("link", { name: "Begin course" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(first?.title ?? "");
    await page
      .getByRole("navigation", { name: "Course contents" })
      .getByRole("link", {
        name: second?.title ?? "",
      })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(second?.title ?? "");
    expect(await page.evaluate(STORED)).toBe(0);
  }
  return problems;
}

test("[rise:R20] web output runs from a folder with no request beyond its own files", async ({
  page,
}) => {
  expect(await visit(page, pathToFileURL(join(dir, "/")).href)).toEqual([]);
});

test("web output runs from a static web server with no request beyond its own files", async ({
  page,
}) => {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    try {
      const body = readFileSync(join(dir, path));
      const type = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : "";
      response.writeHead(200, type ? { "content-type": type } : {}).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    expect(await visit(page, base)).toEqual([]);
  } finally {
    server.close();
  }
});
