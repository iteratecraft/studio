// The blocks of one lesson (blocks-editor.md L1 to L6, L16, W7 to W13; rise.md 2 flow 3, 3C, 3D,
// 3J; BLK-03): one row per block with its type, its tools, its content edited in place and the
// block as learners see it; an insert control below every block and above the first; the shortcut
// bar and the block library; copy and paste, also across lessons and courses; a link to a block;
// and the manage-blocks list for several blocks. Every change is one doc-ops command list, so one
// undo step, and is announced to screen readers.
import { type Block, type LessonEntry, lessonLink } from "@course-suite/format";
import {
  Button,
  EmptyState,
  GridList,
  GridListItem,
  Icon,
  IconButton,
  type Key,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  type ReorderTarget,
  Select,
  type ToastQueue,
  Toolbar,
  useAnnouncer,
  useReorder,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useId, useRef, useState } from "react";
import { BlockLibrary } from "./block-library.js";
import { BlockPreview } from "./block-preview.js";
import { FormatMenu, StyleMenu } from "./block-settings.js";
import { BLOCK_TYPES, type BlockType, blockName, idMaker, typeName, typeOf } from "./blocks.js";
import { ManageBlocks, moveTogether } from "./manage.js";
import { NarrationMenu, narratable } from "./narration.js";
import { AfterRender } from "./outline.js";
import type { CourseSession } from "./session.js";

/** Copied blocks, kept by the app so they paste into any lesson of any course. */
export interface Clipboard {
  /** How many blocks wait to be pasted. */
  count: number;
  copy: (ids: string[]) => Promise<void>;
  /** Pastes them at `index` of lesson `lesson`; resolves to the new blocks' ids. */
  paste: (lesson: string, index: number) => Promise<string[]>;
  /** The other courses and microlearning items blocks can be copied to (B7). */
  courses: () => { id: string; title: string }[];
  /** Copies blocks `ids` to the end of the last lesson of the course with id `course` (W12). */
  copyToCourse: (ids: string[], course: string) => Promise<void>;
}

/** The shortcut bar (L2): the most used types the editor has today, added at the end. */
const SHORTCUTS = [
  "text/paragraph-with-heading",
  // Interactive shortcuts the spec names (blocks-interactions.md A3, M2-14).
  "interactive/labeled-graphic",
  "interactive/process",
  "interactive/flashcard-grid",
  "divider/continue",
].flatMap((key) => BLOCK_TYPES.find((type) => `${type.group}/${type.variant}` === key) ?? []);

/** Where focus goes after the next render: a part of a block's row. */
type FocusRequest = { id: string; part: "field" | "up" | "down" | "tools" | "insert" };

export interface LessonBlocksProps {
  session: CourseSession;
  lesson: LessonEntry;
  toasts: ToastQueue;
  clipboard: Clipboard;
  /** Opens another lesson of the course. */
  onGo?: (id: string) => void;
}

export function LessonBlocks({ session, lesson, toasts, clipboard, onGo }: LessonBlocksProps) {
  const t = useStrings();
  const { editor } = session;
  const blocks = lesson.blocks;
  const headingId = useId();
  const { region, announce } = useAnnouncer();
  const [library, setLibrary] = useState<number>();
  const [managing, setManaging] = useState(false);
  const list = useRef<HTMLElement>(null);
  const focus = useRef<FocusRequest | undefined>(undefined);
  const name = (block: Block) => blockName(block, t);

  /** Focuses the wanted part of block `id`'s row, if one is wanted. */
  const focusRow = (id: string) => {
    const wanted = focus.current;
    const row = list.current?.querySelector(`[data-block="${id}"]`);
    if (wanted?.id !== id || !row) return;
    focus.current = undefined;
    const enabled = (selector: string) =>
      row.querySelector<HTMLElement>(`${selector}:not([disabled]):not([data-disabled])`);
    // A move to the top or the bottom turns its button off: the other move button takes focus.
    const other = { up: "down", down: "up" }[wanted.part as string];
    const target =
      wanted.part === "field"
        ? // A media block's first step is its file: the choose button comes first.
          (enabled(".be-drop button") ?? enabled("input, textarea, [role=textbox]"))
        : (enabled(`[data-part=${wanted.part}]`) ??
          (other ? enabled(`[data-part=${other}]`) : null) ??
          enabled(".be-block-tools button"));
    // The row first, so the list takes it as its current row and leaves focus inside it.
    row.closest<HTMLElement>("[role=row]")?.focus();
    (target ?? enabled(".be-block-tools button"))?.focus();
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

  const insert = (type: BlockType, index: number) => {
    if (!type.create) return;
    const value = type.create(idMaker(editor.document), t);
    const result = editor.dispatch({ type: "insertBlock", parent: lesson.id, index, value });
    if (!result.ok) return;
    announce(t("blocks.added", { name: name(value) }));
    focus.current = { id: value.id, part: "field" };
  };

  const move = (block: Block, target: ReorderTarget, part?: FocusRequest["part"]) => {
    const commands = moveTogether(blocks, new Set([block.id]), target);
    const result = editor.dispatch(commands);
    if (!result.ok || result.ops.length === 0) return;
    const position = (
      editor.document.entries.find((entry) => entry.id === lesson.id) as LessonEntry
    ).blocks.findIndex((other) => other.id === block.id);
    announce(
      t("blocks.moved", { name: name(block), position: position + 1, count: blocks.length }),
    );
    if (part) focus.current = { id: block.id, part };
  };

  const step = (block: Block, by: -1 | 1) => {
    const neighbour = blocks[blocks.indexOf(block) + by];
    if (neighbour) {
      move(
        block,
        { key: neighbour.id, position: by < 0 ? "before" : "after" },
        by < 0 ? "up" : "down",
      );
    }
  };

  const duplicate = (block: Block) => {
    const result = editor.dispatch({ type: "duplicateBlock", id: block.id });
    if (result.ok) announce(t("blocks.duplicated", { name: name(block) }));
  };

  const remove = (block: Block) => {
    const at = blocks.indexOf(block);
    const neighbour = blocks[at + 1] ?? blocks[at - 1];
    const result = editor.dispatch({ type: "deleteBlock", id: block.id });
    if (!result.ok) return;
    const after = editor.document;
    const key = toasts.add(
      {
        title: t("blocks.deleted", { name: name(block) }),
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
    if (neighbour) focus.current = { id: neighbour.id, part: "tools" };
    else list.current?.querySelector<HTMLElement>(".be-shortcuts button")?.focus();
  };

  const copy = (ids: string[]) => {
    clipboard
      .copy(ids)
      .then(() =>
        toasts.add({ title: t("blocks.copied", { count: ids.length }) }, { timeout: 5000 }),
      )
      .catch(() => {});
  };

  /** Puts a link to the block on the system clipboard, for a text link (L6, W12 step 3). */
  const copyLink = (block: Block) => {
    navigator.clipboard
      .writeText(lessonLink(lesson.id, block.id))
      .then(
        () => t("blocks.linkCopied", { name: name(block) }),
        (error: unknown) =>
          t("blocks.linkFailed", {
            message: error instanceof Error ? error.message : String(error),
          }),
      )
      .then((title) => toasts.add({ title }, { timeout: 5000 }));
  };

  const paste = (index: number) => {
    clipboard
      .paste(lesson.id, index)
      .then((ids) => {
        const [first] = ids;
        if (!first) return;
        announce(t("blocks.pasted", { count: ids.length }));
        // The paste may have rendered already, before its files were in: focus once it shows.
        focus.current = { id: first, part: "tools" };
        requestAnimationFrame(() => focusRow(first));
      })
      .catch(() => {});
  };

  // Ctrl/Cmd+C copies the block whose row has focus, Ctrl/Cmd+V pastes below it. Heard on the way
  // down, as the list's rows keep their keys to themselves.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || event.altKey || (key !== "c" && key !== "v")) return;
      const row = document.activeElement;
      const id = row?.matches("[role=row]")
        ? row.querySelector<HTMLElement>("[data-block]")?.dataset.block
        : undefined;
      if (!id || !list.current?.contains(row)) return;
      event.preventDefault();
      if (key === "c") copy([id]);
      else paste(blocks.findIndex((block) => block.id === id) + 1);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  const dragAndDropHooks = useReorder<Block>((keys: Set<Key>, target) => {
    const block = blocks.find((other) => keys.has(other.id));
    if (block) move(block, target);
  }, name);

  return (
    <section ref={list} className="be-blocks" aria-labelledby={headingId}>
      <div className="be-blocks-head">
        <h3 id={headingId} className="be-section-title">
          {t("lesson.blocks")}
        </h3>
        <Button variant="quiet" isDisabled={blocks.length === 0} onPress={() => setManaging(true)}>
          <Icon name="blocks" />
          {t("blocks.manage")}
        </Button>
      </div>
      {blocks.length === 0 ? (
        <EmptyState icon="lesson" title={t("lesson.empty")} level={4}>
          {t("lesson.emptyBody")}
        </EmptyState>
      ) : (
        <>
          <IconButton
            icon="add"
            label={t("blocks.insertTop")}
            className="be-insert"
            onPress={() => setLibrary(0)}
          />
          <GridList
            aria-label={t("blocks.list", { lesson: lesson.title })}
            items={blocks}
            // Rows show more than their block: where they sit, and whether blocks wait to paste.
            dependencies={[blocks, clipboard.count]}
            dragAndDropHooks={dragAndDropHooks}
            // Tab moves through a row's controls; arrows move between rows.
            keyboardNavigationBehavior="tab"
            className="be-block-list"
          >
            {(block) => {
              const index = blocks.indexOf(block);
              const title = name(block);
              const type = typeOf(block);
              const Fields = type?.Fields;
              const siblings = type?.switchable
                ? BLOCK_TYPES.filter(
                    (other) =>
                      other.group === type.group &&
                      other.family === type.family &&
                      other.switchable &&
                      other.create,
                  )
                : [];
              return (
                <GridListItem id={block.id} textValue={title}>
                  <div className="be-block" data-block={block.id}>
                    <AfterRender effect={() => focusRow(block.id)} />
                    <div className="be-block-head">
                      {siblings.length > 0 ? (
                        // W8, UI-BLOCKS-EDITOR-R25: a sibling variant keeps the content; what it
                        // has no place for stays in the block, out of sight.
                        <Select
                          label={t("blocks.type")}
                          items={siblings}
                          selectedKey={block.variant}
                          onSelectionChange={(variant) =>
                            editor.dispatch({
                              type: "updateBlock",
                              id: block.id,
                              set: { variant: String(variant) },
                            })
                          }
                        >
                          {(other) => (
                            <ListBoxItem id={other.variant}>{t(other.label)}</ListBoxItem>
                          )}
                        </Select>
                      ) : (
                        <span className="be-block-type">{typeName(block, t)}</span>
                      )}
                      <Toolbar
                        aria-label={t("blocks.tools", { name: title })}
                        className="be-block-tools"
                      >
                        <StyleMenu editor={editor} block={block} />
                        <FormatMenu
                          editor={editor}
                          block={block}
                          next={index < blocks.length - 1}
                        />
                        {narratable(block) && <NarrationMenu editor={editor} block={block} />}
                        <IconButton
                          icon="arrow-up"
                          label={t("outline.moveUp")}
                          data-part="up"
                          isDisabled={index === 0}
                          onPress={() => step(block, -1)}
                        />
                        <IconButton
                          icon="arrow-down"
                          label={t("outline.moveDown")}
                          data-part="down"
                          isDisabled={index === blocks.length - 1}
                          onPress={() => step(block, 1)}
                        />
                        <IconButton
                          icon="copy"
                          label={t("action.duplicate")}
                          onPress={() => duplicate(block)}
                        />
                        <IconButton
                          icon="trash"
                          label={t("action.delete")}
                          onPress={() => remove(block)}
                        />
                        <MenuTrigger>
                          <IconButton icon="more" label={t("blocks.actions", { name: title })} />
                          <Menu
                            onAction={(key) => {
                              if (key === "copy") copy([block.id]);
                              else if (key === "paste") paste(index + 1);
                              else if (key === "link") copyLink(block);
                              else setLibrary(index + 1);
                            }}
                          >
                            <MenuItem id="copy">{t("action.copy")}</MenuItem>
                            <MenuItem id="paste" isDisabled={clipboard.count === 0}>
                              {t("blocks.pasteBelow")}
                            </MenuItem>
                            <MenuItem id="insert">
                              {t("blocks.insertBelow", { name: title })}
                            </MenuItem>
                            <MenuItem id="link">{t("blocks.copyLink")}</MenuItem>
                          </Menu>
                        </MenuTrigger>
                      </Toolbar>
                    </div>
                    <div className="be-block-body">
                      <div className="be-block-fields">
                        {Fields ? (
                          <Fields block={block} editor={editor} />
                        ) : (
                          <p className="be-note">{t("field.noFields")}</p>
                        )}
                      </div>
                      <BlockPreview block={block} course={editor.document} media={session.media} />
                    </div>
                    <IconButton
                      icon="add"
                      label={t("blocks.insertBelow", { name: title })}
                      data-part="insert"
                      className="be-insert"
                      onPress={() => setLibrary(index + 1)}
                    />
                  </div>
                </GridListItem>
              );
            }}
          </GridList>
        </>
      )}
      {/* The shortcut bar (L2): one press adds a block at the end. */}
      <Toolbar aria-label={t("blocks.shortcuts")} className="be-shortcuts">
        {SHORTCUTS.map((type) => (
          <Button key={type.label} onPress={() => insert(type, blocks.length)}>
            <Icon name="add" />
            {t(type.label)}
          </Button>
        ))}
        <Button onPress={() => setLibrary(blocks.length)}>{t("blocks.all")}</Button>
        {clipboard.count > 0 && (
          <Button onPress={() => paste(blocks.length)}>
            <Icon name="paste" />
            {t("blocks.pasteHere", { count: clipboard.count })}
          </Button>
        )}
      </Toolbar>
      {library !== undefined && (
        <BlockLibrary
          pasteCount={clipboard.count}
          onInsert={(type) => {
            setLibrary(undefined);
            insert(type, library);
          }}
          onPaste={() => {
            setLibrary(undefined);
            paste(library);
          }}
          onClose={() => setLibrary(undefined)}
        />
      )}
      {managing && (
        <ManageBlocks
          editor={editor}
          lesson={lesson}
          announce={announce}
          toasts={toasts}
          onCopy={copy}
          courses={clipboard.courses}
          onCopyToCourse={clipboard.copyToCourse}
          onGo={(id) => {
            setManaging(false);
            onGo?.(id);
          }}
          onClose={() => setManaging(false)}
        />
      )}
      {region}
    </section>
  );
}
