// Round trip (M1-16, M1-18): a package built by @course-suite/exporters reads back through this
// package's reader with the manifest and file list the builder wrote.
import { buildPackage } from "@course-suite/exporters";
import { expect, test } from "vitest";
import { readPackage } from "../src/package.js";
import { stubInput } from "./stub-player.js";

test("a built SCORM 1.2 package reads back with its manifest and every file listed (standards.md E-1..E-6)", async () => {
  const built = await buildPackage(stubInput());
  if (!built.ok) throw new Error(JSON.stringify(built.problems));
  const read = await readPackage(built.value.zip);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  const { files, descriptor, launchHref } = read.value;

  expect(files.names).toEqual(built.value.files);
  expect(launchHref).toBe("index.html");
  if (descriptor.kind !== "scorm") throw new Error(`read a ${descriptor.kind} descriptor`);
  const { manifest } = descriptor;
  expect(manifest).toMatchObject({
    version: "scorm12",
    schemaVersion: "1.2",
    identifier: "workshop_safety_2",
    defaultOrganization: "org",
    launch: { item: "item", resource: "sco", href: "index.html" },
  });
  expect(manifest.organizations).toEqual([
    {
      identifier: "org",
      title: "Workshop safety",
      items: [
        {
          identifier: "item",
          title: "Workshop safety",
          identifierref: "sco",
          isvisible: true,
          masteryScore: 80,
          children: [],
        },
      ],
    },
  ]);
  expect(manifest.resources).toEqual([
    {
      identifier: "sco",
      type: "webcontent",
      scormType: "sco",
      href: "index.html",
      files: ["course/data.js", "index.html", "media/cover.jpg", "player/boot.js"],
      dependencies: [],
    },
  ]);
  // Every file is listed except the manifest and the schema files beside it.
  const listed = new Set(manifest.resources[0]?.files);
  expect(files.names.filter((name) => !listed.has(name))).toEqual([
    "adlcp_rootv1p2.xsd",
    "ims_xml.xsd",
    "imscp_rootv1p1p2.xsd",
    "imsmanifest.xml",
    "imsmd_rootv1p2p1.xsd",
  ]);
  const data = new TextDecoder().decode(await files.read("course/data.js"));
  expect(data).toContain('"standard":"scorm12"');
  expect(data).not.toContain("org.example.plugin");
});
