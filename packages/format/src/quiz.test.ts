import { describe, expect, test } from "vitest";
import { fullCourse } from "../test/courses.js";
import type { MultipleResponseQuestion, Question, QuizEntry } from "./course.js";
import { withNewProjectId } from "./ids.js";
import { openCourse, serializeCourse } from "./open.js";
import {
  answerId,
  drawAttempt,
  drawFrom,
  interactionId,
  isCorrect,
  isPassed,
  plainText,
  quizResult,
  scoreAttempt,
  shuffle,
  toInteraction,
} from "./quiz.js";

const quiz = () => fullCourse().entries[2] as QuizEntry;
const single = (): Question => ({
  id: "question01",
  kind: "single-choice",
  prompt: "<p>When do you fit the guard?</p>",
  answers: [
    { id: "answer0001", text: "Before starting", correct: true },
    { id: "answer0002", text: "After starting", correct: false },
  ],
});
const multiple = (): Question => ({
  id: "question02",
  kind: "multiple-response",
  prompt: "<p>Which are required?</p>",
  answers: [
    { id: "answer0003", text: "Goggles", correct: true },
    { id: "answer0004", text: "Ear defenders", correct: true },
    { id: "answer0005", text: "Gloves near the chuck", correct: false },
  ],
});
const fillIn = (): Question => ({
  id: "question03",
  kind: "fill-in",
  prompt: "<p>The guard must be ___.</p>",
  acceptedAnswers: ["on", "Fully closed", "café"],
});
const matching = (): Question => ({
  id: "question04",
  kind: "matching",
  prompt: "<p>Match the parts.</p>",
  pairs: [
    { id: "pair000001", prompt: "Chuck", match: "Holds the work" },
    { id: "pair000002", prompt: "Guard", match: "Covers the chuck" },
  ],
});
/** A repeatable stand-in for Math.random. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

describe("checking a response", () => {
  test.each([
    ["the correct choice", single(), "answer0001", true],
    ["a wrong choice", single(), "answer0002", false],
    ["an answer id from another question", single(), "answer0003", false],
    ["a list where one choice is expected", single(), ["answer0001"], false],
    ["exactly the correct choices", multiple(), ["answer0004", "answer0003"], true],
    ["a correct choice listed twice", multiple(), ["answer0003", "answer0004", "answer0003"], true],
    ["only some of the correct choices", multiple(), ["answer0003"], false],
    [
      "no choices for an invalid question with no correct answer",
      { ...multiple(), answers: [{ id: "answer0005", text: "Gloves", correct: false }] },
      [],
      false,
    ],
    [
      "the correct choices and a wrong one",
      multiple(),
      ["answer0003", "answer0004", "answer0005"],
      false,
    ],
    [
      "the correct choices and an unknown id",
      multiple(),
      ["answer0003", "answer0004", "nothere001"],
      false,
    ],
    ["no choices", multiple(), [], false],
    ["one id where a list is expected", multiple(), "answer0003", false],
    ["an accepted answer", fillIn(), "on", true],
    ["an accepted answer in another case", fillIn(), "ON", true],
    ["an accepted answer with extra spaces", fillIn(), "  fully   closed ", true],
    ["an accepted answer in another Unicode form", fillIn(), "café", true],
    ["text that is not accepted", fillIn(), "open", false],
    ["empty text", fillIn(), "", false],
    [
      "every pair matched",
      matching(),
      { pair000001: "pair000001", pair000002: "pair000002" },
      true,
    ],
    [
      "two matches swapped",
      matching(),
      { pair000001: "pair000002", pair000002: "pair000001" },
      false,
    ],
    ["a pair left unmatched", matching(), { pair000001: "pair000001" }, false],
    ["a list where matches are expected", matching(), ["pair000001", "pair000002"], false],
  ])("%s", (_name, question, response, correct) => {
    expect(isCorrect(question, response)).toBe(correct);
  });

  test.each([
    ["the same capitals", "Fully closed", true],
    ["other capitals", "fully closed", false],
    ["extra spaces", " Fully  closed ", true],
  ])("UI-BLOCKS-R22 (M2-15): a case-sensitive fill-in accepts %s: %s", (_name, typed, correct) => {
    expect(isCorrect({ ...fillIn(), caseSensitive: true } as Question, typed)).toBe(correct);
  });

  test.each([single(), multiple(), fillIn(), matching()])(
    "[rise:R15] an unanswered $kind question is wrong",
    (question) => {
      expect(isCorrect(question, undefined)).toBe(false);
    },
  );
});

describe("scoring an attempt", () => {
  const questions = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      ...single(),
      id: `question${String(i).padStart(2, "0")}`,
    }));
  const answered = (count: number) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `question${String(i).padStart(2, "0")}`,
        "answer0001",
      ]),
    );

  test.each([
    [2, 3, 67],
    [13, 20, 65],
    [1, 4, 25],
    [1, 2, 50],
    [1, 8, 13],
    [0, 5, 0],
    [5, 5, 100],
  ])("%i right of %i is %i%%", (right, total, percent) => {
    expect(scoreAttempt(questions(total), answered(right))).toEqual({
      correct: right,
      total,
      percent,
    });
  });

  test("[rise:R15] questions left unanswered when time runs out count as wrong", () => {
    const all = [single(), multiple(), fillIn(), matching()];
    expect(scoreAttempt(all, { question01: "answer0001", question03: "on" })).toEqual({
      correct: 2,
      total: 4,
      percent: 50,
    });
  });

  test("a quiz with no questions scores 0", () => {
    expect(scoreAttempt([], {})).toEqual({ correct: 0, total: 0, percent: 0 });
  });

  test("a response keyed by an inherited property name is not a response", () => {
    const question = { ...single(), id: "constructo" };
    expect(scoreAttempt([question], {}).correct).toBe(0);
  });
});

describe("passing", () => {
  test.each([
    [80, undefined, true],
    [79, undefined, false],
    [75, { passingScore: 75 }, true],
    [74, { passingScore: 75 }, false],
    [0, { passingScore: 0 }, true],
    [99, { passingScore: 100 }, false],
  ])("%i%% with %o passes: %s", (percent, settings, passes) => {
    expect(isPassed(percent, settings)).toBe(passes);
  });
});

describe("the quiz result across attempts", () => {
  test("[rise:R8] the best score never goes down", () => {
    expect(quizResult([90, 40])).toMatchObject({ best: 90, passed: true });
    expect(quizResult([40, 90, 60]).best).toBe(90);
  });

  test("[rise:R8] the best score stays within 0 to 100", () => {
    expect(quizResult([-5]).best).toBe(0);
    expect(quizResult([150]).best).toBe(100);
  });

  test("a pass is never undone by a later failed attempt", () => {
    expect(quizResult([85, 10, 0]).passed).toBe(true);
  });

  test("no attempt yet: nothing passed, every attempt still open", () => {
    expect(quizResult([])).toEqual({ best: 0, passed: false, attemptsLeft: Infinity });
    expect(quizResult([], { passingScore: 0 }).passed).toBe(false);
  });

  test.each([
    [undefined, [10, 20, 30, 40], Infinity],
    [0, [], 1],
    [0, [10], 0],
    [2, [10, 20], 1],
    [2, [10, 20, 30], 0],
    [2, [10, 20, 30, 40], 0],
  ])("with %s retries after %o, attempts left: %s", (retries, percents, left) => {
    const settings = retries === undefined ? {} : { retries };
    expect(quizResult(percents, settings).attemptsLeft).toBe(left);
  });
});

describe("drawing questions", () => {
  test("a quiz without draws or shuffling keeps its order", () => {
    const plain = { ...quiz(), settings: {}, questions: [single(), fillIn()] };
    expect(drawAttempt(plain, () => 0).map((q) => q.id)).toEqual(["question01", "question03"]);
  });

  test("a draw takes its count from the pool, in place of the draw", () => {
    const settings = { shuffleQuestions: false };
    const ids = drawAttempt({ ...quiz(), settings }, sequence(0.99)).map((q) => q.id);
    expect(ids).toEqual(["question02", "question03", "question04", "pooled0002"]);
  });

  test("a draw without a count takes the whole pool in random order", () => {
    const draw = { ...(quiz().questions[3] as Parameters<typeof drawFrom>[0]) };
    delete draw.count;
    expect(drawFrom(draw, sequence(0)).map((q) => q.id)).toEqual(["pooled0003", "pooled0002"]);
    expect(drawFrom(draw, sequence(0.99)).map((q) => q.id)).toEqual(["pooled0002", "pooled0003"]);
  });

  test("a count larger than the pool takes the whole pool", () => {
    const draw = { ...(quiz().questions[3] as Parameters<typeof drawFrom>[0]), count: 9 };
    expect(drawFrom(draw)).toHaveLength(2);
  });

  test("shuffled questions are the same questions in another order", () => {
    const ids = drawAttempt(quiz(), sequence(0)).map((q) => q.id);
    expect(ids).toHaveLength(4);
    expect(ids).not.toEqual(["question02", "question03", "question04", "pooled0003"]);
    expect([...ids].sort()).toEqual(["pooled0003", "question02", "question03", "question04"]);
  });

  test("drawing never changes the quiz", () => {
    const before = quiz();
    const copy = JSON.parse(JSON.stringify(before));
    drawAttempt(before);
    expect(before).toEqual(copy);
  });

  test("every order is possible and equally likely", () => {
    const counts = new Map<string, number>();
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 2; b++) {
        const order = shuffle(["x", "y", "z"], sequence(a / 3, b / 2)).join("");
        counts.set(order, (counts.get(order) ?? 0) + 1);
      }
    }
    expect([...counts.values()]).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("interaction ids", () => {
  test("[rise:R11] title, question text and attempt, with spaces as underscores", () => {
    expect(interactionId("Check your knowledge", "When do you fit the guard?", 1)).toBe(
      "Check_your_knowledge_When_do_you_fit_the_guard?_1",
    );
  });

  test("[rise:R11] the title is cut at 20 characters and the question at 230", () => {
    const id = interactionId("A".repeat(30), "q".repeat(300), 2);
    expect(id).toBe(`${"A".repeat(20)}_${"q".repeat(230)}_2`);
  });

  test("[rise:R11] the longest id fits the SCORM 1.2 limit of 255 characters", () => {
    expect(interactionId("t".repeat(99), "q".repeat(999), 999)).toHaveLength(255);
  });

  test("[rise:R11] the attempt number has at most 3 digits", () => {
    expect(interactionId("Quiz", "Question", 1000)).toBe("Quiz_Question_999");
    expect(() => interactionId("Quiz", "Question", 0)).toThrow(RangeError);
    expect(() => interactionId("Quiz", "Question", 1.5)).toThrow(RangeError);
  });

  test("[rise:R11] characters are counted in UTF-16 units, never splitting a pair", () => {
    expect(interactionId("\u{1F600}".repeat(25), "x", 1)).toBe(`${"\u{1F600}".repeat(10)}_x_1`);
    expect(interactionId(`a${"\u{1F600}".repeat(25)}`, "x", 1)).toBe(
      `a${"\u{1F600}".repeat(9)}_x_1`,
    );
  });

  test("[rise:R11] text outside the BMP stays within the SCORM 1.2 limit of 255", () => {
    expect(interactionId("\u{1F600}".repeat(30), "\u{1F600}".repeat(300), 999)).toHaveLength(255);
    expect(interactionId("\u{1F600}".repeat(30), `q${"\u{1F600}".repeat(300)}`, 999)).toHaveLength(
      254,
    );
  });

  test("[rise:R11] tabs and line breaks become underscores too", () => {
    expect(interactionId("Quiz\tone", "Line\nbreak", 1)).toBe("Quiz_one_Line_break_1");
  });
});

describe("answer ids", () => {
  test.each([
    ["Before starting", "Before-starting"],
    ["a/b+c", "a-b-c"],
    ["keep-these_.~", "keep-these_.~"],
    ["café \u{1F600}", "caf---"],
    ["", ""],
  ])("[rise:R11] %j becomes %j", (text, id) => {
    expect(answerId(text)).toBe(id);
  });

  test.each([
    ["Cafe au lait!", "Cafe-au-lait-"],
    ["Café au lait", "Caf--au-lait"],
    ["¿Qué?", "id-wr9RdcOpPw=="],
    ["", "id-"],
  ])("[rise:R11] for AICC, %j becomes %j", (text, id) => {
    expect(answerId(text, { aicc: true })).toBe(id);
  });
});

describe("rich text as plain text", () => {
  test.each([
    ["<p>When do you <strong>fit</strong> the guard?</p>", "When do you fit the guard?"],
    ["<p>One</p><p>Two</p>", "One Two"],
    ["Line<br>break", "Line break"],
    ["Gr<em>ea</em>t", "Great"],
    ["Fish &amp; chips &lt;3 &#233;&#xe9;&nbsp;now", "Fish & chips <3 éé now"],
    ["&unknown; &constructor;", "&unknown; &constructor;"],
  ])("%j", (html, text) => {
    expect(plainText(html)).toBe(text);
  });
});

describe("interactions", () => {
  test("[rise:R10] a choice question is a choice interaction of weight 1", () => {
    expect(toInteraction("Check your knowledge", multiple(), ["answer0003"], 2)).toEqual({
      id: "Check_your_knowledge_Which_are_required?_2",
      weighting: 1,
      result: "incorrect",
      type: "choice",
      response: ["Goggles"],
      correctResponse: ["Goggles", "Ear-defenders"],
    });
    expect(toInteraction("Quiz", single(), "answer0001", 1)).toMatchObject({
      type: "choice",
      result: "correct",
      response: ["Before-starting"],
      correctResponse: ["Before-starting"],
    });
  });

  test("[rise:R10] a fill-in question is a fill-in interaction", () => {
    expect(toInteraction("Quiz", fillIn(), " ON ", 1)).toMatchObject({
      type: "fill-in",
      result: "correct",
      response: " ON ",
      correctResponse: ["on", "Fully closed", "café"],
    });
  });

  test("[rise:R10] a matching question is a matching interaction", () => {
    const response = { pair000001: "pair000002" };
    expect(toInteraction("Quiz", matching(), response, 1)).toMatchObject({
      type: "matching",
      result: "incorrect",
      response: [["Chuck", "Covers-the-chuck"]],
      correctResponse: [
        ["Chuck", "Holds-the-work"],
        ["Guard", "Covers-the-chuck"],
      ],
    });
  });

  test("[rise:R15] an unanswered question is reported wrong with an empty response", () => {
    expect(toInteraction("Quiz", single(), undefined, 1)).toMatchObject({
      result: "incorrect",
      response: [],
    });
    expect(toInteraction("Quiz", fillIn(), undefined, 1)).toMatchObject({ response: "" });
    expect(toInteraction("Quiz", matching(), undefined, 1)).toMatchObject({ response: [] });
  });

  test("[rise:R11] AICC answer ids are passed through", () => {
    const question = { ...single(), answers: [{ id: "answer0001", text: "¿Qué?", correct: true }] };
    expect(
      toInteraction("Quiz", question as Question, "answer0001", 1, { aicc: true }),
    ).toMatchObject({
      response: ["id-wr9RdcOpPw=="],
    });
  });
});

describe("ids stay the same across publishes", () => {
  const ids = (entry: QuizEntry) =>
    entry.questions.flatMap((question) => {
      const all =
        question.kind === "draw" ? question.pool.map((copy) => copy.question) : [question];
      return all.map((q) => toInteraction(entry.title, q, undefined, 1));
    });

  test("[rise:R11] republishing the saved document gives the same ids", () => {
    const opened = openCourse(serializeCourse(fullCourse()));
    if (opened.status !== "ok") throw new Error(opened.status);
    expect(ids(opened.document.entries[2] as QuizEntry)).toEqual(ids(quiz()));
  });

  test("[rise:R11] ids depend on text, not on content ids, project id or position", () => {
    const course = withNewProjectId(fullCourse());
    const moved = { ...quiz(), id: "quiz000009", questions: [...quiz().questions].reverse() };
    const renumbered = JSON.parse(
      JSON.stringify(moved).replaceAll(/answer000(\d)/g, "answer009$1"),
    );
    expect(course.entries[2]).toEqual(quiz());
    expect(new Set(ids(renumbered).map((i) => JSON.stringify(i)))).toEqual(
      new Set(ids(quiz()).map((i) => JSON.stringify(i))),
    );
  });

  test("[rise:R11] answer ids do not change when answers are reordered", () => {
    const original = multiple() as MultipleResponseQuestion;
    const reordered = { ...original, answers: [...original.answers].reverse() };
    const before = toInteraction("Quiz", original, ["answer0003", "answer0004"], 1);
    const after = toInteraction("Quiz", reordered, ["answer0003", "answer0004"], 1);
    expect(new Set(after.correctResponse as string[])).toEqual(
      new Set(before.correctResponse as string[]),
    );
    expect(after.result).toBe("correct");
  });

  test("[rise:R11] every interaction id of the course is within 255 characters with no spaces", () => {
    for (const interaction of ids(quiz())) {
      expect(interaction.id.length).toBeLessThanOrEqual(255);
      expect(interaction.id).not.toMatch(/\s/);
    }
  });
});
