// A package built by @course-suite/exporters launches in the test LMS: the manifest's launch page
// loads, its classic scripts and course data load from the package, and the SCO reaches the API.
import { buildPackage } from "@course-suite/exporters";
import { expect, test } from "@playwright/test";
import { readPackage } from "../src/package.js";
import { runPackage } from "../src/run-package.js";
import { stubInput } from "../test/stub-player.js";

test("a built SCORM 1.2 package launches in the test LMS and loads its course data", async ({
  browser,
}) => {
  const built = await buildPackage(stubInput());
  if (!built.ok) throw new Error(JSON.stringify(built.problems));
  const read = readPackage(built.value.zip);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  const run = await runPackage(read.value, { browser });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(run.trace.map((call) => [call.method, ...call.args, call.result])).toEqual([
    ["LMSInitialize", "", "true"],
    ["LMSSetValue", "cmi.core.lesson_location", "lesson0001", "true"],
    ["LMSSetValue", "cmi.core.lesson_status", "completed", "true"],
    ["LMSCommit", "", "true"],
    ["LMSFinish", "", "true"],
  ]);
});
