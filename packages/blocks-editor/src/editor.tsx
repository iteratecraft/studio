// The course editor's frame (blocks-editor.md C1, C2): the top bar with the way back, the course
// title, the save state, undo and redo, save and the entry points of later waves; under it the
// course overview, whose outline area M2-09 fills.
import {
  Button,
  EmptyState,
  IconButton,
  TextField,
  Toolbar,
  ToolbarSeparator,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { shownTitle, TITLE_MAX } from "./course.js";
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

export function EditorFrame({
  session,
  onSave,
  onClose,
}: {
  session: CourseSession;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useStrings();
  useSession(session);
  const { editor } = session;
  const title = shownTitle(editor.document.title, t("course.untitled"));
  const state = session.state;
  // A new screen: focus starts at its heading, for keyboard and screen reader users.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  // Keyboard (blocks-editor.md 5.1): Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo,
  // Ctrl/Cmd+S saves the file. In a text field the field's own undo applies.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        onSave();
      } else if (!isTextEntry(event.target) && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) editor.redo();
        else editor.undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, onSave]);

  const stateText = {
    saved: t("save.saved"),
    unsaved: t("save.unsaved"),
    saving: t("save.saving"),
    failed: state.kind === "failed" ? t("save.failed", { message: state.message }) : "",
  }[state.kind];

  return (
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
        <CourseTitleField session={session} />
        <EmptyState icon="file" title={t("editor.outline")}>
          {t("editor.outlinePending")}
        </EmptyState>
      </main>
    </div>
  );
}

/**
 * The course title on the overview (C2, UI-BLOCKS-EDITOR-R13): up to 100 characters, one undo
 * step per edit, kept when the field loses focus or on Enter; Escape puts back the saved title.
 */
function CourseTitleField({ session }: { session: CourseSession }) {
  const t = useStrings();
  const saved = session.editor.document.title;
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const commit = () => {
    if (value !== saved) session.editor.dispatch({ type: "updateCourse", set: { title: value } });
  };
  return (
    <TextField
      label={t("editor.courseTitle")}
      className="be-course-title"
      value={value}
      onChange={setValue}
      maxLength={TITLE_MAX}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") setValue(saved);
        else {
          // Saving from the field saves what it holds.
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") commit();
          event.continuePropagation();
        }
      }}
    />
  );
}
