import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { makeZip, zipDirectory } from "../test/make-zip.js";
import { readPackage } from "./package.js";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

describe("readPackage", () => {
  test("reads the hand-made SCORM 1.2 package (S-2)", () => {
    const result = readPackage(zipDirectory(fixture("scorm12-sco")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.descriptor.kind).toBe("scorm");
    expect(result.value.launchHref).toBe("index.html");
    expect([...result.value.files.keys()].sort()).toEqual(["imsmanifest.xml", "index.html"]);
  });

  test("detects tincan.xml and cmi5.xml packages", () => {
    const tincan = readPackage(
      makeZip([
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
    const cmi5 = readPackage(
      makeZip([
        {
          name: "cmi5.xml",
          data: `<courseStructure><course id="c">${langs}</course><au id="a">${langs}<url>https://example.org/au</url></au></courseStructure>`,
        },
      ]),
    );
    expect(cmi5.ok && cmi5.value.launchHref).toBe("https://example.org/au");
  });

  test("rejects a package whose launch file is missing", () => {
    const result = readPackage(
      makeZip([
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

  test("rejects a package with no descriptor or with two", () => {
    const none = readPackage(makeZip([{ name: "index.html", data: "" }]));
    expect(none.ok || none.problems[0]?.message).toContain("has no imsmanifest.xml");
    const two = readPackage(
      makeZip([
        { name: "imsmanifest.xml", data: "" },
        { name: "tincan.xml", data: "" },
      ]),
    );
    expect(two.ok || two.problems[0]?.message).toContain("more than one descriptor");
  });

  test("passes unzip problems through unchanged", () => {
    const result = readPackage(makeZip([{ name: "../imsmanifest.xml", data: "" }]));
    expect(result.ok || result.problems[0]?.file).toBe("../imsmanifest.xml");
  });
});
