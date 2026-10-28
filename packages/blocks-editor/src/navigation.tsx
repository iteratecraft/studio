// The navigation section of the theme panel (M2-16, BLK-08; blocks-editor.md T5, 2.18 navigation,
// W2, W20; rise.md 3F, rule 14): for a course, the menu or none, how it starts, search, lessons in
// order and learner mark-done, the menu's colours, the lesson progress mark and the compact card's
// lesson count, and a buttons tab for the previous and next lesson buttons; for a
// microlearning, continuous scroll or steps with the step indicator. Options that cannot apply say
// why instead of vanishing.
import {
  type Course,
  isRestricted,
  type MenuStyle,
  type Navigation,
  searchBlocked,
  skipAheadQuiz,
} from "@course-suite/format";
import {
  ListBoxItem,
  Select,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type Translate,
  useStrings,
} from "@course-suite/ui";
import { useId } from "react";

/** Settings where undefined leaves one out (back at its default). */
export type LooseNavigation = { [K in keyof Navigation]?: Navigation[K] | undefined };

/** The navigation without unset values; undefined when nothing is left. */
export function cleanedNavigation(navigation: LooseNavigation): Navigation | undefined {
  const kept = Object.fromEntries(
    Object.entries(navigation).filter(([, value]) => value !== undefined),
  );
  return Object.keys(kept).length > 0 ? (kept as Navigation) : undefined;
}

/** What the theme menu says about the navigation. */
export function navigationSummary(course: Course, t: Translate): string {
  const navigation = course.navigation ?? {};
  if (course.kind === "microlearning") return t(navigation.steps ? "nav.steps" : "nav.scroll");
  if (navigation.off) return t("theme.off");
  return t(`nav.${navigation.menu ?? "sidebar"}`);
}

/** A switch with its note below it, read as its description. */
function Described({
  note,
  children,
  ...props
}: {
  note: string;
  children: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <>
      <Switch {...props} aria-describedby={id}>
        {children}
      </Switch>
      <p id={id} className="be-note">
        {note}
      </p>
    </>
  );
}

export function NavigationFields({
  course,
  draft,
  change,
}: {
  /** The course as saved; the draft is checked with it (quizzes force lessons in order). */
  course: Course;
  draft: Navigation;
  change: (next: LooseNavigation) => void;
}) {
  const t = useStrings();
  const set = (next: LooseNavigation) => change({ ...draft, ...next });
  if (course.kind === "microlearning") {
    // W2: a microlearning scrolls, or moves in steps with an indicator (D-38).
    return (
      <>
        <Select
          label={t("nav.flow")}
          selectedKey={draft.steps ? "steps" : "scroll"}
          onSelectionChange={(key) => set({ steps: key === "steps" || undefined })}
        >
          <ListBoxItem id="scroll" description={t("nav.scrollHelp")}>
            {t("nav.scroll")}
          </ListBoxItem>
          <ListBoxItem id="steps" description={t("nav.stepsHelp")}>
            {t("nav.steps")}
          </ListBoxItem>
        </Select>
        {draft.steps && (
          <Select
            label={t("nav.indicator")}
            selectedKey={draft.stepIndicator ?? "bar"}
            onSelectionChange={(key) =>
              set({ stepIndicator: key === "bar" ? undefined : (key as "numbers" | "none") })
            }
          >
            <ListBoxItem id="bar">{t("nav.bar")}</ListBoxItem>
            <ListBoxItem id="numbers">{t("nav.numbers")}</ListBoxItem>
            <ListBoxItem id="none">{t("nav.none")}</ListBoxItem>
          </Select>
        )}
      </>
    );
  }

  const checked = { ...course, navigation: draft };
  const forcedBy = skipAheadQuiz(course);
  const restricted = isRestricted(checked);
  const blocked = searchBlocked(checked);
  const menu = draft.menu ?? "sidebar";
  return (
    <Tabs>
      <TabList aria-label={t("theme.section.navigation")}>
        <Tab id="menu">{t("nav.tabMenu")}</Tab>
        <Tab id="buttons">{t("nav.tabButtons")}</Tab>
      </TabList>
      <TabPanel id="menu">
        <div className="be-theme-fields">
          <Described
            note={t("nav.onHelp")}
            isSelected={draft.off !== true}
            onChange={(on) => set({ off: on ? undefined : true })}
          >
            {t("nav.on")}
          </Described>
          {draft.off !== true && (
            <>
              <Select
                label={t("nav.menu")}
                selectedKey={menu}
                onSelectionChange={(key) =>
                  set({ menu: key === "sidebar" ? undefined : (key as "compact" | "overlay") })
                }
              >
                <ListBoxItem id="sidebar" description={t("nav.sidebarHelp")}>
                  {t("nav.sidebar")}
                </ListBoxItem>
                <ListBoxItem id="compact" description={t("nav.compactHelp")}>
                  {t("nav.compact")}
                </ListBoxItem>
                <ListBoxItem id="overlay" description={t("nav.overlayHelp")}>
                  {t("nav.overlay")}
                </ListBoxItem>
              </Select>
              {menu === "sidebar" && (
                <Described
                  note={t("nav.menuOpenHelp")}
                  isSelected={draft.menuClosed !== true}
                  onChange={(on) => set({ menuClosed: on ? undefined : true })}
                >
                  {t("nav.menuOpen")}
                </Described>
              )}
              {menu !== "overlay" && (
                <Switch
                  isSelected={draft.sectionsClosed !== true}
                  onChange={(on) => set({ sectionsClosed: on ? undefined : true })}
                >
                  {t("nav.sectionsOpen")}
                </Switch>
              )}
              {menu === "compact" && (
                <Switch
                  isSelected={draft.compactCount !== false}
                  onChange={(on) => set({ compactCount: on ? undefined : false })}
                >
                  {t("nav.compactCount")}
                </Switch>
              )}
              <Select
                label={t("nav.menuStyle")}
                description={t("nav.menuStyleHelp")}
                selectedKey={draft.menuStyle ?? "light"}
                onSelectionChange={(key) =>
                  set({ menuStyle: key === "light" ? undefined : (key as MenuStyle) })
                }
              >
                <ListBoxItem id="light">{t("style.light")}</ListBoxItem>
                <ListBoxItem id="gray">{t("style.gray")}</ListBoxItem>
                <ListBoxItem id="theme">{t("style.theme")}</ListBoxItem>
                <ListBoxItem id="tint">{t("style.themeTint")}</ListBoxItem>
                <ListBoxItem id="dark">{t("style.dark")}</ListBoxItem>
                <ListBoxItem id="dark-theme">{t("nav.darkTheme")}</ListBoxItem>
                <ListBoxItem id="image-light" description={t("nav.imageHelp")}>
                  {t("nav.imageLight")}
                </ListBoxItem>
                <ListBoxItem id="image-dark" description={t("nav.imageHelp")}>
                  {t("nav.imageDark")}
                </ListBoxItem>
              </Select>
              <Select
                label={t("nav.progress")}
                selectedKey={draft.progressIndicator ?? "theme"}
                onSelectionChange={(key) =>
                  set({
                    progressIndicator: key === "theme" ? undefined : (key as "circle" | "check"),
                  })
                }
              >
                <ListBoxItem id="theme" description={t("nav.progressThemeHelp")}>
                  {t("nav.progressTheme")}
                </ListBoxItem>
                <ListBoxItem id="circle" description={t("nav.progressCircleHelp")}>
                  {t("nav.progressCircle")}
                </ListBoxItem>
                <ListBoxItem id="check" description={t("nav.progressCheckHelp")}>
                  {t("nav.progressCheck")}
                </ListBoxItem>
              </Select>
            </>
          )}
          {/* rise.md 3F: search only in the sidebar, and never while lessons open in order. */}
          <Described
            note={
              blocked === "restricted"
                ? t("nav.searchRestricted")
                : blocked === "no-sidebar"
                  ? t("nav.searchNoSidebar")
                  : t("nav.searchHelp")
            }
            isSelected={draft.search !== false && blocked === undefined}
            isDisabled={blocked !== undefined}
            onChange={(on) => set({ search: on ? undefined : false })}
          >
            {t("nav.search")}
          </Described>
          {/* Rule 14: in order turns off search and mark-done; a quiz with skip-ahead forces it. */}
          <Described
            note={
              forcedBy ? t("nav.restrictedQuiz", { quiz: forcedBy.title }) : t("nav.restrictedHelp")
            }
            isSelected={restricted}
            isDisabled={forcedBy !== undefined}
            onChange={(on) => set({ restricted: on || undefined })}
          >
            {t("nav.restricted")}
          </Described>
          <Described
            note={restricted ? t("nav.markDoneRestricted") : t("nav.markDoneHelp")}
            isSelected={draft.learnerMarkDone === true && !restricted}
            isDisabled={restricted}
            onChange={(on) => set({ learnerMarkDone: on || undefined })}
          >
            {t("nav.markDone")}
          </Described>
        </div>
      </TabPanel>
      <TabPanel id="buttons">
        <div className="be-theme-fields">
          <Described
            note={t("nav.pageButtonsHelp")}
            isSelected={draft.pageButtons !== "off"}
            onChange={(on) => set({ pageButtons: on ? undefined : "off" })}
          >
            {t("nav.pageButtons")}
          </Described>
          {draft.pageButtons !== "off" && (
            <>
              <Select
                label={t("nav.placement")}
                selectedKey={draft.pageButtons ?? "full-width"}
                onSelectionChange={(key) =>
                  set({
                    pageButtons:
                      key === "full-width"
                        ? undefined
                        : (key as "floating" | "floating-full-width"),
                  })
                }
              >
                <ListBoxItem id="full-width" description={t("nav.fullWidthHelp")}>
                  {t("nav.fullWidth")}
                </ListBoxItem>
                <ListBoxItem id="floating" description={t("nav.floatingHelp")}>
                  {t("nav.floating")}
                </ListBoxItem>
                <ListBoxItem id="floating-full-width" description={t("nav.floatingFullHelp")}>
                  {t("nav.floatingFull")}
                </ListBoxItem>
              </Select>
              <Select
                label={t("nav.buttonColor")}
                description={t("nav.buttonColorHelp")}
                selectedKey={draft.pageButtonColor ?? "white"}
                onSelectionChange={(key) =>
                  set({
                    pageButtonColor:
                      key === "white" ? undefined : (key as "dark" | "theme" | "theme-tint"),
                  })
                }
              >
                <ListBoxItem id="white">{t("nav.white")}</ListBoxItem>
                <ListBoxItem id="dark">{t("style.dark")}</ListBoxItem>
                <ListBoxItem id="theme">{t("style.theme")}</ListBoxItem>
                <ListBoxItem id="theme-tint">{t("style.themeTint")}</ListBoxItem>
              </Select>
            </>
          )}
        </div>
      </TabPanel>
    </Tabs>
  );
}
