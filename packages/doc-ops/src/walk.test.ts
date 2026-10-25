import { checkSchema, compileSchema, courseSchema } from "@course-suite/format";
import { fullCourse } from "@course-suite/format/test/courses";
import { describe, expect, test } from "vitest";
import { indexDocument } from "./walk.js";

describe("walk", () => {
  test("finds every content id the format schema declares, at the same path", () => {
    const course = fullCourse();
    const { found } = checkSchema(compileSchema(courseSchema), course, {
      record: new Set(["Id"]),
    });
    const declared = found.map((f) => [f.value, f.path.replace(/\/id$/, "")]).sort();
    const walked = [...indexDocument(course)].map(([id, at]) => [id, `/${at.path.join("/")}`]);
    expect(walked.sort()).toEqual(declared);
    expect(declared.length).toBeGreaterThan(30);
  });

  test("gives each object its kind and the object holding it", () => {
    const index = indexDocument(fullCourse());
    expect(index.get("lesson0001")).toMatchObject({ kind: "entry", parent: undefined });
    expect(index.get("block00004")?.parent?.value.id).toBe("lesson0001");
    expect(index.get("question01")).toMatchObject({ kind: "question" });
    expect(index.get("answer0005")?.parent?.value.id).toBe("pooled0001");
    expect(index.get("pair000001")?.kind).toBe("pair");
    expect(index.get("media00001")?.kind).toBe("media");
    expect(index.get("custom0001")?.kind).toBe("customBlock");
  });
});
