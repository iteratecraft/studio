// Writes a ZIP archive whose bytes depend only on its files: entries in code-unit order of their
// names, one fixed timestamp, no extra fields and fixed compression settings, so the same files
// always give the same archive in the same runtime (STD-02 "reproducible output"). Deflate is the
// runtime's own CompressionStream, so two runtimes may deflate the same file to different bytes.
import { crc32 } from "./crc32.js";

export interface ZipFile {
  /** Entry name: forward slashes, relative, UTF-8. */
  name: string;
  data: Uint8Array;
  /**
   * false stores the data as it is. By default the data is deflated unless its name is that of an
   * already compressed format, and stored when deflate would not make it smaller.
   */
  compress?: boolean;
}

// shortcut: no ZIP64, so an archive holds at most 65,535 entries and 4 GiB; add ZIP64 (STD-02
// "32-bit or zip64 as needed") when a course or project needs more.
export const ZIP_MAX_ENTRIES = 0xffff;
export const ZIP_MAX_BYTES = 0xffffffff;

/** 1980-01-01 00:00:00, the earliest MS-DOS date, for every entry. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const UTF8_NAMES = 0x0800;
const VERSION = 20;
/** Formats that are compressed already; deflating them again costs time and saves nothing. */
const STORE = /\.(?:png|jpe?g|gif|webp|avif|mp4|m4v|webm|ogv|mp3|m4a|oga|ogg|opus|woff2?|zip|gz)$/i;

const utf8 = new TextEncoder();

/** The archive's bytes. Rejects with a RangeError when the files do not fit the format's limits. */
export async function writeZip(files: readonly ZipFile[]): Promise<Uint8Array> {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (sorted.length > ZIP_MAX_ENTRIES) {
    throw new RangeError(`${sorted.length} files; a ZIP without ZIP64 holds ${ZIP_MAX_ENTRIES}`);
  }
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  let previous: string | undefined;
  for (const file of sorted) {
    if (file.name === previous) throw new RangeError(`'${file.name}' is in the archive twice`);
    previous = file.name;
    if (file.data.length > ZIP_MAX_BYTES || offset > ZIP_MAX_BYTES) {
      throw new RangeError(`'${file.name}' does not fit in a ZIP without ZIP64 (4 GiB)`);
    }
    const name = utf8.encode(file.name);
    const deflate = file.compress ?? !STORE.test(file.name);
    const deflated = deflate ? await deflateRaw(file.data) : undefined;
    const stored = deflated === undefined || deflated.length >= file.data.length;
    const data = stored ? file.data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(file.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, VERSION, true);
    local.setUint16(6, UTF8_NAMES, true);
    local.setUint16(8, method, true);
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    locals.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, VERSION, true); // made by MS-DOS (0), so no Unix mode is implied
    central.setUint16(6, VERSION, true);
    central.setUint16(8, UTF8_NAMES, true);
    central.setUint16(10, method, true);
    central.setUint16(12, DOS_TIME, true);
    central.setUint16(14, DOS_DATE, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  if (offset > ZIP_MAX_BYTES || offset + centralSize + 22 > ZIP_MAX_BYTES) {
    throw new RangeError("the archive would be larger than 4 GiB, the limit without ZIP64");
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, sorted.length, true);
  end.setUint16(10, sorted.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return concat([...locals, ...centrals, new Uint8Array(end.buffer)]);
}

/** `data` deflated without a zlib or gzip wrapper, as ZIP stores it. */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
