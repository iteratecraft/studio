// Starter placeholder templates (rise.md 2 flow 1, 3J; blocks-editor.md H15, W3, GB-O6; BLK-01;
// D-38): new courses, microlearning and lessons built from the text and static blocks, with our own
// placeholder text that tells the author what to write. Placeholder templates need editing before
// they are published, so every text is an instruction, never content. The text comes from the
// string catalogue, so a translated editor gives translated templates.
import type { Block, ContentItem, Course, Entry, LessonEntry } from "@course-suite/format";
import { newContentId } from "@course-suite/format";
import type { StringKey, Translate } from "@course-suite/ui";
import { blankCourse } from "./course.js";
import { inlineHtml } from "./fields.js";
import { writeTable } from "./static-blocks.js";

type Ids = () => string;
type Make = (id: Ids, t: Translate) => Block;

const p = (t: Translate, key: StringKey) => `<p>${inlineHtml(t(key))}</p>`;
const item = (id: Ids, fields: Partial<ContentItem>): ContentItem => ({
  id: id(),
  kind: "content",
  ...fields,
});
const block =
  (
    category: Block["category"],
    variant: string,
    items: (t: Translate) => Partial<ContentItem>[],
  ): Make =>
  (id, t) => {
    const made = items(t);
    return {
      id: id(),
      category,
      variant,
      ...(made.length > 0 && { items: made.map((fields) => item(id, fields)) }),
    };
  };
const titled = (variant: string, title: StringKey, text: StringKey) =>
  block("text", variant, (t) => [{ title: inlineHtml(t(title)), text: p(t, text) }]);
const one = (category: Block["category"], variant: string, text: StringKey) =>
  block(category, variant, (t) => [{ text: p(t, text) }]);
const list = (variant: string, ...keys: StringKey[]) =>
  block("list", variant, (t) => keys.map((key) => ({ text: p(t, key) })));

/** The lessons a template brings, each a title and its blocks. */
const LESSONS = {
  introduction: {
    title: "template.lesson.introduction",
    description: "template.lesson.introductionAbout",
    blocks: [
      titled("paragraph-with-heading", "template.welcome", "template.welcomeText"),
      one("statement", "statement-a", "template.whyItMatters"),
      list("bulleted", "template.goal1", "template.goal2", "template.goal3"),
      one("statement", "note", "template.timeNote"),
    ],
  },
  concept: {
    title: "template.lesson.concept",
    description: "template.lesson.conceptAbout",
    blocks: [
      titled("paragraph-with-heading", "template.idea", "template.ideaText"),
      // A picture placeholder: adding pictures comes with the media library (M2-13).
      one("image", "centered", "template.pictureCaption"),
      block("quote", "quote-b", (t) => [
        { text: p(t, "template.quoteText"), title: inlineHtml(t("template.quoteName")) },
      ]),
      block("divider", "line", () => []),
      titled("paragraph-with-subheading", "template.example", "template.exampleText"),
      block("text", "table", (t) => [
        {
          text: writeTable({
            header: true,
            rows: [
              [t("template.tableTerm"), t("template.tableMeaning")],
              [t("template.tableTermText"), t("template.tableMeaningText")],
            ].map((row) => row.map(inlineHtml)),
          }),
        },
      ]),
    ],
  },
  steps: {
    title: "template.lesson.steps",
    description: "template.lesson.stepsAbout",
    blocks: [
      titled("paragraph-with-heading", "template.howTo", "template.howToText"),
      list("numbered", "template.step1", "template.step2", "template.step3"),
      one("statement", "note", "template.stepsNote"),
      list("checkbox", "template.check1", "template.check2"),
    ],
  },
  summary: {
    title: "template.lesson.summary",
    description: "template.lesson.summaryAbout",
    blocks: [
      titled("paragraph-with-heading", "template.recap", "template.recapText"),
      list("bulleted", "template.point1", "template.point2", "template.point3"),
      one("statement", "statement-c", "template.takeaway"),
      one("text", "paragraph", "template.nextSteps"),
    ],
  },
} satisfies Record<string, { title: StringKey; description: StringKey; blocks: Make[] }>;

export type LessonTemplateId = keyof typeof LESSONS;

export interface Template {
  id: string;
  kind: Course["kind"];
  title: StringKey;
  description: StringKey;
  /** The outline: section headers by title key, and lessons by lesson template. */
  outline: readonly ({ section: StringKey } | LessonTemplateId)[];
}

/** The course and microlearning templates, for the dashboard's New menu (H3, H15, W3). */
export const COURSE_TEMPLATES: readonly Template[] = [
  {
    id: "starter-course",
    kind: "course",
    title: "template.course.starter",
    description: "template.course.starterAbout",
    outline: [
      { section: "template.section.start" },
      "introduction",
      { section: "template.section.learn" },
      "concept",
      "steps",
      "summary",
    ],
  },
  {
    id: "one-idea",
    kind: "microlearning",
    title: "template.course.oneIdea",
    description: "template.course.oneIdeaAbout",
    outline: ["concept"],
  },
];

/** The lesson templates, for adding a lesson to a course (W3 step 3, C7). */
export const LESSON_TEMPLATES = (Object.keys(LESSONS) as LessonTemplateId[]).map((id) => ({
  id,
  title: LESSONS[id].title,
  description: LESSONS[id].description,
}));

/** A new id that `taken` does not hold, added to it. */
const idsFor =
  (taken: Set<string>): Ids =>
  () => {
    const id = newContentId(taken);
    taken.add(id);
    return id;
  };

/** A lesson from template `which`, with ids new in a course holding `taken`. */
export function lessonFrom(which: LessonTemplateId, taken: Set<string>, t: Translate): LessonEntry {
  const id = idsFor(taken);
  const template = LESSONS[which];
  return {
    id: id(),
    kind: "lesson",
    title: t(template.title),
    blocks: template.blocks.map((make) => make(id, t)),
  };
}

/**
 * A new course or microlearning from a template, titled `title`; a microlearning's one lesson takes
 * the course title, as a blank one does (W2).
 */
export function courseFrom(
  template: Template,
  title: string,
  t: Translate,
  now = new Date(),
): Course {
  const course = blankCourse(template.kind, title, now);
  const taken = new Set<string>();
  const id = idsFor(taken);
  const entries: Entry[] = template.outline.map((part) =>
    typeof part === "string"
      ? lessonFrom(part, taken, t)
      : { id: id(), kind: "section", title: t(part.section) },
  );
  if (template.kind === "microlearning") {
    const [lesson] = entries;
    return { ...course, entries: lesson ? [{ ...lesson, title } as LessonEntry] : course.entries };
  }
  return { ...course, entries };
}
