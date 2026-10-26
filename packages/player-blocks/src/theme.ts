// The course theme in the player (ENG-08, BLK-09; rise.md 3E, rule 18): colours from the theme
// colour with automatic contrast, the fonts the package carries, corners, the layout style, the cover
// and lesson header options, and the entrance animation of blocks. Colours and fonts are custom
// properties set through the style object, which a page's content security policy allows (the
// editor's preview runs under the desktop app's), and fonts are FontFace objects over the package's
// own files: nothing loads from anywhere else (ADR-0004).
import { type Block, type Course, type Theme, textColor, themeColors } from "@course-suite/format";
import { fileUrl } from "./hooks.js";

/** One face of a font the package carries: its file, by package path, weight and style. */
export interface PackagedFace {
  file: string;
  weight: 400 | 700;
  style: "normal" | "italic";
}

/**
 * The fonts a package carries (rise.md §4 "Published web package"): every face of every family the
 * theme uses, and the family of each role. Families are named by font key (`fontKey`), so a custom
 * font never clashes with a bundled one or with a font installed on the learner's device.
 */
export interface CourseFonts {
  families: Record<string, PackagedFace[]>;
  heading: string;
  body: string;
  ui: string;
}

/** The device's own fonts, after the theme's and when a package carries none. */
const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** A family name as a CSS string. */
const quoted = (family: string) => `"${family.replace(/["\\]/g, "")}"`;

/** Fixed backgrounds of the lesson header layouts; the same greys as the block swatches. */
const HEADER_COLORS = { gray: "#eef0f3", dark: "#2b3038", black: "#000000" } as const;

/**
 * The custom properties of a course's theme. `families` names the family of each font role, when
 * the fonts are available; without it text stays in the device's fonts.
 */
export function themeVariables(
  theme: Theme | undefined,
  families?: Pick<CourseFonts, "heading" | "body" | "ui">,
): Record<string, string> {
  const colors = themeColors(theme);
  const font = (role: "heading" | "body" | "ui") =>
    families ? `${quoted(families[role])}, ${SYSTEM}` : SYSTEM;
  // player.css draws its accent, button and highlight colours from the --theme-* ones, so a white
  // card on a coloured block can take them back.
  return {
    "--theme-accent": colors.accent,
    "--theme-accent-soft": colors.accentSoft,
    "--theme-button": colors.button,
    "--theme-button-text": colors.buttonText,
    "--theme": colors.theme,
    "--theme-text": colors.themeText,
    "--tint": colors.tint,
    "--tint-text": colors.tintText,
    "--font-heading": font("heading"),
    "--font-body": font("body"),
    "--font-ui": font("ui"),
    "--radius": theme?.corners === "square" ? "0" : "8px",
    "--button-radius": theme?.buttons === "square" ? "0" : "6px",
  };
}

/** Sets `variables` on `element`, through its style object. */
export function setVariables(element: HTMLElement, variables: Record<string, string>): void {
  for (const [name, value] of Object.entries(variables)) element.style.setProperty(name, value);
}

/**
 * Applies the theme to the page: its colours, fonts and corners on `root`, and the layout style
 * as a class. The fonts load from the package's files when text first needs them.
 */
export function applyTheme(
  root: HTMLElement,
  course: Course,
  fonts: CourseFonts | undefined,
): void {
  setVariables(root, themeVariables(course.theme, fonts));
  root.classList.add(`layout-${course.theme?.layout ?? "classic"}`);
  if (!fonts || typeof FontFace === "undefined") return;
  for (const [family, faces] of Object.entries(fonts.families)) {
    for (const { file, weight, style } of faces) {
      const face = new FontFace(family, `url("${encodeURI(fileUrl(file))}")`, {
        weight: String(weight),
        style,
        display: "swap",
      });
      document.fonts.add(face);
    }
  }
}

/** Whether `fonts`, as the course data holds it, is the shape the player draws with. */
export function isCourseFonts(value: unknown): value is CourseFonts {
  if (typeof value !== "object" || value === null) return false;
  const { families, heading, body, ui } = value as Record<string, unknown>;
  return (
    [heading, body, ui].every((name) => typeof name === "string") &&
    typeof families === "object" &&
    families !== null &&
    Object.values(families).every(
      (faces) =>
        Array.isArray(faces) &&
        faces.every(
          (face) =>
            typeof face?.file === "string" &&
            (face.weight === 400 || face.weight === 700) &&
            (face.style === "normal" || face.style === "italic"),
        ),
    )
  );
}

/**
 * The background and text of a block set to theme or theme tint, or undefined for any other
 * background (UI-BLOCKS-EDITOR-R45).
 */
export function themeBackground(
  block: Block,
  course: Course,
): { color: string; text: "light" | "dark" } | undefined {
  const kind = block.settings?.background?.kind;
  if (kind !== "theme" && kind !== "tint") return undefined;
  const colors = themeColors(course.theme);
  const color = kind === "theme" ? colors.theme : colors.tint;
  const text = kind === "theme" ? colors.themeText : colors.tintText;
  return { color, text: text === "#ffffff" ? "light" : "dark" };
}

/**
 * The background and text of the lesson header, or undefined for the light layout, the default
 * (blocks-editor.md 2.18 lesson headers).
 */
export function headerBackground(
  theme: Theme | undefined,
): { color: string; text: "light" | "dark" } | undefined {
  const headers = theme?.headers;
  const layout = headers?.layout ?? "light";
  if (layout === "light") return undefined;
  const colors = themeColors(theme);
  let color: string;
  let text: string;
  if (layout === "theme") [color, text] = [colors.theme, colors.themeText];
  else if (layout === "tint") [color, text] = [colors.tint, colors.tintText];
  else if (layout === "color") {
    color = headers?.color ?? colors.theme;
    text = textColor(color, headers?.contrast);
  } else [color, text] = [HEADER_COLORS[layout], textColor(HEADER_COLORS[layout])];
  return { color, text: text === "#ffffff" ? "light" : "dark" };
}

/** Whether a block fades in as it scrolls into view: the course switch and the block's own. */
export const animates = (block: Block, course: Course): boolean =>
  course.theme?.animations !== false &&
  (block.settings?.entranceAnimation ?? block.category !== "text");

/**
 * Fades blocks in as they scroll into view (rise.md 3D). A block already in view when the page
 * opens shows at once, and a learner who prefers reduced motion sees no movement (player.css,
 * UI-ACCESSIBILITY-R40). Returns a function that stops watching.
 */
export function animateOnScroll(elements: readonly HTMLElement[]): () => void {
  if (elements.length === 0 || typeof IntersectionObserver === "undefined") return () => {};
  const seen = new Set<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const first = !seen.has(target);
        seen.add(target);
        if (!isIntersecting) continue;
        observer.unobserve(target);
        if (!first) target.classList.add("entering");
      }
    },
    { threshold: 0.1 },
  );
  for (const element of elements) observer.observe(element);
  return () => observer.disconnect();
}
