import { expect, test } from "vitest";
import { crc32 } from "./crc32.js";
import { readZip } from "./read.js";
import { writeZip, ZIP_MAX_ENTRIES } from "./write.js";

const file = (name: string, text = "") => ({ name, data: new TextEncoder().encode(text) });
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

test("orders entries by name, so input order does not change the bytes", async () => {
  const a = await writeZip([file("b.txt", "bee"), file("a.txt", "a".repeat(500))]);
  const b = await writeZip([file("a.txt", "a".repeat(500)), file("b.txt", "bee")]);
  expect(a).toEqual(b);
});

test("uses one fixed timestamp and stores data that deflate would not shrink", async () => {
  const zip = view(await writeZip([file("a.txt", "x"), file("b.jpg", "y".repeat(100))]));
  // Local header of the first entry: method, time, date.
  expect([zip.getUint16(8, true), zip.getUint16(10, true), zip.getUint16(12, true)]).toEqual([
    0, 0, 0x21,
  ]);
  const second = 30 + "a.txt".length + 1;
  expect(zip.getUint16(second + 8, true)).toBe(0);
});

test("deflates by default and stores when compress is false", async () => {
  const text = "a".repeat(500);
  const zip = view(
    await writeZip([file("a.txt", text), { ...file("b.txt", text), compress: false }]),
  );
  expect(zip.getUint16(8, true)).toBe(8);
  const second = zip.getUint32(18, true) + 30 + "a.txt".length;
  expect([zip.getUint16(second + 8, true), zip.getUint32(second + 18, true)]).toEqual([0, 500]);
});

test("refuses more entries than a ZIP without ZIP64 holds, and duplicate names", async () => {
  const many = Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => file(`f${i}`));
  await expect(writeZip(many)).rejects.toThrow(RangeError);
  await expect(writeZip([file("a"), file("a")])).rejects.toThrow("'a' is in the archive twice");
});

test("reads back what it wrote, byte for byte", async () => {
  const files = [file("a.txt", "a".repeat(5000)), file("é/b.bin", "\u0000ÿ"), file("e.txt")];
  const result = await readZip(await writeZip(files));
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  expect(result.value.names).toEqual(["a.txt", "e.txt", "é/b.bin"]);
  for (const { name, data } of files) expect(await result.value.read(name)).toEqual(data);
});

test("computes the standard CRC-32, also across chunks", () => {
  const data = new TextEncoder().encode("123456789");
  expect(crc32(data)).toBe(0xcbf43926);
  expect(crc32(data.subarray(4), crc32(data.subarray(0, 4)))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array())).toBe(0);
});
