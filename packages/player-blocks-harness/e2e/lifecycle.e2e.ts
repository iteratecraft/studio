// Player lifecycle from file:// (M1-13, ENG-06a): player events, the debug tracking adapter, saved
// state and resume, page-hide, the exit link and goodbye page, and the save-failed notice (rise.md
// rules 2 and 3; standards.md §5 rules 3, 7 to 9 and 17).
import type { Block } from "@course-suite/format";
import { sampleCourse } from "@course-suite/format/test/courses";
import { continueBlock, course, lesson, paragraph, quiz } from "./courses.ts";
import { adapterCalls, expect, playerEvents, test, useHooks } from "./fixture.ts";

test("[rise:R2] [standards:R3] the debug adapter sees the start, every lesson opened as the bookmark, and the events", async ({
  write,
  open,
  page,
}) => {
  await write();
  await useHooks(page);
  await open();
  await page.getByRole("link", { name: "Begin course" }).click();
  await page.getByRole("link", { name: "Next lesson Greens and browns" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Greens and browns");

  const calls = await adapterCalls(page);
  expect(calls[0]?.method).toBe("initialize");
  expect(
    calls.filter((call) => call.method === "writeLocation").map((call) => call.args[0]),
  ).toEqual(["#/lessons/lessonwhat", "#/lessons/lessonmix1"]);
  expect(calls.find((call) => call.method === "reportStatus")?.args[0]).toMatchObject({
    completion: "incomplete",
  });
  expect(await playerEvents(page)).toEqual([
    { type: "started" },
    { type: "page-entered", page: "lessonwhat" },
    { type: "page-left", page: "lessonwhat" },
    { type: "page-entered", page: "lessonmix1" },
  ]);
});

test("snapshot and restore: a new visit resumes the bookmark, progress, check answers and the quiz attempt", async ({
  write,
  open,
  page,
}) => {
  const base = sampleCourse();
  await write({ course: { ...base, entries: [...base.entries, quiz("quizlong01", "Long quiz")] } });
  await useHooks(page, { keep: true });
  await open("#/lessons/lessonwhat");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "A sealed lid and no water" }).check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await page
    .getByRole("navigation", { name: "Course contents" })
    .getByRole("link", { name: "Long quiz" })
    .click();
  await page.getByRole("button", { name: "Begin quiz" }).click();
  await page.getByRole("radio", { name: "Brown" }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".outline-progress")).toHaveText("20% done");
  // The state is written 0.1 s after the last change (rise.md rule 3).
  await expect
    .poll(async () => (await adapterCalls(page)).some((c) => c.method === "writeResume"))
    .toBe(true);

  await page.goto(page.url().replace(/#.*$/, ""));
  await expect(page.getByRole("link", { name: "Resume where you stopped" })).toHaveAttribute(
    "href",
    "#/lessons/quizlong01",
  );
  await expect(page.locator(".outline-progress")).toHaveText("20% done");
  await page.getByRole("link", { name: "Resume where you stopped" }).click();
  // The attempt goes on at the first unanswered question.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Question 2 of 3");
  await page
    .getByRole("navigation", { name: "Course contents" })
    .getByRole("link", { name: "What compost is" })
    .click();
  await expect(page.getByRole("radio", { name: "A sealed lid and no water" })).toBeChecked();
  await expect(page.locator(".feedback .outcome")).toHaveText("Incorrect");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("[standards:R7] [standards:R9] page-hide ends the session: state saved, time, suspend, terminate", async ({
  write,
  open,
  page,
}) => {
  await write();
  await useHooks(page);
  await open("#/lessons/lessonwhat");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  const methods = (await adapterCalls(page)).map((call) => call.method);
  expect(methods.slice(methods.lastIndexOf("setExit") - 1)).toEqual([
    "writeSessionTime",
    "setExit",
    "commit",
    "terminate",
  ]);
  expect((await adapterCalls(page)).find((call) => call.method === "setExit")?.args).toEqual([
    "suspend",
  ]);
  expect((await playerEvents(page)).at(-1)).toEqual({ type: "page-hide", reachedEnd: false });
});

test("[standards:P-16] before the page unloads, the state, time and a commit are saved and the session stays open", async ({
  write,
  open,
  page,
}) => {
  await write();
  await useHooks(page);
  await open("#/lessons/lessonwhat");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const before = (await adapterCalls(page)).length;
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  const methods = (await adapterCalls(page)).slice(before).map((call) => call.method);
  expect(methods.slice(-2)).toEqual(["writeSessionTime", "commit"]);
  expect(methods).not.toContain("terminate");
  // The leave did not happen: the learner goes on, and page-hide still ends the session.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  expect((await adapterCalls(page)).at(-1)?.method).toBe("terminate");
});

test("[standards:R8] the exit link ends the session and shows the goodbye page; normal exit at the end", async ({
  write,
  open,
  page,
}) => {
  await write({
    course: course([lesson("lessonone1", "Only lesson", paragraph("tparaone01", "One"))], {
      publish: { standard: "web", exitLink: true },
    }),
  });
  await useHooks(page);
  await open("#/lessons/lessonone1");
  await page.getByRole("button", { name: "Exit course" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compost check");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByRole("main")).toContainText(
    "You have left the course. You can close this window now.",
  );
  const calls = await adapterCalls(page);
  expect(calls.find((call) => call.method === "setExit")?.args).toEqual(["normal"]);
  expect(calls.at(-1)?.method).toBe("terminate");
  expect((await playerEvents(page)).map((event) => event.type)).toEqual([
    "started",
    "page-entered",
    "course-finished",
    "page-left",
    "exit",
  ]);
});

test("a state too large to save shows a notice that is announced, never blocks and can be dismissed", async ({
  write,
  open,
  page,
}) => {
  // A thousand seen blocks above an unpressed continue block: far over SCORM 1.2's 4,096 characters.
  const blocks: Block[] = Array.from({ length: 1000 }, (_, i) =>
    paragraph(`t${String(i).padStart(9, "0")}`, `Paragraph ${i}`),
  );
  await write({
    course: course([lesson("lessonbig1", "Long lesson", ...blocks, continueBlock("cgatebig01"))]),
  });
  await open("#/lessons/lessonbig1");
  const notice = page.locator(".notices[role=status]");
  await expect(notice).toContainText("Your progress cannot be saved right now.");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toBeEmpty();
});
