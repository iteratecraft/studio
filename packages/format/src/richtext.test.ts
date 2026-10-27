import { expect, test } from "vitest";
import { isLessonLink, isSafeLink, LINK_PATTERN, lessonLink } from "./richtext.js";

test("blocks-editor L13, UI-BLOCKS-EDITOR-R33: links go to web and mail addresses, a lesson or a block of one", () => {
  for (const href of [
    "https://example.com/a",
    "http://example.com",
    "MAILTO:me@example.com",
    "#/lessons/lessplan01",
    "#/lessons/lessplan01/blkhead001",
    " #/lessons/a%20b ",
  ]) {
    expect(isSafeLink(href), href).toBe(true);
  }
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,x",
    "/index.html",
    "#/lessons/",
    "#/lessons/a/b/c",
    "#/lessons/a?x=1",
    "#top",
  ]) {
    expect(isSafeLink(href), href).toBe(false);
  }
  expect(isLessonLink("https://example.com/#/lessons/a")).toBe(false);
  expect(lessonLink("lesson 1")).toBe("#/lessons/lesson%201");
  expect(lessonLink("lesson 1", "blk/2")).toBe("#/lessons/lesson%201/blk%2F2");
  expect(isLessonLink(lessonLink("lesson 1", "blk/2"))).toBe(true);
});

test("blocks-editor 2.10: a stored link is a safe link written without spaces", () => {
  const stored = (href: string) => new RegExp(LINK_PATTERN, "u").test(href);
  for (const href of [
    "https://example.com/a",
    "MAILTO:me@example.com",
    "#/lessons/lessplan01",
    "#/lessons/lessplan01/blkhead001",
  ]) {
    expect(stored(href), href).toBe(true);
    expect(isSafeLink(href), href).toBe(true);
  }
  for (const href of [
    " https://example.com",
    "https://",
    "https://a b",
    "javascript:alert(1)",
    "#/lessons/",
    "#/lessons/a/b/c",
    "#top",
  ]) {
    expect(stored(href), href).toBe(false);
  }
});
