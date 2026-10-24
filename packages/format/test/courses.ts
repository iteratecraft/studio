// Course documents for tests, written by hand for this package.
import type { Course } from "../src/course.js";

export const PROJECT_ID = "3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b";
export const LIBRARY_ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

export function minimalCourse(): Course {
  return {
    schemaVersion: "1.0",
    id: PROJECT_ID,
    kind: "course",
    title: "Empty",
    entries: [],
    media: [],
  };
}

/** Uses every definition in the schema at least once. */
export function fullCourse(): Course {
  return {
    schemaVersion: "1.0",
    id: PROJECT_ID,
    kind: "course",
    title: "Workshop safety",
    description: "<p>What to check before you start a machine.</p>",
    authors: [{ name: "Sam Example", avatar: { key: "avatar.png", alt: "" } }],
    cover: { key: "cover.jpg", alt: "A tidy workshop bench" },
    themeRef: { containerId: LIBRARY_ID, id: "theme00001" },
    labelSet: { language: "en", set: { containerId: LIBRARY_ID, id: "labels0001" } },
    sourceLanguage: "en-GB",
    languages: ["fr", "de"],
    glossaryRef: { containerId: LIBRARY_ID, id: "glossary01" },
    publish: {
      standard: "scorm2004",
      scorm2004Edition: "4th",
      statusWording: { done: "passed", notDone: "failed" },
      passingScore: 80,
      tracking: { kind: "quiz", quiz: "quiz000001" },
      manifestIdentifier: "workshop_safety",
      activityId: "https://example.com/courses/workshop-safety",
      lom: {
        title: "Workshop safety",
        description: "Checks before starting a machine.",
        keywords: ["safety", "workshop"],
        language: "en",
      },
    },
    entries: [
      { id: "section001", kind: "section", title: "Getting started" },
      {
        id: "lesson0001",
        kind: "lesson",
        title: "Before you start",
        description: "<p>Five checks.</p>",
        icon: "lesson",
        headerImage: { key: "header.jpg", alt: "" },
        author: { name: "Alex Example" },
        blocks: [
          {
            id: "block00001",
            category: "text",
            variant: "paragraph-with-heading",
            settings: {
              padding: { top: 30, bottom: 60, linked: false },
              background: { kind: "color", color: "#1a2b3c" },
              cardStyle: "white",
              contentWidth: "medium",
              accentColor: "#ff8800",
              textContrast: "auto",
              entranceAnimation: true,
              narration: { audio: { key: "narration.mp3" }, transcript: "<p>Five checks.</p>" },
              connectToNext: false,
            },
            variantSettings: { columns: 1, headingLevel: 2 },
            items: [
              { id: "item000001", kind: "content", title: "Checks", text: "<p>Guards on.</p>" },
            ],
            createdAt: "2026-10-01T09:00:00Z",
            updatedAt: "2026-10-02T10:30:00.250Z",
          },
          {
            id: "block00002",
            category: "interactive",
            variant: "labeled-graphic",
            settings: {
              background: {
                kind: "image",
                image: { key: "diagram.png" },
                overlay: "dark",
                opacity: 40,
              },
            },
            media: [{ key: "diagram.png", alt: "Lathe with its guard" }],
            items: [
              { id: "marker0001", kind: "marker", x: 12.5, y: 80, icon: "plus", title: "Guard" },
              { id: "step000001", kind: "step", role: "intro", title: "Start" },
              { id: "step000002", kind: "step", role: "step", hidden: true, text: "<p>Check</p>" },
              {
                id: "flashcard1",
                kind: "flashcard",
                front: { text: "Guard" },
                back: { text: "Always on", media: { key: "diagram.png" } },
              },
              {
                id: "button0001",
                kind: "button",
                label: "Take the quiz",
                destination: { kind: "lesson", entry: "quiz000001" },
              },
              {
                id: "button0002",
                kind: "button",
                label: "Read the manual",
                description: "<p>Opens in a new tab.</p>",
                destination: { kind: "url", url: "https://example.com/manual" },
              },
              { id: "button0003", kind: "button", label: "Exit", destination: { kind: "exit" } },
            ],
          },
          {
            id: "block00003",
            category: "interactive",
            variant: "sorting",
            settings: { background: { kind: "none" } },
            items: [
              { id: "category01", kind: "category", title: "Safe" },
              { id: "sorting001", kind: "sorting", text: "Guard on", category: "category01" },
            ],
          },
          {
            id: "block00004",
            category: "knowledge-check",
            variant: "single-choice",
            question: {
              id: "question01",
              kind: "single-choice",
              prompt: "<p>When do you fit the guard?</p>",
              feedbackMode: "perAnswer",
              answers: [
                { id: "answer0001", text: "Before starting", correct: true, feedback: "Yes." },
                { id: "answer0002", text: "After starting", correct: false },
              ],
            },
          },
          {
            id: "block00005",
            category: "knowledge-check",
            variant: "bank-question",
            link: { kind: "bankQuestion", ref: { containerId: LIBRARY_ID, id: "bankques01" } },
          },
          { id: "block00006", category: "custom", variant: "canvas", customBlock: "custom0001" },
          {
            id: "block00007",
            category: "knowledge-check",
            variant: "bank-draw",
            draw: {
              id: "draw000001",
              kind: "draw",
              bank: { containerId: LIBRARY_ID, id: "bank000001" },
              exclude: ["bankques02"],
              pool: [
                {
                  bankQuestion: "bankques01",
                  question: {
                    id: "pooled0001",
                    kind: "single-choice",
                    prompt: "<p>Who may remove a guard?</p>",
                    answers: [
                      { id: "answer0005", text: "A trained fitter", correct: true },
                      { id: "answer0006", text: "Anyone", correct: false },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      {
        id: "quiz000001",
        kind: "quiz",
        title: "Check your knowledge",
        settings: {
          passingScore: 75,
          retries: 2,
          requirePassing: true,
          skipAhead: { entry: "lesson0002", learnerChooses: true },
          shuffleQuestions: true,
          shuffleAnswers: true,
          revealAnswers: "incorrect",
          correctColor: "#2e7d32",
          incorrectColor: "#c62828",
          timer: { minutes: 10, display: "elapsed-of-total", learnerCanHide: true },
          countAsLesson: false,
          finishButton: "continue",
        },
        questions: [
          {
            id: "question02",
            kind: "multiple-response",
            prompt: "<p>Which are required?</p>",
            feedbackMode: "correctness",
            correctFeedback: "<p>Right.</p>",
            incorrectFeedback: "<p>Not quite.</p>",
            media: { key: "diagram.png", alt: "Lathe" },
            answers: [
              { id: "answer0003", text: "Goggles", correct: true },
              { id: "answer0004", text: "Gloves near the chuck", correct: false },
            ],
          },
          {
            id: "question03",
            kind: "fill-in",
            prompt: "<p>The guard must be ___.</p>",
            acceptedAnswers: ["on", "closed"],
          },
          {
            id: "question04",
            kind: "matching",
            prompt: "<p>Match the parts.</p>",
            pairs: [
              { id: "pair000001", prompt: "Chuck", match: "Holds the work" },
              { id: "pair000002", prompt: "Guard", match: "Covers the chuck" },
            ],
          },
          {
            id: "draw000002",
            kind: "draw",
            bank: { containerId: LIBRARY_ID, id: "bank000001" },
            count: 1,
            pool: [
              {
                bankQuestion: "bankques03",
                question: {
                  id: "pooled0002",
                  kind: "fill-in",
                  prompt: "<p>Name the part that holds the work.</p>",
                  acceptedAnswers: ["chuck"],
                },
              },
              {
                bankQuestion: "bankques04",
                question: {
                  id: "pooled0003",
                  kind: "single-choice",
                  prompt: "<p>Is a loose sleeve safe near the chuck?</p>",
                  answers: [
                    { id: "answer0007", text: "No", correct: true },
                    { id: "answer0008", text: "Yes", correct: false },
                  ],
                },
              },
            ],
          },
        ],
      },
      { id: "lesson0002", kind: "lesson", title: "Using the lathe", blocks: [] },
    ],
    media: [
      { id: "media00001", key: "avatar.png", source: "upload", mimeType: "image/png" },
      {
        id: "media00002",
        key: "cover.jpg",
        variantKey: "cover.opt.jpg",
        source: "stock",
        width: 1600,
        height: 900,
      },
      {
        id: "media00003",
        key: "header.jpg",
        source: "ai",
        aiPrompt: "A tidy workshop",
        licence: "CC0-1.0",
        attribution: "Generated",
      },
      { id: "media00004", key: "narration.mp3", source: "ai", mimeType: "audio/mpeg" },
      { id: "media00005", key: "diagram.png", source: "default" },
    ],
    customBlocks: [{ id: "custom0001", ext: { "org.example.canvas": { objects: [] } } }],
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-02T10:30:00Z",
    ext: { "org.example.plugin": { settings: { id: "lesson0001" }, list: [1, "two", null] } },
  };
}

/**
 * A small course for the player: a cover, two sections, lessons with the walking-skeleton blocks
 * (text, heading, image, continue, knowledge checks) and a quiz entry. Its images are SVG files the
 * player's dev harness writes next to it.
 */
export function sampleCourse(): Course {
  return {
    schemaVersion: "1.0",
    id: PROJECT_ID,
    kind: "course",
    title: "Composting at home",
    description: "<p>Turn kitchen and garden waste into <strong>rich soil</strong>.</p>",
    authors: [{ name: "Sam Example" }],
    cover: { key: "cover.svg", alt: "A garden compost bin beside a vegetable bed" },
    labelSet: { language: "en" },
    sourceLanguage: "en",
    entries: [
      { id: "sectbasics", kind: "section", title: "The basics" },
      {
        id: "lessonwhat",
        kind: "lesson",
        title: "What compost is",
        description: "<p>Why a heap turns waste into soil.</p>",
        blocks: [
          {
            id: "blkheading",
            category: "text",
            variant: "heading",
            items: [{ id: "itmheading", kind: "content", title: "Waste becomes soil" }],
          },
          {
            id: "blkparagrp",
            category: "text",
            variant: "paragraph-with-heading",
            items: [
              {
                id: "itmparagrp",
                kind: "content",
                title: "Living helpers",
                text: "<p>Worms, fungi and bacteria break scraps down. They need <em>air</em>, <em>water</em> and a mix of materials.</p>",
              },
            ],
          },
          {
            id: "blkimage01",
            category: "image",
            variant: "centered",
            media: [{ key: "compost-bin.svg", alt: "A compost bin cut away to show its layers" }],
          },
          { id: "blkcontinu", category: "divider", variant: "continue" },
          {
            id: "blkcheck01",
            category: "knowledge-check",
            variant: "single-choice",
            question: {
              id: "qstneeds01",
              kind: "single-choice",
              prompt: "<p>What does a compost heap need to work well?</p>",
              feedbackMode: "perAnswer",
              answers: [
                {
                  id: "ansairwatr",
                  text: "Air, water and mixed materials",
                  correct: true,
                  feedback: "<p>Yes: the helpers need all three.</p>",
                },
                {
                  id: "anssealed1",
                  text: "A sealed lid and no water",
                  correct: false,
                  feedback: "<p>Without air and water the helpers stop working.</p>",
                },
                { id: "ansdryleaf", text: "Only dry leaves", correct: false },
              ],
            },
          },
        ],
      },
      {
        id: "lessonmix1",
        kind: "lesson",
        title: "Greens and browns",
        blocks: [
          {
            id: "blksubhead",
            category: "text",
            variant: "subheading",
            items: [{ id: "itmsubhead", kind: "content", title: "Two kinds of material" }],
          },
          {
            id: "blkpara002",
            category: "text",
            variant: "paragraph",
            items: [
              {
                id: "itmpara002",
                kind: "content",
                text: "<p>Greens are wet and rich in nitrogen. Browns are dry and rich in carbon.</p><ul><li>Greens: peelings, grass</li><li>Browns: cardboard, leaves</li></ul>",
              },
            ],
          },
          {
            id: "blkcheck02",
            category: "knowledge-check",
            variant: "multiple-response",
            question: {
              id: "qstgreens1",
              kind: "multiple-response",
              prompt: "<p>Which of these are greens?</p>",
              feedbackMode: "correctness",
              correctFeedback: "<p>Right: both are wet and fresh.</p>",
              incorrectFeedback: "<p>Look for the wet, fresh materials.</p>",
              answers: [
                { id: "anspeeling", text: "Vegetable peelings", correct: true },
                { id: "ansgrass01", text: "Grass cuttings", correct: true },
                { id: "anscardbrd", text: "Torn cardboard", correct: false },
              ],
            },
          },
        ],
      },
      { id: "sectpractc", kind: "section", title: "In practice" },
      {
        id: "quizcheck1",
        kind: "quiz",
        title: "Check what you know",
        questions: [
          {
            id: "qstquiz001",
            kind: "single-choice",
            prompt: "<p>Is cardboard a green or a brown?</p>",
            answers: [
              { id: "ansbrown01", text: "A brown", correct: true },
              { id: "ansgreen01", text: "A green", correct: false },
            ],
          },
        ],
      },
      {
        id: "lessoncare",
        kind: "lesson",
        title: "Looking after the heap",
        blocks: [
          {
            id: "blkpara003",
            category: "text",
            variant: "paragraph",
            items: [
              {
                id: "itmpara003",
                kind: "content",
                text: "<p>Turn the heap every few weeks and keep it as damp as a wrung-out sponge.</p>",
              },
            ],
          },
        ],
      },
    ],
    media: [
      {
        id: "mediacover",
        key: "cover.svg",
        source: "upload",
        mimeType: "image/svg+xml",
        width: 1200,
        height: 600,
      },
      {
        id: "mediabin01",
        key: "compost-bin.svg",
        source: "upload",
        mimeType: "image/svg+xml",
        width: 640,
        height: 360,
      },
    ],
  };
}
