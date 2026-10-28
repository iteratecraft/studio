// The Blocks player shell (ENG-04): cover page, sidebar outline with progress, lesson pages
// addressed by stable id, previous and next links (rise.md §3 B, E, F, G and N), and the goodbye
// page. Every learner string comes from the label set; course text comes from the course document.
import type { Block, Course, Entry, LessonEntry } from "@course-suite/format";
import {
  cropOf,
  DEFAULT_HEADER_OVERLAY,
  DEFAULT_OVERLAY,
  overlayColors,
  themeColors,
} from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { type LessonHooks, mediaUrl, renderBlock } from "./blocks.js";
import { h, richText, uid } from "./dom.js";
import { questionMedia } from "./media.js";
import { isContinue, type PageStatus } from "./progress.js";
import { quizView } from "./quiz.js";
import { COVER_HASH, lessonNumber, type Page, pageHash, parseRoute } from "./route.js";
import type { Runtime } from "./runtime.js";
import {
  animateOnScroll,
  animates,
  headerBackground,
  setVariables,
  themePicture,
} from "./theme.js";

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
  { lms = true }: { lms?: boolean } = {},
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
    let route = parseRoute(location.hash, pages);
    if (route.kind === "unknown") {
      // A lesson address this version of the course does not have: open the cover instead.
      history.replaceState(null, "", COVER_HASH);
    }
    // A skipped cover opens the first lesson, or where the learner stopped (BLK-09, rise.md 3E).
    const skipTo = runtime.resumeAt ?? pages[0];
    if (route.kind !== "page" && course.theme?.cover?.skip && skipTo) {
      history.replaceState(null, "", pageHash(skipTo.id));
      route = parseRoute(location.hash, pages);
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
    // An address that names a block of the page shows that block (blocks-editor.md L6, W12);
    // otherwise focus moves to the new page's heading on every change of page, not on the first.
    const block =
      route.kind === "page" && route.block !== undefined
        ? [...view.element.querySelectorAll<HTMLElement>(".block")].find(
            (element) => element.dataset.block === route.block && !element.hidden,
          )
        : undefined;
    if (block) {
      block.tabIndex = -1;
      block.focus();
    } else if (!first) {
      window.scrollTo(0, 0);
      view.element.querySelector<HTMLElement>("h1")?.focus();
    }
    first = false;
  };

  function coverView(): PageView {
    // The cover's layout and options (rise.md 3E, blocks-editor.md 2.18 cover page).
    const options = course.theme?.cover ?? {};
    const layout = options.layout ?? "split-left";
    const cover =
      layout === "plain"
        ? undefined
        : course.cover && course.media.find((media) => media.key === course.cover?.key);
    // A returning learner resumes where they stopped (rise.md rule 1, §4 "Learner state"). Without
    // the button learners start from the outline (UI-BLOCKS-EDITOR-R47).
    const target = options.startButton === false ? undefined : (runtime.resumeAt ?? pages[0]);
    const begin = target
      ? h(
          "a",
          { class: "button", href: pageHash(target.id) },
          labels[runtime.resumeAt ? "course.resume" : "course.begin"],
        )
      : undefined;
    begin?.addEventListener("click", () => runtime.begin());
    // The logo above the title, in one of three sizes, square or its own shape (blocks-editor.md
    // 2.18 cover page).
    const logo = options.logo;
    const logoEntry = logo && course.media.find((media) => media.key === logo.key);
    const element = h(
      "div",
      { class: `cover cover-${layout}` },
      cover && course.cover
        ? themePicture(
            mediaUrl(cover.variantKey ?? cover.key),
            course.cover.alt ?? "",
            cover,
            cropOf(options.crop, cover.key),
            "cover-image",
            layout === "full-image",
          )
        : undefined,
      h(
        "div",
        { class: "cover-text" },
        logo && logoEntry
          ? h(
              "div",
              {
                class: `cover-logo logo-${options.logoSize ?? "small"}${options.logoSquare ? " logo-square" : ""}`,
              },
              themePicture(
                mediaUrl(logoEntry.variantKey ?? logoEntry.key),
                logo.alt ?? "",
                logoEntry,
                cropOf(logo.crop, logoEntry.key),
                "logo-image",
                options.logoSquare === true,
              ),
            )
          : undefined,
        h("h1", { tabindex: -1 }, course.title),
        course.description
          ? h("div", { class: "cover-description" }, richText(course.description, labels))
          : undefined,
        course.authors?.length && options.author !== false
          ? h(
              "p",
              { class: "cover-authors" },
              course.authors.map((author) => author.name).join(", "),
            )
          : undefined,
        begin,
      ),
    );
    if (layout === "full-image") {
      // The title over the picture under an overlay, or over the theme colour without a picture.
      const chosen = options.overlay ?? DEFAULT_OVERLAY;
      const colors = themeColors(course.theme);
      const overlay = cover
        ? overlayColors(chosen, course.theme)
        : { color: colors.theme, text: colors.themeText };
      setVariables(element, {
        "--overlay": overlay.color,
        "--overlay-opacity": String(cover ? chosen.opacity / 100 : 1),
      });
      element.classList.add(`text-${overlay.text === "#ffffff" ? "light" : "dark"}`);
      // Over the picture, under the text.
      element.lastElementChild?.before(h("div", { class: "cover-overlay" }));
    }
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
      const blocks = lessonBlocks(page, next, updates);
      body = blocks.element;
      leave = blocks.stop;
    } else {
      const quiz = quizView(page, {
        labels,
        runtime,
        next,
        refresh,
        media: (question) => questionMedia(question, { course, mediaUrl }),
        announce,
      });
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
      lessonHeader(page, previous, number, titleId),
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

  /**
   * The lesson header (blocks-editor.md 2.18 lesson headers, UI-BLOCKS-EDITOR-R46): its layout,
   * height, lesson count and author. Hidden headers keep the title for screen readers.
   */
  function lessonHeader(
    page: Page,
    previous: Page | undefined,
    number: ReturnType<typeof lessonNumber>,
    titleId: string,
  ): HTMLElement {
    const options = course.theme?.headers ?? {};
    const hidden = options.hidden === true;
    const background = hidden ? undefined : headerBackground(course.theme);
    // The author is hidden on every lesson, on the cover (which hides it everywhere) or on this
    // lesson alone (blocks-editor.md W6).
    const lesson = page.kind === "lesson" ? page : undefined;
    const author =
      hidden ||
      options.author === false ||
      course.theme?.cover?.author === false ||
      lesson?.authorHidden
        ? undefined
        : (lesson?.author?.name ?? course.authors?.[0]?.name);
    const header = h(
      "header",
      {
        class: [
          "lesson-header",
          `header-${options.height ?? "medium"}`,
          hidden && "header-hidden",
          background && `has-background text-${background.text}`,
        ]
          .filter(Boolean)
          .join(" "),
      },
      previous ? pageLink(previous, "previous", labels) : undefined,
      number && !hidden && options.lessonCount !== false
        ? h("p", { class: "lesson-number" }, formatLabel(labels, "lesson.position", number))
        : undefined,
      h(
        "h1",
        { id: titleId, tabindex: -1, class: hidden ? "visually-hidden" : undefined },
        page.title,
      ),
      author ? h("p", { class: "lesson-author" }, author) : undefined,
      page.description
        ? h("div", { class: "lesson-description" }, richText(page.description, labels))
        : undefined,
    );
    if (background) header.style.backgroundColor = background.color;
    if (!hidden && options.layout === "image") imageHeader(header, lesson);
    return header;
  }

  /**
   * The image lesson header: the lesson's own header image, else the theme's with its crop, under
   * the overlay whose text keeps 4.5:1; the theme colour stands in for a missing picture
   * (blocks-editor.md 2.18 lesson headers, default dark at 60 %).
   */
  function imageHeader(header: HTMLElement, lesson: LessonEntry | undefined): void {
    const theme = course.theme;
    const ref = lesson?.headerImage ?? theme?.headers?.image;
    const entry = ref && course.media.find((media) => media.key === ref.key);
    const chosen = theme?.headers?.overlay ?? DEFAULT_HEADER_OVERLAY;
    const colors = themeColors(theme);
    const overlay = entry
      ? overlayColors(chosen, theme)
      : { color: colors.theme, text: colors.themeText };
    const media = h("div", { class: "header-media" });
    if (entry && ref) {
      const crop =
        ref === theme?.headers?.image ? cropOf(theme.headers.image.crop, entry.key) : undefined;
      media.append(
        themePicture(
          mediaUrl(entry.variantKey ?? entry.key),
          ref.alt ?? "",
          entry,
          crop,
          "header-picture",
          true,
        ),
      );
    }
    const shade = h("div", { class: "header-overlay" });
    setVariables(shade, {
      "--overlay": overlay.color,
      "--overlay-opacity": String(entry ? chosen.opacity / 100 : 1),
    });
    media.append(shade);
    header.prepend(media);
    header.classList.add(
      "has-background",
      "header-image",
      `text-${overlay.text === "#ffffff" ? "light" : "dark"}`,
    );
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
      check: (block) => progress.check(block),
      itemDone(block, item, isDone) {
        progress.itemDone(page, block, item, isDone);
        changed();
      },
      isDone: (id) => progress.isDone(id),
      // A button that exits the course is for learning-system packages only (2.10).
      ...(lms && { exit: () => runtime.exit("exit") }),
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
    const element = h(
      "div",
      { class: "blocks" },
      ...rendered.flatMap(([, element]) => (element ? [element] : [])),
    );
    // Blocks fade in as they scroll into view, by the course's switch and their own (rise.md 3D).
    const stop = animateOnScroll(
      rendered.flatMap(([block, el]) => (el && animates(block, course) ? [el] : [])),
    );
    return { element, stop };
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
