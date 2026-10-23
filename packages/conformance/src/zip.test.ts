import { describe, expect, test } from "vitest";
import { makeZip } from "../test/make-zip.js";
import { defaultZipLimits, readZip, unsafeEntryName } from "./zip.js";

const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

function problemsOf(zip: Uint8Array, limits = defaultZipLimits) {
  const result = readZip(zip, limits);
  if (result.ok) throw new Error("expected the archive to be rejected");
  return result.problems;
}

describe("readZip", () => {
  test("reads stored and deflated files and drops directory entries (S-2)", () => {
    const result = readZip(
      makeZip([
        { name: "index.html", data: "<p>hi</p>" },
        { name: "media/", method: 0 },
        { name: "media/a.txt", data: "stored", method: 0 },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.value.keys()]).toEqual(["index.html", "media/a.txt"]);
    expect(text(result.value.get("index.html"))).toBe("<p>hi</p>");
    expect(text(result.value.get("media/a.txt"))).toBe("stored");
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
  ])("rejects the unsafe name %s", (name, reason) => {
    expect(unsafeEntryName(name)).toContain(reason);
    expect(problemsOf(makeZip([{ name, data: "x" }]))).toEqual([
      { file: name, message: expect.stringContaining(reason) },
    ]);
  });

  test("rejects symbolic links", () => {
    expect(
      problemsOf(makeZip([{ name: "link", data: "/etc/passwd", unixMode: 0o120777 }])),
    ).toEqual([{ file: "link", message: "is a symbolic link" }]);
  });

  test("rejects names that collide, ignoring case", () => {
    const problems = problemsOf(
      makeZip([
        { name: "Index.html", data: "a" },
        { name: "index.html", data: "b" },
      ]),
    );
    expect(problems).toEqual([
      { file: "index.html", message: expect.stringContaining("same name as 'Index.html'") },
    ]);
  });

  test("rejects an entry whose inflated-to-compressed ratio is too high", () => {
    const zeros = new Uint8Array(4 * 1024 * 1024);
    expect(problemsOf(makeZip([{ name: "bomb.bin", data: zeros }]))).toEqual([
      { file: "bomb.bin", message: expect.stringContaining("(limit 100:1)") },
    ]);
  });

  test("rejects archives that inflate past the total cap before inflating anything", () => {
    const limits = { ...defaultZipLimits, maxTotalBytes: 10 };
    expect(problemsOf(makeZip([{ name: "a.txt", data: "0123456789ab" }]), limits)).toEqual([
      { file: "", message: "inflates to 12 bytes; the limit is 10" },
    ]);
  });

  test("stops inflating at the declared size when the data says more", () => {
    // Declares 5 bytes but holds 1 MiB of zeros: inflation must stop, not allocate the lot.
    const zip = makeZip([{ name: "a.bin", data: new Uint8Array(1024 * 1024), declaredSize: 5 }]);
    expect(problemsOf(zip)).toEqual([
      { file: "a.bin", message: expect.stringContaining("inflates beyond its declared size") },
    ]);
  });

  test("rejects too many entries", () => {
    const limits = { ...defaultZipLimits, maxEntries: 1 };
    const zip = makeZip([
      { name: "a", data: "" },
      { name: "b", data: "" },
    ]);
    expect(problemsOf(zip, limits)).toEqual([
      { file: "", message: "has 2 entries; the limit is 1" },
    ]);
  });

  test("rejects a CRC mismatch, encryption and unknown compression", () => {
    const problems = problemsOf(
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
    expect(problemsOf(makeZip([{ name: "crc.txt", data: "abc", crc: 1 }]))).toEqual([
      { file: "crc.txt", message: "fails its CRC-32 check" },
    ]);
  });

  test("rejects entries whose data overlap", () => {
    const zip = makeZip([
      { name: "a.txt", data: "aaaa" },
      { name: "b.txt", data: "bbbb" },
    ]);
    // Point the second central-directory record at the first local header.
    const view = new DataView(zip.buffer);
    const cdOffset = view.getUint32(zip.length - 6, true);
    const secondCentral = cdOffset + 46 + "a.txt".length;
    view.setUint32(secondCentral + 42, 0, true);
    expect(problemsOf(zip)).toContainEqual({
      file: expect.stringMatching(/^[ab]\.txt$/),
      message: expect.stringContaining("overlaps the data of"),
    });
  });

  test("rejects something that is not a ZIP archive", () => {
    expect(problemsOf(new TextEncoder().encode("plain text"))).toEqual([
      { file: "", message: expect.stringContaining("is not a ZIP archive") },
    ]);
  });
});
