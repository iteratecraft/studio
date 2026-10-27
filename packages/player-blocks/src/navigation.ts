// The course menu's outline and search, and the steps of a stepped microlearning (M2-16, BLK-08;
// rise.md 3F, rules 16 and 17; blocks-editor.md 2.18 navigation; blocks-interactions.md GL9,
// UI-BLOCKS-R58; accessibility.md D4). Every learner string comes from the label set.
import type { Entry, LessonEntry } from "@course-suite/format";
import { plainText } from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { h, uid } from "./dom.js";
import { type Progress, stepsOf } from "./progress.js";
import { type Page, pageHash } from "./route.js";

export interface OutlineLink {
  link: HTMLAnchorElement;
  status: HTMLElement;
}

export interface Outline {
  element: HTMLElement;
  links: Map<string, OutlineLink>;
  /** Opens the section group holding page `id`, so the current page shows. */
  reveal(id: string): void;
  /** Shows only the pages in `ids` and the groups holding them; undefined shows every page. */
  filter(ids: ReadonlySet<string> | undefined): void;
}

/**
 * The outline of the course menu: its pages in their section groups. A collapsible group's title is
 * a button that shows or hides its pages; groups start expanded unless the author chose collapsed
 * (blocks-editor.md 2.18; the overlay menu has no such option).
 */
export function outlineOf(
  entries: readonly Entry[],
  { collapsible, closed }: { collapsible: boolean; closed: boolean },
): Outline {
  const top = h("ul", { class: "outline-list" });
  const links = new Map<string, OutlineLink>();
  const items = new Map<string, HTMLLIElement>();
  const groups: {
    item: HTMLLIElement;
    list: HTMLUListElement;
    ids: Set<string>;
    open: boolean;
    button?: HTMLButtonElement;
  }[] = [];
  let shown: ReadonlySet<string> | undefined;
  const apply = () => {
    for (const [id, item] of items) item.hidden = shown !== undefined && !shown.has(id);
    for (const group of groups) {
      // While searching, a group shows when it holds a match, whatever its own state.
      group.item.hidden = shown !== undefined && ![...group.ids].some((id) => shown?.has(id));
      group.list.hidden = shown === undefined && !group.open;
      group.button?.setAttribute("aria-expanded", String(shown !== undefined || group.open));
    }
  };
  let list = top;
  let group: (typeof groups)[number] | undefined;
  for (const entry of entries) {
    if (entry.kind === "section") {
      const titleId = uid("section");
      list = h("ul", { id: uid("group"), "aria-labelledby": titleId });
      const button = collapsible
        ? h(
            "button",
            { type: "button", id: titleId, class: "outline-group", "aria-controls": list.id },
            entry.title,
          )
        : undefined;
      const current = {
        item: h(
          "li",
          { class: "outline-section" },
          button ?? h("span", { id: titleId }, entry.title),
          list,
        ),
        list,
        ids: new Set<string>(),
        // A group that cannot collapse is always open.
        open: !(closed && collapsible),
        ...(button && { button }),
      };
      button?.addEventListener("click", () => {
        current.open = !current.open;
        apply();
      });
      groups.push(current);
      group = current;
      top.append(current.item);
      continue;
    }
    const statusId = uid("status");
    const status = h("span", { class: "outline-status", id: statusId });
    const link = h(
      "a",
      { id: uid("page"), href: pageHash(entry.id), "aria-describedby": statusId },
      entry.title,
    );
    links.set(entry.id, { link, status });
    const item = h("li", {}, link, status);
    items.set(entry.id, item);
    group?.ids.add(entry.id);
    list.append(item);
  }
  apply();
  return {
    element: top,
    links,
    reveal(id) {
      const holding = groups.find((one) => one.ids.has(id));
      if (holding && !holding.open) {
        holding.open = true;
        apply();
      }
    },
    filter(ids) {
      shown = ids;
      apply();
    },
  };
}

/** Course text a learner may search for, by property name: titles, text, questions and answers. */
const TEXT_KEYS = new Set([
  "title",
  "text",
  "prompt",
  "description",
  "match",
  "label",
  "transcript",
]);

function textsOf(value: unknown, key = ""): string[] {
  if (typeof value === "string") return TEXT_KEYS.has(key) ? [plainText(value)] : [];
  if (Array.isArray(value)) return value.flatMap((item) => textsOf(item, key));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([name, child]) =>
    name === "ext" ? [] : textsOf(child, name),
  );
}

/** Text compared without case or accents, so "Cafe" finds "café". */
const folded = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/\s+/gu, " ");

/**
 * Course search (rise.md 3F): the outline shows only the lessons whose title or content holds
 * every word typed, and the number found is announced.
 */
export function searchBox(
  pages: readonly Page[],
  outline: Outline,
  labels: Labels,
  announce: (text: string) => void,
): HTMLElement {
  const index = new Map(pages.map((page) => [page.id, folded(textsOf(page).join(" "))]));
  const id = uid("search");
  const input = h("input", { id, type: "search", class: "search-input", autocomplete: "off" });
  const none = h("p", { class: "search-none", hidden: true }, labels["search.none"]);
  input.addEventListener("input", () => {
    const words = folded(input.value).split(" ").filter(Boolean);
    if (words.length === 0) {
      outline.filter(undefined);
      none.hidden = true;
      announce("");
      return;
    }
    const found = new Set(
      pages
        .filter((page) => words.every((word) => index.get(page.id)?.includes(word)))
        .map((page) => page.id),
    );
    outline.filter(found);
    none.hidden = found.size > 0;
    announce(formatLabel(labels, "search.found", { count: found.size }));
  });
  return h(
    "div",
    { class: "search", role: "search" },
    h("label", { for: id }, labels["search.label"]),
    input,
    none,
  );
}

export interface Stepper {
  /** The step indicator and the previous arrow, above the blocks. */
  top: HTMLElement;
  /** The next arrow, below them. */
  bottom: HTMLElement;
  /** Whether block `index` of the lesson is in the step shown. */
  shows(index: number): boolean;
  /** Follows a progress change: locked steps and arrows. */
  update(): void;
  /** Whether the step holding block `index` has a step after it; then shows that one. */
  advanceFrom(index: number): boolean;
  stop(): void;
}

/** A form control or widget that uses the arrow keys itself. */
const ARROW_KEYS_OWNER =
  "input, select, textarea, audio, video, [contenteditable], [role=slider], [role=radiogroup], [role=tablist], [role=listbox], [role=menu], [role=grid]";

/**
 * A stepped lesson (rise.md 3F, rules 16 and 17; GL9; UI-BLOCKS-R58): one step at a time, with the
 * step indicator (a plain bar or numbers, or none) whose buttons go straight to a step, a previous
 * arrow at the top, and a next arrow at the bottom that first shows the rest of a step taller than
 * the screen. The up and down arrow keys do the same. A step after an unpassed gate is locked.
 * Only the steps reached count as viewed.
 */
export function stepper(
  page: LessonEntry,
  {
    labels,
    progress,
    indicator,
    first,
    elements,
    changed,
    announce,
  }: {
    labels: Labels;
    progress: Progress;
    indicator: "bar" | "numbers" | "none";
    /** The block to start at; else the first step. */
    first: number;
    /** The rendered blocks, by index. */
    elements: () => readonly (HTMLElement | undefined)[];
    changed: () => void;
    announce: (text: string) => void;
  },
): Stepper {
  const steps = stepsOf(page.blocks);
  const stepOf = (index: number) =>
    Math.max(
      0,
      steps.findIndex((step) => index < step.end),
    );
  const locked = (i: number) => (steps[i]?.start ?? 0) >= progress.shownBlocks(page);
  let current = locked(stepOf(first)) ? 0 : stepOf(first);
  const reasonId = uid("reason");
  const reason = h("p", { id: reasonId, hidden: true }, labels["steps.locked"]);
  const position = (i: number) =>
    formatLabel(labels, "steps.position", { current: i + 1, total: steps.length });
  const buttons = steps.map((_, i) => {
    const button = h(
      "button",
      { type: "button", class: "step-button", "aria-label": position(i) },
      indicator === "numbers" ? String(i + 1) : undefined,
    );
    button.addEventListener("click", () => {
      if (!locked(i)) go(i);
    });
    return button;
  });
  const previous = h("button", { type: "button", class: "step-arrow" }, labels["steps.previous"]);
  const next = h("button", { type: "button", class: "step-arrow" }, labels["steps.next"]);
  previous.addEventListener("click", () => go(current - 1));
  next.addEventListener("click", () => forward());

  /** What of the current step is still below the next arrow, in pixels. */
  const below = () => {
    const shown = elements()
      .slice(steps[current]?.start, steps[current]?.end)
      .filter((element): element is HTMLElement => element !== undefined && !element.hidden);
    const last = shown.at(-1);
    if (!last) return 0;
    return last.getBoundingClientRect().bottom - next.getBoundingClientRect().top;
  };
  const canGo = (i: number) => i >= 0 && i < steps.length && !locked(i);
  function forward(): void {
    const rest = below();
    if (rest > 1) window.scrollBy(0, Math.min(rest, window.innerHeight * 0.8));
    else if (canGo(current + 1)) go(current + 1);
    update();
  }
  function go(i: number): void {
    if (!canGo(i)) return;
    current = i;
    progress.reach(page, steps[i]?.end ?? 0);
    changed();
    window.scrollTo(0, 0);
    announce(position(i));
    const element = elements()
      .slice(steps[i]?.start, steps[i]?.end)
      .find((one) => one && !one.hidden);
    if (element) {
      element.tabIndex = -1;
      element.focus({ preventScroll: true });
    }
  }
  function update(): void {
    buttons.forEach((button, i) => {
      if (i === current) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
      button.classList.toggle("is-done", i < current);
      if (locked(i)) {
        button.setAttribute("aria-disabled", "true");
        button.setAttribute("aria-describedby", reasonId);
      } else {
        button.removeAttribute("aria-disabled");
        button.removeAttribute("aria-describedby");
      }
    });
    previous.disabled = current === 0;
    const more = below() > 1;
    next.textContent = labels[more ? "steps.more" : "steps.next"];
    next.disabled = !more && !canGo(current + 1);
  }

  // The arrow keys move between steps when no control of the page uses them; down first scrolls
  // through a tall step, as the browser does, and up does so back to its top.
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if ((event.target as Element | null)?.closest?.(ARROW_KEYS_OWNER)) return;
    if (event.key === "ArrowDown" && below() <= 1 && canGo(current + 1)) {
      event.preventDefault();
      go(current + 1);
    } else if (event.key === "ArrowUp" && window.scrollY === 0 && canGo(current - 1)) {
      event.preventDefault();
      go(current - 1);
    }
  };
  let frame = 0;
  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  if (current > 0) progress.reach(page, steps[current]?.end ?? 0);

  return {
    top: h(
      "div",
      { class: "steps-top" },
      indicator === "none"
        ? undefined
        : h(
            "nav",
            { class: `steps steps-${indicator}`, "aria-label": labels["steps.label"] },
            h("ol", {}, ...buttons.map((button) => h("li", {}, button))),
          ),
      previous,
      reason,
    ),
    bottom: h("div", { class: "steps-bottom" }, next),
    shows: (index) => index >= (steps[current]?.start ?? 0) && index < (steps[current]?.end ?? 0),
    update,
    advanceFrom(index) {
      const step = stepOf(index);
      if (steps[step]?.end !== index + 1 || !canGo(step + 1)) return false;
      go(step + 1);
      return true;
    },
    stop() {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    },
  };
}
