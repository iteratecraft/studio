// WebVTT caption files (W3C WebVTT; ENG-07 captions, BLK-05; accessibility.md B5): read a file an
// author uploads and write the cues the caption editor holds. Cue times are whole milliseconds, so a
// file read and written again keeps its timing exactly. Cue text keeps bold, italic, underline and
// voice tags and drops every other tag (B5 "kept markup" and "dropped markup").

/** One caption: shown from `start` to `end`, in milliseconds. */
export interface Cue {
  /** The cue's identifier line, when it has one. */
  id?: string;
  start: number;
  end: number;
  /** Position and alignment settings after the end time, kept as written. */
  settings?: string;
  /** Text with `<b>`, `<i>`, `<u>` and `<v name>` tags; one line break per caption line. */
  text: string;
}

export type VttResult = { ok: true; cues: Cue[] } | { ok: false; line: number; message: string };

const TIME = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;
const KEPT = new Set(["b", "i", "u"]);

/** A WebVTT timestamp (`hh:mm:ss.ttt` or `mm:ss.ttt`) in milliseconds, or undefined. */
export function parseVttTime(text: string): number | undefined {
  const match = TIME.exec(text.trim());
  if (!match) return undefined;
  const [, hours = "0", minutes, seconds, millis] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(millis);
}

/** `hh:mm:ss.ttt`, the form B5 gives for the blocks app. */
export function formatVttTime(ms: number): string {
  const whole = Math.max(0, Math.round(ms));
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const hours = Math.floor(whole / 3_600_000);
  const minutes = Math.floor(whole / 60_000) % 60;
  const seconds = Math.floor(whole / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(whole % 1000, 3)}`;
}

/** Cue text with only the kept tags: `<b>`, `<i>`, `<u>` without classes, and voice tags. */
export function cleanCueText(text: string): string {
  return text.replace(/<(\/?)([^\s>.]*)([^>]*)>/g, (_, close: string, name: string, rest) => {
    const tag = name.toLowerCase();
    if (KEPT.has(tag)) return `<${close}${tag}>`;
    if (tag !== "v") return "";
    if (close) return "</v>";
    const voice = String(rest)
      .replace(/^(\.[^\s>]*)?/, "")
      .trim();
    return voice ? `<v ${voice}>` : "<v>";
  });
}

/** Reads a WebVTT file: the header, then cues; notes, styles and regions are skipped. */
export function parseVtt(text: string): VttResult {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0] ?? "")) {
    return { ok: false, line: 1, message: "does not start with WEBVTT" };
  }
  const cues: Cue[] = [];
  let i = 1;
  // The rest of the header block, up to the first blank line.
  while (i < lines.length && lines[i] !== "") i++;
  while (i < lines.length) {
    if (lines[i] === "") {
      i++;
      continue;
    }
    const first = i;
    const block: string[] = [];
    while (i < lines.length && lines[i] !== "") block.push(lines[i++] as string);
    if (/^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/.test(block[0] ?? "")) continue;
    const timing = block.findIndex((line) => line.includes("-->"));
    if (timing < 0 || timing > 1) {
      return { ok: false, line: first + 1, message: "is not a cue: no start and end time" };
    }
    const id = timing === 1 ? block[0] : undefined;
    const [from = "", rest = ""] = (block[timing] as string).split("-->");
    const [to = "", ...settings] = rest.trim().split(/[ \t]+/);
    const start = parseVttTime(from);
    const end = parseVttTime(to);
    if (start === undefined || end === undefined) {
      return {
        ok: false,
        line: first + timing + 1,
        message: "has a time that is not hh:mm:ss.ttt",
      };
    }
    if (end <= start) {
      return { ok: false, line: first + timing + 1, message: "ends before it starts" };
    }
    cues.push({
      ...(id !== undefined && { id }),
      start,
      end,
      ...(settings.length > 0 && { settings: settings.join(" ") }),
      text: cleanCueText(block.slice(timing + 1).join("\n")),
    });
  }
  return { ok: true, cues };
}

/**
 * Writes cues as a WebVTT file. Text cannot hold a blank line or `-->`, which would end the cue:
 * blank lines are dropped and arrows shortened.
 */
export function serializeVtt(cues: readonly Cue[]): string {
  const blocks = cues.map((cue) => {
    const text = cue.text
      .replaceAll("-->", "->")
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .join("\n");
    const id = cue.id?.trim() && !cue.id.includes("-->") ? [cue.id.trim()] : [];
    const settings = cue.settings ? ` ${cue.settings}` : "";
    return [...id, `${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}${settings}`, text]
      .filter((line) => line !== "")
      .join("\n");
  });
  return ["WEBVTT", ...blocks].join("\n\n").concat("\n");
}
