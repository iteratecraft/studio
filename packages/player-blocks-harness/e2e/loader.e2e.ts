// The classic-script loader's test table (ADR-0003) and the course data boot (rise.md rule 20),
// against a built package opened from disk in Chromium. The timeout cases run over http:// with a
// request the test holds open, because a file:// read cannot be stalled.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, type Visit } from "./fixture.ts";

declare global {
  interface Window {
    blocksPlayer: { load(name: string): Promise<unknown> };
    blocksPlayerTestHooks?: { timeoutMs: number };
    ran?: string[];
  }
}

const writeChunk = (dir: string, name: string, code: string) => {
  mkdirSync(join(dir, "chunks"), { recursive: true });
  writeFileSync(join(dir, "chunks", `${name}.js`), code);
};
const registering = (name: string, as = name) =>
  `(window.ran ||= []).push(${JSON.stringify(name)});\nblocksPlayer.register(${JSON.stringify(as)}, { name: ${JSON.stringify(name)} });\n`;

/** Loads a chunk in the page; returns its value or the rejection message. */
const load = (page: Page, name: string) =>
  page.evaluate(
    (chunk) =>
      window.blocksPlayer.load(chunk).then(
        (value) => ({ value }),
        (error: Error) => ({ error: error.message }),
      ),
    name,
  );

const scripts = (page: Page, name: string) =>
  page.locator(`script[src="chunks/${name}.js"]`).count();

const errorScreen = (page: Page) => page.getByRole("alert");

test.describe("ADR-0003 chunk loader, from file://", () => {
  let visit: Visit;
  test.beforeEach(async ({ write, open, page }) => {
    await write();
    visit = await open();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Composting at home");
  });

  test("a chunk that loads and registers resolves, its code ran, with no console error or failed request", async ({
    dir,
    page,
  }) => {
    writeChunk(dir, "hello", registering("hello"));
    expect(await load(page, "hello")).toEqual({ value: { name: "hello" } });
    expect(await page.evaluate(() => window.ran)).toEqual(["hello"]);
    expect(await load(page, "hello")).toEqual({ value: { name: "hello" } }); // kept for the session
    expect(await scripts(page, "hello")).toBe(1);
    expect(visit.errors).toEqual([]);
    expect(visit.badRequests).toEqual([]);
  });

  test("a missing chunk file rejects naming the chunk and shows the error screen", async ({
    page,
  }) => {
    expect(await load(page, "absent")).toEqual({ error: 'Chunk "absent" could not be read' });
    await expect(errorScreen(page)).toContainText("Part of this course could not load: absent");
    await expect(page.getByRole("button", { name: "Retry" })).toBeFocused();
    await expect(page.getByRole("main")).toBeHidden();
    expect(visit.errors.some((text) => text.includes('Chunk "absent" could not be read'))).toBe(
      true,
    );
    expect(await scripts(page, "absent")).toBe(0); // the failed script element is removed
  });

  test('a chunk that throws at top level rejects with "loaded without registering"', async ({
    dir,
    page,
  }) => {
    writeChunk(dir, "thrower", "throw new Error('broken chunk');\n");
    expect(await load(page, "thrower")).toEqual({
      error: 'Chunk "thrower" loaded without registering',
    });
    await expect(errorScreen(page)).toContainText("could not load: thrower");
  });

  test('a chunk that registers under another name rejects with "loaded without registering"', async ({
    dir,
    page,
  }) => {
    writeChunk(dir, "misnamed", registering("misnamed", "other-name"));
    expect(await load(page, "misnamed")).toEqual({
      error: 'Chunk "misnamed" loaded without registering',
    });
    await expect(errorScreen(page)).toContainText("could not load: misnamed");
  });

  test("two calls before the first settles share one script element and one result", async ({
    dir,
    page,
  }) => {
    writeChunk(dir, "shared", registering("shared"));
    const result = await page.evaluate(async () => {
      const first = window.blocksPlayer.load("shared");
      const second = window.blocksPlayer.load("shared");
      const elements = document.querySelectorAll('script[src="chunks/shared.js"]').length;
      const values = await Promise.all([first, second]);
      return { elements, same: values[0] === values[1], values };
    });
    expect(result).toEqual({
      elements: 1,
      same: true,
      values: [{ name: "shared" }, { name: "shared" }],
    });
    expect(await page.evaluate(() => window.ran)).toEqual(["shared"]);

    const failures = await page.evaluate(async () => {
      const both = [window.blocksPlayer.load("gone"), window.blocksPlayer.load("gone")];
      const elements = document.querySelectorAll('script[src="chunks/gone.js"]').length;
      const settled = await Promise.allSettled(both);
      return {
        elements,
        reasons: settled.map((s) => (s.status === "rejected" ? String(s.reason) : "ok")),
      };
    });
    expect(failures.elements).toBe(1);
    expect(failures.reasons).toEqual([
      'ChunkLoadError: Chunk "gone" could not be read',
      'ChunkLoadError: Chunk "gone" could not be read',
    ]);
  });

  test("Retry after a failure injects a new script element and the load resolves", async ({
    dir,
    page,
  }) => {
    expect(await load(page, "late")).toEqual({ error: 'Chunk "late" could not be read' });
    await expect(errorScreen(page)).toBeVisible();
    writeChunk(dir, "late", registering("late"));
    await page.getByRole("button", { name: "Retry" }).click();
    await expect.poll(() => page.evaluate(() => window.ran)).toEqual(["late"]);
    await expect(errorScreen(page)).toBeHidden();
    await expect(page.getByRole("main")).toBeVisible();
    expect(await scripts(page, "late")).toBe(1);
    expect(await load(page, "late")).toEqual({ value: { name: "late" } });
  });

  test("a chunk name that could leave the chunk folder is refused without a request", async ({
    page,
  }) => {
    expect(await load(page, "../course-data")).toEqual({
      error: 'Chunk "../course-data" is not a chunk name',
    });
    expect(await page.locator("script[src^='chunks/']").count()).toBe(0);
  });
});

test.describe("[rise:R20] course data boot", () => {
  test("loads the course data by script from file:// with no console error or failed request", async ({
    write,
    open,
    page,
  }) => {
    await write();
    const visit = await open();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Composting at home");
    expect(await page.locator("script[src='course-data.js']").count()).toBe(1);
    expect(visit.errors).toEqual([]);
    expect(visit.badRequests).toEqual([]);
  });

  test("a missing data file shows a clear error; Retry loads it once it is there", async ({
    dir,
    write,
    open,
    page,
  }) => {
    await write();
    const data = readFileSync(join(dir, "course-data.js"));
    rmSync(join(dir, "course-data.js"));
    await open();
    await expect(errorScreen(page)).toHaveText(
      /Part of this course could not load: course content/,
    );
    await expect(page).toHaveTitle("Part of this course could not load: course content");
    await expect(page.getByRole("button", { name: "Retry" })).toBeFocused();
    writeFileSync(join(dir, "course-data.js"), data);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Composting at home");
    await expect(errorScreen(page)).toBeHidden();
  });

  for (const [what, code] of <const>[
    ["registers nothing", "// empty\n"],
    ["throws", "throw new Error('bad data');\n"],
    ["holds no course", 'blocksPlayer.register("course-data", btoa("{}"));\n'],
  ]) {
    test(`a data file that ${what} shows the error screen`, async ({ dir, write, open, page }) => {
      await write();
      writeFileSync(join(dir, "course-data.js"), code);
      await open();
      await expect(errorScreen(page)).toContainText("could not load: course content");
      await expect(page.getByRole("main")).toHaveCount(0);
    });
  }
});

/** Serves `dir` over http://, holding the request for `held` open until the server closes. */
async function serve(dir: string, held: string): Promise<{ url: string; server: Server }> {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (path === held) return; // never answered
    try {
      const body = readFileSync(join(dir, path));
      response.writeHead(200, {
        "content-type": types[extname(path)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, server };
}

test.describe("load timeouts, over http:// with a held request", () => {
  for (const [title, held, part] of [
    [
      "a chunk that neither loads nor fails rejects after the timeout, naming the chunk",
      "/chunks/stalled.js",
      "stalled",
    ],
    [
      "[rise:R20] course data that never arrives shows the error screen after the timeout",
      "/course-data.js",
      "course content",
    ],
  ] as const) {
    test(title, async ({ dir, write, open, page }) => {
      await write();
      const { url, server } = await serve(dir, held);
      try {
        await page.addInitScript(() => {
          window.blocksPlayerTestHooks = { timeoutMs: 500 };
        });
        await open("", url);
        if (part === "stalled") {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          expect(await load(page, "stalled")).toEqual({
            error: 'Chunk "stalled" did not load within 500 ms',
          });
        }
        await expect(errorScreen(page)).toContainText(`could not load: ${part}`);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });
  }
});
