// Text fields that edit the course (UI-BLOCKS-EDITOR-R13 "saves while typing", blocks-editor.md 2.2,
// 2.3). What is typed reaches the course after a short pause in typing, so autosave keeps it, and
// again on Enter, on leaving the field and before the course is saved, closed or left (keepDrafts).
// Everything typed in one visit to a field is one undo step; Escape puts back the text the field had
// when that visit began.
import type { Editor } from "@course-suite/doc-ops";
import { TextArea, TextField, type TextFieldProps, useStrings } from "@course-suite/ui";
import { createContext, useContext, useEffect, useRef, useState } from "react";

/** How long typing pauses before a field hands what it holds to the course. */
export const TYPING_PAUSE_MS = 800;

/** The editor whose undo steps the fields join: one step for each visit to a field. */
export const DraftEditor = createContext<Pick<Editor, "beginGroup" | "endGroup"> | undefined>(
  undefined,
);

const drafts = new Set<() => void>();

/**
 * Hands what every DraftField on the page holds to the course, before the course is saved, closed
 * or left.
 */
export function keepDrafts(): void {
  for (const keep of [...drafts]) keep();
}

export interface DraftFieldProps
  extends Omit<TextFieldProps, "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown"> {
  /** The value the course holds. */
  value: string;
  /** Called with a changed value when the field hands it to the course. */
  onCommit: (value: string) => void;
  /** Several lines: Enter starts a new line. */
  multiline?: boolean;
}

export function DraftField({
  value: kept,
  onCommit,
  multiline = false,
  ...props
}: DraftFieldProps) {
  const group = useContext(DraftEditor);
  const [value, setValue] = useState(kept);
  // The value before this visit's first change, while the visit's undo step is open.
  const visit = useRef<{ start: string }>(undefined);
  // Shows what the course holds, as an undo or redo changes it and when a visit ends, but not
  // during a visit: the course may hold the text tidied (trimmed, say), which must not move the
  // text under the author's cursor.
  const [visits, setVisits] = useState(0);
  useEffect(() => {
    if (!visit.current) setValue(kept);
  }, [kept, visits]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Hands `next` to the course if it changed; `last` ends the visit and its undo step. */
  const keep = (next: string, last: boolean) => {
    clearTimeout(timer.current);
    if (next !== kept) {
      if (!visit.current) {
        visit.current = { start: kept };
        group?.beginGroup();
      }
      onCommit(next);
    }
    if (last && visit.current) {
      visit.current = undefined;
      group?.endGroup();
      setVisits((count) => count + 1);
    }
  };
  const latest = useRef({ end: () => {}, pause: () => {} });
  latest.current = { end: () => keep(value, true), pause: () => keep(value, false) };
  useEffect(() => {
    const end = () => latest.current.end();
    drafts.add(end);
    return () => {
      drafts.delete(end);
      clearTimeout(timer.current);
      if (visit.current) {
        visit.current = undefined;
        group?.endGroup();
      }
    };
  }, [group]);
  const Field = multiline ? TextArea : TextField;
  return (
    <Field
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => latest.current.pause(), TYPING_PAUSE_MS);
      }}
      onBlur={() => keep(value, true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !multiline) keep(value, true);
        else if (event.key === "Escape") {
          const start = visit.current?.start ?? kept;
          setValue(start);
          keep(start, true);
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
  /** Called with the changed rich text, or undefined when the field was emptied. */
  onCommit: (html: string | undefined) => void;
}

/**
 * A description (blocks-editor.md 2.2: rich text), edited as plain paragraphs, one per line. A
 * description with other formatting (bold, lists, links) is shown read-only, so that editing it
 * never flattens it.
 */
export function DescriptionField({ label, description, value, onCommit }: DescriptionFieldProps) {
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
      onCommit={(text) => onCommit(htmlOf(text) || undefined)}
    />
  );
}
