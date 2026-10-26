// The course editor's frame (blocks-editor.md C1, C2): the top bar with the way back, the course
// title, the save state, undo and redo, save and the entry points of later waves; under it the
// course overview, whose outline area M2-09 fills.
import type { Command } from "@course-suite/doc-ops";
import {
  Button,
  EmptyState,
  IconButton,
  TextField,
  type TextFieldProps,
  Toolbar,
  ToolbarSeparator,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, languageCode, shownTitle, TITLE_MAX } from "./course.js";
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
  onSaveAs,
  onClose,
}: {
  session: CourseSession;
  onSave: () => void;
  onSaveAs: () => void;
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
  // Ctrl/Cmd+S saves the file, Ctrl/Cmd+Shift+S saves it as a new file. In a text field the
  // field's own undo applies.
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, onSave, onSaveAs]);

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
        <DocumentField
          session={session}
          label={t("editor.courseTitle")}
          className="be-course-title"
          maxLength={TITLE_MAX}
          value={editor.document.title}
          command={(title) => ({ type: "updateCourse", set: { title } })}
        />
        <DocumentField
          session={session}
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
        <EmptyState icon="file" title={t("editor.outline")}>
          {t("editor.outlinePending")}
        </EmptyState>
      </main>
    </div>
  );
}

/** A pause in typing this long puts the field's text into the document. */
export const TYPING_PAUSE_MS = 500;
/** While typing goes on without a pause, the text still reaches the document this often. */
export const TYPING_MAX_WAIT_MS = 2000;

/**
 * A text field of the course document that saves while typing (UI-BLOCKS-EDITOR-R13): its text goes
 * into the document after a pause in typing, at least every 2 s while typing goes on, on Enter, on
 * leaving the field and whenever the session saves, leaves or closes. One editing of the field is
 * one undo step; Escape takes that step back. `command` turns the text into the edit, or gives
 * undefined while the text is not valid, which then stays out of the document.
 */
function DocumentField({
  session,
  value: stored,
  command,
  ...field
}: {
  session: CourseSession;
  value: string;
  command: (text: string) => Command | undefined;
} & Pick<TextFieldProps, "label" | "description" | "errorMessage" | "maxLength" | "className">) {
  const { editor } = session;
  const [value, setValue] = useState(stored);
  const typed = useRef(value);
  const edit = useRef<{
    timer: ReturnType<typeof setTimeout> | undefined;
    since: number | undefined;
    open: boolean;
  }>({ timer: undefined, since: undefined, open: false });
  // The document changed by other means (undo, redo): show it, unless the author is typing here.
  const editing = useRef(false);
  useEffect(() => {
    if (editing.current) return;
    typed.current = stored;
    setValue(stored);
  }, [stored]);

  const commit = () => {
    const state = edit.current;
    clearTimeout(state.timer);
    state.timer = undefined;
    state.since = undefined;
    if (!editing.current) return;
    const next = command(typed.current);
    if (!next || typed.current === stored) return;
    if (state.open) {
      editor.dispatch(next);
      return;
    }
    editor.beginGroup();
    const result = editor.dispatch(next);
    if (result.ok && result.ops.length > 0) state.open = true;
    else editor.endGroup();
  };
  const end = () => {
    commit();
    if (edit.current.open) editor.endGroup();
    edit.current.open = false;
    editing.current = false;
  };
  const latest = useRef(commit);
  latest.current = commit;
  useEffect(() => session.holdDraft(() => latest.current()), [session]);
  const endOnUnmount = useRef(end);
  endOnUnmount.current = end;
  useEffect(() => () => endOnUnmount.current(), []);

  const invalid = command(value) === undefined;
  return (
    <TextField
      {...field}
      value={value}
      isInvalid={invalid}
      onChange={(text) => {
        editing.current = true;
        typed.current = text;
        setValue(text);
        const state = edit.current;
        clearTimeout(state.timer);
        state.since ??= Date.now();
        const wait = Math.min(TYPING_PAUSE_MS, state.since + TYPING_MAX_WAIT_MS - Date.now());
        state.timer = setTimeout(() => latest.current(), Math.max(0, wait));
      }}
      onBlur={end}
      onKeyDown={(event) => {
        if (event.key === "Enter") end();
        else if (event.key === "Escape") {
          // Back to the text before this editing: what it put in the document is one step.
          clearTimeout(edit.current.timer);
          editing.current = false;
          if (edit.current.open) {
            edit.current.open = false;
            editor.endGroup();
            editor.undo();
          } else setValue(stored);
        } else event.continuePropagation();
      }}
    />
  );
}
