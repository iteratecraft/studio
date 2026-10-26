import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import {
  ProgressBar as AriaProgressBar,
  type ProgressBarProps as AriaProgressBarProps,
  Tab as AriaTab,
  TabList as AriaTabList,
  type TabListProps as AriaTabListProps,
  TabPanel as AriaTabPanel,
  type TabPanelProps as AriaTabPanelProps,
  type TabProps as AriaTabProps,
  Tabs as AriaTabs,
  type TabsProps as AriaTabsProps,
  Heading,
  Label,
  useLocale,
} from "react-aria-components";
import { cx, IconButton } from "./buttons.js";
import { ListBoxItem } from "./collections.js";
import { Select } from "./fields.js";
import { Icon, type IconName } from "./icons.js";
import { useStrings } from "./provider.js";

type Styled<P> = Omit<P, "className" | "style"> & { className?: string };

export function Tabs({ className, ...props }: Styled<AriaTabsProps>) {
  return <AriaTabs {...props} className={cx("cs-Tabs", className)} />;
}

export function TabList<T extends object>(props: Omit<AriaTabListProps<T>, "className" | "style">) {
  return <AriaTabList {...props} className="cs-TabList" />;
}

export function Tab(props: Omit<AriaTabProps, "className" | "style">) {
  return <AriaTab {...props} className="cs-Tab" />;
}

export function TabPanel(props: Omit<AriaTabPanelProps, "className" | "style">) {
  return <AriaTabPanel {...props} className="cs-TabPanel" />;
}

export interface ProgressBarProps
  extends Omit<AriaProgressBarProps, "className" | "style" | "children"> {
  label: ReactNode;
}

/** Progress of a task; leave `value` out (isIndeterminate) while the total is unknown. */
export function ProgressBar({ label, ...props }: ProgressBarProps) {
  return (
    <AriaProgressBar {...props} className="cs-ProgressBar">
      {({ percentage, valueText, isIndeterminate }) => (
        <>
          <Label className="cs-Label">{label}</Label>
          <span>{valueText}</span>
          <div className="cs-ProgressBar-track">
            <div
              className="cs-ProgressBar-fill"
              style={isIndeterminate ? undefined : { width: `${percentage}%` }}
            />
          </div>
        </>
      )}
    </AriaProgressBar>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** Heading level of the title in the page outline. */
  level?: 2 | 3 | 4;
  children?: ReactNode;
  /** The next step, usually a primary Button. */
  action?: ReactNode;
}

/** What a view shows when it has nothing in it yet, and how to fill it. */
export function EmptyState({ icon = "info", title, level = 2, children, action }: EmptyStateProps) {
  return (
    <div className="cs-EmptyState">
      <Icon name={icon} size={32} />
      <Heading level={level} className="cs-EmptyState-title">
        {title}
      </Heading>
      {children !== undefined && <p className="cs-EmptyState-body">{children}</p>}
      {action}
    </div>
  );
}

export interface PaginationProps {
  /** What the pages hold, such as "Courses"; names the page bar. */
  label: string;
  /** Items in all the pages. */
  total: number;
  pageSize: number;
  /** The page shown, from 1. */
  page: number;
  onPageChange: (page: number) => void;
}

/**
 * A paging bar: which items the page shows out of how many (announced when it changes), previous
 * and next page, and a jump to any page.
 */
export function Pagination({ label, total, pageSize, page, onPageChange }: PaginationProps) {
  const t = useStrings();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const numbers = Array.from({ length: pages }, (_, i) => ({ id: i + 1 }));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <nav aria-label={t("pages.label", { label })} className="cs-Pagination">
      <span aria-live="polite" className="cs-Pagination-range">
        {t("pages.range", { start, end, total })}
      </span>
      <IconButton
        icon="chevron-left"
        label={t("pages.previous")}
        isDisabled={page <= 1}
        onPress={() => onPageChange(page - 1)}
      />
      <Select
        label={t("pages.page")}
        items={numbers}
        selectedKey={page}
        onSelectionChange={(key) => onPageChange(Number(key))}
        className="cs-Pagination-jump"
      >
        {(item) => (
          <ListBoxItem id={item.id}>{t("pages.of", { page: item.id, pages })}</ListBoxItem>
        )}
      </Select>
      <IconButton
        icon="chevron-right"
        label={t("pages.next")}
        isDisabled={page >= pages}
        onPress={() => onPageChange(page + 1)}
      />
    </nav>
  );
}

export interface SplitterProps {
  /** Accessible name of the handle, such as "Resize the outline". */
  label: string;
  /** Width of the start pane in percent of the whole. */
  defaultSize?: number;
  min?: number;
  max?: number;
  /** The start pane and the end pane. */
  children: [ReactNode, ReactNode];
  className?: string;
}

/**
 * Two panes side by side with a handle between them (the WAI-ARIA window splitter pattern):
 * drag the handle, or focus it and use the arrow keys (Shift for big steps), Home and End, and
 * Enter to collapse the start pane and bring it back.
 */
export function Splitter({
  label,
  defaultSize = 30,
  min = 10,
  max = 90,
  children: [start, end],
  className,
}: SplitterProps) {
  const [size, setSize] = useState(defaultSize);
  const [restore, setRestore] = useState(defaultSize);
  const container = useRef<HTMLDivElement>(null);
  const startId = useId();
  const { direction } = useLocale();
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  // The start pane is on the right in right-to-left languages, so the arrows swap.
  const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft";

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2;
    let next: number;
    if (event.key === forward) next = size + step;
    else if (event.key === backward) next = size - step;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (event.key === "Enter") {
      if (size > min) setRestore(size);
      next = size > min ? min : restore;
    } else return;
    event.preventDefault();
    setSize(clamp(next));
  }

  function onPointerMove(event: PointerEvent) {
    const box = container.current?.getBoundingClientRect();
    if (!box || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const offset = direction === "rtl" ? box.right - event.clientX : event.clientX - box.left;
    setSize(clamp((offset / box.width) * 100));
  }

  return (
    <div
      ref={container}
      className={cx("cs-Splitter", className)}
      style={{ gridTemplateColumns: `${size}% auto minmax(0, 1fr)` }}
    >
      <div id={startId} className="cs-Splitter-pane">
        {start}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable separator is a widget; <hr> cannot take focus or a value. */}
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-controls={startId}
        aria-orientation="vertical"
        aria-valuenow={Math.round(size)}
        aria-valuemin={min}
        aria-valuemax={max}
        className="cs-Splitter-handle"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={onPointerMove}
      />
      <div className="cs-Splitter-pane">{end}</div>
    </div>
  );
}

/**
 * A screen-reader announcement of something that happened out of sight, such as "Moved Soil to
 * place 2 of 5": `announce(text)` reads `text` out politely, again even when it repeats. Render
 * `region` once, where it stays mounted; it is not shown.
 */
export function useAnnouncer(): { region: ReactNode; announce: (text: string) => void } {
  const [message, setMessage] = useState({ text: "", id: 0 });
  const announce = useCallback(
    (text: string) => setMessage(({ id }) => ({ text, id: id + 1 })),
    [],
  );
  return {
    region: (
      <div aria-live="polite" className="cs-visually-hidden">
        {/* A new element each time, so the same text is read again. */}
        <span key={message.id}>{message.text}</span>
      </div>
    ),
    announce,
  };
}
