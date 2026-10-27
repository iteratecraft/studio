// The quiz lesson editor (M2-15, BLK-07; blocks-interactions.md A15, A16, 2.13, W11; rise.md 3I,
// rule 14; D-46): the ordered question list with an add-question menu of the four types, the
// question open on the right (question-fields.tsx) with its tools (move, duplicate, delete), and
// the quiz settings dialog. Every change is one doc-ops command list, so one undo step, and adding,
// moving, duplicating and deleting are announced.
import type { Command, Editor } from "@course-suite/doc-ops";
import {
  DEFAULT_PASSING_SCORE,
  type Question,
  type QuizEntry,
  type QuizQuestion,
  type QuizSettings,
} from "@course-suite/format";
import {
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  Icon,
  IconButton,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Select,
  Switch,
  Toolbar,
  useAnnouncer,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useId, useRef, useState } from "react";
import { shownTitle } from "./course.js";
import { DraftField, textOf } from "./fields.js";
import { idMaker } from "./ids.js";
import { QuestionEditor, RETRY_CHOICES, useColorWarning } from "./question-fields.js";
import { KIND_LABEL, newQuestion, QUESTION_KINDS, type QuestionKind } from "./questions.js";
import type { CourseSession } from "./session.js";
import { ColorControl, NumberControl } from "./static-blocks.js";

/** A new timer's limit in minutes (rise.md 3I) and the longest one offered. */
const DEFAULT_TIMER_MINUTES = 10;
const MAX_TIMER_MINUTES = 120;

/** The first words of a question, to tell it from the others in the list. */
function questionText(question: QuizQuestion): string {
  if (question.kind === "draw") return "";
  const text = textOf(question.prompt).replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function QuizEditor({ session, quiz }: { session: CourseSession; quiz: QuizEntry }) {
  const t = useStrings();
  const { editor } = session;
  const questions = quiz.questions;
  const headingId = useId();
  const { region, announce } = useAnnouncer();
  const [selected, setSelected] = useState(questions[0]?.id);
  const index = Math.max(
    0,
    questions.findIndex((question) => question.id === selected),
  );
  const current = questions[index];
  // After a change, focus goes where the author carries on: a list button or the open question.
  const focus = useRef<"question" | "list" | undefined>(undefined);
  const list = useRef<HTMLOListElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wanted = focus.current;
    focus.current = undefined;
    if (wanted === "list") list.current?.querySelector<HTMLElement>("[aria-current]")?.focus();
    if (wanted === "question") body.current?.querySelector<HTMLElement>("[data-focus]")?.focus();
  });
  const name = (question: QuizQuestion, number: number) => {
    const text = questionText(question);
    const type = question.kind === "draw" ? t("quiz.draw") : t(KIND_LABEL[question.kind]);
    return text
      ? t("quiz.questionName", { number, type, text })
      : t("quiz.questionType", { number, type });
  };

  const add = (kind: QuestionKind) => {
    const value = newQuestion(kind, idMaker(editor.document), t);
    const result = editor.dispatch({ type: "insertQuestion", parent: quiz.id, value });
    if (!result.ok) return;
    setSelected(value.id);
    announce(t("quiz.added", { name: name(value, questions.length + 1) }));
    focus.current = "question";
  };
  const move = (question: QuizQuestion, to: number) => {
    if (!editor.dispatch({ type: "moveQuestion", id: question.id, index: to }).ok) return;
    announce(t("quiz.moved", { name: name(question, to + 1) }));
    focus.current = "list";
  };
  const duplicate = (question: QuizQuestion) => {
    const result = editor.dispatch({ type: "duplicateQuestion", id: question.id });
    const copy = result.ok ? result.created[0] : undefined;
    if (!copy) return;
    setSelected(copy);
    announce(t("quiz.duplicated", { name: name(question, index + 2) }));
    focus.current = "list";
  };
  const remove = (question: QuizQuestion) => {
    if (!editor.dispatch({ type: "deleteQuestion", id: question.id }).ok) return;
    const next = questions[index + 1] ?? questions[index - 1];
    setSelected(next?.id);
    announce(t("quiz.deleted", { name: name(question, index + 1) }));
    focus.current = next ? "list" : undefined;
  };
  /** A question turned into another type keeps its id and its place (convertQuestion). */
  const switchTo = (at: number) => (next: Question) =>
    [
      { type: "deleteQuestion", id: next.id },
      { type: "insertQuestion", parent: quiz.id, index: at, value: next },
    ] satisfies Command[];

  const addMenu = (
    <MenuTrigger>
      <Button variant="primary">
        <Icon name="add" />
        {t("quiz.addQuestion")}
      </Button>
      <Menu onAction={(kind) => add(kind as QuestionKind)}>
        {QUESTION_KINDS.map((kind) => (
          <MenuItem key={kind} id={kind}>
            {t(KIND_LABEL[kind])}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );

  return (
    <section className="be-quiz" aria-labelledby={headingId}>
      <div className="be-quiz-head">
        <h3 id={headingId} className="be-section-title">
          {t("quiz.questions")}
        </h3>
        <QuizSettingsButton editor={editor} quiz={quiz} />
      </div>
      {questions.length === 0 ? (
        <EmptyState icon="quiz" title={t("quiz.empty")} level={4} action={addMenu}>
          {t("quiz.emptyBody")}
        </EmptyState>
      ) : (
        <div className="be-quiz-body">
          <div className="be-quiz-list">
            <ol ref={list} aria-label={t("quiz.questionList")}>
              {questions.map((question, i) => (
                <li key={question.id}>
                  <Button
                    variant="quiet"
                    className="be-quiz-pick"
                    {...(question === current && { "aria-current": "true" as const })}
                    onPress={() => {
                      setSelected(question.id);
                      focus.current = "question";
                    }}
                  >
                    {name(question, i + 1)}
                  </Button>
                </li>
              ))}
            </ol>
            {addMenu}
          </div>
          {current && (
            <div ref={body} className="be-quiz-question">
              <div className="be-quiz-question-head">
                <h4 className="be-quiz-number" data-focus tabIndex={-1}>
                  {t("quiz.position", { number: index + 1, total: questions.length })}
                </h4>
                <Toolbar aria-label={t("quiz.tools", { name: name(current, index + 1) })}>
                  <IconButton
                    icon="arrow-up"
                    label={t("outline.moveUp")}
                    isDisabled={index === 0}
                    onPress={() => move(current, index - 1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={t("outline.moveDown")}
                    isDisabled={index === questions.length - 1}
                    onPress={() => move(current, index + 1)}
                  />
                  <IconButton
                    icon="copy"
                    label={t("action.duplicate")}
                    onPress={() => duplicate(current)}
                  />
                  <IconButton
                    icon="trash"
                    label={t("action.delete")}
                    onPress={() => remove(current)}
                  />
                </Toolbar>
              </div>
              {current.kind === "draw" ? (
                <p className="be-note">{t("quiz.drawNote")}</p>
              ) : (
                <QuestionEditor
                  key={current.id}
                  question={current}
                  editor={editor}
                  switchTo={switchTo(index)}
                />
              )}
            </div>
          )}
        </div>
      )}
      {region}
    </section>
  );
}

/** New settings, where undefined leaves a setting out (back at its default). */
type SettingsChange = { [K in keyof QuizSettings]?: QuizSettings[K] | undefined };

/** A quiz's settings with every default left out, as one command. */
function withQuizSettings(quiz: QuizEntry, changes: SettingsChange): Command {
  const defaults: Partial<Record<keyof QuizSettings, unknown>> = {
    passingScore: DEFAULT_PASSING_SCORE,
    requirePassing: false,
    shuffleQuestions: false,
    shuffleAnswers: false,
    revealAnswers: "all",
    countAsLesson: true,
    finishButton: "next-lesson",
  };
  const kept = Object.fromEntries(
    Object.entries({ ...quiz.settings, ...changes }).filter(
      ([key, value]) => value !== undefined && value !== defaults[key as keyof QuizSettings],
    ),
  );
  return Object.keys(kept).length > 0
    ? { type: "updateEntry", id: quiz.id, set: { settings: kept } }
    : { type: "updateEntry", id: quiz.id, unset: ["settings"] };
}

/** The settings control at the top right of the quiz (A15) and its dialog (A16). */
function QuizSettingsButton({ editor, quiz }: { editor: Editor; quiz: QuizEntry }) {
  const t = useStrings();
  return (
    <DialogTrigger>
      <Button>
        <Icon name="format" />
        {t("quiz.settings")}
      </Button>
      <Dialog title={t("quiz.settings")}>
        <QuizSettingsFields editor={editor} quiz={quiz} />
      </Dialog>
    </DialogTrigger>
  );
}

/**
 * Every setting of a quiz (2.13, GI-O1, GI-O2, W11 step 4), each change one undo step.
 */
function QuizSettingsFields({ editor, quiz }: { editor: Editor; quiz: QuizEntry }) {
  const t = useStrings();
  const entries = editor.document.entries;
  const settings = quiz.settings ?? {};
  const change = (changes: SettingsChange) => editor.dispatch(withQuizSettings(quiz, changes));
  const later = entries
    .slice(entries.indexOf(quiz) + 1)
    .filter((entry) => entry.kind !== "section");
  const skip = settings.skipAhead;
  const timer = settings.timer;
  const lowCorrect = useColorWarning(settings.correctColor);
  const lowIncorrect = useColorWarning(settings.incorrectColor);
  const skipHelp = useId();
  return (
    <div className="be-settings be-quiz-settings">
      <NumberControl
        label={t("quiz.passingScore")}
        unit={t("quiz.percent")}
        value={settings.passingScore ?? DEFAULT_PASSING_SCORE}
        min={0}
        max={100}
        onChange={(passingScore) => change({ passingScore })}
      />
      <Select
        label={t("quiz.retries")}
        selectedKey={String(settings.retries ?? "unlimited")}
        onSelectionChange={(key) =>
          change({ retries: key === "unlimited" ? undefined : Number(key) })
        }
      >
        {RETRY_CHOICES.map((choice) => (
          <ListBoxItem key={choice} id={String(choice)}>
            {choice === "unlimited" ? t("question.unlimited") : String(choice)}
          </ListBoxItem>
        ))}
      </Select>
      <Switch
        isSelected={settings.requirePassing === true}
        onChange={(requirePassing) => change({ requirePassing })}
      >
        {t("quiz.requirePassing")}
      </Switch>
      <Switch
        isSelected={skip !== undefined}
        isDisabled={skip === undefined && later.length === 0}
        aria-describedby={skipHelp}
        onChange={(on) => {
          const first = later[0];
          change({ skipAhead: on && first ? { entry: first.id } : undefined });
        }}
      >
        {t("quiz.skipAhead")}
      </Switch>
      {/* rise.md rule 14, UI-BLOCKS-R41: skip-ahead makes navigation restricted. */}
      <p id={skipHelp} className="be-note">
        {t(later.length === 0 ? "quiz.skipAheadNone" : "quiz.skipAheadHelp")}
      </p>
      {skip && (
        <>
          <Select
            label={t("quiz.skipTo")}
            items={later}
            selectedKey={skip.entry}
            onSelectionChange={(entry) => change({ skipAhead: { ...skip, entry: String(entry) } })}
          >
            {(entry) => (
              <ListBoxItem id={entry.id}>
                {shownTitle(
                  entry.title,
                  t(entry.kind === "quiz" ? "outline.untitledQuiz" : "outline.untitledLesson"),
                )}
              </ListBoxItem>
            )}
          </Select>
          <Switch
            isSelected={skip.learnerChooses === true}
            onChange={(on) => {
              const { learnerChooses: _, buttonLabel: __, ...rest } = skip;
              change({ skipAhead: on ? { ...rest, learnerChooses: true } : rest });
            }}
          >
            {t("quiz.learnerChooses")}
          </Switch>
          {skip.learnerChooses && (
            <DraftField
              label={t("quiz.skipLabel")}
              description={t("field.buttonLabelHelp")}
              value={skip.buttonLabel ?? ""}
              command={(text) => {
                const { buttonLabel: _, ...rest } = skip;
                const label = text.trim().slice(0, 100);
                return withQuizSettings(quiz, {
                  skipAhead: label ? { ...rest, buttonLabel: label } : rest,
                });
              }}
            />
          )}
        </>
      )}
      <Switch
        isSelected={settings.shuffleQuestions === true}
        onChange={(shuffleQuestions) => change({ shuffleQuestions })}
      >
        {t("quiz.shuffleQuestions")}
      </Switch>
      <Switch
        isSelected={settings.shuffleAnswers === true}
        onChange={(shuffleAnswers) => change({ shuffleAnswers })}
      >
        {t("quiz.shuffleAnswers")}
      </Switch>
      <Select
        label={t("quiz.reveal")}
        selectedKey={settings.revealAnswers ?? "all"}
        onSelectionChange={(key) => change({ revealAnswers: key as QuizSettings["revealAnswers"] })}
      >
        <ListBoxItem id="all">{t("quiz.revealAll")}</ListBoxItem>
        <ListBoxItem id="none">{t("quiz.revealNone")}</ListBoxItem>
        <ListBoxItem id="incorrect">{t("quiz.revealWrong")}</ListBoxItem>
      </Select>
      <ColorControl
        label={t("question.correctColor")}
        description={t("style.colorHelp")}
        value={settings.correctColor ?? ""}
        onChange={(correctColor) => change({ correctColor })}
      />
      {lowCorrect && <p className="be-warning">{lowCorrect}</p>}
      <ColorControl
        label={t("question.incorrectColor")}
        description={t("style.colorHelp")}
        value={settings.incorrectColor ?? ""}
        onChange={(incorrectColor) => change({ incorrectColor })}
      />
      {lowIncorrect && <p className="be-warning">{lowIncorrect}</p>}
      <Switch
        isSelected={timer !== undefined}
        onChange={(on) =>
          change({
            timer: on ? { minutes: DEFAULT_TIMER_MINUTES, learnerCanHide: true } : undefined,
          })
        }
      >
        {t("quiz.timer")}
      </Switch>
      {timer && (
        <>
          <NumberControl
            label={t("quiz.timerMinutes")}
            unit={t("quiz.minutes")}
            value={timer.minutes}
            min={1}
            max={MAX_TIMER_MINUTES}
            onChange={(minutes) => change({ timer: { ...timer, minutes } })}
          />
          <Select
            label={t("quiz.timerDisplay")}
            selectedKey={timer.display ?? "remaining"}
            onSelectionChange={(key) => {
              const { display: _, ...rest } = timer;
              change({
                timer:
                  key === "remaining"
                    ? rest
                    : { ...rest, display: key as "elapsed" | "elapsed-of-total" },
              });
            }}
          >
            <ListBoxItem id="remaining">{t("quiz.timerRemaining")}</ListBoxItem>
            <ListBoxItem id="elapsed">{t("quiz.timerElapsed")}</ListBoxItem>
            <ListBoxItem id="elapsed-of-total">{t("quiz.timerElapsedOfTotal")}</ListBoxItem>
          </Select>
          <Switch
            isSelected={timer.learnerCanHide === true}
            onChange={(on) => {
              const { learnerCanHide: _, ...rest } = timer;
              change({ timer: on ? { ...rest, learnerCanHide: true } : rest });
            }}
          >
            {t("quiz.timerHide")}
          </Switch>
        </>
      )}
      <Switch
        isSelected={settings.countAsLesson !== false}
        onChange={(countAsLesson) => change({ countAsLesson })}
      >
        {t("quiz.countAsLesson")}
      </Switch>
      <Select
        label={t("quiz.finishButton")}
        selectedKey={settings.finishButton ?? "next-lesson"}
        onSelectionChange={(key) => change({ finishButton: key as QuizSettings["finishButton"] })}
      >
        <ListBoxItem id="next-lesson">{t("quiz.finishNext")}</ListBoxItem>
        <ListBoxItem id="continue">{t("quiz.finishContinue")}</ListBoxItem>
      </Select>
    </div>
  );
}
