import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { readPackage } from "../src/package.js";
import { runPackage } from "../src/run-package.js";
import { makeZip, zipDirectory } from "../test/make-zip.js";

const load = (name: string) => {
  const result = readPackage(
    zipDirectory(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.value;
};

// Golden call order of the hand-written SCOs (standards.md S-1, T-6, T-7; section 4.1 elements).
test("records the SCORM 1.2 call trace of the test SCO", async ({ browser }) => {
  const run = await runPackage(load("scorm12-sco"), { browser });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(run.trace).toEqual([
    { method: "LMSInitialize", args: [""], result: "true", errorCode: "0" },
    {
      method: "LMSGetValue",
      args: ["cmi.core.lesson_status"],
      result: "not attempted",
      errorCode: "0",
    },
    { method: "LMSSetValue", args: ["cmi.core.score.raw", "90"], result: "true", errorCode: "0" },
    {
      method: "LMSSetValue",
      args: ["cmi.core.lesson_status", "passed"],
      result: "true",
      errorCode: "0",
    },
    {
      method: "LMSSetValue",
      args: ["cmi.suspend_data", "v1;done"],
      result: "true",
      errorCode: "0",
    },
    { method: "LMSCommit", args: [""], result: "true", errorCode: "0" },
    { method: "LMSFinish", args: [""], result: "true", errorCode: "0" },
  ]);
});

test("records the SCORM 2004 call trace of the test SCO", async ({ browser }) => {
  const run = await runPackage(load("scorm2004-sco"), { browser });
  expect(run.pageErrors).toEqual([]);
  expect(run.finished).toBe(true);
  expect(run.trace.map((call) => [call.method, ...call.args, call.result, call.errorCode])).toEqual(
    [
      ["Initialize", "", "true", "0"],
      ["SetValue", "cmi.score.scaled", "0.9", "true", "0"],
      ["SetValue", "cmi.completion_status", "completed", "true", "0"],
      ["SetValue", "cmi.success_status", "passed", "true", "0"],
      ["SetValue", "cmi.exit", "normal", "true", "0"],
      ["Commit", "", "true", "0"],
      ["Terminate", "", "true", "0"],
    ],
  );
});

test("returns the partial trace when the SCO never finishes", async () => {
  const manifest = readFileSync(
    new URL("../fixtures/scorm12-sco/imsmanifest.xml", import.meta.url),
  );
  const sco = '<!doctype html><title>Stuck</title><script>parent.API.LMSInitialize("");</script>';
  const result = readPackage(
    makeZip([
      { name: "imsmanifest.xml", data: manifest },
      { name: "index.html", data: sco },
    ]),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  // No browser passed: runPackage launches and closes its own.
  const run = await runPackage(result.value, { timeoutMs: 1_000 });
  expect(run.finished).toBe(false);
  expect(run.trace.map((call) => call.method)).toEqual(["LMSInitialize"]);
});

test("keeps running after a finish call that fails", async ({ browser }) => {
  const manifest = readFileSync(
    new URL("../fixtures/scorm12-sco/imsmanifest.xml", import.meta.url),
  );
  // LMSFinish before LMSInitialize fails; the run must go on to the real finish.
  const sco = `<!doctype html><title>Early finish</title><script>
parent.API.LMSFinish("");
setTimeout(() => { parent.API.LMSInitialize(""); parent.API.LMSFinish(""); }, 300);
</script>`;
  const result = readPackage(
    makeZip([
      { name: "imsmanifest.xml", data: manifest },
      { name: "index.html", data: sco },
    ]),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  const run = await runPackage(result.value, { browser });
  expect(run.finished).toBe(true);
  expect(run.trace.map((call) => [call.method, call.result])).toEqual([
    ["LMSFinish", "false"],
    ["LMSInitialize", "true"],
    ["LMSFinish", "true"],
  ]);
});
