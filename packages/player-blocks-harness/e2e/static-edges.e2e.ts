// Edge cases of the text and static blocks in the real player (M2-12, BLK-04; rise.md 3C;
// blocks-editor.md 2.5, 2.9, 2.10; UI-BLOCKS-R45, R51): a cleared checklist point never holds a
// continue block back and a picture links to a lesson or a web page. Their colours in every theme:
// theme-contrast.e2e.ts.
import type { Block, ContentItem, Course } from "@course-suite/format";
import { staticBlocksCourse } from "@course-suite/format/test/courses";
import { expectAccessible } from "./axe.ts";
import { continueBlock, course, lesson } from "./courses.ts";
import { expect, test } from "./fixture.ts";

const subject = () => staticBlocksCourse();
const block = (from: Course, id: string) =>
  structuredClone(
    from.entries
      .flatMap((entry) => (entry.kind === "lesson" ? entry.blocks : []))
      .find((b) => b.id === id) as Block,
  );
const heading = (id: string, variant: string, title: string, level?: number): Block => ({
  id,
  category: "text",
  variant,
  items: [{ id: `i${id.slice(1)}`, kind: "content", title }],
  ...(level !== undefined && { variantSettings: { headingLevel: level } }),
});

test("[rise:3C] UI-BLOCKS-R45, R51, BLK-04: a checklist point whose text was cleared is not shown and does not hold the continue block back", async ({
  write,
  open,
  page,
}) => {
  const from = subject();
  const checklist = block(from, "stlistchek");
  // The editor removes an item's text when the author clears it.
  const cleared = checklist.items?.[1] as ContentItem;
  delete cleared.text;
  await write({
    course: course([
      lesson(
        "lessoncler",
        "Cleared",
        checklist,
        continueBlock("cgatecler1", "block-above"),
        heading("hafter0001", "heading", "After the gate"),
      ),
    ]),
  });
  await open("#/lessons/lessoncler");
  const gate = page.getByRole("button", { name: "Continue" });
  await expect(gate).toHaveAttribute("aria-disabled", "true");
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(1);
  await boxes.focus();
  await page.keyboard.press("Space");
  await expect(gate).not.toHaveAttribute("aria-disabled");
  await gate.click();
  await expect(page.getByRole("heading", { name: "After the gate" })).toBeVisible();
});

test("[rise:3C] blocks-editor 2.10, W15: a picture links to a lesson, which opens in place, or to a web page, which opens in a new tab and says so", async ({
  write,
  open,
  page,
}) => {
  const from = subject();
  const toLesson = block(from, "stimgcentr");
  toLesson.variantSettings = { link: "#/lessons/lessonnext" };
  // Decorative, so the link is named by where it goes.
  const toWeb = block(from, "stimgfullw");
  toWeb.variantSettings = { link: "https://example.org/moon" };
  await write({
    course: course(
      [
        lesson("lessonlink", "Links", toLesson, toWeb),
        lesson("lessonnext", "Next steps", heading("hnext00001", "heading", "Welcome")),
      ],
      { media: from.media },
    ),
  });
  const visit = await open("#/lessons/lessonlink");
  await expect(page.locator(".image-link")).toHaveCount(2);
  // Before axe, which reads the style sheets in ways a page from disk refuses.
  expect(visit.badRequests).toEqual([]);
  const web = page.getByRole("link", { name: "https://example.org/moon (opens in a new tab)" });
  await expect(web).toHaveAttribute("target", "_blank");
  await expect(web).toHaveAttribute("rel", "noopener noreferrer");
  // A linked picture opens its link instead of enlarging.
  await expect(page.locator(".zoom-open")).toHaveCount(0);
  await expectAccessible(page, "linked pictures", [320, 1280]);
  const inPlace = page.getByRole("link", { name: "The moon, half lit, over a roof." });
  await expect(inPlace).not.toHaveAttribute("target");
  await inPlace.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Next steps");
});
