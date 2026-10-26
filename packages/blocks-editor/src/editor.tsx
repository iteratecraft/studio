// The course editor's frame (blocks-editor.md C1, C2): the top bar with the way back, the course
// title, the save state, undo and redo, save and the entry points of later waves; under it the
// course overview (title, author, description and the outline), or one open lesson.
import type { Entry } from "@course-suite/format";
import {
  Button,
  IconButton,
  type ToastQueue,
  Toolbar,
  ToolbarSeparator,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, languageCode, shownTitle, TITLE_MAX } from "./course.js";
import { DescriptionField, DraftField, DraftSession } from "./fields.js";
import { LessonContent, LessonView } from "./lesson.js";
import { Outline } from "./outline.js";
import type { CourseSession } from "./session.js";

/** Re-renders on every edit and save-state change of the session. */
const useSession = (session: CourseSession) =>
  useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.version,
  );

const isTextEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

/** The overview, coming back from entry `from`; or the lesson or quiz with id `id`. */
type View = { kind: "overview"; from?: string } | { kind: "entry"; id: string };

export interface EditorFrameProps {
  session: CourseSession;
  toasts: ToastQueue;
  onSave: () => void;
  onSaveAs: () => void;
  onClose: () => void;
  /** Copy to another course (blocks-editor.md W5, C8). */
  onCopyEntry: (entry: Entry) => void;
}

export function EditorFrame({
  session,
  toasts,
  onSave,
  onSaveAs,
  onClose,
  onCopyEntry,
}: EditorFrameProps) {
  const t = useStrings();
  useSession(session);
  const { editor } = session;
  const course = editor.document;
  const title = shownTitle(course.title, t("course.untitled"));
  const state = session.state;
  const [view, setView] = useState<View>({ kind: "overview" });
  // UI-BLOCKS-EDITOR-R15: undo history belongs to one screen and goes when the author leaves it.
  const go = (next: View) => {
    session.commitDrafts();
    editor.clearHistory();
    setView(next);
  };
  // A lesson that an undo removed closes, back to the overview.
  const open =
    view.kind === "entry"
      ? course.entries.find(
          (entry): entry is Exclude<Entry, { kind: "section" }> =>
            entry.id === view.id && entry.kind !== "section",
        )
      : undefined;
  // A new screen: focus starts at its heading, for keyboard and screen reader users.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // Keyboard (blocks-editor.md 5.1): Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo,
  // Ctrl/Cmd+S saves the file with what the fields hold, Ctrl/Cmd+Shift+S saves it as a new file. In
  // a text field the field's own undo applies. Heard on the way down, as list rows keep their
  // controls' keys to themselves.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) onSaveAs();
        else onSave();
      } else if (!isTextEntry(event.target) && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) editor.redo();
        else editor.undo();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editor, onSave, onSaveAs]);

  const stateText = {
    saved: t("save.saved"),
    unsaved: t("save.unsaved"),
    saving: t("save.saving"),
    failed: state.kind === "failed" ? t("save.failed", { message: state.message }) : "",
  }[state.kind];

  return (
    <DraftSession.Provider value={session}>
      <div className="be-editor">
        <header className="be-bar">
          <IconButton icon="back" label={t("editor.back")} onPress={onClose} />
          <h1 ref={heading} tabIndex={-1} className="be-bar-title">
            {title}
          </h1>
          <span role="status" className="be-save-state" data-state={state.kind}>
            {stateText}
          </span>
          <Toolbar aria-label={t("editor.tools")} className="be-tools">
            <IconButton
              icon="undo"
              label={t("editor.undo")}
              isDisabled={!editor.canUndo}
              onPress={() => editor.undo()}
            />
            <IconButton
              icon="redo"
              label={t("editor.redo")}
              isDisabled={!editor.canRedo}
              onPress={() => editor.redo()}
            />
            <IconButton icon="save" label={t("editor.save")} onPress={onSave} />
            <Button variant="quiet" onPress={onSaveAs}>
              {t("editor.saveAs")}
            </Button>
            <ToolbarSeparator />
            {/* Theme arrives with M2-17, preview with M2-11, publish with M2-18. */}
            <Button variant="quiet" isDisabled>
              {t("editor.theme")}
            </Button>
            <Button isDisabled>{t("editor.preview")}</Button>
            <Button variant="primary" isDisabled>
              {t("editor.publish")}
            </Button>
          </Toolbar>
        </header>
        <main className="be-overview">
          {open ? (
            <LessonView
              key={open.id}
              session={session}
              entry={open}
              onGo={(id) => go(id ? { kind: "entry", id } : { kind: "overview", from: open.id })}
            />
          ) : (
            <>
              <CourseFields session={session} />
              {course.kind === "microlearning" ? (
                // rise.md 3A, blocks-editor.md 2.2 and W2: a microlearning is its one lesson, with no
                // outline.
                course.entries[0] && <LessonContent entry={course.entries[0]} />
              ) : (
                <Outline
                  session={session}
                  toasts={toasts}
                  focusEntry={view.kind === "overview" ? view.from : undefined}
                  onOpen={(id) => go({ kind: "entry", id })}
                  onCopy={onCopyEntry}
                />
              )}
            </>
          )}
        </main>
      </div>
    </DraftSession.Provider>
  );
}

/**
 * The course fields of the overview (C2, blocks-editor.md 2.2): the title (UI-BLOCKS-EDITOR-R13:
 * up to 100 characters), the source language code (BLK-01), the author shown to learners (empty
 * hides it, C3, W6) and the description shown on the cover. They save while typing (fields.tsx).
 */
function CourseFields({ session }: { session: CourseSession }) {
  const t = useStrings();
  const { editor } = session;
  const { title, authors = [], description = "" } = editor.document;
  const [first, ...others] = authors;
  return (
    <div className="be-course-fields">
      <DraftField
        label={t("editor.courseTitle")}
        className="be-course-title"
        value={title}
        maxLength={TITLE_MAX}
        command={(text) => ({ type: "updateCourse", set: { title: text } })}
      />
      <DraftField
        label={t("editor.sourceLanguage")}
        description={t("editor.sourceLanguageHelp")}
        errorMessage={t("editor.sourceLanguageInvalid")}
        className="be-language"
        value={editor.document.sourceLanguage ?? DEFAULT_LANGUAGE}
        command={(text) => {
          const sourceLanguage = languageCode(text);
          return sourceLanguage === undefined
            ? undefined
            : { type: "updateCourse", set: { sourceLanguage } };
        }}
      />
      <DraftField
        label={t("editor.author")}
        description={t("editor.authorHelp")}
        value={first?.name ?? ""}
        command={(text) => {
          const name = text.trim();
          return name
            ? { type: "updateCourse", set: { authors: [{ ...first, name }, ...others] } }
            : { type: "updateCourse", unset: ["authors"] };
        }}
      />
      <DescriptionField
        label={t("editor.description")}
        description={t("editor.descriptionHelp")}
        value={description}
        command={(html) =>
          html
            ? { type: "updateCourse", set: { description: html } }
            : { type: "updateCourse", unset: ["description"] }
        }
      />
    </div>
  );
}
