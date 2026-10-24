import { describe, expect, test } from "vitest";
import { statementProblems } from "./xapi-statement.js";

const valid = {
  id: "6f2a3b40-0c1d-4e5f-8a9b-0123456789ab",
  actor: { objectType: "Agent", name: "Sam", mbox: "mailto:sam@example.org" },
  verb: { id: "http://adlnet.gov/expapi/verbs/answered", display: { "en-US": "answered" } },
  object: {
    objectType: "Activity",
    id: "https://example.org/course/quiz/q1",
    definition: {
      type: "http://adlnet.gov/expapi/activities/cmi.interaction",
      name: { "en-GB": "Is cardboard brown?" },
      interactionType: "choice",
      correctResponsesPattern: ["Brown"],
      choices: [{ id: "Brown", description: { "en-GB": "Brown" } }],
    },
  },
  result: {
    score: { scaled: 0.8, raw: 80, min: 0, max: 100 },
    success: true,
    completion: true,
    response: "Brown",
    duration: "PT1M12.26S",
  },
  context: {
    registration: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d",
    contextActivities: { parent: [{ id: "https://example.org/course" }] },
    language: "en-GB",
  },
  timestamp: "2026-01-05T09:00:00.000Z",
};

describe("xAPI statement rules", () => {
  test("a statement of our player's shape is valid in 1.0.3 and 2.0", () => {
    expect(statementProblems(valid, "1.0")).toEqual([]);
    expect(statementProblems(valid, "2.0")).toEqual([]);
  });

  test.each([
    [
      "two identifiers",
      { ...valid, actor: { mbox: "mailto:a@b.c", openid: "https://id.example.org/a" } },
      "actor",
    ],
    ["a bare email", { ...valid, actor: { mbox: "sam@example.org" } }, "actor.mbox"],
    ["a verb without IRI", { ...valid, verb: { id: "answered" } }, "verb.id"],
    ["an unknown property", { ...valid, extra: 1 }, "statement"],
    [
      "a scaled score over 1",
      { ...valid, result: { score: { scaled: 2 } } },
      "result.score.scaled",
    ],
    [
      "a raw score above max",
      { ...valid, result: { score: { raw: 120, min: 0, max: 100 } } },
      "result.score.raw",
    ],
    ["a duration in seconds", { ...valid, result: { duration: 72 } }, "result.duration"],
    ["a timestamp without a zone", { ...valid, timestamp: "2026-01-05T09:00:00" }, "timestamp"],
    [
      "a registration that is not a UUID",
      { ...valid, context: { registration: "r1" } },
      "context.registration",
    ],
    ["a bad language tag", { ...valid, context: { language: "en_GB" } }, "context.language"],
    [
      "choices without an interaction type",
      { ...valid, object: { id: "https://example.org/q", definition: { choices: [] } } },
      "object.definition.choices",
    ],
  ])("refuses %s", (_, statement, path) => {
    expect(statementProblems(statement, "2.0").join("\n")).toContain(`${path}:`);
  });

  test("2.0 requires context activities in arrays and allows context agents; 1.0.3 the other way round", () => {
    const single = {
      ...valid,
      context: { contextActivities: { parent: { id: "https://example.org/c" } } },
    };
    expect(statementProblems(single, "1.0")).toEqual([]);
    expect(statementProblems(single, "2.0")).toEqual([
      "context.contextActivities.parent: must be an array",
    ]);
    const agents = { ...valid, context: { contextAgents: [] } };
    expect(statementProblems(agents, "2.0")).toEqual([]);
    expect(statementProblems(agents, "1.0")).toEqual(["context: unknown property contextAgents"]);
  });
});
