import { createMemoryHost } from "@course-suite/host";
import { describe, expect, test } from "vitest";
import { FONT_MAX_BYTES, FontLibrary, fontFileProblem } from "./fonts.js";

const font = (tag: "wOF2" | "wOFF", text: string) => new TextEncoder().encode(`${tag}${text}`);

async function library() {
  const host = createMemoryHost();
  const fonts = new FontLibrary(host);
  await fonts.load();
  return { host, fonts };
}

const dataFiles = (host: ReturnType<typeof createMemoryHost>) =>
  [...host.disk.keys()].filter((id) => id.startsWith("appdata/")).sort();

describe("the author's font library (BLK-09, blocks-editor.md T9, W21)", () => {
  test("blocks-editor W21 adds a font with its regular face and optional bold and italic ones, kept in the app data folder for every course", async () => {
    const { host, fonts } = await library();
    const added = await fonts.save({
      name: "  House Hand ",
      faces: { regular: font("wOF2", "regular"), italic: font("wOFF", "italic") },
    });
    expect(added).toMatchObject({
      name: "House Hand",
      faces: { regular: "woff2", italic: "woff" },
    });
    expect(dataFiles(host)).toEqual([
      `appdata/fonts/${added.id}/italic.woff`,
      `appdata/fonts/${added.id}/regular.woff2`,
    ]);
    // Another session of the app finds it.
    const again = new FontLibrary(host);
    await again.load();
    expect(again.fonts).toEqual([added]);
    const files = await again.source({ kind: "custom", id: added.id, name: "House Hand" });
    expect(files?.name).toBe("House Hand");
    expect(new TextDecoder().decode(files?.italic)).toBe("wOFFitalic");
    expect(files?.bold).toBeUndefined();
  });

  test("UI-BLOCKS-EDITOR-R48 editing a font changes what every course using it gets; deleting it returns them to the default font", async () => {
    const { host, fonts } = await library();
    const added = await fonts.save({ name: "Comb", faces: { regular: font("wOF2", "one") } });
    const ref = { kind: "custom", id: added.id, name: "Comb" } as const;
    const theme = { fonts: { heading: ref } };
    expect(fonts.resolve(theme).heading).toEqual(ref);

    await fonts.save({ id: added.id, name: "Honeycomb", faces: { regular: font("wOFF", "two") } });
    const files = await fonts.source(ref);
    expect(files?.name).toBe("Honeycomb");
    expect(new TextDecoder().decode(files?.regular)).toBe("wOFFtwo");
    // The woff2 it replaced is gone.
    expect(dataFiles(host)).toEqual([`appdata/fonts/${added.id}/regular.woff`]);

    await fonts.remove(added.id);
    expect(fonts.fonts).toEqual([]);
    expect(dataFiles(host)).toEqual([]);
    expect(await fonts.source(ref)).toBeUndefined();
    expect(fonts.resolve(theme)).toEqual({
      heading: { kind: "builtin", id: "noto-sans" },
      body: { kind: "builtin", id: "noto-serif" },
      ui: { kind: "builtin", id: "noto-sans" },
    });
  });

  test("an optional face can be removed; the regular face cannot, and only WOFF or WOFF2 under 5 MB is taken", async () => {
    const { host, fonts } = await library();
    const added = await fonts.save({
      name: "Comb",
      faces: { regular: font("wOF2", "r"), bold: font("wOF2", "b") },
    });
    await fonts.save({ id: added.id, name: "Comb", faces: { bold: null } });
    expect(fonts.find(added.id)?.faces).toEqual({ regular: "woff2" });
    expect(dataFiles(host)).toEqual([`appdata/fonts/${added.id}/regular.woff2`]);
    await expect(
      fonts.save({ id: added.id, name: "Comb", faces: { regular: null } }),
    ).rejects.toThrow();
    await expect(fonts.save({ name: "No face", faces: {} })).rejects.toThrow();
    await expect(
      fonts.save({ name: "Text", faces: { regular: new TextEncoder().encode("hello") } }),
    ).rejects.toThrow();
    expect(fontFileProblem(new TextEncoder().encode("hello"))).toBe("notFont");
    expect(fontFileProblem(new Uint8Array(FONT_MAX_BYTES + 1))).toBe("tooLarge");
    expect(fontFileProblem(font("wOFF", ""))).toBeUndefined();
  });

  test("a damaged list in storage is read as the entries it can use", async () => {
    const host = createMemoryHost();
    await host.storage.set(
      "fonts",
      '[{"id":"bad"},{"id":"abcdefghij","name":"Ok","faces":{"regular":"woff2"},"updated":1}]',
    );
    const fonts = new FontLibrary(host);
    await fonts.load();
    expect(fonts.fonts.map((f) => f.name)).toEqual(["Ok"]);
    await host.storage.set("fonts", "not json");
    await fonts.load();
    expect(fonts.fonts).toEqual([]);
  });
});
