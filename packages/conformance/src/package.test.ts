import { fileURLToPath } from "node:url";
import { makeZip } from "@course-suite/zip/test/make-zip";
import { describe, expect, test } from "vitest";
import { zipDirectory } from "../test/make-zip.js";
import { readPackage } from "./package.js";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

describe("readPackage", () => {
  test("reads the hand-made SCORM 1.2 package (S-2)", async () => {
    const result = await readPackage(await zipDirectory(fixture("scorm12-sco")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.descriptor.kind).toBe("scorm");
    expect(result.value.launchHref).toBe("index.html");
    expect([...result.value.files.names].sort()).toEqual(["imsmanifest.xml", "index.html"]);
  });

  test("detects tincan.xml and cmi5.xml packages", async () => {
    const tincan = await readPackage(
      await makeZip([
        {
          name: "tincan.xml",
          data: '<tincan><activities><activity id="urn:a"><launch>start.html?x=1</launch></activity></activities></tincan>',
        },
        { name: "start.html", data: "" },
      ]),
    );
    expect(tincan.ok && tincan.value.descriptor.kind).toBe("tincan");
    const langs =
      "<title><langstring>T</langstring></title><description><langstring>D</langstring></description>";
    const cmi5 = await readPackage(
      await makeZip([
        {
          name: "cmi5.xml",
          data: `<courseStructure><course id="c">${langs}</course><au id="a">${langs}<url>https://example.org/au</url></au></courseStructure>`,
        },
      ]),
    );
    expect(cmi5.ok && cmi5.value.launchHref).toBe("https://example.org/au");
  });

  test("rejects a package whose launch file is missing", async () => {
    const result = await readPackage(
      await makeZip([
        {
          name: "tincan.xml",
          data: '<tincan><activities><activity id="urn:a"><launch>missing%20page.html</launch></activity></activities></tincan>',
        },
      ]),
    );
    expect(result.ok || result.problems).toEqual([
      {
        file: "tincan.xml",
        message: "launches 'missing%20page.html', which is not in the package",
      },
    ]);
  });

  test.each([
    ["a/../index.html", true],
    ["./index.html?x=1#top", true],
    ["https://example.org/au", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["//example.org/au", false],
    ["/index.html", false],
    ["../index.html", false],
    ["a/../../index.html", false],
  ])("checks the launch href %s", async (href, accepted) => {
    const result = await readPackage(
      await makeZip([
        {
          name: "tincan.xml",
          data: `<tincan><activities><activity id="urn:a"><launch>${href}</launch></activity></activities></tincan>`,
        },
        { name: "index.html", data: "" },
      ]),
    );
    expect(result.ok || result.problems).toEqual(
      accepted || [{ file: "tincan.xml", message: expect.stringContaining(`launches '${href}'`) }],
    );
  });

  test("rejects a package with no descriptor or with two", async () => {
    const none = await readPackage(await makeZip([{ name: "index.html", data: "" }]));
    expect(none.ok || none.problems[0]?.message).toContain("has no imsmanifest.xml");
    const two = await readPackage(
      await makeZip([
        { name: "imsmanifest.xml", data: "" },
        { name: "tincan.xml", data: "" },
      ]),
    );
    expect(two.ok || two.problems[0]?.message).toContain("more than one descriptor");
  });

  test("passes unzip problems through unchanged", async () => {
    const result = await readPackage(await makeZip([{ name: "../imsmanifest.xml", data: "" }]));
    expect(result.ok || result.problems[0]?.file).toBe("../imsmanifest.xml");
  });
});
