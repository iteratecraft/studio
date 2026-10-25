// Text fields that edit the course: what is typed is kept as one undo step when the field loses
// focus or on Enter, and Escape puts back the kept value (UI-BLOCKS-EDITOR-R13, blocks-editor.md
// 2.2, 2.3). Saving first keeps what the fields hold (keepDrafts).
import { RichTextField, TextArea, TextField, type TextFieldProps } from "@course-suite/ui";
import { useEffect, useRef, useState } from "react";
import { cleanRichText } from "./richtext.js";

const drafts = new Set<() => void>();

/** Keeps what every DraftField on the page holds, before the course is saved (Ctrl/Cmd+S). */
export function keepDrafts(): void {
  for (const keep of [...drafts]) keep();
}

export interface DraftFieldProps
  extends Omit<TextFieldProps, "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown"> {
  /** The value the course holds. */
  value: string;
  /** Called with a changed value when the field keeps it. */
  onCommit: (value: string) => void;
  /** Several lines: Enter starts a new line, and the value is kept when the field loses focus. */
  multiline?: boolean;
}

export function DraftField({
  value: kept,
  onCommit,
  multiline = false,
  ...props
}: DraftFieldProps) {
  const [value, setValue] = useState(kept);
  useEffect(() => setValue(kept), [kept]);
  const commit = () => {
    if (value !== kept) onCommit(value);
  };
  useKeep(commit);
  const Field = multiline ? TextArea : TextField;
  return (
    <Field
      {...props}
      value={value}
      onChange={setValue}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !multiline) commit();
        else if (event.key === "Escape") setValue(kept);
        else event.continuePropagation();
      }}
    />
  );
}

/** Registers `keep` with keepDrafts while the field is on the page; `keep` may change freely. */
function useKeep(keep: () => void) {
  const latest = useRef(keep);
  latest.current = keep;
  useEffect(() => {
    const run = () => latest.current();
    drafts.add(run);
    return () => {
      drafts.delete(run);
    };
  }, []);
}

export interface RichDraftFieldProps {
  label: string;
  description?: string;
  hideLabel?: boolean;
  /** The rich text the course holds. */
  value: string;
  /** Called with changed, normalised rich text ("" for none) when the field keeps it. */
  onCommit: (html: string) => void;
}

/**
 * Formatted text kept like a DraftField: as one undo step when focus leaves the field and its
 * tools, Escape puts back the kept text. What it keeps is normalised course rich text.
 */
export function RichDraftField({ value: kept, onCommit, ...props }: RichDraftFieldProps) {
  const [value, setValue] = useState(kept);
  useEffect(() => setValue(kept), [kept]);
  const commit = () => {
    if (value === kept) return;
    const html = cleanRichText(value);
    if (html !== kept) onCommit(html);
    else setValue(kept);
  };
  useKeep(commit);
  return (
    <RichTextField
      {...props}
      value={value}
      onChange={setValue}
      onLeave={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") setValue(kept);
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
