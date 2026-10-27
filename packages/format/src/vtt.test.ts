import { describe, expect, test } from "vitest";
import { mediaCourse } from "../test/courses.js";
import { usedMediaKeys } from "./media.js";
import { validateCourse } from "./validate.js";
import { cleanCueText, formatVttTime, parseVtt, parseVttTime, serializeVtt } from "./vtt.js";

const FILE = [
  "﻿WEBVTT - river captions",
  "Kind: captions",
  "",
  "NOTE written for the tests",
  "spans two lines",
  "",
  "STYLE",
  "::cue { color: lime }",
  "",
  "intro",
  "00:00:01.250 --> 00:00:04.007 align:start line:10%",
  "<v.loud Ana>Look, an <b>otter</b>!",
  "<c.yellow>Two</c> of them.",
  "",
  "01:02.003 --> 01:05.999",
  "<i>water</i> <u>splashes</u> <ruby>川<rt>kawa</rt></ruby> <00:01:03.000>now",
  "",
].join("\r\n");

describe("WebVTT captions (ENG-07, accessibility.md B5)", () => {
  test("[rise:3C] UI-ACCESSIBILITY-R41: reads cues with millisecond timing, keeping b, i, u and voice tags only", () => {
    const read = parseVtt(FILE);
    expect(read).toEqual({
      ok: true,
      cues: [
        {
          id: "intro",
          start: 1250,
          end: 4007,
          settings: "align:start line:10%",
          text: "<v Ana>Look, an <b>otter</b>!\nTwo of them.",
        },
        { start: 62003, end: 65999, text: "<i>water</i> <u>splashes</u> 川kawa now" },
      ],
    });
  });

  test("[rise:3C] B5: writes hh:mm:ss.ttt and reads back the same cues", () => {
    const read = parseVtt(FILE);
    if (!read.ok) throw new Error(read.message);
    const text = serializeVtt(read.cues);
    expect(text.startsWith("WEBVTT\n\nintro\n00:00:01.250 --> 00:00:04.007 align:start")).toBe(
      true,
    );
    expect(text).toContain("00:01:02.003 --> 00:01:05.999\n");
    expect(parseVtt(text)).toEqual(read);
  });

  test("[rise:3C] UI-ACCESSIBILITY-R41: refuses a file without the WEBVTT header, and bad cue times", () => {
    expect(parseVtt("1\n00:00:01,000 --> 00:00:02,000\nSRT\n")).toMatchObject({
      ok: false,
      line: 1,
    });
    expect(parseVtt("WEBVTT\n\n00:00:01,000 --> 00:00:02,000\nx\n")).toMatchObject({
      ok: false,
      line: 3,
      message: "has a time that is not hh:mm:ss.ttt",
    });
    expect(parseVtt("WEBVTT\n\n00:00:03.000 --> 00:00:02.000\nx\n")).toMatchObject({
      ok: false,
      message: "ends before it starts",
    });
    expect(parseVtt("WEBVTT\n\njust text\n")).toMatchObject({ ok: false, line: 3 });
  });

  test("writing keeps a cue whole: no blank line and no arrow inside its text", () => {
    const text = serializeVtt([{ start: 0, end: 1000, text: "a --> b\n\nc" }]);
    expect(text).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\na -> b\nc\n");
  });

  test("times round to whole milliseconds and hours may pass 99", () => {
    expect(formatVttTime(360_000_000 + 1.4)).toBe("100:00:00.001");
    expect(parseVttTime("100:00:00.001")).toBe(360_000_001);
    expect(parseVttTime("00:60:00.000")).toBeUndefined();
    expect(cleanCueText("<v>x</v><lang en>y</lang>")).toBe("<v>x</v>y");
  });
});

describe("media a course uses", () => {
  test("BLK-05: every key a media reference names, captions and narration included, and no unused file", () => {
    const course = mediaCourse();
    expect(validateCourse(course)).toEqual([]);
    expect([...usedMediaKeys(course)].sort()).toEqual([
      "bank.svg",
      "cover.svg",
      "header.svg",
      "heron.svg",
      "map.pdf",
      "otters-en.vtt",
      "otters-fr.vtt",
      "otters.webm",
      "stream.mp3",
    ]);
  });
});
