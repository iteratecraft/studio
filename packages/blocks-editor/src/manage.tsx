// Manage blocks (blocks-editor.md L16, W13; blocks-publish-collab.md C2, W10, W12): every block of
// the lesson in a list to select from; the selection moves as one by its drag handles, and is
// copied (to paste in any lesson of any course), duplicated below itself or deleted, each as one
// undo step.
import type { Editor } from "@course-suite/doc-ops";
import type { Block, LessonEntry } from "@course-suite/format";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  GridList,
  GridListItem,
  Icon,
  type Key,
  type ReorderTarget,
  Toolbar,
  useReorder,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useRef, useState } from "react";
import { blockName } from "./blocks.js";
import { movesBetween } from "./outline.js";

export interface ManageBlocksProps {
  editor: Editor;
  lesson: LessonEntry;
  onCopy: (ids: string[]) => void;
  onClose: () => void;
  /** Says what happened, out of sight. */
  announce: (text: string) => void;
}

/** moveBlock commands that put `moving` (in lesson order) before or after `target`. */
export function moveTogether(
  blocks: readonly Block[],
  moving: ReadonlySet<string>,
  target: ReorderTarget,
) {
  const order = blocks.map((block) => block.id);
  const rest = order.filter((id) => !moving.has(id));
  let at = rest.indexOf(String(target.key));
  if (at < 0) return [];
  if (target.position === "after") at += 1;
  const moved = order.filter((id) => moving.has(id));
  const next = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
  return movesBetween(order, next, (id, index) => ({ type: "moveBlock", id, index }));
}

export function ManageBlocks({ editor, lesson, onCopy, onClose, announce }: ManageBlocksProps) {
  const t = useStrings();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const blocks = lesson.blocks;
  // Lesson order, whatever order they were picked in; blocks undo took away are left out.
  const chosen = blocks.filter((block) => selected.has(block.id)).map((block) => block.id);
  const count = chosen.length;
  const name = (block: Block) => blockName(block, t);
  // The question replaces the tools and gets focus; after it, focus goes back to the tools.
  const tools = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    const target = confirming ? "[data-part=cancel]" : "button:not([disabled])";
    if (confirming || asked.current) tools.current?.querySelector<HTMLElement>(target)?.focus();
    asked.current = confirming;
  }, [confirming]);

  const dragAndDropHooks = useReorder<Block>((keys: Set<Key>, target) => {
    const moving = new Set([...keys].map(String));
    editor.dispatch(moveTogether(blocks, moving, target));
  }, name);

  const duplicate = () => {
    // UI-BLOCKS-EDITOR-R24, W13: the copies go directly below the selection, in its order.
    const last = Math.max(...chosen.map((id) => blocks.findIndex((block) => block.id === id)));
    const result = editor.dispatch(
      chosen.map((id, i) => ({ type: "duplicateBlock" as const, id, index: last + 1 + i })),
    );
    if (result.ok) announce(t("blocks.duplicatedMany", { count }));
  };

  const remove = () => {
    const result = editor.dispatch(chosen.map((id) => ({ type: "deleteBlock" as const, id })));
    setConfirming(false);
    if (result.ok) {
      setSelected(new Set());
      announce(t("blocks.deletedMany", { count }));
    }
  };

  return (
    <Dialog isOpen title={t("blocks.manage")} onOpenChange={(open) => !open && onClose()}>
      <div className="be-manage">
        <p className="be-note">{t("manage.help")}</p>
        <Checkbox
          isSelected={count > 0 && count === blocks.length}
          isIndeterminate={count > 0 && count < blocks.length}
          isDisabled={blocks.length === 0}
          onChange={(all) => setSelected(new Set(all ? blocks.map((block) => block.id) : []))}
        >
          {t("manage.selectAll")}
        </Checkbox>
        <GridList
          aria-label={t("manage.list", { lesson: lesson.title })}
          items={blocks}
          dependencies={[blocks]}
          selectionMode="multiple"
          selectionBehavior="toggle"
          selectedKeys={selected}
          onSelectionChange={(keys) =>
            setSelected(
              keys === "all" ? new Set(blocks.map((b) => b.id)) : new Set([...keys].map(String)),
            )
          }
          dragAndDropHooks={dragAndDropHooks}
          className="be-manage-list"
        >
          {(block) => (
            <GridListItem id={block.id} textValue={name(block)}>
              <span className="be-manage-check" aria-hidden="true">
                {selected.has(block.id) && <Icon name="check" />}
              </span>
              <span className="be-manage-name">{name(block)}</span>
            </GridListItem>
          )}
        </GridList>
        <p role="status" className="be-note">
          {t("manage.selected", { count })}
        </p>
        <div ref={tools}>
          {confirming ? (
            <div role="alert" className="be-confirm">
              <p>
                <strong>{t("manage.deleteTitle", { count })}</strong> {t("manage.deleteBody")}
              </p>
              <DialogActions>
                <Button variant="quiet" data-part="cancel" onPress={() => setConfirming(false)}>
                  {t("action.cancel")}
                </Button>
                <Button variant="danger" onPress={remove}>
                  {t("action.delete")}
                </Button>
              </DialogActions>
            </div>
          ) : (
            <Toolbar aria-label={t("blocks.manage")} className="be-manage-tools">
              <Button isDisabled={count === 0} onPress={() => onCopy(chosen)}>
                <Icon name="copy" />
                {t("action.copy")}
              </Button>
              <Button isDisabled={count === 0} onPress={duplicate}>
                {t("action.duplicate")}
              </Button>
              <Button variant="danger" isDisabled={count === 0} onPress={() => setConfirming(true)}>
                <Icon name="trash" />
                {t("action.delete")}
              </Button>
            </Toolbar>
          )}
        </div>
      </div>
    </Dialog>
  );
}
