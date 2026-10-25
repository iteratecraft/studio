// ADR-0006: the project container and the zip package run without Node.js. The built packages are
// served as they are, with an import map, and driven in Chromium: the project in a page, the zip
// package in a module Web Worker.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { fullCourse } from "@course-suite/format/test/courses";
import { expect, test } from "@playwright/test";

const dist = (name: string) => dirname(fileURLToPath(import.meta.resolve(name)));
const FOLDERS: Record<string, string> = {
  zip: dist("@course-suite/zip"),
  format: dist("@course-suite/format"),
  project: join(import.meta.dirname, "..", "dist"),
};
const TYPES: Record<string, string> = { ".js": "text/javascript", ".json": "application/json" };
const PAGE = `<!doctype html><html lang="en"><title>Engine in the browser</title>
<script type="importmap">{"imports": {
  "@course-suite/zip": "/zip/index.js",
  "@course-suite/format": "/format/index.js",
  "@course-suite/project": "/project/index.js"
}}</script>`;
const WORKER = `import { readZip, writeZip } from "/zip/index.js";
const data = new TextEncoder().encode("worker ".repeat(5000));
const zip = await writeZip([{ name: "a.txt", data }, { name: "b.png", data }]);
const read = await readZip(zip);
const back = read.ok ? new TextDecoder().decode(await read.value.read("a.txt")) : "";
postMessage({ ok: read.ok, same: back === "worker ".repeat(5000), size: zip.length });`;

let server: Server;
let origin = "";

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const send = (type: string, body: string | Uint8Array) => {
      response.writeHead(200, { "Content-Type": type });
      response.end(body);
    };
    if (path === "/") return send("text/html", PAGE);
    if (path === "/worker.js") return send("text/javascript", WORKER);
    const [, folder = "", ...rest] = path.split("/");
    const root = FOLDERS[folder];
    const file = root && normalize(join(root, ...rest));
    if (!root || !file?.startsWith(root)) return response.writeHead(404).end();
    try {
      send(TYPES[extname(file)] ?? "application/octet-stream", readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise((resolve) => server.close(resolve)));

test("a project saves, reopens and restores a snapshot in the browser, without Node.js", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/`);
  const result = await page.evaluate(async (course) => {
    const project = await import("@course-suite/project");
    const { serializeCourse } = await import("@course-suite/format");
    const files = project.memoryProjectFiles();
    const opened = project.createProject(course as never);
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    const key = await project.addAsset(opened, bytes, {
      name: "photo.jpg",
      type: "image/jpeg",
      source: "upload",
    });
    const snapshot = project.takeSnapshot(opened, { name: "v1", trigger: "manual" });
    const wanted = serializeCourse(opened.course);
    opened.course.title = "Changed";
    await project.saveProject(files, "Course.course", opened);
    await project.autosaveProject(files, "Course.course", opened);
    const reopened = await project.openProject(files, "Course.course");
    if (!reopened.ok || !reopened.recovered) return { error: JSON.stringify(reopened) };
    await project.restoreSnapshot(reopened.project, snapshot.id);
    const asset = await project.readAsset(reopened.project, key);
    return {
      restored: serializeCourse(reopened.project.course) === wanted,
      asset: asset?.length === bytes.length && asset.every((byte, i) => byte === bytes[i]),
      key,
    };
  }, fullCourse());
  expect(result).toEqual({ restored: true, asset: true, key: expect.stringMatching(/\.jpg$/) });
  expect(errors).toEqual([]);
});

test("the zip package writes and reads an archive in a module Web Worker", async ({ page }) => {
  await page.goto(`${origin}/`);
  const result = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const worker = new Worker("/worker.js", { type: "module" });
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
      }),
  );
  expect(result).toEqual({ ok: true, same: true, size: expect.any(Number) });
});
