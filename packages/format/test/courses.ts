// Course documents for tests, written by hand for this package.
import type { Block, ContentItem, Course } from "../src/course.js";

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
      exitLink: true,
    },
    navigation: { restricted: false, learnerMarkDone: true },
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

/**
 * Every text and static block variant (BLK-04) with most of their settings, on two lessons, some on
 * a dark block colour; its media are SVG drawings.
 */
export function staticBlocksCourse(): Course {
  const text = (id: string, html: string, more: Partial<ContentItem> = {}): ContentItem => ({
    id,
    kind: "content",
    text: html,
    ...more,
  });
  const block = (
    id: string,
    category: Block["category"],
    variant: string,
    items: ContentItem[] = [],
    more: Partial<Block> = {},
  ): Block => ({ id, category, variant, ...(items.length > 0 && { items }), ...more });
  const dark = { background: { kind: "color" as const, color: "#2b3038" } };
  const svg = (id: string, key: string, width: number, height: number) => ({
    id,
    key,
    source: "upload" as const,
    mimeType: "image/svg+xml",
    width,
    height,
  });
  const quote = (n: number) =>
    text(`stquoitm0${n}`, `<p>Quote ${n}: look a little to the side of a faint star.</p>`, {
      title: `Observer ${n}`,
      media: { key: "observer.svg", alt: "" },
    });
  const shot = (n: number) =>
    text(`stgalitm0${n}`, `<p>Night ${n} from the garden.</p>`, {
      media: { key: "sky.svg", alt: `The sky on night ${n}, with the moon low in the east.` },
    });
  return {
    schemaVersion: "1.0",
    id: PROJECT_ID,
    kind: "course",
    title: "Watching the night sky",
    entries: [
      {
        id: "stlessread",
        kind: "lesson",
        title: "Reading blocks",
        blocks: [
          block(
            "sttextcol1",
            "text",
            "paragraph-with-heading",
            [
              text(
                "sttextitm1",
                "<p>Find a dark place away from street lights and let your eyes adjust for twenty minutes before you start looking.</p>",
                { title: "Before you look up" },
              ),
            ],
            { variantSettings: { columns: 2 } },
          ),
          block(
            "sttexthead",
            "text",
            "paragraph-with-heading",
            [
              text("sttextitm2", "<p>Red light keeps your eyes used to the dark.</p>", {
                title: "Keep a red torch",
              }),
            ],
            { variantSettings: { headingLevel: 3, headingSpace: 24 } },
          ),
          block(
            "sttextcols",
            "text",
            "columns",
            [
              text("stcolsitm1", "<p>Binoculars show far more than your eyes.</p>", {
                media: { key: "sky.svg", alt: "" },
              }),
              text("stcolsitm2", "<p>A chair saves your neck.</p>", {
                media: { key: "sky.svg", alt: "" },
              }),
              text("stcolsitm3", "<p>A notebook keeps what you saw.</p>", {
                media: { key: "sky.svg", alt: "" },
              }),
            ],
            { variantSettings: { columns: 3, images: true } },
          ),
          block(
            "sttexttabl",
            "text",
            "table",
            [
              text(
                "sttablitm1",
                '<table><thead><tr><th>Object</th><th>Best month</th></tr></thead><tbody><tr><td><strong>Orion</strong></td><td>January</td></tr><tr><td>Lyra</td><td><a href="#/lessons/stlesspics">August</a></td></tr></tbody></table>',
              ),
            ],
            { variantSettings: { cellPadding: "large" }, settings: { accentColor: "#1f5fbf" } },
          ),
          ...(["statement-a", "statement-b", "statement-c", "statement-d"] as const).map(
            (variant, i) =>
              block(
                `ststatem0${i + 1}`,
                "statement",
                variant,
                [
                  text(
                    `ststatitm${i + 1}`,
                    `<p>Patience shows you more stars than any lens. (${variant})</p>`,
                  ),
                ],
                i === 3 ? { settings: dark } : {},
              ),
          ),
          block(
            "ststatnote",
            "statement",
            "note",
            [text("ststatnot1", "<p>Check the weather and the moon before you set out.</p>")],
            { variantSettings: { noteColor: "#fde7a9", noteSize: "large" } },
          ),
          ...(["quote-a", "quote-b", "quote-c", "quote-d"] as const).map((variant, i) =>
            block(
              `stquotesa${i + 1}`,
              "quote",
              variant,
              [
                text(`stquoteit${i + 1}`, "<p>The sky rewards the people who wait.</p>", {
                  title: "A club member",
                }),
              ],
              i === 1 ? { settings: dark, variantSettings: { divider: true, dividerSize: 5 } } : {},
            ),
          ),
          block(
            "stquoteimg",
            "quote",
            "on-image",
            [
              text("stquoimit1", "<p>Every clear night is a new map.</p>", {
                title: "A club member",
              }),
            ],
            { media: [{ key: "sky.svg", alt: "" }], variantSettings: { align: "left" } },
          ),
          block("stquotecar", "quote", "carousel", [quote(1), quote(2), quote(3)]),
          block(
            "stlistnumb",
            "list",
            "numbered",
            [
              text("stlistnum1", "<p>Find the Plough.</p>"),
              text("stlistnum2", "<p>Follow its last two stars upward.</p>"),
            ],
            { variantSettings: { start: 3, markerColor: "#7a2e8f" } },
          ),
          block(
            "stlistbull",
            "list",
            "bulleted",
            [
              text("stlistbul1", "<p>Warm clothes</p>"),
              text("stlistbul2", "<p>A flask of tea</p>"),
            ],
            { settings: dark },
          ),
          block("stlistchek", "list", "checkbox", [
            text("stlistchk1", "<p>I let my eyes adjust.</p>"),
            text("stlistchk2", "<p>I found the Pole Star.</p>"),
          ]),
          block("stdivline1", "divider", "line"),
          block("stdivnum01", "divider", "numbered"),
          block("stdivspace", "divider", "spacer"),
          block("stdivnum02", "divider", "numbered"),
          block("stdivnum03", "divider", "numbered", [], {
            variantSettings: { restart: true, start: 5 },
          }),
        ],
      },
      {
        id: "stlesspics",
        kind: "lesson",
        title: "Pictures",
        blocks: [
          block(
            "stimgcentr",
            "image",
            "centered",
            [text("stimgcapt1", "<p>The moon at first quarter.</p>")],
            {
              media: [{ key: "moon.svg", alt: "The moon, half lit, over a roof." }],
              variantSettings: { cornerRadius: 12 },
            },
          ),
          // Decorative and linked to the first lesson, so the link is named by that lesson.
          block("stimgfullw", "image", "full-width", [], {
            media: [{ key: "sky.svg", alt: "" }],
            variantSettings: { link: "#/lessons/stlessread" },
          }),
          block(
            "stimgtext1",
            "image",
            "image-text",
            [text("stimgtxt01", "<p>Craters show best along the line between light and dark.</p>")],
            {
              media: [
                { key: "moon.svg", alt: "Craters near the edge of the lit half of the moon." },
              ],
              variantSettings: { position: "right", size: "large" },
            },
          ),
          block("stimgonimg", "image", "text-on-image", [text("stimgtxt02", "<p>Look up.</p>")], {
            media: [{ key: "sky.svg", alt: "" }],
            variantSettings: { overlayOpacity: 70 },
          }),
          block("stimgbannr", "image", "banner", [], { media: [{ key: "sky.svg", alt: "" }] }),
          block("stgalcarou", "gallery", "carousel", [shot(1), shot(2), shot(3)]),
          block("stgalgrid2", "gallery", "grid-2", [shot(4), shot(5)]),
          block("stgalgrid3", "gallery", "grid-3", [shot(6), shot(7), shot(8)], {
            variantSettings: { cornerRadius: 8 },
          }),
          block("stgalgrid4", "gallery", "grid-4", [
            shot(9),
            text("stgalitm10", "<p>A cloudy night.</p>"),
          ]),
        ],
      },
    ],
    media: [
      svg("stmediasky", "sky.svg", 960, 480),
      svg("stmediamon", "moon.svg", 480, 480),
      svg("stmediaobs", "observer.svg", 120, 120),
    ],
  };
}

/**
 * Embed addresses named YouTube that are not a YouTube player (D-44), by the trick each tries: the
 * format refuses them and the player frames none of them.
 */
export const EMBED_ATTACKS: readonly (readonly [trick: string, embedUrl: string])[] = [
  ["another host", "https://login.example.net/phish"],
  ["a look-alike host", "https://www.youtube-nocookie.com.example.net/embed/aqz-KE-bpKQ"],
  [
    "the provider's host as a user name",
    "https://www.youtube-nocookie.com@login.example.net/embed/aqz-KE-bpKQ",
  ],
  ["a user name and password", "https://user:pass@www.youtube-nocookie.com/embed/aqz-KE-bpKQ"],
  ["another port", "https://www.youtube-nocookie.com:8443/embed/aqz-KE-bpKQ"],
  ["a dot segment", "https://www.youtube-nocookie.com/embed/../phish"],
  ["an encoded dot segment", "https://www.youtube-nocookie.com/embed/%2e%2e/phish"],
  ["an encoded slash", "https://www.youtube-nocookie.com/embed/x%2F..%2F..%2Fphish"],
  ["backslashes", "https://www.youtube-nocookie.com\\embed\\aqz-KE-bpKQ"],
  ["a path past the video", "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ/phish"],
  ["no video", "https://www.youtube-nocookie.com/embed/"],
  ["another provider's player", "https://player.vimeo.com/video/76979871"],
];

/**
 * Every media block (M2-13, BLK-05): image variants, galleries, audio, video with caption tracks in
 * two languages, a web embed, a file to download and a code snippet, a block with narration, a
 * cover and a lesson header image. Its media are stand-ins the tests write next to it.
 */
export function mediaCourse(): Course {
  return {
    schemaVersion: "1.0",
    id: PROJECT_ID,
    kind: "course",
    title: "A walk by the river",
    cover: { key: "cover.svg", alt: "A footpath beside a slow river" },
    sourceLanguage: "en",
    entries: [
      {
        id: "lessonpics",
        kind: "lesson",
        title: "What you will see",
        headerImage: { key: "header.svg", alt: "" },
        blocks: [
          {
            id: "blkcentred",
            category: "image",
            variant: "centered",
            media: [{ key: "heron.svg", alt: "A grey heron standing in shallow water" }],
            items: [{ id: "itmcentred", kind: "content", text: "<p>Herons fish at dawn.</p>" }],
          },
          {
            id: "blkfullwid",
            category: "image",
            variant: "full-width",
            media: [{ key: "bank.svg", alt: "" }],
          },
          {
            id: "blkimgtext",
            category: "image",
            variant: "image-text",
            variantSettings: { position: "right", size: "small", zoom: false },
            media: [{ key: "heron.svg", alt: "The heron again, closer" }],
            items: [{ id: "itmimgtext", kind: "content", text: "<p>Look for its long neck.</p>" }],
          },
          {
            id: "blkonimage",
            category: "image",
            variant: "text-on-image",
            variantSettings: { overlayOpacity: 60 },
            media: [{ key: "bank.svg", alt: "" }],
            items: [{ id: "itmonimage", kind: "content", text: "<p>Keep to the path.</p>" }],
          },
          {
            id: "blkbanner1",
            category: "image",
            variant: "banner",
            media: [{ key: "bank.svg", alt: "Reeds along the bank" }],
          },
          {
            id: "blkcarouse",
            category: "gallery",
            variant: "carousel",
            items: [
              {
                id: "itmslide01",
                kind: "content",
                media: { key: "heron.svg", alt: "A heron" },
                text: "<p>Heron</p>",
              },
              { id: "itmslide02", kind: "content", media: { key: "bank.svg", alt: "The bank" } },
              {
                id: "itmslide03",
                kind: "content",
                media: { key: "cover.svg", alt: "The path" },
                text: "<p>Path</p>",
              },
            ],
          },
          {
            id: "blkgrid003",
            category: "gallery",
            variant: "grid-3",
            variantSettings: { cornerRadius: 12 },
            items: [
              { id: "itmgrid001", kind: "content", media: { key: "heron.svg", alt: "A heron" } },
              { id: "itmgrid002", kind: "content", media: { key: "bank.svg", alt: "The bank" } },
              { id: "itmgrid003", kind: "content", media: { key: "cover.svg", alt: "The path" } },
            ],
          },
        ],
      },
      {
        id: "lessonsoun",
        kind: "lesson",
        title: "Listen and watch",
        blocks: [
          {
            id: "blkaudio01",
            category: "multimedia",
            variant: "audio",
            variantSettings: { forwardSeeking: false, transcript: "Water runs over stones." },
            media: [{ key: "stream.mp3" }],
            items: [{ id: "itmaudio01", kind: "content", text: "<p>The stream at dawn.</p>" }],
          },
          {
            id: "blkvideo01",
            category: "multimedia",
            variant: "video",
            variantSettings: {
              poster: { key: "bank.svg" },
              transcript: "Two otters roll in the shallows.",
            },
            media: [
              {
                key: "otters.webm",
                captions: [
                  { key: "otters-en.vtt", language: "en" },
                  { key: "otters-fr.vtt", language: "fr" },
                ],
              },
            ],
            items: [{ id: "itmvideo01", kind: "content", text: "<p>Otters at play.</p>" }],
          },
          {
            id: "blknarrate",
            category: "text",
            variant: "paragraph",
            settings: {
              background: {
                kind: "image",
                image: { key: "bank.svg", alt: "" },
                overlay: "dark",
                opacity: 70,
              },
              narration: {
                audio: { key: "stream.mp3" },
                transcript: "<p>Listen as you read.</p>",
                position: "top",
              },
            },
            items: [{ id: "itmnarrate", kind: "content", text: "<p>Read along.</p>" }],
          },
        ],
      },
      {
        id: "lessonlink",
        kind: "lesson",
        title: "Take it further",
        blocks: [
          {
            id: "blkembed01",
            category: "multimedia",
            variant: "embed",
            variantSettings: {
              url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
              embedUrl: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
              provider: "YouTube",
            },
            items: [{ id: "itmembed01", kind: "content", text: "<p>A river film.</p>" }],
          },
          {
            id: "blkattach1",
            category: "multimedia",
            variant: "attachment",
            variantSettings: { fileName: "River map.pdf", fileSize: 24576 },
            media: [{ key: "map.pdf" }],
            items: [{ id: "itmattach1", kind: "content", text: "<p>Print it for the walk.</p>" }],
          },
          {
            id: "blkcode001",
            category: "multimedia",
            variant: "code-snippet",
            variantSettings: {
              code: 'const pace = "slow";\nconsole.log("The river is " + pace + " today.");',
              language: "JavaScript",
              wrap: true,
            },
            items: [{ id: "itmcode001", kind: "content", text: "<p>Log the river's pace.</p>" }],
          },
        ],
      },
    ],
    media: [
      ["mediacover", "cover.svg", "image/svg+xml", 1200, 600],
      ["mediahead", "header.svg", "image/svg+xml", 1600, 400],
      ["mediaheron", "heron.svg", "image/svg+xml", 800, 600],
      ["mediabank", "bank.svg", "image/svg+xml", 1600, 900],
      ["mediastream", "stream.mp3", "audio/mpeg"],
      ["mediaotter", "otters.webm", "video/webm", 1280, 720],
      ["mediacapen", "otters-en.vtt", "text/vtt"],
      ["mediacapfr", "otters-fr.vtt", "text/vtt"],
      ["mediamap", "map.pdf", "application/pdf"],
      ["mediaunused", "unused.svg", "image/svg+xml", 10, 10],
    ].map(([id, key, mimeType, width, height]) => ({
      id: String(id).padEnd(10, "0").slice(0, 10),
      key: String(key),
      mimeType: String(mimeType),
      source: "upload" as const,
      ...(width !== undefined && { width: Number(width), height: Number(height) }),
    })),
  };
}
