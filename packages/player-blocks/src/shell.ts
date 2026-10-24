// The Blocks player shell (ENG-04): cover page, sidebar outline, lesson pages addressed by stable
// id, previous and next links (rise.md §3 B, E, F and N). Every learner string comes from the label
// set; course text comes from the course document.
import type { Course, Entry } from "@course-suite/format";
import { formatLabel, type Labels } from "@course-suite/labels";
import { mediaUrl, renderBlock } from "./blocks.js";
import { h, richText, uid } from "./dom.js";
import { COVER_HASH, lessonNumber, type Page, pageHash, pagesOf, parseRoute } from "./route.js";

/** Below this width the outline starts closed and covers the content when opened (UI-BLOCKS-EDITOR-R53, R55). */
export const WIDE_LAYOUT = "(min-width: 992px)";

export function startShell(root: HTMLElement, course: Course, labels: Labels): void {
  const pages = pagesOf(course);
  const wide = window.matchMedia(WIDE_LAYOUT);
  const main = h("main", { id: "content", tabindex: -1, "aria-label": labels["sr.content"] });
  const toggle = h("button", {
    type: "button",
    class: "outline-toggle",
    "aria-controls": "outline",
  });
  const links = new Map<string, HTMLAnchorElement>();
  const outline = h(
    "nav",
    { id: "outline", class: "outline", "aria-label": labels["sr.outline"] },
    h("p", { class: "outline-course" }, course.title),
    outlineList(course.entries, links),
  );

  const setOpen = (open: boolean) => {
    outline.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = labels[open ? "outline.hide" : "outline.show"];
    root.classList.toggle("outline-open", open);
  };
  setOpen(wide.matches);
  wide.addEventListener("change", () => setOpen(wide.matches));
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  outline.addEventListener("click", (event) => {
    if (!wide.matches && (event.target as Element).closest("a")) setOpen(false);
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
  );

  let first = true;
  const show = () => {
    const route = parseRoute(location.hash, pages);
    if (route.kind === "unknown") {
      // A lesson address this version of the course does not have: open the cover instead.
      history.replaceState(null, "", COVER_HASH);
    }
    const page = route.kind === "page" ? route.page : undefined;
    for (const [id, link] of links) {
      if (id === page?.id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    const view = page ? lessonView(course, pages, page, labels) : coverView(course, pages, labels);
    main.replaceChildren(view);
    document.title = page ? [page.title, course.title].join(" - ") : course.title;
    // Focus moves to the new page's heading on every change of page, not on the first one.
    if (!first) {
      window.scrollTo(0, 0);
      view.querySelector<HTMLElement>("h1")?.focus();
    }
    first = false;
  };
  window.addEventListener("hashchange", show);
  show();
}

function outlineList(
  entries: readonly Entry[],
  links: Map<string, HTMLAnchorElement>,
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
    const link = h("a", { href: pageHash(entry.id) }, entry.title);
    links.set(entry.id, link);
    list.append(h("li", {}, link));
  }
  return top;
}

function coverView(course: Course, pages: readonly Page[], labels: Labels): HTMLElement {
  const cover = course.cover && course.media.find((media) => media.key === course.cover?.key);
  const firstPage = pages[0];
  return h(
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
        ? h("p", { class: "cover-authors" }, course.authors.map((author) => author.name).join(", "))
        : undefined,
      firstPage
        ? h("a", { class: "button", href: pageHash(firstPage.id) }, labels["course.begin"])
        : undefined,
    ),
  );
}

function lessonView(
  course: Course,
  pages: readonly Page[],
  page: Page,
  labels: Labels,
): HTMLElement {
  const index = pages.indexOf(page);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  const number = lessonNumber(pages, page);
  const titleId = uid("lesson");
  const blocks =
    page.kind === "lesson"
      ? page.blocks.map((block) => renderBlock(block, { course, labels }))
      : []; // The quiz runtime (M1-12) fills quiz pages.
  return h(
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
    h("div", { class: "blocks" }, ...blocks),
    previous || next
      ? h(
          "nav",
          { class: "lesson-nav", "aria-label": labels["sr.lessonNavigation"] },
          previous ? pageLink(previous, "previous", labels) : undefined,
          next ? pageLink(next, "next", labels) : undefined,
        )
      : undefined,
  );
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
