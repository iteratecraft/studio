// Packages exported with the settings the publish panel produces (M2-18; BLK-10, STD-08): the
// panel's defaults in every standard, reset on update at the next launch in the test LMS (rise.md
// rule 12), and LMS-only launch outside a learning system (UI-PUBCOLLAB-R17, standards.md P-5).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  blocksPlayer,
  buildPackage,
  cmi5Exporter,
  scorm12Exporter,
  scorm2004Exporter,
  xapiExporter,
} from "@course-suite/exporters";
import { nodeFonts } from "@course-suite/fonts/test/node-fonts";
import {
  type Course,
  exportCourseOf,
  nextPackageVersion,
  PUBLISH_DEFAULTS,
  type PublishSettings,
} from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { english } from "@course-suite/labels";
import { expect, test } from "@playwright/test";
import { readPackage } from "../src/package.js";
import { closeSco, relaunchCmi, runPackage } from "../src/run-package.js";
import { STORED } from "../test/blocks.js";

const label = english.labels;

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

/**
 * Two lessons, published with the panel's defaults and `settings` over them; `packageVersion` is the
 * version of the last export.
 */
const course = (settings: Partial<PublishSettings> = {}, packageVersion?: number): Course => ({
  schemaVersion: "1.0",
  id: PROJECT_ID,
  ...(packageVersion !== undefined && { packageVersion }),
  kind: "course",
  title: "Rain gardens",
  sourceLanguage: "en",
  publish: { ...PUBLISH_DEFAULTS, ...settings },
  entries: [
    {
      id: "lessrain01",
      kind: "lesson",
      title: "Why plant one",
      blocks: [paragraph("tpara00001", "A rain garden soaks up water from the roof.")],
    },
    {
      id: "lessrain02",
      kind: "lesson",
      title: "Where to dig",
      blocks: [paragraph("tpara00002", "Dig it downhill from the house.")],
    },
  ],
  media: [],
});

const EXPORTERS = {
  scorm12: scorm12Exporter,
  scorm2004: scorm2004Exporter,
  xapi: xapiExporter,
  cmi5: cmi5Exporter,
} as const;

/** Exports `course` as the editor does: the course to export, with the next package version. */
async function exported(source: Course) {
  const course = exportCourseOf(source);
  const standard = course.publish?.standard as keyof typeof EXPORTERS;
  const built = await buildPackage({
    course,
    player: blocksPlayer(),
    exporter: EXPORTERS[standard](),
    media: () => undefined,
    fonts: nodeFonts,
    packageVersion: nextPackageVersion(source),
  });
  if (!built.ok) throw new Error(JSON.stringify(built.problems, null, 2));
  const read = await readPackage(built.value.zip);
  if (!read.ok) throw new Error(JSON.stringify(read.problems, null, 2));
  return read.value;
}

for (const standard of Object.keys(EXPORTERS) as (keyof typeof EXPORTERS)[]) {
  test(`[standards:E-16] [standards:E-22] STD-08: the panel's defaults export a valid ${standard} package with no other input`, async () => {
    const pkg = await exported(course({ standard }));
    const kinds = { scorm12: "scorm", scorm2004: "scorm", xapi: "tincan", cmi5: "cmi5" };
    expect(pkg.descriptor.kind).toBe(kinds[standard]);
  });
}

test("[rise:R12] UI-PUBCOLLAB-R16, BLK-10: a re-export with reset on update clears the bookmark and progress at the next LMS launch", async ({
  browser,
}) => {
  // The first package: the learner finishes the first lesson, opens the second and leaves.
  const first = await runPackage(await exported(course({ resetOnUpdate: true })), {
    browser,
    drive: async (sco, page) => {
      await sco.getByRole("link", { name: label["course.begin"] }).click();
      await sco
        .getByRole("navigation", { name: label["sr.outline"] })
        .getByRole("link", { name: "Where to dig" })
        .click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Where to dig");
      await closeSco(page);
    },
  });
  expect(first.pageErrors).toEqual([]);
  expect(first.cmi.core).toMatchObject({ lesson_location: "#/lessons/lessrain02" });

  // The same package again resumes there.
  const again = await runPackage(await exported(course({ resetOnUpdate: true })), {
    browser,
    cmi: relaunchCmi(first.cmi),
    drive: async (sco, page) => {
      await expect(sco.getByRole("link", { name: label["course.resume"] })).toBeVisible();
      await closeSco(page);
    },
  });
  expect(again.pageErrors).toEqual([]);

  // The update, one version higher: the learner starts again.
  const update = await runPackage(await exported(course({ resetOnUpdate: true }, 1)), {
    browser,
    cmi: relaunchCmi(first.cmi),
    drive: async (sco, page) => {
      await expect(sco.getByRole("link", { name: label["course.begin"] })).toBeVisible();
      await expect(sco.getByRole("link", { name: label["course.resume"] })).toHaveCount(0);
      await sco.getByRole("link", { name: label["course.begin"] }).click();
      await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Why plant one");
      await closeSco(page);
    },
  });
  expect(update.pageErrors).toEqual([]);
  expect(update.cmi.core).toMatchObject({ lesson_location: "#/lessons/lessrain01" });
});

test("[standards:P-5] UI-PUBCOLLAB-R17, BLK-10: with LMS-only on, a SCORM package opened from a web server outside a learning system shows one line and sends nothing; opened from disk it runs", async ({
  page,
}) => {
  const pkg = await exported(course());
  const origin = "http://lms-only.test/";
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route(`${origin}**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const body = await pkg.files.read(path);
    if (!body) return route.fulfill({ status: 404 });
    const type = path.endsWith(".html")
      ? "text/html"
      : path.endsWith(".css")
        ? "text/css"
        : "text/javascript";
    await route.fulfill({ body: Buffer.from(body), contentType: type });
  });
  await page.goto(`${origin}index.html`);
  await expect(page.getByRole("alert")).toHaveText(label["error.lmsOnly"]);
  await expect(page.getByRole("link", { name: label["course.begin"] })).toHaveCount(0);
  expect(requests.every((url) => url.startsWith(origin))).toBe(true);
  expect(await page.evaluate(STORED)).toBe(0);

  const dir = mkdtempSync(join(tmpdir(), "lms-only-"));
  try {
    for (const name of pkg.files.names) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), (await pkg.files.read(name)) as Uint8Array);
    }
    await page.goto(pathToFileURL(join(dir, "index.html")).href);
    await expect(page.getByRole("link", { name: label["course.begin"] })).toBeVisible();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
