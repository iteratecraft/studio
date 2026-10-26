// The course outline on the overview (blocks-editor.md C4 to C10, W4, W5; rise.md 3B; BLK-02): the
// ordered rows of section headers, lessons and quizzes. Rows are renamed in place, reordered by
// drag or by keyboard (drag handle, or Move up and Move down), duplicated, copied to another course
// and deleted with an undo notice; a section's lessons fold away under it. Every change is one
// doc-ops command list, so it is one undo step and autosaves like any edit.
import type { Command } from "@course-suite/doc-ops";
import type { Entry } from "@course-suite/format";
import { newContentId } from "@course-suite/format";
import {
  Button,
  EmptyState,
  GridList,
  GridListItem,
  Icon,
  IconButton,
  type Key,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  type ReorderTarget,
  type StringKey,
  TextField,
  type ToastQueue,
  useAnnouncer,
  useReorder,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useId, useRef, useState } from "react";
import { DraftField } from "./fields.js";
import type { CourseSession } from "./session.js";

type Kind = Entry["kind"];

const UNTITLED: Record<Kind, StringKey> = {
  section: "outline.untitledSection",
  lesson: "outline.untitledLesson",
  quiz: "outline.untitledQuiz",
};
const TITLE_LABEL: Record<Kind, StringKey> = {
  section: "outline.sectionTitle",
  lesson: "outline.lessonTitle",
  quiz: "outline.quizTitle",
};

/** A lesson or quiz with something in it (UI-BLOCKS-EDITOR-R11, R12). */
export const hasContent = (entry: Entry) =>
  (entry.kind === "lesson" && entry.blocks.length > 0) ||
  (entry.kind === "quiz" && entry.questions.length > 0);

/** A new, empty outline entry. A quiz stays empty until quiz editing (M2-15). */
function newEntry(kind: Kind, title: string, taken: ReadonlySet<string>): Entry {
  const id = newContentId(taken);
  if (kind === "lesson") return { id, kind, title, blocks: [] };
  if (kind === "quiz") return { id, kind, title, questions: [] };
  return { id, kind, title };
}

/**
 * Move commands that turn the order `from` into `to`, as one list (one undo step): moveEntry for
 * outline entries, or the command `move` makes, such as moveBlock.
 */
export function movesBetween(
  from: readonly string[],
  to: readonly string[],
  move = (id: string, index: number): Command => ({ type: "moveEntry", id, index }),
): Command[] {
  const current = [...from];
  const commands: Command[] = [];
  to.forEach((id, index) => {
    if (current[index] === id) return;
    current.splice(current.indexOf(id), 1);
    current.splice(index, 0, id);
    commands.push(move(id, index));
  });
  return commands;
}

/** The section each entry sits under, by entry id: the nearest section header above it. */
function sectionsOf(entries: readonly Entry[]): Map<string, string> {
  const under = new Map<string, string>();
  let section: string | undefined;
  for (const entry of entries) {
    if (entry.kind === "section") section = entry.id;
    else if (section) under.set(entry.id, section);
  }
  return under;
}

export interface OutlineProps {
  session: CourseSession;
  toasts: ToastQueue;
  /** The entry whose open button takes focus when the outline appears (coming back from it). */
  focusEntry?: string | undefined;
  onOpen: (id: string) => void;
  onCopy: (entry: Entry) => void;
}

export function Outline({ session, toasts, focusEntry, onOpen, onCopy }: OutlineProps) {
  const t = useStrings();
  const { editor } = session;
  const { entries } = editor.document;
  const headingId = useId();
  const { region, announce } = useAnnouncer();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  // The control to focus after the next render: a new row's title, a neighbour of a deleted row,
  // or the open button of the lesson the author comes back from.
  const outline = useRef<HTMLElement>(null);
  const focus = useRef<{ id: string; part: "title" | "open" } | undefined>(
    focusEntry ? { id: focusEntry, part: "open" } : undefined,
  );
  const setFocus = (next: { id: string; part: "title" | "open" }) => {
    focus.current = next;
  };
  /** Focuses the wanted control of the row of entry `id`, if it is wanted. */
  const focusRow = (id: string) => {
    const wanted = focus.current;
    const row = outline.current?.querySelector(`[data-entry="${id}"]`);
    if (wanted?.id !== id || !row) return;
    focus.current = undefined;
    const target = row.querySelector<HTMLElement>(
      wanted.part === "title" ? "input" : "[data-part=open]",
    );
    // The row first, so the list takes it as its current row and leaves focus inside it.
    row.closest<HTMLElement>("[role=row]")?.focus();
    (target ?? row.querySelector<HTMLElement>("input"))?.focus();
  };

  // The delete notice offers undo while the delete is still the latest change.
  const deletion = useRef<{ key: string; after: unknown }>(undefined);
  useEffect(() => {
    const open = deletion.current;
    if (open && open.after !== editor.document) {
      toasts.close(open.key);
      deletion.current = undefined;
    }
  });

  const under = sectionsOf(entries);
  const titleOf = (entry: Entry) => entry.title.trim() || t(UNTITLED[entry.kind]);
  const members = (id: string) => entries.filter((entry) => under.get(entry.id) === id);
  const isFolded = (id: string) => collapsed.has(id);
  const visible = entries.filter((entry) => !isFolded(under.get(entry.id) ?? ""));
  /** What moves with a row: a folded section takes its lessons along. */
  const group = (id: string) => [id, ...(isFolded(id) ? members(id).map((entry) => entry.id) : [])];
  const setFolded = (id: string, folded: boolean) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (folded) next.add(id);
      else next.delete(id);
      return next;
    });

  const add = (kind: Kind, title: string, index?: number) => {
    const value = newEntry(kind, title, new Set(entries.map((entry) => entry.id)));
    const result = editor.dispatch({
      type: "insertEntry",
      value,
      ...(index !== undefined && { index }),
    });
    if (result.ok) announce(t("outline.added", { title: titleOf(value) }));
    return result.ok ? value.id : undefined;
  };

  const addBelow = (entry: Entry, kind: Kind) => {
    const index = entries.indexOf(entry) + group(entry.id).length;
    const id = add(kind, "", index);
    if (id) setFocus({ id, part: "title" });
  };

  const move = (id: string, target: ReorderTarget) => {
    const moving = group(id);
    const order = entries.map((entry) => entry.id);
    const rest = order.filter((other) => !moving.includes(other));
    const key = String(target.key);
    let at = rest.indexOf(key);
    if (at < 0) return;
    if (target.position === "after") {
      at += group(key).filter((other) => !moving.includes(other)).length;
      // Dropped into a folded section: unfold it, so the row stays in sight.
      if (isFolded(key)) setFolded(key, false);
    }
    const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
    const result = editor.dispatch(movesBetween(order, next));
    const entry = entries.find((other) => other.id === id);
    if (result.ok && entry && result.ops.length > 0) {
      const position = next.indexOf(id) + 1;
      announce(t("outline.moved", { title: titleOf(entry), position, count: next.length }));
    }
  };

  const step = (entry: Entry, by: -1 | 1) => {
    const neighbour = visible[visible.indexOf(entry) + by];
    if (neighbour) move(entry.id, { key: neighbour.id, position: by < 0 ? "before" : "after" });
  };

  const remove = (entry: Entry) => {
    const at = visible.indexOf(entry);
    const neighbour = visible[at + 1] ?? visible[at - 1];
    const result = editor.dispatch({ type: "deleteEntry", id: entry.id });
    if (!result.ok) return;
    const title = titleOf(entry);
    const after = editor.document;
    const key = toasts.add(
      {
        title: t("outline.deleted", { title }),
        action: {
          label: t("action.undo"),
          onAction: () => {
            if (editor.document === after && editor.canUndo) editor.undo();
          },
        },
      },
      { timeout: 8000 },
    );
    deletion.current = { key, after };
    if (neighbour) setFocus({ id: neighbour.id, part: "title" });
    else document.getElementById(`${headingId}-new`)?.focus();
  };

  const duplicate = (entry: Entry) => {
    const result = editor.dispatch({ type: "duplicateEntry", id: entry.id });
    if (result.ok) announce(t("outline.duplicated", { title: titleOf(entry) }));
  };

  const dragAndDropHooks = useReorder<Entry>((keys: Set<Key>, target) => {
    const [id] = keys;
    if (id !== undefined) move(String(id), target);
  }, titleOf);

  const kinds: Kind[] = ["lesson", "quiz", "section"];
  const ADD: Record<Kind, StringKey> = {
    lesson: "outline.addLesson",
    quiz: "outline.addQuiz",
    section: "outline.addSection",
  };
  const BELOW: Record<Kind, StringKey> = {
    lesson: "outline.addLessonBelow",
    quiz: "outline.addQuizBelow",
    section: "outline.addSectionBelow",
  };

  return (
    <section ref={outline} className="be-outline" aria-labelledby={headingId}>
      <h2 id={headingId} className="be-section-title">
        {t("editor.outline")}
      </h2>
      <GridList
        aria-labelledby={headingId}
        items={visible}
        // Rows show more than their entry: where they sit, and what is folded.
        dependencies={[entries, collapsed]}
        dragAndDropHooks={dragAndDropHooks}
        // Tab moves through a row's controls; arrows move between rows.
        keyboardNavigationBehavior="tab"
        renderEmptyState={() => (
          <EmptyState icon="lesson" title={t("outline.empty")} level={3}>
            {t("outline.emptyBody")}
          </EmptyState>
        )}
        className="be-outline-list"
      >
        {(entry) => {
          const title = titleOf(entry);
          const content = hasContent(entry);
          const folded = isFolded(entry.id);
          const at = visible.findIndex((other) => other.id === entry.id);
          const hidden = folded ? members(entry.id).length : 0;
          return (
            <GridListItem id={entry.id} textValue={title}>
              <div
                className="be-row"
                data-entry={entry.id}
                data-kind={entry.kind}
                data-in-section={under.has(entry.id) || undefined}
              >
                <AfterRender effect={() => focusRow(entry.id)} />
                {entry.kind === "section" ? (
                  <IconButton
                    icon={folded ? "chevron-right" : "chevron-down"}
                    label={t("outline.toggle", { title })}
                    aria-expanded={!folded}
                    onPress={() => setFolded(entry.id, !folded)}
                  />
                ) : (
                  // UI-BLOCKS-EDITOR-R11: only lessons that have content show their icon.
                  <span className="be-row-icon">
                    {content && <Icon name={entry.kind === "quiz" ? "quiz" : "lesson"} />}
                  </span>
                )}
                <DraftField
                  label={t(TITLE_LABEL[entry.kind])}
                  hideLabel
                  placeholder={t(UNTITLED[entry.kind])}
                  className="be-row-title"
                  value={entry.title}
                  command={(text) => ({ type: "updateEntry", id: entry.id, set: { title: text } })}
                />
                {hidden > 0 && (
                  <span className="be-row-meta">{t("course.lessons", { count: hidden })}</span>
                )}
                {entry.kind !== "section" && (
                  <Button
                    variant="quiet"
                    data-part="open"
                    aria-label={t("outline.open", { title })}
                    onPress={() => onOpen(entry.id)}
                  >
                    {t("action.open")}
                  </Button>
                )}
                {/* UI-BLOCKS-EDITOR-R12: one click deletes a header or an empty lesson. */}
                {!content && (
                  <IconButton
                    icon="trash"
                    label={t("outline.delete", { title })}
                    onPress={() => remove(entry)}
                  />
                )}
                <MenuTrigger>
                  <IconButton icon="more" label={t("course.actions", { title })} />
                  <Menu
                    onAction={(key) => {
                      const action = String(key);
                      if (action === "open") onOpen(entry.id);
                      else if (action === "duplicate") duplicate(entry);
                      else if (action === "copy") onCopy(entry);
                      else if (action === "up") step(entry, -1);
                      else if (action === "down") step(entry, 1);
                      else if (action === "delete") remove(entry);
                      else addBelow(entry, action as Kind);
                    }}
                  >
                    {entry.kind !== "section" && (
                      <>
                        <MenuItem id="open">{t("action.open")}</MenuItem>
                        <MenuItem id="duplicate">{t("action.duplicate")}</MenuItem>
                        <MenuItem id="copy">{t("outline.copyTo")}</MenuItem>
                        <MenuSeparator />
                      </>
                    )}
                    {kinds.map((kind) => (
                      <MenuItem key={kind} id={kind}>
                        {t(BELOW[kind])}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem id="up" isDisabled={at === 0}>
                      {t("outline.moveUp")}
                    </MenuItem>
                    <MenuItem id="down" isDisabled={at === visible.length - 1}>
                      {t("outline.moveDown")}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem id="delete" isDanger>
                      {t("action.delete")}
                    </MenuItem>
                  </Menu>
                </MenuTrigger>
              </div>
            </GridListItem>
          );
        }}
      </GridList>
      {/* The new row at the end (C4, W4, UI-BLOCKS-EDITOR-R9). */}
      <div className="be-new-entry">
        <TextField
          id={`${headingId}-new`}
          label={t("outline.newTitle")}
          description={t("outline.newHelp")}
          placeholder={t("outline.newPlaceholder")}
          className="be-new-title"
          value={newTitle}
          onChange={setNewTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter" && newTitle.trim()) {
              if (add(event.shiftKey ? "section" : "lesson", newTitle.trim())) setNewTitle("");
            } else event.continuePropagation();
          }}
        />
        <MenuTrigger>
          <Button>
            <Icon name="add" />
            {t("outline.add")}
            <Icon name="chevron-down" />
          </Button>
          <Menu
            onAction={(key) => {
              if (add(key as Kind, newTitle.trim())) setNewTitle("");
            }}
          >
            {kinds.map((kind) => (
              <MenuItem key={kind} id={kind}>
                {t(ADD[kind])}
              </MenuItem>
            ))}
          </Menu>
        </MenuTrigger>
      </div>
      {region}
    </section>
  );
}

/**
 * Runs `effect` after every render of the list row it sits in. Its effects run once the list has
 * set up the row, which a ref callback runs too early for.
 */
export function AfterRender({ effect }: { effect: () => void }) {
  useEffect(effect);
  return null;
}
