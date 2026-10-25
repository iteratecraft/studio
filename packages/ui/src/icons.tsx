// The kit's icon set: original 16 x 16 line drawings made for this project, drawn in currentColor.
// Icons are decoration: the control around an icon carries the accessible name.

const PATHS = {
  add: "M8 3v10M3 8h10",
  "arrow-down": "M8 3v10M4 9l4 4 4-4",
  "arrow-up": "M8 13V3M4 7l4-4 4 4",
  back: "M13 8H3.5M7.5 4l-4 4 4 4",
  blocks: "M2.5 2.5h11v3h-11zM2.5 7.5h11v3h-11zM2.5 12.5h11",
  bold: "M4.5 2.5h4a2.75 2.75 0 0 1 0 5.5h-4zM4.5 8h4.75a2.75 2.75 0 0 1 0 5.5H4.5z",
  bullets: "M6 4h7.5M6 8h7.5M6 12h7.5M2.5 4h.5M2.5 8h.5M2.5 12h.5",
  check: "M3 8.5l3.2 3.2L13 4.5",
  "chevron-down": "M4 6l4 4 4-4",
  "chevron-right": "M6 4l4 4-4 4",
  "clear-format": "M3 3.5h8M7 3.5L5 13M3 13h4M10 10l3.5 3.5M13.5 10L10 13.5",
  close: "M4 4l8 8M12 4l-8 8",
  computer: "M2 2.5h12v8.5H2zM5.5 14h5M8 11v3",
  copy: "M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3",
  edit: "M10.5 2.5l3 3L6 13H3v-3z",
  file: "M4 1.5h5l3.5 3.5v9.5H4zM9 1.5V5h3.5",
  format: "M2.5 2.5h11M2.5 13.5h11M5 6h6v4H5z",
  grid: "M2.5 2.5h4.5V7H2.5zM9 2.5h4.5V7H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z",
  grip: "M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01",
  info: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13M8 7v4.5M8 4.75h.01",
  italic: "M7 2.5h5M4 13.5h5M10 2.5l-4 11",
  lesson: "M3.5 1.5h9v13h-9zM5.75 5h4.5M5.75 8h4.5M5.75 11h2.5",
  link: "M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1",
  list: "M2.5 4h11M2.5 8h11M2.5 12h11",
  minus: "M3 8h10",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  numbers: "M6.5 4h7M6.5 8h7M6.5 12h7M2.5 2.5h1v3M2 10.5h2l-2 3h2",
  open: "M1.5 3.5h4.5L7.5 5h7v8.5h-13zM1.5 7.5h13",
  paste: "M5.5 3H4v11.5h8V3h-1.5M6 1.5h4V4H6z",
  phone: "M5 1.5h6v13H5zM7.5 12.5h1",
  quiz: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13M6.1 6.2a2 2 0 1 1 2.7 1.9c-.5.2-.8.6-.8 1.1v.5M8 11.6h.01",
  redo: "M10 4l3 3-3 3M13 7H6.5a3.5 3.5 0 0 0 0 7H9",
  restore: "M3 3v3.5h3.5M3.5 6.5A5 5 0 1 1 3 9.5",
  save: "M2.5 2.5h8.5l2.5 2.5v8.5h-11zM5 2.5v3.5h5V2.5M5 13.5V9.5h6v4",
  search: "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9M10.5 10.5L14 14",
  strike:
    "M2.5 8h11M11 4.5C10.5 3.3 9.3 2.5 7.8 2.5c-1.9 0-3.1 1-3.1 2.4 0 1.2.8 1.8 2.3 2.3M5 11.5c.5 1.3 1.8 2 3.3 2 1.9 0 3.2-1 3.2-2.5",
  style: "M8 2C8 2 4 6.5 4 9.5a4 4 0 0 0 8 0C12 6.5 8 2 8 2z",
  subscript:
    "M2.5 3l5 6.5M7.5 3l-5 6.5M10.5 11.25a1.25 1.25 0 1 1 2.5 0c0 1-2.5 1.75-2.5 2.75H13.5",
  superscript:
    "M2.5 6l5 6.5M7.5 6l-5 6.5M10.5 3.25a1.25 1.25 0 1 1 2.5 0c0 1-2.5 1.75-2.5 2.75H13.5",
  tablet: "M3.5 1.5h9v13h-9zM7 12.5h2",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5",
  underline: "M4.5 2.5V7a3.5 3.5 0 0 0 7 0V2.5M3.5 14h9",
  undo: "M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 0 1 0 7H7",
  warning: "M8 2l6.5 11.5h-13zM8 6.5V10M8 12h.01",
} as const;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

// Icons that point along the reading direction turn round in right-to-left languages.
const MIRRORED: ReadonlySet<IconName> = new Set(["back", "chevron-right", "redo", "undo"]);
// Dot icons need a thicker pen to be seen.
const DOTTED: ReadonlySet<IconName> = new Set(["grip", "more"]);

export interface IconProps {
  name: IconName;
  /** Width and height in CSS pixels. */
  size?: number;
}

export function Icon({ name, size = 16 }: IconProps) {
  return (
    <svg
      className={MIRRORED.has(name) ? "cs-Icon cs-Icon--mirror" : "cs-Icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={DOTTED.has(name) ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
