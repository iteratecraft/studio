// The dashboard a person sees on launch (blocks-editor.md H6 to H14, W24; BLK-01): their courses
// as cards, 16 to a page, with new, open, search, sort, type filter, grid or list view, selection
// of several cards for one action, and a Deleted list.

import type { Course } from "@course-suite/format";
import {
  Button,
  Checkbox,
  EmptyState,
  GridList,
  GridListItem,
  Icon,
  IconButton,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Pagination,
  SearchField,
  Select,
  type Selection,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  useLocale,
  useStrings,
} from "@course-suite/ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { shownTitle } from "./course.js";
import { type KindFilter, type LibraryItem, type SortKey, visibleItems } from "./library.js";

export type ItemAction = "open" | MenuAction;
type MenuAction = "duplicate" | "rename" | "delete" | "restore" | "remove";

const MENU_LABELS = {
  duplicate: "action.duplicate",
  rename: "action.rename",
  delete: "action.delete",
  restore: "action.restore",
  remove: "action.remove",
} as const;
export type LayoutKey = "grid" | "list";

/** UI-BLOCKS-EDITOR-R3, blocks-editor H14: a page of the dashboard holds 16 cards. */
export const PAGE_SIZE = 16;

export interface DashboardProps {
  appName: string;
  version: string;
  items: readonly LibraryItem[];
  /** Ids of the files found missing. */
  missing: ReadonlySet<string>;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  layout: LayoutKey;
  onLayoutChange: (layout: LayoutKey) => void;
  onNew: (kind: Course["kind"]) => void;
  onOpen: () => void;
  /** An action on one course, or on the courses selected together. */
  onAction: (action: ItemAction, items: readonly LibraryItem[]) => void;
  onEmptyDeleted: () => void;
}

export function Dashboard(props: DashboardProps) {
  const t = useStrings();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const { items, sort } = props;
  const courses = useMemo(
    () => visibleItems(items, { query, sort, kind, deleted: false }, locale),
    [items, query, sort, kind, locale],
  );
  const deleted = useMemo(
    () => visibleItems(items, { query: "", sort: "updated", kind: "all", deleted: true }, locale),
    [items, locale],
  );
  const hasCourses = items.some((item) => item.deleted === undefined);
  // A new screen: focus starts at its heading, for keyboard and screen reader users.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="be-dashboard">
      <header className="be-bar">
        <span className="be-brand">{props.appName}</span>
      </header>
      <main className="be-dashboard-main">
        <div className="be-heading-row">
          <h1 ref={heading} tabIndex={-1}>
            {t("dashboard.title")}
          </h1>
          <div className="be-actions">
            <MenuTrigger>
              <Button variant="primary">
                <Icon name="add" />
                {t("dashboard.new")}
                <Icon name="chevron-down" />
              </Button>
              <Menu onAction={(key) => props.onNew(key as Course["kind"])}>
                <MenuItem id="course">{t("dashboard.newCourse")}</MenuItem>
                <MenuItem id="microlearning">{t("dashboard.newMicrolearning")}</MenuItem>
              </Menu>
            </MenuTrigger>
            <Button onPress={props.onOpen}>
              <Icon name="open" />
              {t("dashboard.open")}
            </Button>
          </div>
        </div>
        <Tabs>
          <TabList aria-label={t("dashboard.sections")}>
            <Tab id="courses">{t("dashboard.courses")}</Tab>
            <Tab id="deleted">{t("dashboard.deleted")}</Tab>
          </TabList>
          <TabPanel id="courses">
            {hasCourses ? (
              <>
                <div className="be-filters">
                  <SearchField
                    label={t("dashboard.search")}
                    value={query}
                    onChange={setQuery}
                    className="be-search"
                  />
                  <Select
                    label={t("dashboard.sort")}
                    selectedKey={sort}
                    onSelectionChange={(key) => props.onSortChange(key as SortKey)}
                  >
                    <ListBoxItem id="updated">{t("dashboard.sortUpdated")}</ListBoxItem>
                    <ListBoxItem id="created">{t("dashboard.sortCreated")}</ListBoxItem>
                    <ListBoxItem id="title">{t("dashboard.sortTitle")}</ListBoxItem>
                  </Select>
                  <Select
                    label={t("dashboard.type")}
                    selectedKey={kind}
                    onSelectionChange={(key) => setKind(key as KindFilter)}
                  >
                    <ListBoxItem id="all">{t("dashboard.typeAll")}</ListBoxItem>
                    <ListBoxItem id="course">{t("course.kind.course")}</ListBoxItem>
                    <ListBoxItem id="microlearning">{t("course.kind.microlearning")}</ListBoxItem>
                  </Select>
                  <ToggleButtonGroup
                    aria-label={t("dashboard.view")}
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[props.layout]}
                    onSelectionChange={(keys) => {
                      const [key] = keys;
                      if (key) props.onLayoutChange(key as LayoutKey);
                    }}
                    className="be-view"
                  >
                    <ToggleButton id="grid" icon="grid" label={t("dashboard.viewGrid")} />
                    <ToggleButton id="list" icon="list" label={t("dashboard.viewList")} />
                  </ToggleButtonGroup>
                </div>
                <CourseList
                  // A new search, filter or sort starts again at its first page, with nothing selected.
                  key={`${query}\n${kind}\n${sort}`}
                  label={t("dashboard.courses")}
                  items={courses}
                  layout={props.layout}
                  missing={props.missing}
                  onAction={props.onAction}
                  empty={
                    <EmptyState icon="search" title={t("dashboard.noMatch")} level={2}>
                      {t("dashboard.noMatchBody")}
                    </EmptyState>
                  }
                />
              </>
            ) : (
              <EmptyState
                icon="file"
                title={t("dashboard.emptyTitle")}
                action={
                  <Button variant="primary" onPress={() => props.onNew("course")}>
                    {t("dashboard.newCourse")}
                  </Button>
                }
              >
                {t("dashboard.emptyBody")}
              </EmptyState>
            )}
          </TabPanel>
          <TabPanel id="deleted">
            <div className="be-deleted-row">
              <p className="be-note">{t("dashboard.deletedNote")}</p>
              <Button
                variant="quiet"
                isDisabled={deleted.length === 0}
                onPress={props.onEmptyDeleted}
              >
                {t("dashboard.emptyDeleted")}
              </Button>
            </div>
            <CourseList
              label={t("dashboard.deleted")}
              items={deleted}
              layout={props.layout}
              missing={props.missing}
              onAction={props.onAction}
              inDeleted
              empty={<EmptyState icon="trash" title={t("dashboard.deletedEmpty")} level={2} />}
            />
          </TabPanel>
        </Tabs>
      </main>
      <footer className="be-footer">{t("app.version", { version: props.version })}</footer>
    </div>
  );
}

function CourseList({
  label,
  items,
  layout,
  missing,
  onAction,
  inDeleted = false,
  empty,
}: {
  label: string;
  items: LibraryItem[];
  layout: LayoutKey;
  missing: ReadonlySet<string>;
  onAction: DashboardProps["onAction"];
  inDeleted?: boolean;
  empty: ReactNode;
}) {
  const t = useStrings();
  const { locale } = useLocale();
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Selection>(new Set());
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const byId = new Map(shown.map((item) => [item.file.id, item]));
  // Ctrl/Cmd+A selects every card on the page (blocks-editor 5.1); only the page can be selected.
  const chosen = selected === "all" ? shown : shown.filter((item) => selected.has(item.file.id));
  const act = (action: MenuAction) => {
    onAction(action, chosen);
    setSelected(new Set());
  };
  return (
    <>
      {chosen.length > 0 && (
        <Toolbar aria-label={t("dashboard.selection")} className="be-selection">
          <span className="be-selection-count">{t("list.selected", { count: chosen.length })}</span>
          {inDeleted ? (
            <>
              <Button onPress={() => act("restore")}>{t("action.restore")}</Button>
              <Button onPress={() => act("remove")}>{t("action.remove")}</Button>
            </>
          ) : (
            <Button variant="danger" onPress={() => act("delete")}>
              {t("action.delete")}
            </Button>
          )}
          <Button variant="quiet" onPress={() => setSelected(new Set())}>
            {t("action.clearSelection")}
          </Button>
        </Toolbar>
      )}
      {/* Ctrl/Cmd+A from anywhere in the list, its select boxes included (blocks-editor 5.1). */}
      <div
        className="be-courses-wrap"
        onKeyDownCapture={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            event.key.toLowerCase() === "a" &&
            shown.length > 0
          ) {
            event.preventDefault();
            event.stopPropagation();
            setSelected("all");
          }
        }}
      >
        <GridList
          aria-label={label}
          items={shown.map((item) => ({ ...item, id: item.file.id }))}
          layout={layout === "grid" ? "grid" : "stack"}
          // Tab reaches each card's actions button; arrows move between cards; Space selects one.
          keyboardNavigationBehavior="tab"
          selectionMode="multiple"
          selectedKeys={selected}
          onSelectionChange={setSelected}
          renderEmptyState={() => empty}
          onAction={(key) => {
            const item = byId.get(String(key));
            if (item && !inDeleted && !missing.has(item.file.id)) onAction("open", [item]);
          }}
          className={`be-courses be-courses--${layout}${chosen.length > 0 ? " be-courses--selecting" : ""}`}
        >
          {(item) => {
            const title = shownTitle(item.title, t("course.untitled"));
            const lost = missing.has(item.file.id);
            const actions: MenuAction[] = inDeleted
              ? ["restore", "remove"]
              : lost
                ? ["remove"]
                : ["duplicate", "rename", "delete"];
            return (
              <GridListItem id={item.id} textValue={title}>
                <div className="be-card">
                  {/* Space on the card selects it too, so the box needs no stop of its own. */}
                  <Checkbox slot="selection" excludeFromTabOrder />
                  <div className="be-cover" data-kind={item.kind} aria-hidden="true">
                    <Icon name="file" size={28} />
                  </div>
                  <div className="be-card-text">
                    <span className="be-card-title">{title}</span>
                    <span className="be-card-meta">
                      {t(
                        item.kind === "course" ? "course.kind.course" : "course.kind.microlearning",
                      )}
                      {" · "}
                      {t("course.lessons", { count: item.lessons })}
                    </span>
                    <span className="be-card-meta">
                      {lost ? (
                        <span className="be-missing">
                          <Icon name="warning" size={14} />
                          {t("course.missing")}
                        </span>
                      ) : (
                        t("course.modified", { date: date.format(item.updated) })
                      )}
                    </span>
                  </div>
                  <MenuTrigger>
                    <IconButton icon="more" label={t("course.actions", { title })} />
                    <Menu onAction={(key) => onAction(key as ItemAction, [item])}>
                      {actions.map((action) => (
                        <MenuItem key={action} id={action} isDanger={action === "delete"}>
                          {t(MENU_LABELS[action])}
                        </MenuItem>
                      ))}
                    </Menu>
                  </MenuTrigger>
                </div>
              </GridListItem>
            );
          }}
        </GridList>
      </div>
      {pages > 1 && (
        <Pagination
          label={label}
          total={items.length}
          pageSize={PAGE_SIZE}
          page={current}
          // UI-BLOCKS-EDITOR-R3: changing page clears the selection.
          onPageChange={(to) => {
            setPage(to);
            setSelected(new Set());
          }}
        />
      )}
    </>
  );
}
