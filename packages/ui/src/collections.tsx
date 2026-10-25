import type { CSSProperties, ReactNode } from "react";
import {
  Button as AriaButton,
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  type GridListItemProps as AriaGridListItemProps,
  type GridListProps as AriaGridListProps,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  type ListBoxItemProps as AriaListBoxItemProps,
  type ListBoxProps as AriaListBoxProps,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  type TreeItemProps as AriaTreeItemProps,
  type TreeProps as AriaTreeProps,
  DropIndicator,
  type Key,
  type ListData,
  TreeItemContent,
  useDragAndDrop,
  useListData,
} from "react-aria-components";
import { cx } from "./buttons.js";
import { Icon } from "./icons.js";

export type { Key, ListData };
export { useListData };

export interface ListBoxProps<T extends object>
  extends Omit<AriaListBoxProps<T>, "className" | "style"> {}

/** A list to pick one or more options from, in the page; type to jump to an option. */
export function ListBox<T extends object>(props: ListBoxProps<T>) {
  return <AriaListBox {...props} className="cs-ListBox cs-ListBox--standalone" />;
}

export interface ListBoxItemProps<T extends object>
  extends Omit<AriaListBoxItemProps<T>, "className" | "style"> {}

/** An option of a ListBox or a Select. */
export function ListBoxItem<T extends object>(props: ListBoxItemProps<T>) {
  return <AriaListBoxItem {...props} className="cs-ListBoxItem" />;
}

export interface GridListProps<T extends object>
  extends Omit<AriaGridListProps<T>, "className" | "style"> {
  className?: string;
}

/**
 * A list of rows that may hold their own buttons, and may be reordered (see useReorder);
 * `layout="grid"` flows the items into columns of cards.
 */
export function GridList<T extends object>({ className, ...props }: GridListProps<T>) {
  return <AriaGridList {...props} className={cx("cs-GridList", className)} />;
}

export interface GridListItemProps<T extends object>
  extends Omit<AriaGridListItemProps<T>, "className" | "style" | "children"> {
  children: ReactNode;
}

/** A row of a GridList; shows a drag handle when its list can be reordered. */
export function GridListItem<T extends object>({ children, ...props }: GridListItemProps<T>) {
  return (
    <AriaGridListItem
      {...(typeof children === "string" && { textValue: children })}
      {...props}
      className="cs-GridListItem"
    >
      {({ allowsDragging }) => (
        <>
          {allowsDragging && (
            <AriaButton slot="drag" className="cs-DragHandle">
              <Icon name="grip" />
            </AriaButton>
          )}
          {children}
        </>
      )}
    </AriaGridListItem>
  );
}

/** Where reordered items go: before or after the item with `key`. */
export interface ReorderTarget {
  key: Key;
  position: "before" | "after";
}

/**
 * Drag-and-drop hooks that reorder the items of a GridList, by pointer or by keyboard (Enter on a
 * drag handle, arrows to the place, Enter to drop). `list` is the ListData to reorder, or a
 * function that moves the dragged `keys` itself, such as by an editing command. `text` names an
 * item for other apps.
 */
export function useReorder<T extends object>(
  list: ListData<T> | ((keys: Set<Key>, target: ReorderTarget) => void),
  text: (item: T) => string,
) {
  return useDragAndDrop<T>({
    getItems: (_keys, items) => items.map((item) => ({ "text/plain": text(item) })),
    onReorder({ keys, target }) {
      const { key, dropPosition: position } = target;
      if (position === "on") return;
      if (typeof list === "function") list(keys, { key, position });
      else if (position === "before") list.moveBefore(key, keys);
      else list.moveAfter(key, keys);
    },
    renderDropIndicator: (target) => <DropIndicator target={target} className="cs-DropIndicator" />,
  }).dragAndDropHooks;
}

export interface TreeProps<T extends object>
  extends Omit<AriaTreeProps<T>, "className" | "style"> {}

/** A tree of rows that open and close, such as a course outline; type to jump to a row. */
export function Tree<T extends object>(props: TreeProps<T>) {
  return <AriaTree {...props} className="cs-Tree" />;
}

export interface TreeItemProps<T extends object>
  extends Omit<AriaTreeItemProps<T>, "className" | "style" | "children" | "textValue"> {
  title: string;
  /** Child TreeItems. */
  children?: ReactNode;
}

export function TreeItem<T extends object>({ title, children, ...props }: TreeItemProps<T>) {
  return (
    <AriaTreeItem
      {...props}
      textValue={title}
      className="cs-TreeItem"
      style={({ level }) => ({ "--cs-tree-level": level }) as CSSProperties}
    >
      <TreeItemContent>
        {({ hasChildItems }) =>
          hasChildItems ? (
            <>
              <AriaButton slot="chevron" className="cs-TreeItem-chevron">
                <Icon name="chevron-right" />
              </AriaButton>
              {title}
            </>
          ) : (
            <>
              <span className="cs-TreeItem-spacer" />
              {title}
            </>
          )
        }
      </TreeItemContent>
      {children}
    </AriaTreeItem>
  );
}
