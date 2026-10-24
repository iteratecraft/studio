// The Blocks player shell (ENG-04): cover page, sidebar outline with progress, lesson pages
// addressed by stable id, previous and next links (rise.md §3 B, E, F, G and N), and the goodbye
// page. Every learner string comes from the label set; course text comes from the course document.
import type { Block, Course, Entry, LessonEntry } from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { type LessonHooks, mediaUrl, renderBlock } from "./blocks.js";
import { h, richText, uid } from "./dom.js";
import { isContinue, type PageStatus } from "./progress.js";
import { quizView } from "./quiz.js";
import { COVER_HASH, lessonNumber, type Page, pageHash, parseRoute } from "./route.js";
import type { Runtime } from "./runtime.js";

/** Below this width the outline starts closed and covers the content when opened (UI-BLOCKS-EDITOR-R53, R55). */
export const WIDE_LAYOUT = "(min-width: 992px)";

interface PageView {
  element: HTMLElement;
  /** Follows a progress change: gates, links, statuses. */
  refresh(): void;
  /** The learner leaves the page. */
  leave(): void;
}

export function startShell(
  root: HTMLElement,
  course: Course,
  labels: Labels,
  runtime: Runtime,
): void {
  const { progress } = runtime;
  const pages = progress.pages;
  const wide = window.matchMedia(WIDE_LAYOUT);
  const main = h("main", { id: "content", tabindex: -1, "aria-label": labels["sr.content"] });
  const toggle = h("button", {
    type: "button",
    class: "outline-toggle",
    "aria-controls": "outline",
  });
  const links = new Map<string, { link: HTMLAnchorElement; status: HTMLElement }>();
  const courseProgress = h("p", { class: "outline-progress" });
  const exit = course.publish?.exitLink
    ? h("button", { type: "button", class: "outline-exit" }, labels["course.exit"])
    : undefined;
  const outline = h(
    "nav",
    { id: "outline", class: "outline", "aria-label": labels["sr.outline"] },
    h("p", { class: "outline-course" }, course.title),
    courseProgress,
    outlineList(course.entries, links),
    exit,
  );
  // Polite announcements: a lesson done, content revealed (UI-BLOCKS-R43).
  const announcer = h("p", { class: "visually-hidden", role: "status" });
  const announce = (text: string) => {
    announcer.textContent = text;
  };

  const setOpen = (open: boolean) => {
    // Focus inside the outline as it hides would be lost; the button that opens it takes it.
    const refocus = !open && outline.contains(document.activeElement);
    outline.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = labels[open ? "outline.hide" : "outline.show"];
    root.classList.toggle("outline-open", open);
    if (refocus) toggle.focus();
  };
  setOpen(wide.matches);
  wide.addEventListener("change", () => setOpen(wide.matches));
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  outline.addEventListener("click", (event) => {
    if (!wide.matches && (event.target as Element).closest("a[href]")) setOpen(false);
  });
  // On a narrow screen the open outline covers the content, so tabbing out of it closes it and the
  // focused control is never hidden behind it (WCAG 2.4.11).
  outline.addEventListener("focusout", (event) => {
    const next = event.relatedTarget as Node | null;
    if (!wide.matches && next && !outline.contains(next) && next !== toggle) setOpen(false);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !wide.matches && !outline.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  // The skip link focuses the content without touching the address, which holds the lesson.
  const skip = h("a", { class: "skip-link", href: "#content" }, labels["sr.skipToContent"]);
  skip.addEventListener("click", (event) => {
    event.preventDefault();
    main.focus();
  });

  root.replaceChildren(
    skip,
    h("header", { class: "topbar" }, toggle, h("p", { class: "topbar-title" }, course.title)),
    h("div", { class: "layout" }, outline, main),
    announcer,
  );

  let view: PageView | undefined;

  /** Outline statuses, the course percentage (rise.md §3 F) and the open page follow progress. */
  function refresh(): void {
    for (const page of pages) {
      const entry = links.get(page.id);
      if (!entry) continue;
      const state = progress.status(page);
      // A locked lesson stays in the outline as a disabled link whose name says why (UI-BLOCKS-R26,
      // UI-ACCESSIBILITY-R37); it has no address, so it is not a tab stop.
      const { link, status } = entry;
      if (state === "locked") {
        link.removeAttribute("href");
        link.removeAttribute("aria-describedby");
        link.setAttribute("role", "link");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("aria-labelledby", `${link.id} ${status.id}`);
      } else {
        link.setAttribute("href", pageHash(page.id));
        link.setAttribute("aria-describedby", status.id);
        link.removeAttribute("role");
        link.removeAttribute("aria-disabled");
        link.removeAttribute("aria-labelledby");
      }
      link.parentElement?.setAttribute("data-status", state);
      status.textContent = statusText(state, progress.percent(page), labels);
    }
    courseProgress.textContent = formatLabel(labels, "course.progress", {
      percent: progress.coursePercent(),
    });
    view?.refresh();
  }

  function goodbye(): void {
    view?.leave();
    view = undefined;
    const heading = h("h1", { tabindex: -1 }, course.title);
    root.replaceChildren(
      h("main", { class: "goodbye" }, heading, h("p", {}, labels["course.goodbye"])),
    );
    document.title = course.title;
    heading.focus();
  }
  runtime.on((event) => {
    if (event.type === "exit") goodbye();
  });
  exit?.addEventListener("click", () => runtime.exit("exit"));

  let first = true;
  const show = () => {
    if (runtime.ended) return;
    const route = parseRoute(location.hash, pages);
    if (route.kind === "unknown") {
      // A lesson address this version of the course does not have: open the cover instead.
      history.replaceState(null, "", COVER_HASH);
    }
    const page = route.kind === "page" ? route.page : undefined;
    view?.leave();
    if (page) runtime.enter(page);
    for (const [id, { link }] of links) {
      if (id === page?.id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    view = page ? lessonView(page) : coverView();
    main.replaceChildren(view.element);
    refresh();
    document.title = page ? [page.title, course.title].join(" - ") : course.title;
    // Focus moves to the new page's heading on every change of page, not on the first one.
    if (!first) {
      window.scrollTo(0, 0);
      view.element.querySelector<HTMLElement>("h1")?.focus();
    }
    first = false;
  };

  function coverView(): PageView {
    const cover = course.cover && course.media.find((media) => media.key === course.cover?.key);
    // A returning learner resumes where they stopped (rise.md rule 1, §4 "Learner state").
    const target = runtime.resumeAt ?? pages[0];
    const begin = target
      ? h(
          "a",
          { class: "button", href: pageHash(target.id) },
          labels[runtime.resumeAt ? "course.resume" : "course.begin"],
        )
      : undefined;
    begin?.addEventListener("click", () => runtime.begin());
    const element = h(
      "div",
      { class: "cover" },
      cover && course.cover
        ? h("img", {
            class: "cover-image",
            src: mediaUrl(cover.variantKey ?? cover.key),
            alt: course.cover.alt ?? "",
            width: cover.width,
            height: cover.height,
          })
        : undefined,
      h(
        "div",
        { class: "cover-text" },
        h("h1", { tabindex: -1 }, course.title),
        course.description
          ? h("div", { class: "cover-description" }, richText(course.description, labels))
          : undefined,
        course.authors?.length
          ? h(
              "p",
              { class: "cover-authors" },
              course.authors.map((author) => author.name).join(", "),
            )
          : undefined,
        begin,
      ),
    );
    return { element, refresh() {}, leave() {} };
  }

  function lessonView(page: Page): PageView {
    const index = pages.indexOf(page);
    const previous = pages[index - 1];
    const next = pages[index + 1];
    const number = lessonNumber(pages, page);
    const titleId = uid("lesson");
    const updates: (() => void)[] = [];
    let leave = () => {};
    const blocker = progress.lockedBy(page);
    let body: HTMLElement;
    if (blocker) {
      // Opened by its address while locked: the lesson says so and points back (UI-BLOCKS-R26).
      body = h(
        "div",
        { class: "locked-notice" },
        h("p", {}, labels["outline.lessonLocked"]),
        h(
          "a",
          { href: pageHash(blocker.id) },
          formatLabel(labels, "lesson.finishFirst", { lesson: blocker.title }),
        ),
      );
    } else if (page.kind === "lesson") {
      body = lessonBlocks(page, next, updates);
    } else {
      const quiz = quizView(page, { labels, runtime, next, refresh });
      leave = quiz.stop;
      body = quiz.element;
    }

    const markDone =
      page.kind === "lesson" && !blocker
        ? h("button", { type: "button", class: "button mark-done" }, labels["lesson.markDone"])
        : undefined;
    markDone?.addEventListener("click", () => {
      progress.markDone(page);
      runtime.changed();
      refresh();
      document.getElementById(titleId)?.focus(); // the button is gone; the lesson goes on
    });
    if (markDone) {
      updates.push(() => {
        markDone.hidden = !progress.canMarkDone(page);
      });
    }

    const nav = h("nav", { class: "lesson-nav", "aria-label": labels["sr.lessonNavigation"] });
    updates.push(() => {
      nav.hidden = !previous && !next;
      nav.replaceChildren(
        ...(previous ? [pageLink(previous, "previous", labels)] : []),
        ...(next ? [nextLink(next)] : []),
      );
    });

    let wasDone = progress.isDone(page.id);
    updates.push(() => {
      const done = progress.isDone(page.id);
      if (done && !wasDone) announce(labels["sr.lessonDone"]);
      wasDone = done;
    });

    const element = h(
      "article",
      { class: `lesson lesson-${page.kind}`, "aria-labelledby": titleId },
      h(
        "header",
        { class: "lesson-header" },
        previous ? pageLink(previous, "previous", labels) : undefined,
        number
          ? h("p", { class: "lesson-number" }, formatLabel(labels, "lesson.position", number))
          : undefined,
        h("h1", { id: titleId, tabindex: -1 }, page.title),
        page.description
          ? h("div", { class: "lesson-description" }, richText(page.description, labels))
          : undefined,
      ),
      body,
      markDone ? h("div", { class: "lesson-actions" }, markDone) : undefined,
      nav,
    );
    return {
      element,
      refresh: () => {
        for (const update of updates) update();
      },
      leave,
    };
  }

  /** The next page's link, or its title marked unavailable with the reason (UI-BLOCKS-R26). */
  function nextLink(next: Page): HTMLElement {
    if (!progress.lockedBy(next)) return pageLink(next, "next", labels);
    return h(
      "p",
      { class: "page-link page-link-next is-locked" },
      h("span", { class: "page-link-label" }, labels["lesson.next"]),
      " ",
      h("span", { class: "page-link-title" }, next.title),
      h("span", { class: "page-link-reason" }, labels["outline.lessonLocked"]),
    );
  }

  /** The blocks of a lesson, each shown once the gates above it are passed (rule 13, UI-BLOCKS-R43). */
  function lessonBlocks(page: LessonEntry, next: Page | undefined, updates: (() => void)[]) {
    const rendered: [Block, HTMLElement | undefined][] = [];
    const changed = () => {
      runtime.changed();
      refresh();
    };
    const hooks: LessonHooks = {
      continueReady: (block) => progress.continueReady(page, block),
      pressContinue(block) {
        const before = progress.shownBlocks(page);
        progress.pressContinue(page, block);
        changed();
        // The last block of a lesson finishes it and opens the next lesson.
        if (page.blocks.at(-1) === block && next && !progress.lockedBy(next)) {
          location.hash = pageHash(next.id);
          return;
        }
        focusFirst(rendered.slice(before));
      },
      answered(block, response, correct) {
        progress.answerCheck(page, block, response, correct);
        changed();
      },
      saved: (id) => progress.response(id),
      watch(update) {
        updates.push(update);
        update();
      },
    };
    for (const block of page.blocks) {
      rendered.push([block, renderBlock(block, { course, labels, lesson: hooks })]);
    }
    updates.push(() => {
      const shown = progress.shownBlocks(page);
      rendered.forEach(([block, element], i) => {
        // A pressed continue block has done its job and steps aside.
        if (element)
          element.hidden = i >= shown || (isContinue(block) && progress.isDone(block.id));
      });
    });
    return h(
      "div",
      { class: "blocks" },
      ...rendered.flatMap(([, element]) => (element ? [element] : [])),
    );
  }

  /** Focus moves to the first block a gate revealed, so keyboard users carry on from there. */
  function focusFirst(revealed: [Block, HTMLElement | undefined][]): void {
    const element = revealed.find(([, el]) => el && !el.hidden)?.[1];
    if (!element) return;
    element.tabIndex = -1;
    element.focus();
  }

  window.addEventListener("hashchange", show);
  show();
}

/** What the outline says beside a page (rise.md §3 F, UI-BLOCKS-R26, R36). */
function statusText(status: PageStatus, percent: number, labels: Labels): string {
  switch (status) {
    case "done":
      return labels["outline.lessonDone"];
    case "failed":
      return labels["quiz.failed"];
    case "locked":
      return labels["outline.lessonLocked"];
    case "in-progress":
      return formatLabel(labels, "course.progress", { percent });
    case "not-started":
      return "";
  }
}

function outlineList(
  entries: readonly Entry[],
  links: Map<string, { link: HTMLAnchorElement; status: HTMLElement }>,
): HTMLElement {
  const top = h("ul", { class: "outline-list" });
  let list = top;
  for (const entry of entries) {
    if (entry.kind === "section") {
      const titleId = uid("section");
      list = h("ul", { "aria-labelledby": titleId });
      top.append(
        h("li", { class: "outline-section" }, h("span", { id: titleId }, entry.title), list),
      );
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
    list.append(h("li", {}, link, status));
  }
  return top;
}

/** A link to the previous or next page that names it (rise.md §3 F). */
function pageLink(page: Page, direction: "previous" | "next", labels: Labels): HTMLAnchorElement {
  return h(
    "a",
    { class: `page-link page-link-${direction}`, href: pageHash(page.id) },
    h(
      "span",
      { class: "page-link-label" },
      labels[direction === "previous" ? "lesson.previous" : "lesson.next"],
    ),
    " ",
    h("span", { class: "page-link-title" }, page.title),
  );
}
