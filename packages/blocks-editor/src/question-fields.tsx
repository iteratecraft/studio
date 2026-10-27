// The question editor shared by knowledge-check blocks and quiz lessons (M2-15, BLK-07;
// blocks-interactions.md 2.12, A15, A17, W10, W11): the question type, the prompt with a picture
// or video and audio beside it, the answer choices (pasted several at once) and which are right, a
// fill-in's accepted answers and case sensitivity, a matching question's pairs and which column
// keeps its order, and the feedback by any response, by correct or incorrect, or by answer choice.
// A knowledge check's options sit in its format menu. Every change is one doc-ops command list, so
// one undo step.
import type { Command, Editor } from "@course-suite/doc-ops";
import {
  type Answer,
  accentReadable,
  type FeedbackMode,
  type MatchingQuestion,
  type MatchPair,
  type MediaRef,
  nearestReadable,
  type Question,
  SURFACE,
} from "@course-suite/format";
import {
  Button,
  Checkbox,
  IconButton,
  ListBoxItem,
  Select,
  type StringKey,
  Switch,
  useStrings,
} from "@course-suite/ui";
import type { ReactNode } from "react";
import type { FieldsProps } from "./blocks.js";
import { DraftField, inlineHtml, RichDraftField, textOf } from "./fields.js";
import { idMaker } from "./ids.js";
import { MediaDrop, useMediaIntake } from "./intake.js";
import {
  convertQuestion,
  KIND_LABEL,
  MAX_ACCEPTED,
  MAX_PAIRS,
  MIN_ANSWERS,
  MIN_PAIRS,
  QUESTION_KINDS,
  type QuestionKind,
} from "./questions.js";
import { type Control, Controls, ImageSlot, withVariantSettings } from "./static-blocks.js";

export interface QuestionEditorProps {
  question: Question;
  editor: Editor;
  /** The edit that turns the question into another type (convertQuestion). */
  switchTo: (question: Question) => Command | Command[];
}

const update = (question: Question, set: Record<string, unknown>, unset: string[] = []) =>
  ({
    type: "updateQuestion",
    id: question.id,
    ...(Object.keys(set).length > 0 && { set }),
    ...(unset.length > 0 && { unset }),
  }) as Command;

/** A rich text that may be empty: set, or left out. */
const optional = (question: Question, field: string, html: string) =>
  html ? update(question, { [field]: html }) : update(question, {}, [field]);

/** One question, edited in place (W10 steps 1 to 3, W11 step 3). */
export function QuestionEditor({ question, editor, switchTo }: QuestionEditorProps) {
  const t = useStrings();
  return (
    <div className="be-question">
      <Select
        label={t("question.type")}
        selectedKey={question.kind}
        onSelectionChange={(kind) =>
          editor.dispatch(
            switchTo(convertQuestion(question, kind as QuestionKind, idMaker(editor.document), t)),
          )
        }
      >
        {QUESTION_KINDS.map((kind) => (
          <ListBoxItem key={kind} id={kind}>
            {t(KIND_LABEL[kind])}
          </ListBoxItem>
        ))}
      </Select>
      <RichDraftField
        label={t("field.question")}
        value={question.prompt}
        command={(prompt) => (prompt ? update(question, { prompt }) : undefined)}
      />
      <QuestionMedia question={question} editor={editor} />
      {(question.kind === "single-choice" || question.kind === "multiple-response") && (
        <Choices question={question} editor={editor} />
      )}
      {question.kind === "fill-in" && <Accepted question={question} editor={editor} />}
      {question.kind === "matching" && <Pairs question={question} editor={editor} />}
      <Feedback question={question} editor={editor} />
    </div>
  );
}

/**
 * The question's picture or video, and audio beside either (rise.md 3C, 2.12 "prompt + media +
 * audio"): a new picture or video takes the place of the old, and so does new audio.
 */
function QuestionMedia({ question, editor }: { question: Question; editor: Editor }) {
  const t = useStrings();
  const intake = useMediaIntake();
  const ref = question.media;
  const type = ref && editor.document.media.find((media) => media.key === ref.key)?.mimeType;
  const image = ref && !/^(audio|video)\//.test(type ?? "") ? ref : undefined;
  const set = (media: MediaRef) => update(question, { media });
  const remove = update(question, {}, ["media"]);
  const take = (kind: "audio" | "video") => (
    <MediaDrop
      kind={kind}
      label={t(kind === "audio" ? "media.chooseAudio" : "media.chooseVideo")}
      onAdded={([added]) =>
        added &&
        editor.dispatch([
          ...added.commands,
          update(question, { [kind === "audio" ? "audio" : "media"]: { key: added.key } }),
        ])
      }
    />
  );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div role="group" aria-label={t("question.media")} className="be-question-media">
      <span className="cs-Label" aria-hidden="true">
        {t("question.media")}
      </span>
      <p className="be-note">{t("question.mediaHelp")}</p>
      <ImageSlot
        label={t("question.picture")}
        image={image}
        editor={editor}
        command={set}
        remove={{ label: t("media.removeImageFile"), command: remove }}
      />
      {ref && !image && (
        <>
          <p className="be-note">{t("media.file", { name: intake.name(ref.key) ?? ref.key })}</p>
          <Button variant="quiet" onPress={() => editor.dispatch(remove)}>
            {t("question.removeMedia")}
          </Button>
        </>
      )}
      {take("video")}
      {question.audio && (
        <>
          <p className="be-note">
            {t("question.audioFile", {
              name: intake.name(question.audio.key) ?? question.audio.key,
            })}
          </p>
          <Button variant="quiet" onPress={() => editor.dispatch(update(question, {}, ["audio"]))}>
            {t("question.removeAudio")}
          </Button>
        </>
      )}
      {take("audio")}
    </div>
  );
}

/** A list row's move and remove buttons, named after the row. */
function RowTools({
  name,
  index,
  count,
  min,
  move,
  remove,
}: {
  name: string;
  index: number;
  count: number;
  min: number;
  move: (index: number) => void;
  remove: () => void;
}) {
  const t = useStrings();
  return (
    <div className="be-item-head">
      <span className="be-item-name">{name}</span>
      <IconButton
        icon="arrow-up"
        label={t("items.up", { name })}
        isDisabled={index === 0}
        onPress={() => move(index - 1)}
      />
      <IconButton
        icon="arrow-down"
        label={t("items.down", { name })}
        isDisabled={index === count - 1}
        onPress={() => move(index + 1)}
      />
      <IconButton
        icon="trash"
        label={t("items.remove", { name })}
        isDisabled={count <= min}
        onPress={remove}
      />
    </div>
  );
}

/** A group of fields for one row of a list. */
function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div role="group" aria-label={name} className="be-item">
      {children}
    </div>
  );
}

/**
 * Answer choices (2.12): at least two; single choice has exactly one right answer, so marking
 * one unmarks the others in the same step; multiple response one or more. In by-choice feedback
 * mode each choice has its own message.
 */
function Choices({
  question,
  editor,
}: {
  question: Extract<Question, { answers: Answer[] }>;
  editor: Editor;
}) {
  const t = useStrings();
  const single = question.kind === "single-choice";
  const perAnswer = single && question.feedbackMode === "perAnswer";
  const answers = question.answers;
  return (
    <>
      <p className="be-note">{t("question.pasteHelp")}</p>
      {answers.map((answer, i) => {
        const name = t("field.answer", { number: i + 1 });
        return (
          <Row key={answer.id} name={name}>
            <RowTools
              name={name}
              index={i}
              count={answers.length}
              min={MIN_ANSWERS}
              move={(index) => editor.dispatch({ type: "moveAnswer", id: answer.id, index })}
              remove={() => {
                const rest = answers.filter((other) => other.id !== answer.id);
                // The right answer goes: the first one left takes its place.
                const fix: Command[] =
                  answer.correct && !rest.some((other) => other.correct) && rest[0]
                    ? [{ type: "updateAnswer", id: rest[0].id, set: { correct: true } }]
                    : [];
                editor.dispatch([...fix, { type: "deleteAnswer", id: answer.id }]);
              }}
            />
            <DraftField
              label={name}
              value={textOf(answer.text)}
              command={(text) =>
                text.trim()
                  ? { type: "updateAnswer", id: answer.id, set: { text: inlineHtml(text) } }
                  : undefined
              }
              // Bulk paste (2.12): the first line is this answer, each other line a new one after it.
              pasteLines={(lines) => {
                const id = idMaker(editor.document);
                return [
                  {
                    type: "updateAnswer",
                    id: answer.id,
                    set: { text: inlineHtml(lines[0] ?? "") },
                  },
                  ...lines.slice(1).map((line, n) => ({
                    type: "insertAnswer" as const,
                    parent: question.id,
                    index: i + 1 + n,
                    value: { id: id(), text: inlineHtml(line), correct: false },
                  })),
                ];
              }}
            />
            <Checkbox
              isSelected={answer.correct}
              // Single choice: the right answer is chosen, never cleared; choose another instead.
              isReadOnly={single && answer.correct}
              onChange={(correct) =>
                editor.dispatch(
                  single
                    ? answers.map((other) => ({
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
            {perAnswer && (
              <RichDraftField
                label={t("question.answerFeedback")}
                value={answer.feedback ?? ""}
                command={(html) =>
                  html
                    ? { type: "updateAnswer", id: answer.id, set: { feedback: html } }
                    : { type: "updateAnswer", id: answer.id, unset: ["feedback"] }
                }
              />
            )}
          </Row>
        );
      })}
      <Button
        onPress={() =>
          editor.dispatch({
            type: "insertAnswer",
            parent: question.id,
            value: {
              id: idMaker(editor.document)(),
              text: inlineHtml(t("sample.wrong")),
              correct: false,
            },
          })
        }
      >
        {t("items.add", { name: t("field.answer", { number: answers.length + 1 }) })}
      </Button>
    </>
  );
}

/** A fill-in's accepted answers, one per line, up to 10, and whether capitals count (2.12). */
function Accepted({
  question,
  editor,
}: {
  question: Extract<Question, { kind: "fill-in" }>;
  editor: Editor;
}) {
  const t = useStrings();
  return (
    <>
      <DraftField
        label={t("field.accepted")}
        description={t("question.acceptedHelp", { max: MAX_ACCEPTED })}
        multiline
        value={question.acceptedAnswers.join("\n")}
        command={(text) => {
          const accepted = [
            ...new Set(
              text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean),
            ),
          ];
          return accepted.length > 0 && accepted.length <= MAX_ACCEPTED
            ? update(question, { acceptedAnswers: accepted })
            : undefined;
        }}
      />
      <Switch
        isSelected={question.caseSensitive === true}
        onChange={(on) =>
          editor.dispatch(
            on
              ? update(question, { caseSensitive: true })
              : update(question, {}, ["caseSensitive"]),
          )
        }
      >
        {t("question.caseSensitive")}
      </Switch>
    </>
  );
}

const FREEZE: readonly (readonly [
  NonNullable<MatchingQuestion["freezeColumn"]> | "none",
  StringKey,
])[] = [
  ["none", "question.freezeNone"],
  ["prompts", "question.freezePrompts"],
  ["matches", "question.freezeMatches"],
];

/**
 * A matching question's pairs: an item and its match each, 2 to 10, and the column learners see in
 * the author's order; the others are shuffled (2.12, A17).
 */
function Pairs({ question, editor }: { question: MatchingQuestion; editor: Editor }) {
  const t = useStrings();
  const pairs = question.pairs;
  const text = (pair: MatchPair, side: "prompt" | "match", number: number) => (
    <DraftField
      label={t(side === "prompt" ? "field.pairItem" : "field.pairMatch", { number })}
      value={textOf(pair[side])}
      command={(typed) =>
        typed.trim()
          ? { type: "updatePair", id: pair.id, set: { [side]: inlineHtml(typed) } }
          : undefined
      }
    />
  );
  return (
    <>
      {pairs.map((pair, i) => {
        const name = t("question.pair", { number: i + 1 });
        return (
          <Row key={pair.id} name={name}>
            <RowTools
              name={name}
              index={i}
              count={pairs.length}
              min={MIN_PAIRS}
              move={(index) => editor.dispatch({ type: "movePair", id: pair.id, index })}
              remove={() => editor.dispatch({ type: "deletePair", id: pair.id })}
            />
            {text(pair, "prompt", i + 1)}
            {text(pair, "match", i + 1)}
          </Row>
        );
      })}
      <Button
        isDisabled={pairs.length >= MAX_PAIRS}
        onPress={() => {
          const id = idMaker(editor.document);
          const number = pairs.length + 1;
          editor.dispatch({
            type: "insertPair",
            parent: question.id,
            value: {
              id: id(),
              prompt: inlineHtml(t("field.pairItem", { number })),
              match: inlineHtml(t("field.pairMatch", { number })),
            },
          });
        }}
      >
        {t("items.add", { name: t("question.pair", { number: pairs.length + 1 }) })}
      </Button>
      <Select
        label={t("question.freeze")}
        selectedKey={question.freezeColumn ?? "none"}
        onSelectionChange={(key) =>
          editor.dispatch(
            key === "none"
              ? update(question, {}, ["freezeColumn"])
              : update(question, { freezeColumn: key }),
          )
        }
      >
        {FREEZE.map(([value, label]) => (
          <ListBoxItem key={value} id={value}>
            {t(label)}
          </ListBoxItem>
        ))}
      </Select>
    </>
  );
}

const MODES: readonly (readonly [FeedbackMode, StringKey])[] = [
  ["any", "question.feedbackAny"],
  ["correctness", "question.feedbackCorrectness"],
  ["perAnswer", "question.feedbackPerAnswer"],
];

/**
 * Feedback (2.12, UI-BLOCKS-R23): one message for any response, one each for a right and a wrong
 * answer, or a message per answer choice (single choice only, written with each choice). A
 * question without a mode shows its correct and incorrect messages.
 */
function Feedback({ question, editor }: { question: Question; editor: Editor }) {
  const t = useStrings();
  const mode = question.feedbackMode ?? "correctness";
  const text = (field: "feedback" | "correctFeedback" | "incorrectFeedback", label: string) => (
    <RichDraftField
      label={label}
      value={question[field] ?? ""}
      command={(html) => optional(question, field, html)}
    />
  );
  return (
    <>
      <Select
        label={t("question.feedbackMode")}
        selectedKey={mode}
        onSelectionChange={(key) =>
          editor.dispatch(
            key === "correctness"
              ? update(question, {}, ["feedbackMode"])
              : update(question, { feedbackMode: key }),
          )
        }
      >
        {MODES.filter(([value]) => value !== "perAnswer" || question.kind === "single-choice").map(
          ([value, label]) => (
            <ListBoxItem key={value} id={value}>
              {t(label)}
            </ListBoxItem>
          ),
        )}
      </Select>
      {mode === "any" && text("feedback", t("question.feedback"))}
      {mode === "correctness" && text("correctFeedback", t("question.correctFeedback"))}
      {mode === "correctness" && text("incorrectFeedback", t("question.incorrectFeedback"))}
    </>
  );
}

/** A knowledge check's content: its question, which switches type in place (2.12, A6). */
export function CheckFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const question = block.question;
  if (!question) return <p className="be-note">{t("field.noFields")}</p>;
  return (
    <QuestionEditor
      question={question}
      editor={editor}
      switchTo={(next) => ({
        type: "updateBlock",
        id: block.id,
        set: { variant: next.kind, question: next },
      })}
    />
  );
}

/** The retry limits a menu offers: unlimited, then none to ten (blocks-interactions.md Q7). */
export const RETRY_CHOICES = ["unlimited", ...Array.from({ length: 11 }, (_, i) => i)] as const;

/**
 * Where an answer colour falls short: marks are text, so it needs 4.5:1 on the white card; the
 * player then keeps its own colour. The nearest colour that passes is offered.
 */
export function useColorWarning(color: unknown): string | undefined {
  const t = useStrings();
  if (typeof color !== "string" || accentReadable(color, SURFACE)) return undefined;
  return t("question.colorLow", { color: nearestReadable(color, SURFACE, 4.5) });
}

/**
 * A knowledge check's options (2.12, A17, W10 step 4): require a right answer, the retry limit,
 * reveal the right answer after a wrong one, and the colours of right and wrong marks.
 */
export function CheckFormat({ block, editor }: FieldsProps) {
  const t = useStrings();
  const settings = block.variantSettings ?? {};
  const controls: Control[] = [
    { name: "requireCorrect", label: "question.requireCorrect", kind: "switch" },
    { name: "reveal", label: "question.reveal", kind: "switch" },
    {
      name: "correctColor",
      label: "question.correctColor",
      kind: "color",
      help: "style.colorHelp",
    },
    {
      name: "incorrectColor",
      label: "question.incorrectColor",
      kind: "color",
      help: "style.colorHelp",
    },
  ];
  const retries = typeof settings.retries === "number" ? settings.retries : "unlimited";
  const lowCorrect = useColorWarning(settings.correctColor);
  const lowIncorrect = useColorWarning(settings.incorrectColor);
  return (
    <>
      <Select
        label={t("question.retries")}
        selectedKey={String(retries)}
        onSelectionChange={(key) =>
          editor.dispatch(
            withVariantSettings(block, {
              retries: key === "unlimited" ? undefined : Number(key),
            }),
          )
        }
      >
        {RETRY_CHOICES.map((choice) => (
          <ListBoxItem key={choice} id={String(choice)}>
            {choice === "unlimited" ? t("question.unlimited") : String(choice)}
          </ListBoxItem>
        ))}
      </Select>
      <Controls block={block} editor={editor} controls={controls} />
      {settings.requireCorrect === true && typeof settings.retries === "number" && (
        <p className="be-warning">{t("question.requiredLimited")}</p>
      )}
      {lowCorrect && <p className="be-warning">{lowCorrect}</p>}
      {lowIncorrect && <p className="be-warning">{lowIncorrect}</p>}
    </>
  );
}
