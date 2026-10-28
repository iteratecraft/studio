// The interactive blocks (M2-14, BLK-06; rise.md 3C, 3G, 3N; blocks-interactions.md 2.2 to 2.5,
// 2.8, 2.10, 4, UI-BLOCKS-R1 to R8, R12, R13, R18, R19, R52, R56; accessibility.md
// UI-ACCESSIBILITY-R36, R40): accordion, tabs, labeled graphic, process, flashcard grid and stack,
// button and button stack. Each shows exactly the items the progress engine waits for
// (shownSections, shownMarkers, shownSteps, flashcards) and tells the lesson as each is opened,
// shown or turned over. What the learner opened belongs to the page and starts again on a return
// (UI-BLOCKS-R5); progress keeps what was done. Buttons never count as required (UI-BLOCKS-R19).
// An item's media is a picture, a video or a web embed, and it may have audio (2.1 to 2.4, 2.8,
// A10, A11), drawn as the media blocks draw theirs (media.ts).
import type {
  Block,
  ButtonItem,
  CardSide,
  ContentItem,
  FlashcardItem,
  ItemEmbed,
  MediaRef,
} from "@course-suite/format";
import {
  deepestHeadingLevel,
  isRelativeLink,
  isSafeLink,
  textOn,
  variantSettings,
} from "@course-suite/format";
import { formatLabel, type LabelKey } from "@course-suite/labels";
import { h, linkOut, richText, uid } from "./dom.js";
import { audioOf, embedFrame, isVideo, itemVideo } from "./media.js";
import { flashcards, shownMarkers, shownSections, shownSteps } from "./progress.js";
import { pageHash, pagesOf } from "./route.js";
import {
  carousel,
  INFO,
  icon,
  lessonBlocks,
  NEXT,
  PREVIOUS,
  picture,
  type StaticContext,
  zoomable,
} from "./static.js";

type Renderer = (block: Block, context: StaticContext) => HTMLElement | undefined;

const px = (value: number) => `${value}px`;
const CHEVRON = "M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z";
const TURN = "M12 4a8 8 0 0 0-7.4 5H2l3.5 4L9 9H6.8A6 6 0 1 1 6 12H4a8 8 0 1 0 8-8z";
const CLOSE =
  "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z";
const START = "M6 3h2v18H6zm3 1h10l-2.5 4L19 12H9z";
const END = "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z";

/** Our own marker icons (MARKER_ICONS) and the label naming each to screen readers. */
const MARKER_GLYPHS: Readonly<Record<string, [path: string, name: LabelKey]>> = {
  plus: ["M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z", "marker.iconPlus"],
  info: [INFO, "marker.iconInfo"],
  question: [
    "M11 18h2v-2h-2zm1-14a4 4 0 0 0-4 4h2a2 2 0 1 1 2 2c-.6 0-1 .4-1 1v3h2v-2.2A4 4 0 0 0 12 4z",
    "marker.iconQuestion",
  ],
  star: [
    "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
    "marker.iconStar",
  ],
  pin: [
    "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
    "marker.iconPin",
  ],
  eye: [
    "M12 5C7 5 3 8.6 1.5 12 3 15.4 7 19 12 19s9-3.6 10.5-7C21 8.6 17 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
    "marker.iconEye",
  ],
};

/** Item `id` of `block` is done: once, and not after the whole block is. */
function itemDone({ lesson }: StaticContext, block: Block, id: string): void {
  if (lesson && !lesson.isDone(id) && !lesson.isDone(block.id)) lesson.itemDone(block, id);
}

/**
 * The level of the item titles' heading elements: the author's, else one below the nearest
 * heading above the block, so the page's outline never skips a level (BLK-04, accessibility.md W18).
 */
function itemLevel(block: Block, context: StaticContext): number {
  const { headingLevel } = variantSettings<{ headingLevel?: number }>(block);
  if (headingLevel !== undefined) return headingLevel;
  const blocks = lessonBlocks(block, context);
  return deepestHeadingLevel(
    blocks,
    blocks.findIndex((other) => other.id === block.id),
  );
}

const title = (html: string | undefined, context: StaticContext) =>
  richText(html ?? "", context.labels);

/** The plain text of an item title, for names that join it with other words. */
const plain = (html: string | undefined, context: StaticContext) =>
  (h("span", {}, title(html, context)).textContent ?? "").trim();

/** What an item may show besides its title (ContentItem, MarkerItem, StepItem, CardSide). */
interface ItemParts {
  text?: string;
  media?: MediaRef;
  embed?: ItemEmbed;
  audio?: MediaRef;
}

type AudioPosition = "top" | "bottom";

/**
 * An item's media (A10): its web embed, loaded only when the learner asks; its video; or its
 * picture with class `image`, which may enlarge.
 */
function itemMedia(
  item: ItemParts,
  context: StaticContext,
  zoom: boolean,
  image = "image",
): HTMLElement | undefined {
  if (item.embed) {
    const { embedUrl, provider } = item.embed;
    return h("div", { class: "item-embed" }, embedFrame(embedUrl, provider, context.labels));
  }
  if (item.media && isVideo(item.media, context)) {
    const video = itemVideo(item.media, context);
    return video && h("div", { class: "item-video" }, video);
  }
  const shown = picture(item.media, context, image);
  return shown && zoomable(shown, context.labels, zoom);
}

/**
 * An item's media, its text and its audio player (A11), the player above or below the rest
 * (2.1 "audio position"); `name` is what the item is called, which names its player.
 */
function body(
  item: ItemParts,
  name: string,
  context: StaticContext,
  zoom: boolean,
  at: AudioPosition = "bottom",
  image = "image",
): (HTMLElement | undefined)[] {
  const { labels } = context;
  const audio = audioOf(
    item.audio,
    name ? formatLabel(labels, "item.audio", { title: name }) : labels["narration.label"],
    context,
  );
  return [
    at === "top" ? audio : undefined,
    itemMedia(item, context, zoom, image),
    item.text ? h("div", { class: "text-body" }, richText(item.text, labels)) : undefined,
    at === "bottom" ? audio : undefined,
  ];
}

/**
 * Accordion (2.2, UI-BLOCKS-R1): a heading per section with a button that opens its panel, a named
 * region; several may be open, or one at a time. A section opened is done.
 */
const accordion: Renderer = (block, context) => {
  const sections = shownSections(block);
  if (sections.length === 0) return undefined;
  const s = variantSettings<{ oneAtATime: boolean; zoom: boolean; audioPosition: AudioPosition }>(
    block,
  );
  const level = itemLevel(block, context);
  const parts: [HTMLButtonElement, HTMLElement][] = [];
  const set = ([button, panel]: [HTMLButtonElement, HTMLElement], open: boolean) => {
    button.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
  };
  const items = sections.map((item: ContentItem) => {
    const buttonId = uid("section");
    const panelId = uid("panel");
    const button = h(
      "button",
      {
        type: "button",
        class: "accordion-button",
        id: buttonId,
        "aria-expanded": "false",
        "aria-controls": panelId,
      },
      h("span", { class: "accordion-title" }, title(item.title, context)),
      icon(CHEVRON, "icon accordion-icon"),
    );
    const panel = h(
      "div",
      { class: "accordion-panel", id: panelId, role: "region", "aria-labelledby": buttonId },
      ...body(item, plain(item.title, context), context, s.zoom, s.audioPosition),
    );
    panel.hidden = true;
    const part: [HTMLButtonElement, HTMLElement] = [button, panel];
    parts.push(part);
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      if (open && s.oneAtATime) for (const other of parts) set(other, false);
      set(part, open);
      if (open) itemDone(context, block, item.id);
    });
    return h(
      "div",
      { class: "accordion-item card" },
      h(`h${level}` as "h2", { class: "accordion-heading" }, button),
      panel,
    );
  });
  return h("div", { class: "accordion" }, ...items);
};

/**
 * Tabs (2.3, UI-BLOCKS-R2, R52; rise.md 3N): the first tab is chosen and counts as seen as soon as
 * the block shows; arrows move the choice and wrap, Home and End go to the ends; only the chosen
 * panel is in the page. The strip scrolls sideways when the tabs do not fit, never the page.
 */
const tabs: Renderer = (block, context) => {
  const sections = shownSections(block);
  if (sections.length === 0) return undefined;
  const s = variantSettings<{ zoom: boolean; audioPosition: AudioPosition }>(block);
  const parts = sections.map((item) => {
    const tabId = uid("tab");
    const panelId = uid("tabpanel");
    const tab = h(
      "button",
      { type: "button", role: "tab", class: "tab", id: tabId, "aria-controls": panelId },
      title(item.title, context),
    );
    const panel = h(
      "div",
      {
        class: "tab-panel card",
        role: "tabpanel",
        id: panelId,
        "aria-labelledby": tabId,
        tabindex: 0,
      },
      ...body(item, plain(item.title, context), context, s.zoom, s.audioPosition),
    );
    return { item, tab, panel };
  });
  let current = 0;
  const select = (index: number, focus: boolean) => {
    current = (index + parts.length) % parts.length;
    parts.forEach(({ tab, panel }, i) => {
      tab.setAttribute("aria-selected", String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
      panel.hidden = i !== current;
    });
    const chosen = parts[current];
    if (!chosen) return;
    if (focus) {
      chosen.tab.focus();
      chosen.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    itemDone(context, block, chosen.item.id);
  };
  const list = h("div", { class: "tab-list", role: "tablist" }, ...parts.map(({ tab }) => tab));
  parts.forEach(({ tab }, i) => {
    tab.addEventListener("click", () => select(i, false));
  });
  list.addEventListener("keydown", (event) => {
    const to = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: parts.length - 1,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    select(to, true);
  });
  parts.forEach(({ tab, panel }, i) => {
    tab.setAttribute("aria-selected", String(i === 0));
    tab.tabIndex = i === 0 ? 0 : -1;
    panel.hidden = i !== 0;
  });
  // Once the lesson page is built: the first tab counts as soon as the block shows.
  queueMicrotask(() => itemDone(context, block, parts[0]?.item.id ?? ""));
  return h(
    "div",
    { class: "tabs" },
    list,
    h("div", { class: "tab-panels" }, ...parts.map(({ panel }) => panel)),
  );
};

/**
 * Labeled graphic (2.4, W2; UI-BLOCKS-R3 to R5; UI-ACCESSIBILITY-R36): markers placed by
 * percentage on the picture, so they keep their point at every width, as buttons in a list in the
 * figure. Each names its number, its icon, its title and whether it was viewed. A marker opens its
 * card, one at a time, with previous and next (also Left and Right) through the markers in list
 * order; Escape closes it and focus goes back to the marker. A marker opened is done.
 */
const labeledGraphic: Renderer = (block, context) => {
  const { labels } = context;
  const image = picture(block.media?.[0], context, "graphic-image");
  if (!image) return undefined;
  const markers = shownMarkers(context.course, block);
  const s = variantSettings<{
    cornerRadius: number;
    markerColor?: string;
    markerContrast: "auto" | "light" | "dark";
    zoom: boolean;
    audioPosition: AudioPosition;
  }>(block);
  image.style.borderRadius = px(s.cornerRadius);
  const level = itemLevel(block, context);
  const viewed = new Set<string>();
  const list = h("ul", { class: "markers" });
  if (s.markerColor) {
    list.style.setProperty("--marker", s.markerColor);
    const text = textOn(s.markerColor, s.markerContrast) === "light" ? "#ffffff" : "#000000";
    list.style.setProperty("--marker-text", text);
  }
  const cardTitleId = uid("marker");
  const card = h("div", { class: "marker-card card", role: "dialog", tabindex: -1 });
  card.hidden = true;
  let open = -1;

  const glyph = (i: number) => {
    const name = markers[i]?.icon;
    return name && name !== "number" ? MARKER_GLYPHS[name] : undefined;
  };
  // Each part of a marker's name is a label template, so a translation sets the words, their
  // order and the punctuation: "Marker 2 (star): Saddle, not viewed".
  const markerName = (i: number) => {
    const name = formatLabel(labels, "marker.name", { number: i + 1 });
    const found = glyph(i);
    return found
      ? formatLabel(labels, "marker.withIcon", { marker: name, icon: labels[found[1]] })
      : name;
  };
  const nameOf = (i: number) => {
    const marker = markers[i];
    const text = plain(marker?.title, context);
    const named = text
      ? formatLabel(labels, "marker.withTitle", { marker: markerName(i), title: text })
      : markerName(i);
    const state = labels[viewed.has(marker?.id ?? "") ? "marker.viewed" : "marker.notViewed"];
    return formatLabel(labels, "marker.state", { marker: named, state });
  };
  const buttons = markers.map((marker, i) => {
    const found = glyph(i);
    const button = h(
      "button",
      { type: "button", class: "marker", "aria-haspopup": "dialog", "aria-expanded": "false" },
      found
        ? icon(found[0], "marker-icon")
        : h("span", { class: "marker-number", "aria-hidden": "true" }, String(i + 1)),
    );
    button.style.left = `${marker.x}%`;
    button.style.top = `${marker.y}%`;
    button.addEventListener("click", () => (open === i ? close(true) : show(i, true)));
    list.append(h("li", {}, button));
    return button;
  });
  const update = () =>
    buttons.forEach((button, i) => {
      button.setAttribute("aria-label", nameOf(i));
      button.setAttribute("aria-expanded", String(i === open));
      button.toggleAttribute("data-viewed", viewed.has(markers[i]?.id ?? ""));
    });

  const close = (focus: boolean) => {
    const was = open;
    open = -1;
    card.hidden = true;
    update();
    if (focus) buttons[was]?.focus();
  };
  const show = (i: number, focus: boolean) => {
    const marker = markers[i];
    if (!marker) return;
    open = i;
    viewed.add(marker.id);
    itemDone(context, block, marker.id);
    const heading = h(`h${level}` as "h2", { class: "marker-title", id: cardTitleId });
    heading.append(marker.title ? title(marker.title, context) : markerName(i));
    const step = (path: string, label: LabelKey, to: number) => {
      const button = h(
        "button",
        { type: "button", class: "carousel-button" },
        icon(path, "icon"),
        h("span", { class: "visually-hidden" }, labels[label]),
      );
      const ends = to < 0 || to >= markers.length;
      button.setAttribute("aria-disabled", String(ends));
      button.addEventListener("click", () => {
        if (!ends) show(to, false);
      });
      return button;
    };
    const closer = h(
      "button",
      { type: "button", class: "marker-close" },
      icon(CLOSE, "icon"),
      h("span", { class: "visually-hidden" }, labels["marker.close"]),
    );
    closer.addEventListener("click", () => close(true));
    card.setAttribute("aria-labelledby", cardTitleId);
    card.replaceChildren(
      closer,
      heading,
      ...body(
        marker,
        plain(marker.title, context) || markerName(i),
        context,
        s.zoom,
        s.audioPosition,
      ).filter((part) => part !== undefined),
      h(
        "div",
        { class: "carousel-controls" },
        step(PREVIOUS, "marker.previous", i - 1),
        h(
          "p",
          { class: "carousel-position", "aria-live": "polite" },
          formatLabel(labels, "process.card", { current: i + 1, total: markers.length }),
        ),
        step(NEXT, "marker.next", i + 1),
      ),
    );
    card.hidden = false;
    update();
    if (focus) card.focus();
  };
  card.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const to = open + (event.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= markers.length) return;
      event.preventDefault();
      show(to, false);
    }
  });
  list.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open >= 0) close(true);
  });
  update();
  return h(
    "div",
    { class: "labeled-graphic" },
    h(
      "figure",
      { class: "graphic", "aria-label": labels["sr.labeledGraphic"] },
      image,
      markers.length > 0 ? list : undefined,
    ),
    card,
  );
};

/**
 * Process (2.5, W3; UI-BLOCKS-R6 to R8): one card at a time, an introduction, numbered steps and a
 * summary, with a strip of a button per card between previous and next. The introduction's begin
 * button goes to the first step, the summary's start-again button back to the start; hidden cards
 * are left out. Arrows on the strip move one card, and focus stays on the strip. A card shown is
 * done; the first counts as soon as the block shows.
 */
const process: Renderer = (block, context) => {
  const { labels } = context;
  const cards = shownSteps(block);
  if (cards.length === 0) return undefined;
  const s = variantSettings<{
    stepLabel: boolean;
    stepWord?: string;
    zoom: boolean;
    audioPosition: AudioPosition;
  }>(block);
  const level = itemLevel(block, context);
  const word = s.stepWord?.trim() || labels["process.step"];
  const total = cards.length;
  let number = 0;
  const parts = cards.map((card, i) => {
    const step = card.role === "step" ? ++number : undefined;
    const name =
      card.role === "intro"
        ? labels["process.intro"]
        : card.role === "summary"
          ? labels["process.summary"]
          : formatLabel(labels, "process.stepName", { word, number: step ?? 0 });
    const strip = h(
      "button",
      { type: "button", class: "process-strip-button", "aria-label": name },
      step === undefined
        ? icon(card.role === "intro" ? START : END, "icon")
        : h("span", { "aria-hidden": "true" }, String(step)),
    );
    let action: HTMLButtonElement | undefined;
    if (card.role === "intro" && i < total - 1) {
      action = h("button", { type: "button", class: "button" }, labels["process.begin"]);
      action.addEventListener("click", () => show(i + 1, true));
    } else if (card.role === "summary" && i > 0) {
      action = h("button", { type: "button", class: "button" }, labels["process.again"]);
      action.addEventListener("click", () => show(0, true));
    }
    const element = h(
      "div",
      {
        class: `process-card card process-${card.role}`,
        role: "group",
        "aria-roledescription": labels["sr.slide"],
        "aria-label": formatLabel(labels, "process.card", { current: i + 1, total }),
      },
      step !== undefined && s.stepLabel ? h("p", { class: "process-step" }, name) : undefined,
      card.title
        ? h(`h${level}` as "h2", { class: "process-title" }, title(card.title, context))
        : undefined,
      ...body(card, plain(card.title, context) || name, context, s.zoom, s.audioPosition),
      action ? h("div", { class: "actions" }, action) : undefined,
    );
    if (step !== undefined && !s.stepLabel) strip.setAttribute("aria-label", String(step));
    return { card, strip, element };
  });
  const status = h("p", { class: "visually-hidden", "aria-live": "polite" });
  const arrow = (path: string, label: LabelKey) =>
    h(
      "button",
      { type: "button", class: "carousel-button" },
      icon(path, "icon"),
      h("span", { class: "visually-hidden" }, labels[label]),
    );
  const previous = arrow(PREVIOUS, "process.previous");
  const next = arrow(NEXT, "process.next");
  let current = 0;
  function show(to: number, focusStrip: boolean): void {
    current = Math.max(0, Math.min(total - 1, to));
    parts.forEach(({ strip, element }, i) => {
      element.hidden = i !== current;
      if (i === current) strip.setAttribute("aria-current", "step");
      else strip.removeAttribute("aria-current");
    });
    previous.setAttribute("aria-disabled", String(current === 0));
    next.setAttribute("aria-disabled", String(current === total - 1));
    status.textContent = formatLabel(labels, "process.card", { current: current + 1, total });
    const shown = parts[current];
    if (!shown) return;
    if (focusStrip) shown.strip.focus();
    itemDone(context, block, shown.card.id);
  }
  previous.addEventListener("click", () => show(current - 1, false));
  next.addEventListener("click", () => show(current + 1, false));
  parts.forEach(({ strip }, i) => {
    strip.addEventListener("click", () => show(i, false));
  });
  const strip = h(
    "div",
    { class: "process-strip", role: "group", "aria-label": labels["process.steps"] },
    ...parts.map((part) => part.strip),
  );
  strip.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    show(current + (event.key === "ArrowLeft" ? -1 : 1), true);
  });
  // Shown without counting, then counted once the lesson page is built (UI-BLOCKS-R52).
  parts.forEach(({ element }, i) => {
    element.hidden = i !== 0;
  });
  parts[0]?.strip.setAttribute("aria-current", "step");
  previous.setAttribute("aria-disabled", "true");
  next.setAttribute("aria-disabled", String(total === 1));
  queueMicrotask(() => itemDone(context, block, cards[0]?.id ?? ""));
  return h(
    "section",
    {
      class: "process",
      "aria-roledescription": labels["sr.carousel"],
      "aria-label": labels["sr.process"],
    },
    h("div", { class: "process-controls" }, previous, strip, next),
    h("div", { class: "process-cards" }, ...parts.map((part) => part.element)),
    status,
  );
};

interface CardSettings {
  flipHint: boolean;
  autosize: boolean;
  cardHeight: number;
}

/** Controls a learner can press or play inside a card side. */
const CONTROLS = "a, button, audio, video, iframe";

/**
 * A flashcard (2.8, UI-BLOCKS-R12): its front, then its back once turned over by its round button
 * or by a press anywhere on it but its controls; both sides stay in the accessibility tree as
 * groups, and the controls of the side turned away leave the tab order. Each side has its own
 * picture style, media and audio. A card turned over is done, and turning it back does not undo
 * that (UI-BLOCKS-R13, R56).
 */
function flashcard(
  block: Block,
  card: FlashcardItem,
  s: CardSettings,
  context: StaticContext,
): HTMLElement {
  const { labels } = context;
  const side = (which: "front" | "back") => {
    const part: CardSide = card[which];
    const name = labels[which === "front" ? "flashcard.front" : "flashcard.back"];
    return h(
      "div",
      {
        class: `card-side card-${which} image-${part.imageStyle ?? "centered"}`,
        role: "group",
        "aria-label": name,
      },
      ...body(part, name, context, false, "bottom", "card-image"),
    );
  };
  const front = side("front");
  const back = side("back");
  const reachable = (turned: boolean) => {
    for (const [face, shown] of [
      [front, !turned],
      [back, turned],
    ] as const) {
      for (const control of face.querySelectorAll<HTMLElement>(CONTROLS)) {
        if (shown) control.removeAttribute("tabindex");
        else control.tabIndex = -1;
      }
    }
  };
  const turn = h(
    "button",
    { type: "button", class: "card-turn", "aria-pressed": "false" },
    icon(TURN, "icon"),
    h("span", { class: "visually-hidden" }, labels["flashcard.turn"]),
  );
  const faces = h("div", { class: "card-faces" }, front, back);
  if (!s.autosize) faces.style.minHeight = px(s.cardHeight);
  const element = h(
    "div",
    { class: "flashcard card" },
    faces,
    h(
      "div",
      { class: "card-foot" },
      s.flipHint ? h("p", { class: "card-hint" }, labels["flashcard.hint"]) : undefined,
      turn,
    ),
  );
  const flip = () => {
    const turned = turn.getAttribute("aria-pressed") !== "true";
    turn.setAttribute("aria-pressed", String(turned));
    element.classList.toggle("is-turned", turned);
    reachable(turned);
    itemDone(context, block, card.id);
  };
  turn.addEventListener("click", flip);
  element.addEventListener("click", (event) => {
    if (!(event.target as Element).closest(`${CONTROLS}, .embed-frame`)) flip();
  });
  reachable(false);
  return element;
}

const cardSettings = (block: Block) => variantSettings<CardSettings>(block);

/** Flashcard grid (2.8, W6): every card at once, as many columns as fit. */
const flashcardGrid: Renderer = (block, context) => {
  const cards = flashcards(block);
  if (cards.length === 0) return undefined;
  const s = cardSettings(block);
  return h(
    "div",
    { class: "flashcards" },
    ...cards.map((card) => flashcard(block, card, s, context)),
  );
};

/**
 * Flashcard stack (2.8, GL11, UI-BLOCKS-R70): one card at a time with previous and next and its
 * position; each card keeps its side while the learner moves on. Cards are done when turned over,
 * not when shown.
 */
const flashcardStack: Renderer = (block, context) => {
  const cards = flashcards(block);
  if (cards.length === 0) return undefined;
  const s = cardSettings(block);
  return carousel(
    block,
    cards.map((card) => [card.id, flashcard(block, card, s, context)]),
    {
      previous: "flashcard.previous",
      next: "flashcard.next",
      position: "flashcard.position",
      region: "sr.flashcards",
    },
    context,
    false,
  );
};

/** A mail address as a mailto address part: what RFC 6068 wants escaped, escaped. */
const mailbox = (address: string) => encodeURIComponent(address).replace("%40", "@");

/**
 * A button's control (2.10, UI-BLOCKS-R18): a lesson of the course opens in the same window; a web
 * page, or a page next to the course by its relative address, in a new tab; an email destination
 * opens a new message to its addresses with the course title as its subject; and exit ends the
 * course through the LMS connection (the runtime's exit, as the outline's exit link does), so it
 * shows only where the lesson can exit, in a learning-system package (`LessonHooks.exit`), and in
 * the editor's drawing of the block, which has no lesson. None for a destination this course
 * cannot reach.
 */
function control(item: ButtonItem, { course, labels, lesson }: StaticContext) {
  const { destination } = item;
  const link = (href: string) => h("a", { class: "button block-button", href }, item.label);
  switch (destination.kind) {
    case "lesson":
      return pagesOf(course).some((page) => page.id === destination.entry)
        ? link(pageHash(destination.entry))
        : undefined;
    case "url":
      return isSafeLink(destination.url) ? linkOut(link(destination.url), labels) : undefined;
    case "relative":
      return isRelativeLink(destination.path) ? linkOut(link(destination.path), labels) : undefined;
    case "email": {
      const to = destination.addresses.map(mailbox).join(",");
      return link(`mailto:${to}?subject=${encodeURIComponent(course.title)}`);
    }
    case "exit": {
      if (lesson && !lesson.exit) return undefined;
      const exit = h("button", { type: "button", class: "button block-button" }, item.label);
      exit.addEventListener("click", () => lesson?.exit?.());
      return exit;
    }
  }
}

/**
 * Button and button stack (2.10, L10, W8): each button with its heading and description beside it,
 * aligned and as wide as the author chose, in the theme's button colour or the author's with the
 * text that keeps 4.5:1 on it; on an image background, black or white by contrast instead
 * (UI-BLOCKS-EDITOR-R23, player.css). A single button shows the first of the buttons a stack
 * switched to it kept.
 */
const buttons: Renderer = (block, context) => {
  const all = (block.items ?? []).filter((item): item is ButtonItem => item.kind === "button");
  const shown = block.variant === "button" ? all.slice(0, 1) : all;
  const s = variantSettings<{
    showDescription: boolean;
    align: string;
    width: string;
    cornerRadius?: number;
    buttonColor?: string;
    buttonContrast: "auto" | "light" | "dark";
    spacing: number;
  }>(block);
  const level = itemLevel(block, context);
  const rows = shown.flatMap((item) => {
    const button = control(item, context);
    if (!button) return [];
    if (s.cornerRadius !== undefined) button.style.borderRadius = px(s.cornerRadius);
    const heading = item.title
      ? h(`h${level}` as "h2", { class: "button-heading" }, title(item.title, context))
      : undefined;
    const description =
      s.showDescription && item.description
        ? h("div", { class: "text-body" }, richText(item.description, context.labels))
        : undefined;
    const words =
      heading || description ? h("div", { class: "button-text" }, heading, description) : undefined;
    return [h("div", { class: "button-row" }, button, words)];
  });
  if (rows.length === 0) return undefined;
  const element = h("div", { class: `button-block align-${s.align} buttons-${s.width}` }, ...rows);
  element.style.setProperty("--button-gap", px(s.spacing));
  if (s.buttonColor) {
    element.style.setProperty("--button", s.buttonColor);
    const text = textOn(s.buttonColor, s.buttonContrast) === "light" ? "#ffffff" : "#000000";
    element.style.setProperty("--button-text", text);
  }
  return element;
};

export const INTERACTIVE_RENDERERS: Record<string, Renderer> = {
  "interactive/accordion": accordion,
  "interactive/tabs": tabs,
  "interactive/labeled-graphic": labeledGraphic,
  "interactive/process": process,
  "interactive/flashcard-grid": flashcardGrid,
  "interactive/flashcard-stack": flashcardStack,
  "interactive/button": buttons,
  "interactive/button-stack": buttons,
};
