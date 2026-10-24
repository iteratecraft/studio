import { describe, expect, test } from "vitest";
import { checkLabelSet, english, formatLabel, LABEL_KEYS, resolveLabels } from "./index.js";

describe("the built-in English set", () => {
  test("passes its own check", () => {
    expect(checkLabelSet(english)).toEqual([]);
  });

  test("has a non-empty text for every key, with keys named area.name", () => {
    for (const key of LABEL_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z][A-Za-z]*$/);
      expect(english.labels[key].trim()).not.toBe("");
    }
  });

  test("includes screen-reader and media-player strings", () => {
    expect(LABEL_KEYS.filter((key) => key.startsWith("sr.")).length).toBeGreaterThan(5);
    expect(LABEL_KEYS.filter((key) => key.startsWith("media.")).length).toBeGreaterThan(5);
  });
});

describe("resolving and formatting labels", () => {
  test("a custom set overrides its keys and falls back to English for the rest", () => {
    const labels = resolveLabels({ language: "en-GB", labels: { "quiz.submit": "Hand in" } });
    expect(labels["quiz.submit"]).toBe("Hand in");
    expect(labels["quiz.next"]).toBe(english.labels["quiz.next"]);
  });

  test("no set gives the English labels", () => {
    expect(resolveLabels()).toEqual(english.labels);
  });

  test("keys a set should not have are not resolved", () => {
    const set = { language: "en", labels: { "quiz.extra": "x" } } as never;
    expect(Object.keys(resolveLabels(set))).toEqual(LABEL_KEYS);
  });

  test("an overridden label is what the player formats, visible text and screen-reader text alike", () => {
    const labels = resolveLabels({
      language: "en",
      labels: { "quiz.position": "Q{current}/{total}", "sr.progress": "{percent} percent" },
    });
    expect(formatLabel(labels, "quiz.position", { current: 2, total: 5 })).toBe("Q2/5");
    expect(formatLabel(labels, "sr.progress", { percent: 40 })).toBe("40 percent");
  });

  test("a placeholder without a value is left as it is", () => {
    expect(formatLabel(resolveLabels(), "quiz.score", {})).toBe("Your score: {score}%");
    expect(formatLabel(resolveLabels(), "quiz.score", JSON.parse('{"__proto__":1}'))).toBe(
      "Your score: {score}%",
    );
  });
});

describe("checking a label set from outside", () => {
  test.each([
    ["not an object", [], "", "must be an object"],
    ["no language", { labels: {} }, "/language", "must be a BCP 47 language tag"],
    ["a bad language tag", { language: "english", labels: {} }, "/language", "BCP 47"],
    ["no labels", { language: "fr" }, "/labels", "must be an object"],
    ["an unknown property", { language: "fr", labels: {}, font: "x" }, "/font", "is not a known"],
    [
      "an unknown key",
      { language: "fr", labels: { "a/b": "x" } },
      "/labels/a~1b",
      "is not a known label",
    ],
    [
      "a text that is not a string",
      { language: "fr", labels: { "quiz.submit": 1 } },
      "/labels/quiz.submit",
      "must be a string",
    ],
    [
      "an empty text",
      { language: "fr", labels: { "quiz.submit": " " } },
      "/labels/quiz.submit",
      "must not be empty",
    ],
    [
      "a missing placeholder",
      { language: "fr", labels: { "quiz.position": "Question {current}" } },
      "/labels/quiz.position",
      "must use exactly the placeholders {current}, {total}",
    ],
    [
      "a placeholder the player does not fill",
      { language: "fr", labels: { "quiz.submit": "Envoyer {name}" } },
      "/labels/quiz.submit",
      "must not use placeholders",
    ],
  ])("%s", (_name, set, path, message) => {
    expect(checkLabelSet(set)).toEqual([{ path, message: expect.stringContaining(message) }]);
  });

  test("a partial set with reordered and repeated placeholders is valid", () => {
    const set = {
      language: "fr-CA",
      labels: { "quiz.position": "{total} : {current} ({current})" },
    };
    expect(checkLabelSet(set)).toEqual([]);
  });
});
