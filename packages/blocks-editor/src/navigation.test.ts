// M2-16: a microlearning from a template starts in steps, a blank one scrolls; the navigation
// panel keeps only the settings the author changed.
import { createTranslator } from "@course-suite/ui";
import { expect, test } from "vitest";
import { blankCourse } from "./course.js";
import { cleanedNavigation, navigationSummary } from "./navigation.js";
import { COURSE_TEMPLATES, courseFrom } from "./templates.js";

const t = createTranslator("en");

test("UI-BLOCKS-EDITOR-R49: a microlearning from a template starts in steps; a blank one scrolls", () => {
  const template = COURSE_TEMPLATES.find((one) => one.kind === "microlearning");
  if (!template) throw new Error("no microlearning template");
  const fromTemplate = courseFrom(template, "One idea", t);
  expect(fromTemplate.navigation).toEqual({ steps: true });
  expect(navigationSummary(fromTemplate, t)).toBe("Steps");
  const blank = blankCourse("microlearning", "Blank");
  expect(blank.navigation).toBeUndefined();
  expect(navigationSummary(blank, t)).toBe("Continuous scroll");
  // A course from a template keeps the default navigation.
  const course = courseFrom(COURSE_TEMPLATES[0] as (typeof COURSE_TEMPLATES)[0], "Course", t);
  expect(course.navigation).toBeUndefined();
  expect(navigationSummary(course, t)).toBe("Sidebar");
});

test("blocks-editor 2.18: a setting back at its default is left out, and nothing set is no navigation", () => {
  expect(cleanedNavigation({ menu: undefined, search: false })).toEqual({ search: false });
  expect(cleanedNavigation({ restricted: undefined })).toBeUndefined();
});
