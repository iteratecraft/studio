// Text fields that edit the course and save while typing (UI-BLOCKS-EDITOR-R13, blocks-editor.md
// 2.2, 2.3), plain or formatted. What is typed goes into the document after a pause in typing, at
// least every 2 s while typing goes on, on Enter, on leaving the field and whenever the session
// saves, leaves or closes (CourseSession.commitDrafts), so autosave keeps it. One editing of a field
// is one undo step; Escape takes that step back. Text a field was given is never rewritten until the
// author edits it.
import type { Command } from "@course-suite/doc-ops";
import {
  cleanRichText,
  type LinkTarget,
  RichTextField,
  TextArea,
  TextField,
  type TextFieldProps,
} from "@course-suite/ui";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CourseSession } from "./session.js";

/** A pause in typing this long puts the field's text into the document. */
export const TYPING_PAUSE_MS = 500;
/** While typing goes on without a pause, the text still reaches the document this often. */
export const TYPING_MAX_WAIT_MS = 2000;

/** The open course, whose document the fields edit and whose saves take what they hold. */
export const DraftSession = createContext<CourseSession | undefined>(undefined);

/** The lessons and quizzes of the open course, which links in formatted text may go to (L13). */
export const LinkTargets = createContext<readonly LinkTarget[]>([]);

/**
 * The edit that puts `text` into the document: a command or a list of them (one step), `[]` when
 * there is nothing to change, or undefined while the text is not valid, which then stays out of
 * the document and marks the field invalid.
 */
export type DraftCommand = (text: string) => Command | Command[] | undefined;

/**
 * The text of a field while it is edited, put into the document as `tidy` makes it (see the top
 * of this file): `change` on every edit, `end` when the editing ends, `escape` to take it back.
 */
function useDraft(stored: string, command: DraftCommand, tidy: (text: string) => string) {
  const session = useContext(DraftSession);
  if (!session) throw new Error("A draft field needs a DraftSession");
  const { editor } = session;
  const [value, setValue] = useState(stored);
  const typed = useRef(value);
  const edit = useRef<{
    timer: ReturnType<typeof setTimeout> | undefined;
    since: number | undefined;
    open: boolean;
    /** The text this editing last put into the document, which the document now holds. */
    sent: string | undefined;
  }>({ timer: undefined, since: undefined, open: false, sent: undefined });
  // The document changed by other means (undo, redo): show it, unless the author is typing here.
  // While typing, the document may hold the text tidied (trimmed, say), which must not move the
  // text under the author's cursor.
  const editing = useRef(false);
  useEffect(() => {
    if (editing.current) return;
    typed.current = stored;
    setValue(stored);
  }, [stored]);
  /** Shows `text` and stops editing. */
  const show = (text: string) => {
    editing.current = false;
    edit.current.sent = undefined;
    typed.current = text;
    setValue(text);
  };

  const commit = () => {
    const state = edit.current;
    clearTimeout(state.timer);
    state.timer = undefined;
    state.since = undefined;
    if (!editing.current) return;
    const text = tidy(typed.current);
    const next = command(text);
    // `stored` can lag behind the document: a GridList row gets its new props a render after the
    // change. What this editing sent is what the document holds.
    const held = state.sent ?? stored;
    if (!next || text === held || (Array.isArray(next) && next.length === 0)) return;
    if (!state.open) editor.beginGroup();
    const result = editor.dispatch(next);
    if (result.ok) state.sent = text;
    if (result.ok && result.ops.length > 0) state.open = true;
    else if (!state.open) editor.endGroup();
  };
  const end = () => {
    commit();
    if (edit.current.open) editor.endGroup();
    edit.current.open = false;
    // Show what the document holds now, without waiting for `stored`, which may still be the
    // text from before this editing (see commit).
    if (editing.current) show(edit.current.sent ?? stored);
  };
  const latest = useRef(commit);
  latest.current = commit;
  useEffect(() => session.holdDraft(() => latest.current()), [session]);
  const endOnUnmount = useRef(end);
  endOnUnmount.current = end;
  useEffect(() => () => endOnUnmount.current(), []);

  return {
    value,
    change(text: string) {
      editing.current = true;
      typed.current = text;
      setValue(text);
      const state = edit.current;
      clearTimeout(state.timer);
      state.since ??= Date.now();
      const wait = Math.min(TYPING_PAUSE_MS, state.since + TYPING_MAX_WAIT_MS - Date.now());
      state.timer = setTimeout(() => latest.current(), Math.max(0, wait));
    },
    end,
    /** Back to the text before this editing: what it put in the document is one step. */
    escape() {
      clearTimeout(edit.current.timer);
      if (edit.current.open) {
        // The undo brings the old text back as a new `stored`.
        editing.current = false;
        edit.current.sent = undefined;
        edit.current.open = false;
        editor.endGroup();
        editor.undo();
      } else show(stored);
    },
  };
}

const asTyped = (text: string) => text;

export interface DraftFieldProps
  extends Omit<
    TextFieldProps,
    "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown" | "isInvalid"
  > {
  /** The text the document holds. */
  value: string;
  /** The edit that puts the text into the document (DraftCommand). */
  command: DraftCommand;
  /** Several lines: Enter starts a new line. */
  multiline?: boolean;
  /**
   * The edit for text of several lines pasted into a one-line field, one step of its own after
   * what was typed before; without it, a paste is ordinary typing.
   */
  pasteLines?: (lines: string[]) => Command | Command[];
}

/** A text field of the course document that saves while typing (see the top of this file). */
export function DraftField({
  value: stored,
  command,
  multiline = false,
  pasteLines,
  ...field
}: DraftFieldProps) {
  const draft = useDraft(stored, command, asTyped);
  const session = useContext(DraftSession);
  const Field = multiline ? TextArea : TextField;
  return (
    <Field
      {...field}
      {...(pasteLines && {
        onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => {
          const lines = event.clipboardData
            .getData("text/plain")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          if (lines.length < 2) return;
          event.preventDefault();
          draft.end();
          session?.editor.dispatch(pasteLines(lines));
        },
      })}
      value={draft.value}
      isInvalid={command(draft.value) === undefined}
      onChange={draft.change}
      onBlur={draft.end}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !multiline) draft.end();
        else if (event.key === "Escape") draft.escape();
        else event.continuePropagation();
      }}
    />
  );
}

export interface RichDraftFieldProps {
  label: string;
  description?: string;
  hideLabel?: boolean;
  /** The rich text the document holds. */
  value: string;
  /** The edit that puts the normalised rich text ("" for none) into the document. */
  command: DraftCommand;
}

/**
 * Formatted text of the course document that saves while typing, like a DraftField; editing ends
 * when focus leaves the field and its tools. What it puts in the document is normalised rich text.
 */
export function RichDraftField({ value: stored, command, ...props }: RichDraftFieldProps) {
  const lessons = useContext(LinkTargets);
  const draft = useDraft(stored, command, cleanRichText);
  return (
    <RichTextField
      {...props}
      lessons={lessons}
      value={draft.value}
      onChange={draft.change}
      onLeave={draft.end}
      onKeyDown={(event) => {
        if (event.key === "Escape") draft.escape();
      }}
    />
  );
}

/** Plain text as rich text inside an element (a heading or an answer): escaped, no paragraph. */
export function inlineHtml(text: string): string {
  return text.trim().replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * The text of an HTML fragment, a line per paragraph or line break, read by the browser into an
 * inert template, where nothing in it loads, runs or applies.
 */
export function textOf(html: string): string {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  const body = template.content;
  for (const br of body.querySelectorAll("br")) br.replaceWith("\n");
  const blocks = body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote");
  const lines = blocks.length > 0 ? [...blocks].map((block) => block.textContent ?? "") : [];
  return (lines.length > 0 ? lines.join("\n") : (body.textContent ?? "")).trim();
}
