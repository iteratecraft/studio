// One open lesson or quiz (blocks-editor.md L1, C11; rise.md 3B; BLK-02): the lesson switcher, the
// lesson's own fields (title, description, the author shown on it) and its blocks, read-only until
// block editing arrives (M2-10). A quiz shows where its questions go (M2-15).
import type { Entry, LessonEntry, QuizEntry } from "@course-suite/format";
import { EmptyState, ListBoxItem, Select, type StringKey, useStrings } from "@course-suite/ui";
import { useEffect, useId, useRef } from "react";
import { shownTitle } from "./course.js";
import { DescriptionField, DraftField } from "./fields.js";
import type { CourseSession } from "./session.js";

const OVERVIEW = "overview";

export interface LessonViewProps {
  session: CourseSession;
  entry: LessonEntry | QuizEntry;
  /** Go to another lesson or quiz by id, or back to the overview (undefined). */
  onGo: (id: string | undefined) => void;
}

export function LessonView({ session, entry, onGo }: LessonViewProps) {
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
  const update = (set: Partial<Pick<LessonEntry, "title" | "description" | "author">>) =>
    editor.dispatch({ type: "updateEntry", id: entry.id, set });
  const unset = (field: "description" | "author") =>
    editor.dispatch({ type: "updateEntry", id: entry.id, unset: [field] });

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
          onCommit={(title) => update({ title })}
        />
        <DescriptionField
          label={t("editor.description")}
          value={entry.description ?? ""}
          onCommit={(html) => (html ? update({ description: html }) : unset("description"))}
        />
        <DraftField
          label={t("lesson.author")}
          description={t("lesson.authorHelp")}
          value={entry.author?.name ?? ""}
          onCommit={(value) => {
            const name = value.trim();
            if (name) update({ author: { ...entry.author, name } });
            else unset("author");
          }}
        />
      </div>
      <LessonContent entry={entry} />
    </section>
  );
}

/** What a lesson holds: its blocks, read-only for now; or where a quiz's questions go. */
export function LessonContent({ entry }: { entry: Entry }) {
  const t = useStrings();
  const headingId = useId();
  if (entry.kind === "quiz") {
    return (
      <EmptyState icon="quiz" title={t("quiz.pending")} level={3}>
        {t("quiz.pendingBody")}
      </EmptyState>
    );
  }
  if (entry.kind !== "lesson") return null;
  if (entry.blocks.length === 0) {
    return (
      <EmptyState icon="lesson" title={t("lesson.empty")} level={3}>
        {t("lesson.emptyBody")}
      </EmptyState>
    );
  }
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="be-section-title">
        {t("lesson.blocks")}
      </h3>
      <ol className="be-blocks">
        {entry.blocks.map((block) => (
          <li key={block.id} className="be-block">
            {t(`block.${block.category}` satisfies StringKey)}
          </li>
        ))}
      </ol>
    </section>
  );
}
