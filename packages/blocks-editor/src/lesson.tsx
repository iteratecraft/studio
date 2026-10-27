// One open lesson or quiz (blocks-editor.md L1, C11; rise.md 3B; BLK-02): the lesson switcher, the
// lesson's own fields (title, description, the author shown on it) and its blocks, edited in place
// (M2-10, lesson-blocks.tsx). A quiz shows where its questions go (M2-15).
import type { Command } from "@course-suite/doc-ops";
import type { Entry, LessonEntry, QuizEntry } from "@course-suite/format";
import {
  EmptyState,
  ListBoxItem,
  Select,
  Switch,
  type ToastQueue,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useId, useRef } from "react";
import { shownTitle } from "./course.js";
import { HeaderImageField } from "./cover.js";
import { DraftField, RichDraftField } from "./fields.js";
import { type Clipboard, LessonBlocks } from "./lesson-blocks.js";
import type { CourseSession } from "./session.js";

const OVERVIEW = "overview";

export interface LessonViewProps {
  session: CourseSession;
  entry: LessonEntry | QuizEntry;
  toasts: ToastQueue;
  clipboard: Clipboard;
  /** Go to another lesson or quiz by id, or back to the overview (undefined). */
  onGo: (id: string | undefined) => void;
}

export function LessonView({ session, entry, toasts, clipboard, onGo }: LessonViewProps) {
  const t = useStrings();
  const { editor } = session;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const quiz = entry.kind === "quiz";
  const untitled = t(quiz ? "outline.untitledQuiz" : "outline.untitledLesson");
  const targets = [
    { id: OVERVIEW, title: t("lesson.overview") },
    ...editor.document.entries
      .filter((other) => other.kind !== "section")
      .map((other) => ({
        id: other.id,
        title: shownTitle(
          other.title,
          t(other.kind === "quiz" ? "outline.untitledQuiz" : "outline.untitledLesson"),
        ),
      })),
  ];
  const update = (
    set: Partial<Pick<LessonEntry, "title" | "description" | "author">>,
  ): Command => ({
    type: "updateEntry",
    id: entry.id,
    set,
  });
  const unset = (field: "description" | "author"): Command => ({
    type: "updateEntry",
    id: entry.id,
    unset: [field],
  });

  return (
    <section className="be-lesson" aria-labelledby={headingId}>
      {/* The lesson switcher (C11): another lesson, or back to the overview. */}
      <Select
        label={t("lesson.goTo")}
        className="be-lesson-switcher"
        items={targets}
        selectedKey={entry.id}
        onSelectionChange={(key) => onGo(key === OVERVIEW ? undefined : String(key))}
      >
        {(target) => <ListBoxItem id={target.id}>{target.title}</ListBoxItem>}
      </Select>
      <h2 id={headingId} ref={heading} tabIndex={-1} className="be-section-title">
        {shownTitle(entry.title, untitled)}
      </h2>
      <div className="be-course-fields">
        <DraftField
          label={t(quiz ? "outline.quizTitle" : "outline.lessonTitle")}
          value={entry.title}
          command={(title) => update({ title })}
        />
        <RichDraftField
          label={t("editor.description")}
          value={entry.description ?? ""}
          command={(html) => (html ? update({ description: html }) : unset("description"))}
        />
        {/* W6: hide the author on this lesson only; the field below names another. */}
        {entry.kind === "lesson" && (
          <Switch
            isSelected={entry.authorHidden === true}
            onChange={(on) =>
              editor.dispatch(
                on
                  ? { type: "updateEntry", id: entry.id, set: { authorHidden: true } }
                  : { type: "updateEntry", id: entry.id, unset: ["authorHidden"] },
              )
            }
          >
            {t("lesson.hideAuthor")}
          </Switch>
        )}
        <DraftField
          label={t("lesson.author")}
          description={t("lesson.authorHelp")}
          value={entry.author?.name ?? ""}
          command={(text) => {
            const name = text.trim();
            return name ? update({ author: { ...entry.author, name } }) : unset("author");
          }}
        />
        {entry.kind === "lesson" && <HeaderImageField editor={editor} lesson={entry} />}
      </div>
      <LessonContent
        session={session}
        entry={entry}
        toasts={toasts}
        clipboard={clipboard}
        onGo={onGo}
      />
    </section>
  );
}

/** What a lesson holds: its blocks to edit; or where a quiz's questions go. */
export function LessonContent({
  session,
  entry,
  toasts,
  clipboard,
  onGo,
}: {
  session: CourseSession;
  entry: Entry;
  toasts: ToastQueue;
  clipboard: Clipboard;
  /** Opens another lesson of the course. */
  onGo?: (id: string) => void;
}) {
  const t = useStrings();
  if (entry.kind === "quiz") {
    return (
      <EmptyState icon="quiz" title={t("quiz.pending")} level={3}>
        {t("quiz.pendingBody")}
      </EmptyState>
    );
  }
  if (entry.kind !== "lesson") return null;
  return (
    <LessonBlocks
      session={session}
      lesson={entry}
      toasts={toasts}
      clipboard={clipboard}
      {...(onGo && { onGo })}
    />
  );
}
