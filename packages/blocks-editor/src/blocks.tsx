// The block types (blocks-editor.md 3; BLK-03 plugin contract): every type the library lists, in
// its order, with what each one brings to the editor. A type that the format and the player can
// show today has `create` (a new block with sample content, W7) and usually `Fields` (its content,
// edited in place); the others are listed as not available yet. A later block epic adds its type
// here and touches no other editor file.
import type { Command, Editor } from "@course-suite/doc-ops";
import type { Block, ContentItem, Question } from "@course-suite/format";
import { Checkbox, type StringKey, type Translate, useStrings } from "@course-suite/ui";
import type { ComponentType } from "react";
import { DraftField, inlineHtml, RichDraftField, textOf } from "./fields.js";
import { idMaker } from "./ids.js";
import {
  AttachmentFields,
  AudioFields,
  CodeSnippetFields,
  CodeSnippetFormat,
  EmbedFields,
  VideoFields,
} from "./media-fields.js";
import {
  DIVIDER_TYPES,
  GALLERY_TYPES,
  IMAGE_TYPES,
  LIST_TYPES,
  MORE_TEXT_TYPES,
  QUOTE_TYPES,
  STATEMENT_TYPES,
  TEXT_FORMAT,
} from "./static-blocks.js";

/** Library groups in the library's order. Most are format categories; AI and templates are not. */
export const GROUPS = [
  "ai",
  "text",
  "statement",
  "quote",
  "list",
  "image",
  "gallery",
  "multimedia",
  "interactive",
  "knowledge-check",
  "survey",
  "chart",
  "divider",
  "templates",
  "code",
  "custom",
] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABEL: Record<Group, StringKey> = {
  ai: "block.ai",
  text: "block.text",
  statement: "block.statement",
  quote: "block.quote",
  list: "block.list",
  image: "block.image",
  gallery: "block.gallery",
  multimedia: "block.multimedia",
  interactive: "block.interactive",
  "knowledge-check": "block.knowledge-check",
  survey: "block.survey",
  chart: "block.chart",
  divider: "block.divider",
  templates: "block.templates",
  code: "block.code",
  custom: "block.custom",
};

export interface FieldsProps {
  block: Block;
  editor: Editor;
}

export interface BlockType {
  group: Group;
  variant: string;
  label: StringKey;
  /** A new block of this type with sample content; `id` gives a new unused content id. */
  create?: (id: () => string, t: Translate) => Block;
  /** Edits the block's content in place; none: the block has nothing to type. */
  Fields?: ComponentType<FieldsProps>;
  /** Its own format options, shown in the format menu after the common ones (L10). */
  Format?: ComponentType<FieldsProps>;
  /** Other variants it can switch to, keeping its content (W8, UI-BLOCKS-EDITOR-R25). */
  switchable?: boolean;
  /** Its items show as cards, which may stay white on a block colour (2.4 "keep cards white"). */
  cards?: boolean;
}

/** The type id of a block or library entry: group or category, a slash, the variant. */
export const typeId = (block: { category: string; variant: string }) =>
  `${block.category}/${block.variant}`;

const content = (block: Block): ContentItem | undefined =>
  block.items?.find((item): item is ContentItem => item.kind === "content");

/**
 * The edit of the block's first content item, or the one adding it (a block made by an importer
 * may have none); none for no text in a block without one.
 */
export function setContent(
  block: Block,
  id: () => string,
  field: "title" | "text",
  html: string,
): Command[] {
  const item = content(block);
  if (!item) {
    return html
      ? [
          {
            type: "insertItem",
            parent: block.id,
            value: { id: id(), kind: "content", [field]: html },
          },
        ]
      : [];
  }
  return [
    html
      ? { type: "updateItem", id: item.id, set: { [field]: html } }
      : { type: "updateItem", id: item.id, unset: [field] },
  ];
}

/** Text blocks: a heading, a body text, or both (blocks-editor.md 2.5). */
function textFields(title: StringKey | undefined, body: boolean): ComponentType<FieldsProps> {
  return function TextFields({ block, editor }) {
    const t = useStrings();
    const item = content(block);
    const newId = () => idMaker(editor.document)();
    return (
      <>
        {title && (
          <DraftField
            label={t(title)}
            value={textOf(item?.title ?? "")}
            command={(text) => setContent(block, newId, "title", inlineHtml(text))}
          />
        )}
        {body && (
          <RichDraftField
            label={t("field.text")}
            value={item?.text ?? ""}
            command={(html) => setContent(block, newId, "text", html)}
          />
        )}
      </>
    );
  };
}

/** Continue: its own button label and locked hint, empty for the defaults (blocks-interactions.md 2.11). */
function ContinueFields({ block }: FieldsProps) {
  const t = useStrings();
  const settings = block.variantSettings ?? {};
  const set = (name: "buttonLabel" | "hintText", value: string): Command => {
    const { [name]: _, ...others } = settings;
    const next = value.trim() ? { ...others, [name]: value.trim() } : others;
    return Object.keys(next).length > 0
      ? { type: "updateBlock", id: block.id, set: { variantSettings: next } }
      : { type: "updateBlock", id: block.id, unset: ["variantSettings"] };
  };
  const text = (name: string) =>
    typeof settings[name] === "string" ? (settings[name] as string) : "";
  return (
    <>
      <DraftField
        label={t("field.buttonLabel")}
        description={t("field.buttonLabelHelp")}
        value={text("buttonLabel")}
        command={(text) => set("buttonLabel", text)}
      />
      <DraftField
        label={t("field.hint")}
        description={t("field.hintHelp")}
        value={text("hintText")}
        command={(text) => set("hintText", text)}
      />
    </>
  );
}

/**
 * Knowledge checks: the question, its answers and which are right (blocks-interactions.md 2.12).
 * Adding and removing answers, feedback and the other settings come with quiz editing (M2-15).
 */
function QuestionFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const question = block.question;
  if (!question) return <p className="be-note">{t("field.noFields")}</p>;
  const update = (set: Partial<Question>) =>
    ({ type: "updateQuestion", id: question.id, set }) as Command;
  return (
    <>
      <RichDraftField
        label={t("field.question")}
        value={question.prompt}
        command={(prompt) => (prompt ? update({ prompt }) : undefined)}
      />
      {(question.kind === "single-choice" || question.kind === "multiple-response") &&
        question.answers.map((answer, i) => (
          <div key={answer.id} className="be-answer">
            <DraftField
              label={t("field.answer", { number: i + 1 })}
              value={textOf(answer.text)}
              command={(text) =>
                text.trim()
                  ? { type: "updateAnswer", id: answer.id, set: { text: inlineHtml(text) } }
                  : undefined
              }
            />
            <Checkbox
              isSelected={answer.correct}
              onChange={(correct) =>
                editor.dispatch(
                  question.kind === "single-choice"
                    ? // One right answer: choosing one makes the others wrong, in one step.
                      question.answers.map((other) => ({
                        type: "updateAnswer" as const,
                        id: other.id,
                        set: { correct: other.id === answer.id },
                      }))
                    : { type: "updateAnswer", id: answer.id, set: { correct } },
                )
              }
            >
              {t("field.correct")}
            </Checkbox>
          </div>
        ))}
      {question.kind === "fill-in" && (
        <DraftField
          label={t("field.accepted")}
          description={t("field.acceptedHelp")}
          multiline
          value={question.acceptedAnswers.join("\n")}
          command={(text) => {
            const accepted = text
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
            return accepted.length > 0 ? update({ acceptedAnswers: accepted }) : undefined;
          }}
        />
      )}
      {question.kind === "matching" &&
        question.pairs.map((pair, i) => (
          <div key={pair.id} className="be-answer">
            <DraftField
              label={t("field.pairItem", { number: i + 1 })}
              value={textOf(pair.prompt)}
              command={(text) =>
                text.trim()
                  ? { type: "updatePair", id: pair.id, set: { prompt: inlineHtml(text) } }
                  : undefined
              }
            />
            <DraftField
              label={t("field.pairMatch", { number: i + 1 })}
              value={textOf(pair.match)}
              command={(text) =>
                text.trim()
                  ? { type: "updatePair", id: pair.id, set: { match: inlineHtml(text) } }
                  : undefined
              }
            />
          </div>
        ))}
    </>
  );
}

const paragraph = (t: Translate) => `<p>${inlineHtml(t("sample.paragraph"))}</p>`;
const textBlock =
  (variant: string, title: StringKey | undefined, body: boolean) =>
  (id: () => string, t: Translate): Block => ({
    id: id(),
    category: "text",
    variant,
    items: [
      {
        id: id(),
        kind: "content",
        ...(title && { title: inlineHtml(t(title)) }),
        ...(body && { text: paragraph(t) }),
      },
    ],
  });
const check =
  (make: (id: () => string, t: Translate) => Question) =>
  (id: () => string, t: Translate): Block => {
    const blockId = id();
    const question = make(id, t);
    return { id: blockId, category: "knowledge-check", variant: question.kind, question };
  };
const prompt = (t: Translate, key: StringKey) => `<p>${inlineHtml(t(key))}</p>`;
const answer = (id: () => string, t: Translate, key: StringKey, correct: boolean) => ({
  id: id(),
  text: inlineHtml(t(key)),
  correct,
});

/**
 * Multimedia blocks (M2-13; blocks-editor.md 2.12). A new one waits for its file, which the player
 * needs before it shows anything.
 */
const MULTIMEDIA_TYPES: readonly BlockType[] = (
  [
    ["audio", AudioFields],
    ["video", VideoFields],
    ["embed", EmbedFields],
    ["attachment", AttachmentFields],
  ] as const
).map(
  ([variant, Fields]): BlockType => ({
    group: "multimedia",
    variant,
    label: `variant.multimedia.${variant}`,
    create: (id) => ({ id: id(), category: "multimedia", variant }),
    Fields,
  }),
);

const CODE_SNIPPET: BlockType = {
  group: "multimedia",
  variant: "code-snippet",
  label: "variant.multimedia.code-snippet",
  create: (id, t) => ({
    id: id(),
    category: "multimedia",
    variant: "code-snippet",
    variantSettings: { code: t("sample.code") },
  }),
  Fields: CodeSnippetFields,
  Format: CodeSnippetFormat,
};

const later = (group: Group, variants: string[]): BlockType[] =>
  variants.map((variant) => ({
    group,
    variant,
    label: `variant.${group}.${variant}` as StringKey,
  }));

/** Every block type, in the library's order (blocks-editor.md 3). */
export const BLOCK_TYPES: readonly BlockType[] = [
  ...later("ai", ["text", "image"]),
  {
    group: "text",
    variant: "paragraph",
    label: "variant.text.paragraph",
    create: textBlock("paragraph", undefined, true),
    Fields: textFields(undefined, true),
    Format: TEXT_FORMAT,
    switchable: true,
  },
  {
    group: "text",
    variant: "paragraph-with-heading",
    label: "variant.text.paragraph-with-heading",
    create: textBlock("paragraph-with-heading", "sample.heading", true),
    Fields: textFields("field.heading", true),
    Format: TEXT_FORMAT,
    switchable: true,
  },
  {
    group: "text",
    variant: "paragraph-with-subheading",
    label: "variant.text.paragraph-with-subheading",
    create: textBlock("paragraph-with-subheading", "sample.subheading", true),
    Fields: textFields("field.subheading", true),
    Format: TEXT_FORMAT,
    switchable: true,
  },
  {
    group: "text",
    variant: "heading",
    label: "variant.text.heading",
    create: textBlock("heading", "sample.heading", false),
    Fields: textFields("field.heading", false),
    Format: TEXT_FORMAT,
    switchable: true,
  },
  {
    group: "text",
    variant: "subheading",
    label: "variant.text.subheading",
    create: textBlock("subheading", "sample.subheading", false),
    Fields: textFields("field.subheading", false),
    Format: TEXT_FORMAT,
    switchable: true,
  },
  ...MORE_TEXT_TYPES,
  ...STATEMENT_TYPES,
  ...QUOTE_TYPES,
  ...LIST_TYPES,
  ...IMAGE_TYPES,
  ...GALLERY_TYPES,
  // Multimedia blocks (M2-13, media-fields.tsx).
  ...MULTIMEDIA_TYPES,
  CODE_SNIPPET,
  ...later("interactive", [
    "accordion",
    "tabs",
    "labeled-graphic",
    "process",
    "scenario",
    "sorting",
    "timeline",
    "flashcard-grid",
    "flashcard-stack",
    "button",
    "buttons",
    "slides",
  ]),
  {
    group: "knowledge-check",
    variant: "single-choice",
    label: "variant.knowledge-check.single-choice",
    create: check((id, t) => ({
      id: id(),
      kind: "single-choice",
      prompt: prompt(t, "sample.choicePrompt"),
      answers: [answer(id, t, "sample.right", true), answer(id, t, "sample.wrong", false)],
    })),
    Fields: QuestionFields,
    cards: true,
  },
  {
    group: "knowledge-check",
    variant: "multiple-response",
    label: "variant.knowledge-check.multiple-response",
    create: check((id, t) => ({
      id: id(),
      kind: "multiple-response",
      prompt: prompt(t, "sample.responsePrompt"),
      answers: [
        answer(id, t, "sample.right", true),
        answer(id, t, "sample.right", true),
        answer(id, t, "sample.wrong", false),
      ],
    })),
    Fields: QuestionFields,
    cards: true,
  },
  {
    group: "knowledge-check",
    variant: "fill-in",
    label: "variant.knowledge-check.fill-in",
    create: check((id, t) => ({
      id: id(),
      kind: "fill-in",
      prompt: prompt(t, "sample.fillPrompt"),
      acceptedAnswers: [t("sample.fillAnswer")],
    })),
    Fields: QuestionFields,
    cards: true,
  },
  {
    group: "knowledge-check",
    variant: "matching",
    label: "variant.knowledge-check.matching",
    create: check((id, t) => ({
      id: id(),
      kind: "matching",
      prompt: prompt(t, "sample.matchPrompt"),
      pairs: (
        [
          ["sample.match1", "sample.match1b"],
          ["sample.match2", "sample.match2b"],
          ["sample.match3", "sample.match3b"],
        ] as const
      ).map(([item, match]) => ({
        id: id(),
        prompt: inlineHtml(t(item)),
        match: inlineHtml(t(match)),
      })),
    })),
    Fields: QuestionFields,
    cards: true,
  },
  ...later("knowledge-check", ["draw"]),
  ...later("survey", ["survey"]),
  ...later("chart", ["bar", "line", "pie"]),
  {
    group: "divider",
    variant: "continue",
    label: "variant.divider.continue",
    create: (id) => ({ id: id(), category: "divider", variant: "continue" }),
    Fields: ContinueFields,
  },
  ...DIVIDER_TYPES,
  ...later("templates", ["saved"]),
  ...later("code", ["code"]),
  ...later("custom", ["custom"]),
];

const BY_ID = new Map(BLOCK_TYPES.map((type) => [`${type.group}/${type.variant}`, type]));

/** The type of a block in a course, if the editor knows it. */
export const typeOf = (block: Block): BlockType | undefined => BY_ID.get(typeId(block));

/** What a block is called: its type, or its category for a type the editor does not know. */
export function typeName(block: Block, t: Translate): string {
  const type = typeOf(block);
  return t(type ? type.label : (`block.${block.category}` as StringKey));
}

/** The first words of a block, to tell it from its neighbours in lists and announcements. */
export function blockText(block: Block): string {
  const item = content(block);
  const html = item?.title || item?.text || block.question?.prompt || "";
  const text = textOf(html).replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** A block's name for lists, toolbars and announcements: its type and first words. */
export function blockName(block: Block, t: Translate): string {
  const type = typeName(block, t);
  const text = blockText(block);
  return text ? t("blocks.name", { type, text }) : type;
}

export { idMaker } from "./ids.js";
