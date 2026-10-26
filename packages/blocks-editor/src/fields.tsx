// Text fields that edit the course and save while typing (UI-BLOCKS-EDITOR-R13, blocks-editor.md
// 2.2, 2.3). What is typed goes into the document after a pause in typing, at least every 2 s while
// typing goes on, on Enter, on leaving the field and whenever the session saves, leaves or closes
// (CourseSession.commitDrafts), so autosave keeps it. One editing of a field is one undo step;
// Escape takes that step back.
import type { Command } from "@course-suite/doc-ops";
import { TextArea, TextField, type TextFieldProps, useStrings } from "@course-suite/ui";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CourseSession } from "./session.js";

/** A pause in typing this long puts the field's text into the document. */
export const TYPING_PAUSE_MS = 500;
/** While typing goes on without a pause, the text still reaches the document this often. */
export const TYPING_MAX_WAIT_MS = 2000;

/** The open course, whose document the fields edit and whose saves take what they hold. */
export const DraftSession = createContext<CourseSession | undefined>(undefined);

export interface DraftFieldProps
  extends Omit<
    TextFieldProps,
    "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown" | "isInvalid"
  > {
  /** The text the document holds. */
  value: string;
  /**
   * The edit that puts `text` into the document, or undefined while the text is not valid, which
   * then stays out of the document and marks the field invalid.
   */
  command: (text: string) => Command | undefined;
  /** Several lines: Enter starts a new line. */
  multiline?: boolean;
}

/** A text field of the course document that saves while typing (see the top of this file). */
export function DraftField({
  value: stored,
  command,
  multiline = false,
  ...field
}: DraftFieldProps) {
  const session = useContext(DraftSession);
  if (!session) throw new Error("DraftField needs a DraftSession");
  const { editor } = session;
  const [value, setValue] = useState(stored);
  const typed = useRef(value);
  const edit = useRef<{
    timer: ReturnType<typeof setTimeout> | undefined;
    since: number | undefined;
    open: boolean;
  }>({ timer: undefined, since: undefined, open: false });
  // The document changed by other means (undo, redo): show it, unless the author is typing here.
  // While typing, the document may hold the text tidied (trimmed, say), which must not move the
  // text under the author's cursor.
  const editing = useRef(false);
  // Counts finished editings, so that the field then shows what the document holds.
  const [ends, setEnds] = useState(0);
  useEffect(() => {
    if (editing.current) return;
    typed.current = stored;
    setValue(stored);
  }, [stored, ends]);

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
    if (editing.current) setEnds((count) => count + 1);
    editing.current = false;
  };
  const latest = useRef(commit);
  latest.current = commit;
  useEffect(() => session.holdDraft(() => latest.current()), [session]);
  const endOnUnmount = useRef(end);
  endOnUnmount.current = end;
  useEffect(() => () => endOnUnmount.current(), []);

  const Field = multiline ? TextArea : TextField;
  return (
    <Field
      {...field}
      value={value}
      isInvalid={command(value) === undefined}
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
        if (event.key === "Enter" && !multiline) end();
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

/** Plain text as the HTML fragment a rich-text field holds: a paragraph per line. */
export function htmlOf(text: string): string {
  const escaped = (line: string) =>
    line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escaped(line)}</p>`)
    .join("");
}

/** The text of an HTML fragment, a line per paragraph or line break, read by the browser. */
export function textOf(html: string): string {
  if (!html) return "";
  const body = new DOMParser().parseFromString(html, "text/html").body;
  for (const br of body.querySelectorAll("br")) br.replaceWith("\n");
  const blocks = body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote");
  const lines = blocks.length > 0 ? [...blocks].map((block) => block.textContent ?? "") : [];
  return (lines.length > 0 ? lines.join("\n") : (body.textContent ?? "")).trim();
}

/**
 * Whether rich text is only plain paragraphs, which a plain field edits without loss: it is what
 * htmlOf makes of its text, give or take white space between the paragraphs.
 */
export const isPlain = (html: string) =>
  htmlOf(textOf(html)) === html.replace(/>\s+</g, "><").trim();

export interface DescriptionFieldProps {
  label: string;
  /** Help under the field. */
  description?: string;
  /** The rich text the course holds ("" for none). */
  value: string;
  /** The edit that puts the rich text into the document, undefined when the field was emptied. */
  command: (html: string | undefined) => Command;
}

/**
 * A description (blocks-editor.md 2.2: rich text), edited as plain paragraphs, one per line. A
 * description with other formatting (bold, lists, links) is shown read-only, so that editing it
 * never flattens it.
 */
export function DescriptionField({ label, description, value, command }: DescriptionFieldProps) {
  const t = useStrings();
  if (value && !isPlain(value)) {
    return (
      <TextArea
        label={label}
        description={t("editor.descriptionFormatted")}
        value={textOf(value)}
        isReadOnly
      />
    );
  }
  return (
    <DraftField
      label={label}
      {...(description !== undefined && { description })}
      multiline
      value={textOf(value)}
      command={(text) => command(htmlOf(text) || undefined)}
    />
  );
}
