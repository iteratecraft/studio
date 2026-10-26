// ADR-0006, M2-06: the engine builds packages without Node.js. The job runner and the export job
// run in a Chromium page and buildPackage runs in the export worker, a module Web Worker, for every
// standard and every course the golden-trace harness runs (standards.e2e.ts). Each package must be
// byte for byte the one Node.js builds, which is the package whose trace matches the golden. And a
// cancelled job's worker stops within 2 s (ENG-15).
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import {
  cmi5Exporter,
  type Exporter,
  packagedMediaKeys,
  type Standard,
  scorm12Exporter,
  scorm2004Exporter,
  webExporter,
  xapiExporter,
} from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import { fontKey, fontsOf } from "@course-suite/format";
import { expect, test } from "@playwright/test";
import { build } from "rolldown";
import { blocksZip, standardsCourses } from "../test/blocks.js";
import type { PageCourse } from "./jobs-page.js";

const STANDARDS: Record<Standard, () => Exporter> = {
  scorm12: scorm12Exporter,
  scorm2004: scorm2004Exporter,
  xapi: xapiExporter,
  cmi5: cmi5Exporter,
  web: webExporter,
};

/** Bundles an entry for the browser, minified as the app ships it. */
async function bundle(input: string): Promise<string> {
  const { output } = await build({
    input,
    platform: "browser",
    write: false,
    output: { format: "esm", minify: true },
  });
  if (output.length !== 1) throw new Error(`${input} split into ${output.length} chunks`);
  return output[0].code;
}

const FILES: Record<string, string> = {};
let server: Server;
let origin = "";

test.beforeAll(async () => {
  FILES["/page.js"] = await bundle(fileURLToPath(new URL("jobs-page.ts", import.meta.url)));
  FILES["/export-worker.js"] = await bundle(
    fileURLToPath(import.meta.resolve("@course-suite/jobs/export-worker")),
  );
  FILES["/busy-worker.js"] = "onmessage = () => { for (;;) {} };";
  FILES["/"] =
    '<!doctype html><html lang="en"><title>Jobs in the browser</title><script type="module" src="/page.js"></script>';
  server = createServer((request, response) => {
    const body = FILES[new URL(request.url ?? "/", "http://localhost").pathname];
    if (body === undefined) return response.writeHead(404).end();
    response.writeHead(200, {
      "Content-Type": request.url === "/" ? "text/html" : "text/javascript",
    });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  test.info().annotations.push({
    type: "bundle sizes (minified bytes)",
    description: `page with runner and export job: ${FILES["/page.js"].length}; export worker: ${FILES["/export-worker.js"].length}`,
  });
});

test.afterAll(() => new Promise((resolve) => server.close(resolve)));

for (const standard of Object.keys(STANDARDS) as Standard[]) {
  test(`buildPackage in a Web Worker gives the same ${standard} packages as Node.js, for every golden-trace course`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const courses = standardsCourses(standard);
    const node: Record<string, string> = {};
    const sent: PageCourse[] = [];
    for (const { name, course, media } of courses) {
      const zip = await blocksZip(course, STANDARDS[standard](), media);
      node[name] = createHash("sha256").update(zip).digest("hex");
      const files: Record<string, string> = {};
      for (const key of packagedMediaKeys(course)) {
        const data = media(key);
        if (data) files[key] = Buffer.from(data).toString("base64");
      }
      const fonts: PageCourse["fonts"] = {};
      const base64 = (data: Uint8Array | undefined) => data && Buffer.from(data).toString("base64");
      for (const font of [
        ...Object.values(fontsOf(course.theme)),
        ...Object.values(fontsOf(undefined)),
      ]) {
        const found = await nodeFonts(font);
        if (!found) continue;
        fonts[fontKey(font)] = {
          name: found.name,
          regular: base64(found.regular) as string,
          ...(found.bold && { bold: base64(found.bold) }),
          ...(found.italic && { italic: base64(found.italic) }),
        };
      }
      sent.push({ name, course, media: files, fonts });
    }
    await page.goto(`${origin}/`);
    await page.waitForFunction("globalThis.jobsPage");
    const worker = await page.evaluate(
      ([courses, standard]) =>
        (
          globalThis as unknown as {
            jobsPage: { exportAll(c: unknown, s: unknown): Promise<Record<string, string>> };
          }
        ).jobsPage.exportAll(courses, standard),
      [sent, standard] as const,
    );
    expect(worker).toEqual(node);
    expect(Object.keys(worker)).toHaveLength(courses.length);
    expect(errors).toEqual([]);
  });
}

test("ENG-15: cancelling a job stops its busy worker within 2 s and removes its temporary output", async ({
  page,
}) => {
  await page.goto(`${origin}/`);
  await page.waitForFunction("globalThis.jobsPage");
  const result = await page.evaluate(() =>
    (
      globalThis as unknown as {
        jobsPage: { cancelBusy(): Promise<{ ms: number; state: string; files: string[] }> };
      }
    ).jobsPage.cancelBusy(),
  );
  expect(result).toMatchObject({ state: "cancelled", files: [] });
  expect(result.ms).toBeLessThan(2_000);
});
