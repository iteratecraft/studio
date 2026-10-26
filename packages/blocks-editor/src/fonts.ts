// The author's font library (BLK-09, ENG-08; blocks-editor.md T9, W21, UI-BLOCKS-EDITOR-R48): fonts
// the author uploads, with a regular face and optional bold and italic ones, kept in the app data
// folder through the host and usable in every course. A course names a library font by its id, so
// editing the font changes every course that uses it, and a course whose font was deleted shows the
// default font instead. The bundled fonts come from @course-suite/fonts, read from the app's own
// files. Both reach the preview and the exporters through one FontSource.
import {
  BUILTIN_FONT_FILES,
  type FontFace as Face,
  FONT_FACES,
  type FontFiles,
  fetchBytes,
  fontFormat,
  readBuiltinFont,
} from "@course-suite/fonts";
import {
  defaultFont,
  type FontRef,
  type FontRole,
  fontKey,
  fontsOf,
  newContentId,
  type Theme,
} from "@course-suite/format";
import type { HostInterface } from "@course-suite/host";

export type FontFormat = "woff" | "woff2";

export interface LibraryFont {
  id: string;
  name: string;
  /** The format of each face it has; the regular face is always there. */
  faces: { regular: FontFormat } & Partial<Record<Exclude<Face, "regular">, FontFormat>>;
  /** Milliseconds since 1970. */
  updated: number;
}

/** New bytes for a face, `null` to remove an optional face, or undefined to keep it as it is. */
export type FaceChange = Uint8Array | null | undefined;

/** Where the list lives in the host's storage; the files are in the app data folder. */
const LIST_KEY = "fonts";
/** The largest font file taken: every package that uses the font carries it. */
export const FONT_MAX_BYTES = 5_000_000;
/** The longest font name. */
export const FONT_NAME_MAX = 60;

const dataName = (id: string, face: Face, format: FontFormat) => `fonts/${id}/${face}.${format}`;

/** Why a picked file cannot be a font face, or undefined when it can. */
export function fontFileProblem(bytes: Uint8Array): "tooLarge" | "notFont" | undefined {
  if (bytes.length > FONT_MAX_BYTES) return "tooLarge";
  return fontFormat(bytes) ? undefined : "notFont";
}

function isFont(value: unknown): value is LibraryFont {
  const font = value as Partial<LibraryFont> | null;
  const format = (f: unknown) => f === "woff" || f === "woff2";
  return (
    typeof font === "object" &&
    font !== null &&
    typeof font.id === "string" &&
    /^[a-z][a-z0-9]{9}$/.test(font.id) &&
    typeof font.name === "string" &&
    typeof font.faces === "object" &&
    font.faces !== null &&
    format(font.faces.regular) &&
    (font.faces.bold === undefined || format(font.faces.bold)) &&
    (font.faces.italic === undefined || format(font.faces.italic)) &&
    Number.isFinite(font.updated)
  );
}

export class FontLibrary {
  readonly #host: HostInterface;
  #fonts: LibraryFont[] = [];
  readonly #listeners = new Set<() => void>();
  /** Font files read, by font key, with the `updated` of the library font they are of (0: bundled). */
  readonly #read = new Map<string, { stamp: number; files: Promise<FontFiles> }>();
  /** Goes up on every change, for React's useSyncExternalStore. */
  version = 0;

  constructor(host: HostInterface) {
    this.#host = host;
  }

  get fonts(): readonly LibraryFont[] {
    return this.#fonts;
  }

  find(id: string): LibraryFont | undefined {
    return this.#fonts.find((font) => font.id === id);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Reads the saved list; entries without the expected shape are left out. */
  async load(): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse((await this.#host.storage.get(LIST_KEY)) ?? "[]");
    } catch {
      value = [];
    }
    this.#fonts = Array.isArray(value) ? value.filter(isFont) : [];
    this.#emit();
  }

  /**
   * Adds a font (no `id`) or changes one: its name and the faces in `faces`. A new font needs its
   * regular face. Files are written before the list, so the list never names a missing file.
   */
  async save({
    id,
    name,
    faces,
  }: {
    id?: string;
    name: string;
    faces: Partial<Record<Face, FaceChange>>;
  }): Promise<LibraryFont> {
    const old = id === undefined ? undefined : this.find(id);
    if (id !== undefined && !old) throw new Error(`No font ${id} in the library`);
    const taken = new Set(this.#fonts.map((font) => font.id));
    let fontId = old?.id ?? newContentId();
    while (!old && taken.has(fontId)) fontId = newContentId();
    const formats: Partial<Record<Face, FontFormat>> = { ...old?.faces };
    const stale: string[] = [];
    for (const face of FONT_FACES) {
      const change = faces[face];
      if (change === undefined) continue;
      const before = formats[face];
      if (change === null) {
        if (face === "regular") throw new Error("A font needs its regular face");
        delete formats[face];
      } else {
        const format = fontFormat(change);
        if (!format || change.length > FONT_MAX_BYTES) throw new Error(`${face} is not a font`);
        await this.#host.files.write(
          await this.#host.files.dataFile(dataName(fontId, face, format)),
          change,
        );
        formats[face] = format;
        if (before === format) continue;
      }
      if (before) stale.push(dataName(fontId, face, before));
    }
    if (!formats.regular) throw new Error("A font needs its regular face");
    const font: LibraryFont = {
      id: fontId,
      name: name.trim(),
      faces: formats as LibraryFont["faces"],
      updated: Date.now(),
    };
    await this.#store(
      old ? this.#fonts.map((f) => (f.id === fontId ? font : f)) : [...this.#fonts, font],
    );
    await this.#removeFiles(stale);
    return font;
  }

  /** Deletes a font and its files; courses that use it show the default font from now on. */
  async remove(id: string): Promise<void> {
    const font = this.find(id);
    if (!font) return;
    await this.#store(this.#fonts.filter((other) => other.id !== id));
    await this.#removeFiles(
      FONT_FACES.flatMap((face) => {
        const format = font.faces[face];
        return format ? [dataName(id, face, format)] : [];
      }),
    );
  }

  /**
   * The files of a font, bundled or from this library as it is now; undefined for a library font
   * that is gone. One function for the library's life, so a preview keeps it; see ThemeView for
   * how a change shows.
   */
  readonly source = (font: FontRef): Promise<FontFiles | undefined> => {
    const found = font.kind === "custom" ? this.find(font.id) : undefined;
    if (font.kind === "custom" && !found) return Promise.resolve(undefined);
    // Read once per version of a font: the preview asks again on every edit of the course.
    const key = fontKey(font);
    const stamp = found?.updated ?? 0;
    const cached = this.#read.get(key);
    if (cached?.stamp === stamp) return cached.files;
    const files =
      font.kind === "builtin"
        ? readBuiltinFont(font.id, fetchBytes)
        : this.#readFiles(found as LibraryFont);
    // A failed read is tried again next time.
    files.catch(() => {
      if (this.#read.get(key)?.files === files) this.#read.delete(key);
    });
    this.#read.set(key, { stamp, files });
    return files;
  };

  async #readFiles(font: LibraryFont): Promise<FontFiles> {
    const files: FontFiles = { name: font.name, regular: new Uint8Array() };
    for (const face of FONT_FACES) {
      const format = font.faces[face];
      if (!format) continue;
      files[face] = await this.#host.files.read(
        await this.#host.files.dataFile(dataName(font.id, face, format)),
      );
    }
    return files;
  }

  /**
   * Asks the author for a WOFF or WOFF2 file through the host's open dialog; undefined when they
   * cancel. `filter` names the file type in the dialog.
   */
  async pickFile(filter: string): Promise<{ name: string; bytes: Uint8Array } | undefined> {
    const [file] = await this.#host.files.pickOpen({
      filters: [{ name: filter, extensions: ["woff", "woff2"] }],
    });
    return file && { name: file.name, bytes: await this.#host.files.read(file) };
  }

  /**
   * The font each role of `theme` shows in: a library font that is gone gives way to the default
   * of its role (UI-BLOCKS-EDITOR-R48).
   */
  resolve(theme: Theme | undefined): Record<FontRole, FontRef> {
    const chosen = fontsOf(theme);
    const role = (name: FontRole) => {
      const font = chosen[name];
      return font.kind === "custom" && !this.find(font.id) ? defaultFont(name) : font;
    };
    return { heading: role("heading"), body: role("body"), ui: role("ui") };
  }

  async #store(fonts: LibraryFont[]): Promise<void> {
    await this.#host.storage.set(LIST_KEY, JSON.stringify(fonts));
    this.#fonts = fonts;
    this.#emit();
  }

  async #removeFiles(names: string[]): Promise<void> {
    for (const name of names) {
      // A file left behind costs space, not correctness: the list no longer names it.
      await this.#host.files.remove(await this.#host.files.dataFile(name)).catch(() => {});
    }
  }

  #emit() {
    this.version += 1;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** Faces registered in this page by font key, with the library version they came from. */
const registered = new Map<string, { stamp: string; faces: FontFace[] }>();

/**
 * Makes a font usable in the editor's own page under its key (`fontKey`), as the player names it,
 * so block previews and font lists show it. Bundled faces load from the app's files when text first
 * needs them; a library font's faces are read once per change of it.
 */
export async function registerFont(font: FontRef, library: FontLibrary): Promise<string> {
  const key = fontKey(font);
  if (typeof FontFace === "undefined" || typeof document === "undefined") return key;
  const stamp = font.kind === "builtin" ? "builtin" : String(library.find(font.id)?.updated);
  if (registered.get(key)?.stamp === stamp) return key;
  const faces: FontFace[] = [];
  const descriptors = (face: Face) => ({
    weight: face === "bold" ? "700" : "400",
    style: face === "italic" ? "italic" : "normal",
  });
  if (font.kind === "builtin") {
    for (const face of FONT_FACES) {
      faces.push(
        new FontFace(key, `url("${BUILTIN_FONT_FILES[font.id][face]}")`, descriptors(face)),
      );
    }
  } else {
    const files = await library.source(font);
    for (const face of FONT_FACES) {
      const bytes = files?.[face];
      if (bytes?.length) faces.push(new FontFace(key, bytes.slice().buffer, descriptors(face)));
    }
  }
  for (const old of registered.get(key)?.faces ?? []) document.fonts.delete(old);
  for (const face of faces) document.fonts.add(face);
  registered.set(key, { stamp, faces });
  return key;
}
