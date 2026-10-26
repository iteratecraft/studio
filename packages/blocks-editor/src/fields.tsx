// Text fields that edit the course (UI-BLOCKS-EDITOR-R13 "saves while typing", blocks-editor.md 2.2,
// 2.3). What is typed reaches the course after a short pause in typing, so autosave keeps it, and
// again on Enter, on leaving the field and before the course is saved, closed or left (keepDrafts).
// Everything typed in one visit to a field is one undo step; Escape puts back the text the field had
// when that visit began.
import type { Editor } from "@course-suite/doc-ops";
import {
  cleanRichText,
  type LinkTarget,
  RichTextField,
  TextArea,
  TextField,
  type TextFieldProps,
} from "@course-suite/ui";
import { createContext, useContext, useEffect, useRef, useState } from "react";

/** How long typing pauses before a field hands what it holds to the course. */
export const TYPING_PAUSE_MS = 800;

/** The editor whose undo steps the fields join: one step for each visit to a field. */
export const DraftEditor = createContext<Pick<Editor, "beginGroup" | "endGroup"> | undefined>(
  undefined,
);

/** The lessons and quizzes of the open course, which links in formatted text may go to (L13). */
export const LinkTargets = createContext<readonly LinkTarget[]>([]);

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
  const draft = useDraft(kept, onCommit);
  const Field = multiline ? TextArea : TextField;
  return (
    <Field
      {...props}
      value={draft.value}
      onChange={draft.change}
      onBlur={draft.leave}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !multiline) draft.leave();
        else if (event.key === "Escape") draft.revert();
        else event.continuePropagation();
      }}
    />
  );
}

/**
 * What a field holds while it is edited, handed to the course after a pause in typing, on `leave`
 * and on keepDrafts, as `tidy` makes it; one undo step for each visit to the field.
 */
function useDraft(
  kept: string,
  onCommit: (value: string) => void,
  tidy: (value: string) => string = (value) => value,
) {
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
    // Untouched text is never handed over, even where tidying would change it: a course file's
    // own text stays as it is until the author edits it.
    const tidied = next === kept ? kept : tidy(next);
    if (tidied !== kept) {
      if (!visit.current) {
        visit.current = { start: kept };
        group?.beginGroup();
      }
      onCommit(tidied);
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
  return {
    value,
    change(next: string) {
      setValue(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current.pause(), TYPING_PAUSE_MS);
    },
    leave: () => keep(value, true),
    /** Puts back the text the field had when this visit began. */
    revert() {
      const start = visit.current?.start ?? kept;
      setValue(start);
      keep(start, true);
    },
  };
}

export interface RichDraftFieldProps {
  label: string;
  description?: string;
  hideLabel?: boolean;
  /** The rich text the course holds. */
  value: string;
  /** Called with changed, normalised rich text ("" for none) when the field hands it over. */
  onCommit: (html: string) => void;
}

/**
 * Formatted text handed to the course like a DraftField's (after a pause in typing, when focus
 * leaves the field and its tools, and on keepDrafts), one undo step for each visit; Escape puts
 * back the text the field had when the visit began. What it hands over is normalised rich text.
 */
export function RichDraftField({ value: kept, onCommit, ...props }: RichDraftFieldProps) {
  const lessons = useContext(LinkTargets);
  const draft = useDraft(kept, onCommit, cleanRichText);
  return (
    <RichTextField
      {...props}
      lessons={lessons}
      value={draft.value}
      onChange={draft.change}
      onLeave={draft.leave}
      onKeyDown={(event) => {
        if (event.key === "Escape") draft.revert();
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
