// The dashboard a person sees on launch (blocks-editor.md H6 to H13, W24; BLK-01): their courses
// as cards, with new, open, search, sort, type filter and grid or list view, and a Deleted list.

import type { Course } from "@course-suite/format";
import {
  Button,
  EmptyState,
  GridList,
  GridListItem,
  Icon,
  IconButton,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  SearchField,
  Select,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
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
  onAction: (action: ItemAction, item: LibraryItem) => void;
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
  const byId = new Map(items.map((item) => [item.file.id, item]));
  return (
    <GridList
      aria-label={label}
      items={items.map((item) => ({ ...item, id: item.file.id }))}
      layout={layout === "grid" ? "grid" : "stack"}
      // Tab reaches each card's actions button; arrows move between cards.
      keyboardNavigationBehavior="tab"
      renderEmptyState={() => empty}
      onAction={(key) => {
        const item = byId.get(String(key));
        if (item && !inDeleted && !missing.has(item.file.id)) onAction("open", item);
      }}
      className={`be-courses be-courses--${layout}`}
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
              <div className="be-cover" data-kind={item.kind} aria-hidden="true">
                <Icon name="file" size={28} />
              </div>
              <div className="be-card-text">
                <span className="be-card-title">{title}</span>
                <span className="be-card-meta">
                  {t(item.kind === "course" ? "course.kind.course" : "course.kind.microlearning")}
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
                <Menu onAction={(key) => onAction(key as ItemAction, item)}>
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
  );
}
