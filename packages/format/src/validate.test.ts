import { describe, expect, test } from "vitest";
import { fullCourse, minimalCourse } from "../test/courses.js";
import { edit, REMOVE } from "../test/edit.js";
import type { Schema } from "./validate.js";
import { compileSchema, courseSchema, validateCourse } from "./validate.js";

const LESSON = "/entries/1";
const BLOCK = `${LESSON}/blocks/0`;
const GRAPHIC = `${LESSON}/blocks/1`;
const SORTING = `${LESSON}/blocks/2`;
const CHECK = `${LESSON}/blocks/3/question`;
const QUIZ = "/entries/2";

describe("valid documents", () => {
  test.each([
    ["the minimal course", minimalCourse()],
    ["a course using every definition", fullCourse()],
    ["a microlearning course", { ...minimalCourse(), kind: "microlearning" }],
    [
      "web publishing tracked by completion",
      edit(fullCourse(), "/publish", { standard: "web", tracking: { kind: "completion" } }),
    ],
    [
      "SCORM 1.2 with its status wording",
      edit(fullCourse(), "/publish", {
        standard: "scorm12",
        statusWording: { done: "completed", notDone: "incomplete" },
      }),
    ],
    [
      "xAPI with an activity IRI",
      edit(fullCourse(), "/publish", { standard: "xapi", activityId: "urn:example:course:1" }),
    ],
    ["cmi5 with LOM metadata only", edit(fullCourse(), "/publish", { standard: "cmi5", lom: {} })],
    ["a lesson with no blocks", edit(fullCourse(), `${LESSON}/blocks`, [])],
    ["empty extension data", edit(fullCourse(), "/ext", {})],
    ["a decorative image", edit(fullCourse(), "/cover/alt", "")],
    [
      "ids inside ext that collide or dangle",
      edit(fullCourse(), "/ext", { "org.example.plugin": { id: "lesson0001", ref: "missing001" } }),
    ],
    [
      "any JSON as variant settings",
      edit(fullCourse(), `${BLOCK}/variantSettings`, { chart: { series: [[1, 2]] }, label: null }),
    ],
    [
      "a button to a quiz entry",
      edit(fullCourse(), `${GRAPHIC}/items/4/destination/entry`, "quiz000001"),
    ],
    ["a marker on the image edge", edit(fullCourse(), `${GRAPHIC}/items/0/x`, 100)],
    [
      "a name of 1 code point that is 2 UTF-16 units",
      edit(fullCourse(), "/authors/0/name", "\u{1F600}"),
    ],
    ["a quiz with no questions yet", edit(fullCourse(), "/entries/2/questions", [])],
    ["a course without publish settings", edit(fullCourse(), "/publish", REMOVE)],
    [
      "a block with only its required fields",
      edit(fullCourse(), BLOCK, { id: "block00001", category: "divider", variant: "spacer" }),
    ],
    ["SCORM 2004 3rd edition", edit(fullCourse(), "/publish/scorm2004Edition", "3rd")],
    ["a label set built in for a language", edit(fullCourse(), "/labelSet", { language: "pt-BR" })],
  ])("%s", (_name, document) => {
    expect(validateCourse(document)).toEqual([]);
  });
});

describe("invalid documents report the exact path", () => {
  test.each([
    // [what is wrong, pointer to change, new value, path of the error, message]
    ["a required property is missing", "/title", REMOVE, "/title", "is required"],
    ["an unknown property at the root", "/colour", "red", "/colour", "is not a known property"],
    [
      "an unknown property deep inside",
      `${BLOCK}/settings/margin`,
      4,
      `${BLOCK}/settings/margin`,
      "is not a known property",
    ],
    [
      "an inherited Object property name",
      "/constructor",
      {},
      "/constructor",
      "is not a known property",
    ],
    ["a wrong type", "/title", 5, "/title", "must be a string"],
    [
      "a value outside an enum",
      "/kind",
      "book",
      "/kind",
      'must be one of "course", "microlearning"',
    ],
    ["a project id that is not a v4 UUID", "/id", "not-a-uuid", "/id", "must match"],
    [
      "a content id with a capital letter",
      `${LESSON}/id`,
      "Lesson0001",
      `${LESSON}/id`,
      "must match",
    ],
    [
      "a content id that starts with a digit",
      `${BLOCK}/id`,
      "1block0001",
      `${BLOCK}/id`,
      "must match",
    ],
    [
      "an unknown entry kind",
      `${LESSON}/kind`,
      "page",
      `${LESSON}/kind`,
      'must be one of "section", "lesson", "quiz"',
    ],
    ["an entry without a kind", `${LESSON}/kind`, REMOVE, `${LESSON}/kind`, "is required"],
    ["an entry that is not an object", "/entries/0", "intro", "/entries/0", "must be an object"],
    [
      "a section header holding blocks",
      "/entries/0/blocks",
      [],
      "/entries/0/blocks",
      "is not a known property",
    ],
    ["a lesson without blocks", `${LESSON}/blocks`, REMOVE, `${LESSON}/blocks`, "is required"],
    [
      "an unknown block category",
      `${BLOCK}/category`,
      "video",
      `${BLOCK}/category`,
      "must be one of",
    ],
    [
      "a variant that is not kebab-case",
      `${BLOCK}/variant`,
      "Paragraph",
      `${BLOCK}/variant`,
      "must match",
    ],
    [
      "a variant setting that is not camelCase",
      `${BLOCK}/variantSettings/Columns`,
      2,
      `${BLOCK}/variantSettings/Columns`,
      "property name must match",
    ],
    [
      "a fractional padding",
      `${BLOCK}/settings/padding/top`,
      1.5,
      `${BLOCK}/settings/padding/top`,
      "must be an integer",
    ],
    [
      "a negative padding",
      `${BLOCK}/settings/padding/bottom`,
      -1,
      `${BLOCK}/settings/padding/bottom`,
      "must be at least 0",
    ],
    [
      "a short hex colour",
      `${BLOCK}/settings/accentColor`,
      "#FFF",
      `${BLOCK}/settings/accentColor`,
      "must match",
    ],
    [
      "a colour background without a colour",
      `${BLOCK}/settings/background/color`,
      REMOVE,
      `${BLOCK}/settings/background/color`,
      "is required",
    ],
    [
      "a background of an unknown kind",
      `${BLOCK}/settings/background/kind`,
      "video",
      `${BLOCK}/settings/background/kind`,
      'must be one of "none", "color", "image"',
    ],
    [
      "a timestamp with an offset",
      `${BLOCK}/createdAt`,
      "2026-10-01T09:00:00+02:00",
      `${BLOCK}/createdAt`,
      "must match",
    ],
    [
      "a marker outside the image",
      `${GRAPHIC}/items/0/x`,
      120,
      `${GRAPHIC}/items/0/x`,
      "must be at most 100",
    ],
    [
      "an unknown item kind",
      `${GRAPHIC}/items/0/kind`,
      "hotspot",
      `${GRAPHIC}/items/0/kind`,
      "must be one of",
    ],
    [
      "a process step of an unknown role",
      `${GRAPHIC}/items/1/role`,
      "outro",
      `${GRAPHIC}/items/1/role`,
      "must be one of",
    ],
    [
      "a flashcard without a back",
      `${GRAPHIC}/items/3/back`,
      REMOVE,
      `${GRAPHIC}/items/3/back`,
      "is required",
    ],
    [
      "a button with an empty label",
      `${GRAPHIC}/items/4/label`,
      "",
      `${GRAPHIC}/items/4/label`,
      "must not be empty",
    ],
    [
      "a script URL as a destination",
      `${GRAPHIC}/items/5/destination/url`,
      "javascript:alert(1)",
      `${GRAPHIC}/items/5/destination/url`,
      "must match",
    ],
    [
      "a URL over 2,048 characters",
      `${GRAPHIC}/items/5/destination/url`,
      `https://example.com/${"a".repeat(2048)}`,
      `${GRAPHIC}/items/5/destination/url`,
      "must be at most 2048 characters",
    ],
    [
      "a single-choice question with one answer",
      `${CHECK}/answers`,
      [{ id: "answer0001", text: "Only", correct: true }],
      `${CHECK}/answers`,
      "must have at least 2 items",
    ],
    [
      "an answer without its correct flag",
      `${CHECK}/answers/1/correct`,
      REMOVE,
      `${CHECK}/answers/1/correct`,
      "is required",
    ],
    [
      "an empty accepted answer",
      `${QUIZ}/questions/1/acceptedAnswers/1`,
      "",
      `${QUIZ}/questions/1/acceptedAnswers/1`,
      "must not be empty",
    ],
    [
      "a repeated accepted answer",
      `${QUIZ}/questions/1/acceptedAnswers/1`,
      "on",
      `${QUIZ}/questions/1/acceptedAnswers/1`,
      "duplicates item 0",
    ],
    [
      "a matching question given answers",
      `${QUIZ}/questions/2/answers`,
      [],
      `${QUIZ}/questions/2/answers`,
      "is not a known property",
    ],
    [
      "an unknown feedback mode",
      `${QUIZ}/questions/0/feedbackMode`,
      "none",
      `${QUIZ}/questions/0/feedbackMode`,
      "must be one of",
    ],
    ["a repeated language", "/languages/1", "fr", "/languages/1", "duplicates item 0"],
    [
      "a language that is not a BCP 47 tag",
      "/sourceLanguage",
      "english",
      "/sourceLanguage",
      "must match",
    ],
    [
      "an extension key that is not reverse-DNS",
      "/ext/plugin",
      {},
      "/ext/plugin",
      "property name must match",
    ],
    [
      "extension data on an object without an id",
      "/cover/ext",
      {},
      "/cover/ext",
      "is not a known property",
    ],
    [
      "a passing score over 100",
      "/publish/passingScore",
      101,
      "/publish/passingScore",
      "must be at most 100",
    ],
    ["an unknown standard", "/publish/standard", "aicc", "/publish/standard", "must be one of"],
    [
      "an unknown SCORM 2004 edition",
      "/publish/scorm2004Edition",
      "1st",
      "/publish/scorm2004Edition",
      "must be one of",
    ],
    [
      "status wording that is not a pair",
      "/publish/statusWording/notDone",
      REMOVE,
      "/publish/statusWording/notDone",
      "is required",
    ],
    [
      "quiz tracking without its quiz",
      "/publish/tracking/quiz",
      REMOVE,
      "/publish/tracking/quiz",
      "is required",
    ],
    [
      "a manifest identifier with a space",
      "/publish/manifestIdentifier",
      "workshop safety",
      "/publish/manifestIdentifier",
      "must match",
    ],
    [
      "an activity id that is not an IRI",
      "/publish/activityId",
      "workshop",
      "/publish/activityId",
      "must match",
    ],
    [
      "a media entry of an unknown source",
      "/media/0/source",
      "camera",
      "/media/0/source",
      "must be one of",
    ],
    [
      "a storage key with a path",
      "/media/1/variantKey",
      "../cover.jpg",
      "/media/1/variantKey",
      "must match",
    ],
    [
      "a quiz question of an unknown kind",
      `${QUIZ}/questions/0/kind`,
      "essay",
      `${QUIZ}/questions/0/kind`,
      'must be one of "single-choice", "multiple-response", "fill-in", "matching", "draw"',
    ],
    [
      "a draw with an empty pool",
      `${QUIZ}/questions/3/pool`,
      [],
      `${QUIZ}/questions/3/pool`,
      "must have at least 1 items",
    ],
    [
      "a draw inside a draw's pool",
      `${QUIZ}/questions/3/pool/0/kind`,
      "draw",
      `${QUIZ}/questions/3/pool/0/kind`,
      "must be one of",
    ],
    [
      "a draw of no questions",
      `${QUIZ}/questions/3/count`,
      0,
      `${QUIZ}/questions/3/count`,
      "at least 1",
    ],
    [
      "a timer of no minutes",
      `${QUIZ}/settings/timer/minutes`,
      0,
      `${QUIZ}/settings/timer/minutes`,
      "at least 1",
    ],
    ["negative retries", `${QUIZ}/settings/retries`, -1, `${QUIZ}/settings/retries`, "at least 0"],
    [
      "a passing score over 100",
      `${QUIZ}/settings/passingScore`,
      101,
      `${QUIZ}/settings/passingScore`,
      "at most 100",
    ],
    [
      "an unknown reveal mode",
      `${QUIZ}/settings/revealAnswers`,
      "some",
      `${QUIZ}/settings/revealAnswers`,
      "must be one of",
    ],
    [
      "a knowledge-check draw without its bank",
      `${LESSON}/blocks/6/draw/bank`,
      REMOVE,
      `${LESSON}/blocks/6/draw/bank`,
      "is required",
    ],
    ["a zero media width", "/media/1/width", 0, "/media/1/width", "must be at least 1"],
    [
      "an external reference without its container",
      "/themeRef/containerId",
      REMOVE,
      "/themeRef/containerId",
      "is required",
    ],
  ])("%s", (_name, path, value, errorPath, message) => {
    expect(validateCourse(edit(fullCourse(), path, value))).toEqual([
      { path: errorPath, message: expect.stringContaining(message) },
    ]);
  });

  test("escapes ~ and / in the path", () => {
    expect(validateCourse({ ...minimalCourse(), "a~b/c": 1 })).toEqual([
      { path: "/a~0b~1c", message: "is not a known property" },
    ]);
  });

  test("a root that is not an object", () => {
    expect(validateCourse([])).toEqual([{ path: "", message: "must be an object" }]);
  });

  test("a __proto__ key from JSON text is an unknown property", () => {
    const document = JSON.parse(
      `{"__proto__":{"title":"x"},${JSON.stringify(minimalCourse()).slice(1)}`,
    );
    expect(validateCourse(document)).toEqual([
      { path: "/__proto__", message: "is not a known property" },
    ]);
  });

  test("reports every error, not only the first", () => {
    const document = edit(edit(fullCourse(), "/title", 1), `${BLOCK}/variant`, "X");
    expect(validateCourse(document).map((e) => e.path)).toEqual(["/title", `${BLOCK}/variant`]);
  });
});

describe("reference integrity", () => {
  test.each([
    [
      "a content id used twice",
      `${BLOCK}/id`,
      "lesson0001",
      `${BLOCK}/id`,
      `duplicates the one at ${LESSON}/id`,
    ],
    [
      "a media id equal to an answer id",
      "/media/0/id",
      "answer0001",
      "/media/0/id",
      `duplicates the one at ${CHECK}/answers/0/id`,
    ],
    [
      "a storage key listed twice",
      "/media/5",
      { id: "media00006", key: "avatar.png", source: "upload" },
      "/media/5/key",
      "duplicates the one at /media/0/key",
    ],
    [
      "a media reference missing from the index",
      "/cover/key",
      "missing.jpg",
      "/cover/key",
      "is not in the media index",
    ],
    [
      "quiz tracking that names a lesson",
      "/publish/tracking/quiz",
      "lesson0001",
      "/publish/tracking/quiz",
      `must refer to a QuizEntry, not the LessonEntry at ${LESSON}/id`,
    ],
    [
      "a button to an id that does not exist",
      `${GRAPHIC}/items/4/destination/entry`,
      "missing001",
      `${GRAPHIC}/items/4/destination/entry`,
      "does not refer to an object in this document",
    ],
    [
      "a button to a section header",
      `${GRAPHIC}/items/4/destination/entry`,
      "section001",
      `${GRAPHIC}/items/4/destination/entry`,
      "must refer to a LessonEntry or QuizEntry",
    ],
    [
      "a custom block whose document is missing",
      `${LESSON}/blocks/5/customBlock`,
      "custom0002",
      `${LESSON}/blocks/5/customBlock`,
      "does not refer to an object",
    ],
    [
      "a sorting card pointing at a step",
      `${SORTING}/items/1/category`,
      "step000001",
      `${SORTING}/items/1/category`,
      "must refer to a CategoryItem",
    ],
    [
      "a quiz that skips back to an earlier lesson",
      `${QUIZ}/settings/skipAhead/entry`,
      "lesson0001",
      `${QUIZ}/settings/skipAhead/entry`,
      "must refer to an entry after the quiz",
    ],
    [
      "a quiz that skips to itself",
      `${QUIZ}/settings/skipAhead/entry`,
      "quiz000001",
      `${QUIZ}/settings/skipAhead/entry`,
      "must refer to an entry after the quiz",
    ],
    [
      "a drawn question with the id of a quiz question",
      `${QUIZ}/questions/3/pool/0/id`,
      "question03",
      `${QUIZ}/questions/3/pool/0/id`,
      `duplicates the one at ${QUIZ}/questions/1/id`,
    ],
  ])("%s", (_name, path, value, errorPath, message) => {
    expect(validateCourse(edit(fullCourse(), path, value))).toEqual([
      { path: errorPath, message: expect.stringContaining(message) },
    ]);
  });

  test("a sorting card must use a category of its own block", () => {
    const document = edit(fullCourse(), `${GRAPHIC}/items/7`, {
      id: "category02",
      kind: "category",
      title: "Elsewhere",
    });
    expect(validateCourse(edit(document, `${SORTING}/items/1/category`, "category02"))).toEqual([
      {
        path: `${SORTING}/items/1/category`,
        message: "must refer to a category in the same block",
      },
    ]);
  });

  test("references to other containers are never reported as missing", () => {
    const document = edit(fullCourse(), "/glossaryRef/id", "nowhere001");
    expect(validateCourse(document)).toEqual([]);
  });
});

describe("newer MINOR documents", () => {
  test("unknown properties are allowed, known ones are still checked", () => {
    const document = edit(
      edit(fullCourse(), `${BLOCK}/settings/shadow`, "soft"),
      "/futureField",
      [1],
    );
    expect(validateCourse(document)).toHaveLength(2);
    expect(validateCourse(document, { allowUnknown: true })).toEqual([]);
    expect(validateCourse(edit(document, "/title", 1), { allowUnknown: true })).toEqual([
      { path: "/title", message: "must be a string" },
    ]);
  });

  test("ids inside unknown properties are opaque", () => {
    const document = edit(fullCourse(), "/futureField", { id: "lesson0001", key: "missing.jpg" });
    expect(validateCourse(document, { allowUnknown: true })).toEqual([]);
  });
});

describe("the course schema", () => {
  const subschemas = (schema: Schema, where: string): [string, Schema][] => [
    [where, schema],
    ...Object.entries((schema.properties ?? {}) as Record<string, Schema>).flatMap(([k, s]) =>
      subschemas(s, `${where}/properties/${k}`),
    ),
    ...(schema.items ? subschemas(schema.items as Schema, `${where}/items`) : []),
    ...((schema.oneOf ?? []) as Schema[]).flatMap((s, i) => subschemas(s, `${where}/oneOf/${i}`)),
  ];
  const all = [
    ...subschemas(courseSchema, ""),
    ...Object.entries(courseSchema.$defs as Record<string, Schema>).flatMap(([name, s]) =>
      subschemas(s, `/$defs/${name}`),
    ),
  ];

  test("declares JSON Schema 2020-12", () => {
    expect(courseSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  test("is closed everywhere except the extension namespace and variant settings", () => {
    const open = all.filter(([, s]) => s.type === "object" && s.unevaluatedProperties !== false);
    expect(open.map(([where]) => where)).toEqual(["/$defs/Ext", "/$defs/VariantSettings"]);
  });

  test("every object with a content id can carry extension data", () => {
    const withId = all.filter(
      ([, s]) => (s.properties as Record<string, Schema> | undefined)?.id?.$ref === "#/$defs/Id",
    );
    expect(withId.length).toBeGreaterThan(10);
    for (const [where, s] of withId)
      expect([where, Object.hasOwn(s.properties as object, "ext")]).toEqual([where, true]);
  });
});

describe("compileSchema refuses what the validator does not implement", () => {
  test.each([
    [
      "an unsupported keyword",
      { type: "object", additionalProperties: false },
      'keyword "additionalProperties"',
    ],
    ["an unresolved $ref", { $ref: "#/$defs/Missing" }, "unresolved $ref"],
    ["a remote $ref", { $ref: "https://example.com/schema.json" }, "unresolved $ref"],
    ["an unknown type", { type: "null" }, "type"],
    ["a type list", { type: ["string", "null"] }, "type"],
    [
      "unevaluatedProperties as a schema",
      { type: "object", unevaluatedProperties: {} },
      "must be false",
    ],
    [
      "propertyNames with more than a pattern",
      { type: "object", propertyNames: { maxLength: 3 } },
      "only a pattern",
    ],
    [
      "a oneOf without a discriminating const",
      { oneOf: [{ type: "string" }, { type: "integer" }] },
      "const property",
    ],
    [
      "a oneOf repeating a discriminator",
      { oneOf: [{ properties: { k: { const: 1 } } }, { properties: { k: { const: 1 } } }] },
      'repeats a "k" value',
    ],
    [
      "an unsupported keyword inside $defs",
      { $defs: { A: { format: "uri" } } },
      'keyword "format"',
    ],
  ])("%s", (_name, schema, message) => {
    expect(() => compileSchema(schema)).toThrow(message);
  });
});
