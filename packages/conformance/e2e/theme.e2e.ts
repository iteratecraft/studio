// The course theme in LMS packages (M2-17; BLK-09, ENG-08): a skipped cover opens the first lesson
// at launch and, for a returning learner, the lesson where they stopped; the text is drawn in the
// theme's fonts, a custom one among them, which the package carries.
import { TEST_CUSTOM_FONT } from "@course-suite/fonts/test/node-fonts";
import type { Course } from "@course-suite/format";
import { PROJECT_ID } from "@course-suite/format/test/courses";
import { expect, type Frame, test } from "@playwright/test";
import type { CoursePackage } from "../src/package.js";
import { closeSco, relaunchCmi, relaunchCmi2004, runPackage } from "../src/run-package.js";
import type { CmiData } from "../src/test-lms.js";
import { scorm12Package, scorm2004Package } from "../test/blocks.js";

const paragraph = (id: string, text: string) => ({
  id,
  category: "text" as const,
  variant: "paragraph" as const,
  items: [{ id: `i${id.slice(1)}`, kind: "content" as const, text: `<p>${text}</p>` }],
});

const course: Course = {
  schemaVersion: "1.0",
  id: PROJECT_ID,
  kind: "course",
  title: "Compost basics",
  sourceLanguage: "en",
  theme: { cover: { skip: true }, fonts: { heading: TEST_CUSTOM_FONT } },
  entries: [
    {
      id: "lessonone1",
      kind: "lesson",
      title: "Why compost",
      blocks: [paragraph("tpara00001", "Compost feeds the soil.")],
    },
    {
      id: "lessontwo1",
      kind: "lesson",
      title: "Greens and browns",
      blocks: [paragraph("tpara00002", "Mix wet greens with dry browns.")],
    },
  ],
  media: [],
};

/** Whether the SCO's page has drawn text in the font family, from the package's own file. */
const fontLoaded = (sco: Frame, family: string) =>
  sco.evaluate(async (family) => {
    await document.fonts.ready;
    return [...document.fonts].some((face) => face.family === family && face.status === "loaded");
  }, family);

const LMS: [string, (course: Course) => Promise<CoursePackage>, (cmi: CmiData) => CmiData][] = [
  ["SCORM 1.2", scorm12Package, relaunchCmi],
  ["SCORM 2004", scorm2004Package, relaunchCmi2004],
];

for (const [name, build, relaunch] of LMS) {
  test(`[rise:3E] BLK-09, ENG-08: ${name}: a skipped cover opens the first lesson at launch and where the learner stopped on relaunch, in the theme's packaged fonts`, async ({
    browser,
  }) => {
    const pkg = await build(course);
    expect(
      pkg.files.names.filter((file) => file.startsWith("fonts/custom-testfont01-")),
    ).toHaveLength(3);

    const first = await runPackage(pkg, {
      browser,
      drive: async (sco, page) => {
        const heading = sco.getByRole("heading", { level: 1 });
        await expect(heading).toHaveText("Why compost");
        await expect(sco.getByRole("link", { name: "Begin course" })).toHaveCount(0);
        await expect(heading).toHaveCSS("font-family", /^"?custom-testfont01"?, /);
        await expect.poll(() => fontLoaded(sco, "custom-testfont01")).toBe(true);
        await sco
          .getByRole("navigation", { name: "Course contents" })
          .getByRole("link", { name: "Greens and browns" })
          .click();
        await expect(heading).toHaveText("Greens and browns");
        await closeSco(page);
      },
    });
    expect(first.pageErrors).toEqual([]);
    expect(first.finished).toBe(true);

    const second = await runPackage(pkg, {
      browser,
      cmi: relaunch(first.cmi),
      drive: async (sco, page) => {
        await expect(sco.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");
        await closeSco(page);
      },
    });
    expect(second.pageErrors).toEqual([]);
  });
}
