// The player's colour tokens for a theme colour, as the M2-17 theme sets them (themeColors and
// themeVariables of @course-suite/format and player-blocks on m2/theme): links and marks in an
// accent at 4.5:1 on the panel colour, filled buttons at 3:1 there, and each fill with the white or
// black text that reads best on it. shortcut: a copy until M2-17 lands, then import its themeColors.
import { contrastRatio, luminance, textOn } from "@course-suite/format";

/** The suggested theme colours (blocks-editor.md 2.18, T7); #ff631e is the default one. */
export const THEME_COLORS = ["#4baaf4", "#285f9f", "#7837a8", "#d84738", "#ff631e", "#25bb64"];

const WHITE = "#ffffff";
const BLACK = "#000000";
/** player.css --panel: the darkest light surface links and buttons sit on. */
const PANEL = "#f4f5f7";

const channels = (color: string) =>
  [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16));
const mix = (color: string, toward: string, amount: number) => {
  const to = channels(toward);
  return `#${channels(color)
    .map((c, i) =>
      Math.round(c + ((to[i] as number) - c) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};
const contrastOf = (a: string, b: string) => contrastRatio(luminance(a), luminance(b));
const textColor = (background: string) => (textOn(background) === "light" ? WHITE : BLACK);

/** The colour nearest to `color` that keeps `ratio` on `against`, moved toward black or white. */
function nearestReadable(color: string, against: string, ratio: number): string {
  if (contrastOf(color, against) >= ratio) return color;
  let best: { amount: number; color: string } | undefined;
  for (const extreme of [BLACK, WHITE]) {
    if (contrastOf(extreme, against) < ratio) continue;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (contrastOf(mix(color, extreme, middle), against) >= ratio) high = middle;
      else low = middle;
    }
    let candidate = mix(color, extreme, high);
    for (let step = high; contrastOf(candidate, against) < ratio && step < 1; ) {
      step = Math.min(1, step + 1 / 512);
      candidate = mix(color, extreme, step);
    }
    if (!best || high < best.amount) best = { amount: high, color: candidate };
  }
  return best?.color ?? (contrastOf(BLACK, against) >= contrastOf(WHITE, against) ? BLACK : WHITE);
}

/** The custom properties player.css reads, for theme colour `color` under automatic contrast. */
export function themeTokens(color: string): Record<string, string> {
  const accent = nearestReadable(color, PANEL, 4.5);
  const button = nearestReadable(color, PANEL, 3);
  return {
    "--accent": accent,
    "--accent-text": textColor(accent),
    "--accent-soft": mix(accent, WHITE, 0.88),
    "--focus": accent,
    "--button": button,
    "--button-text": textColor(button),
  };
}
