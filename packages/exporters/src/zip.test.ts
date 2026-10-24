import { expect, test } from "vitest";
import { writeZip, ZIP_MAX_ENTRIES } from "./zip.js";

const file = (name: string, text = "") => ({ name, data: new TextEncoder().encode(text) });

test("orders entries by name, so input order does not change the bytes", () => {
  const a = writeZip([file("b.txt", "bee"), file("a.txt", "a".repeat(500))]);
  const b = writeZip([file("a.txt", "a".repeat(500)), file("b.txt", "bee")]);
  expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
});

test("uses one fixed timestamp and stores data that deflate would not shrink", () => {
  const zip = Buffer.from(writeZip([file("a.txt", "x"), file("b.jpg", "y".repeat(100))]));
  // Local header of the first entry: method, time, date.
  expect([zip.readUInt16LE(8), zip.readUInt16LE(10), zip.readUInt16LE(12)]).toEqual([0, 0, 0x21]);
  const second = 30 + "a.txt".length + 1;
  expect(zip.readUInt16LE(second + 8)).toBe(0);
});

test("refuses more entries than a ZIP without ZIP64 holds, and duplicate names", () => {
  const many = Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => file(`f${i}`));
  expect(() => writeZip(many)).toThrow(RangeError);
  expect(() => writeZip([file("a"), file("a")])).toThrow("'a' is in the archive twice");
});
