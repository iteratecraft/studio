import { beforeAll, describe, expect, test } from "vitest";
import { makeZip } from "../test/make-zip.js";
import { defaultZipLimits, readZip, unsafeEntryName } from "./read.js";

// These tests run in Node (Vitest); the package itself has no Node typings.
declare const process: { memoryUsage(): { arrayBuffers: number } };

const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

async function problemsOf(zip: Uint8Array | Promise<Uint8Array>, limits = defaultZipLimits) {
  const result = await readZip(await zip, limits);
  if (result.ok) throw new Error("expected the archive to be rejected");
  return result.problems;
}

describe("readZip", () => {
  test("reads stored and deflated files and drops directory entries (S-2)", async () => {
    const result = await readZip(
      await makeZip([
        { name: "index.html", data: "<p>hi</p>" },
        { name: "media/", method: 0 },
        { name: "media/a.txt", data: "stored", method: 0 },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.names).toEqual(["index.html", "media/a.txt"]);
    expect(result.value.has("media/a.txt")).toBe(true);
    expect(text(await result.value.read("index.html"))).toBe("<p>hi</p>");
    expect(text(await result.value.read("media/a.txt"))).toBe("stored");
    expect(await result.value.read("missing.txt")).toBeUndefined();
  });

  test("hands out copies, so a reader cannot change the archive", async () => {
    const result = await readZip(await makeZip([{ name: "a.txt", data: "stored", method: 0 }]));
    if (!result.ok) throw new Error("expected the archive to be read");
    (await result.value.read("a.txt"))?.fill(0);
    expect(text(await result.value.read("a.txt"))).toBe("stored");
  });

  test.each([
    ["../evil.js", "climbs out"],
    ["a/../../evil.js", "climbs out"],
    ["/etc/passwd", "absolute"],
    ["C:/Windows/evil.dll", "absolute"],
    ["a\\..\\evil.js", "backslash"],
    ["a//b.txt", "empty"],
    ["./a.txt", "empty or '.'"],
    ["con.txt", "reserved Windows device"],
    ["a/b?.txt", "Windows does not allow"],
    ["trailing./x", "dot or space"],
    ["CONIN$", "reserved Windows device"],
    ["a/conout$.txt", "reserved Windows device"],
    ["com¹.txt", "reserved Windows device"],
    ["LPT³", "reserved Windows device"],
    ["com0", "reserved Windows device"],
    [`${"a".repeat(256)}.txt`, "longer than 255 bytes"],
    [`${"é".repeat(128)}`, "longer than 255 bytes"],
  ])("rejects the unsafe name %s", async (name, reason) => {
    expect(unsafeEntryName(name)).toContain(reason);
    expect(await problemsOf(makeZip([{ name, data: "x" }]))).toEqual([
      { file: name, message: expect.stringContaining(reason) },
    ]);
  });

  test("accepts a segment of exactly 255 bytes", async () => {
    expect(unsafeEntryName(`d/${"a".repeat(255)}`)).toBeUndefined();
  });

  test("rejects a file that has the name of a folder other entries sit in", async () => {
    expect(
      await problemsOf(
        makeZip([
          { name: "a", data: "file" },
          { name: "A/b.txt", data: "inside" },
        ]),
      ),
    ).toEqual([{ file: "a", message: "is a file, but other entries sit inside it" }]);
  });

  test("rejects symbolic links", async () => {
    expect(
      await problemsOf(makeZip([{ name: "link", data: "/etc/passwd", unixMode: 0o120777 }])),
    ).toEqual([{ file: "link", message: "is a symbolic link" }]);
  });

  test("rejects names that collide, ignoring case", async () => {
    const problems = await problemsOf(
      makeZip([
        { name: "Index.html", data: "a" },
        { name: "index.html", data: "b" },
      ]),
    );
    expect(problems).toEqual([
      { file: "index.html", message: expect.stringContaining("same name as 'Index.html'") },
    ]);
  });

  test("rejects an entry whose inflated-to-compressed ratio is too high", async () => {
    const zeros = new Uint8Array(4 * 1024 * 1024);
    expect(await problemsOf(makeZip([{ name: "bomb.bin", data: zeros }]))).toEqual([
      { file: "bomb.bin", message: expect.stringContaining("(limit 100:1)") },
    ]);
  });

  test("rejects archives that inflate past the total cap before inflating anything", async () => {
    const limits = { ...defaultZipLimits, maxTotalBytes: 10 };
    expect(await problemsOf(makeZip([{ name: "a.txt", data: "0123456789ab" }]), limits)).toEqual([
      { file: "", message: "inflates to 12 bytes; the limit is 10" },
    ]);
  });

  // The reviewer's probe: 1,024 entries of 1 MiB of zeros in a ~1.15 MB archive. Each entry sits at
  // the per-entry ratio floor and together they equal the 1 GiB total cap, so only an archive-wide
  // bound stops it. Built here, never committed.
  describe("an archive of many entries at the per-entry limits", () => {
    const mib = new Uint8Array(1024 * 1024);
    let bomb: Uint8Array;
    beforeAll(async () => {
      bomb = await makeZip(
        Array.from({ length: 1024 }, (_, i) => ({ name: `f${i}.bin`, data: mib })),
      );
    });

    test("is rejected by the archive-wide ratio before anything is inflated", async () => {
      expect(bomb.length).toBeLessThan(1.2e6);
      const before = process.memoryUsage().arrayBuffers;
      expect(await problemsOf(bomb)).toEqual([
        { file: "", message: `inflates ${1024 ** 3} bytes from ${bomb.length} (limit 100:1)` },
      ]);
      expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(64 * 1024 * 1024);
    });

    test("is verified one file at a time when the ratio is allowed", async () => {
      const before = process.memoryUsage().arrayBuffers;
      const result = await readZip(bomb, { ...defaultZipLimits, maxRatio: 1e6 });
      if (!result.ok) throw new Error(JSON.stringify(result.problems));
      expect(result.value.names).toHaveLength(1024);
      // Holding every file at once would keep 1 GiB alive.
      expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(256 * 1024 * 1024);
      const last = await result.value.read("f1023.bin");
      expect(last?.length === mib.length && last.every((byte) => byte === 0)).toBe(true);
    }, 30_000);
  });

  test("applies the archive-wide ratio only above the floor", async () => {
    // Each entry is at the floor, so only their sum is checked against the ratio.
    const data = "a".repeat(4096);
    const zip = await makeZip([
      { name: "a.txt", data },
      { name: "b.txt", data },
    ]);
    const limits = { ...defaultZipLimits, ratioFloorBytes: 4096, maxRatio: 10 };
    expect(await problemsOf(zip, limits)).toEqual([
      { file: "", message: `inflates 8192 bytes from ${zip.length} (limit 10:1)` },
    ]);
    expect((await readZip(zip, { ...limits, ratioFloorBytes: 8192 })).ok).toBe(true);
    expect((await readZip(zip, { ...limits, maxRatio: 1000 })).ok).toBe(true);
  });

  test("rejects an entry that inflates to less than it declares", async () => {
    expect(await problemsOf(makeZip([{ name: "a.txt", data: "abcde", declaredSize: 10 }]))).toEqual(
      [{ file: "a.txt", message: "inflates to 5 bytes but declares 10" }],
    );
  });

  test("stops at the first file that fails verification", async () => {
    const zip = await makeZip([
      { name: "a.txt", data: "abc", crc: 1 },
      { name: "b.txt", data: "abc", crc: 1 },
    ]);
    expect(await problemsOf(zip)).toEqual([{ file: "a.txt", message: "fails its CRC-32 check" }]);
  });

  test("stops inflating at the declared size when the data says more", async () => {
    // Declares 5 bytes but holds 1 MiB of zeros: inflation must stop, not allocate the lot.
    const zip = await makeZip([
      { name: "a.bin", data: new Uint8Array(1024 * 1024), declaredSize: 5 },
    ]);
    expect(await problemsOf(zip)).toEqual([
      { file: "a.bin", message: expect.stringContaining("inflates beyond its declared size") },
    ]);
  });

  test("rejects too many entries", async () => {
    const limits = { ...defaultZipLimits, maxEntries: 1 };
    const zip = await makeZip([
      { name: "a", data: "" },
      { name: "b", data: "" },
    ]);
    expect(await problemsOf(zip, limits)).toEqual([
      { file: "", message: "has 2 entries; the limit is 1" },
    ]);
  });

  test("rejects a CRC mismatch, encryption and unknown compression", async () => {
    const problems = await problemsOf(
      makeZip([
        { name: "crc.txt", data: "abc", crc: 1 },
        { name: "secret.txt", data: "abc", flags: 1 },
        { name: "bz.txt", data: "abc", method: 12 },
      ]),
    );
    expect(problems).toEqual([
      { file: "secret.txt", message: "is encrypted" },
      { file: "bz.txt", message: expect.stringContaining("compression method 12") },
    ]);
    expect(await problemsOf(makeZip([{ name: "crc.txt", data: "abc", crc: 1 }]))).toEqual([
      { file: "crc.txt", message: "fails its CRC-32 check" },
    ]);
  });

  test("rejects entries whose data overlap", async () => {
    const zip = await makeZip([
      { name: "a.txt", data: "aaaa" },
      { name: "b.txt", data: "bbbb" },
    ]);
    // Point the second central-directory record at the first local header.
    const view = new DataView(zip.buffer);
    const cdOffset = view.getUint32(zip.length - 6, true);
    const secondCentral = cdOffset + 46 + "a.txt".length;
    view.setUint32(secondCentral + 42, 0, true);
    expect(await problemsOf(zip)).toContainEqual({
      file: expect.stringMatching(/^[ab]\.txt$/),
      message: expect.stringContaining("overlaps the data of"),
    });
  });

  test("rejects something that is not a ZIP archive", async () => {
    expect(await problemsOf(new TextEncoder().encode("plain text"))).toEqual([
      { file: "", message: expect.stringContaining("is not a ZIP archive") },
    ]);
  });
});
