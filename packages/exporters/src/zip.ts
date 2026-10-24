// Writes a ZIP archive whose bytes depend only on its files: entries in code-unit order of their
// names, one fixed timestamp, no extra fields and fixed compression settings, so the same files
// always give the same archive (STD-02 "reproducible output").
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipFile {
  /** Entry name: forward slashes, relative, UTF-8. */
  name: string;
  data: Uint8Array;
}

// shortcut: no ZIP64, so an archive holds at most 65,535 entries and 4 GiB; add ZIP64 (STD-02
// "32-bit or zip64 as needed") when a course needs more.
export const ZIP_MAX_ENTRIES = 0xffff;
export const ZIP_MAX_BYTES = 0xffffffff;

/** 1980-01-01 00:00:00, the earliest MS-DOS date, for every entry. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const UTF8_NAMES = 0x0800;
const VERSION = 20;
/** Formats that are compressed already; deflating them again costs time and saves nothing. */
const STORE = /\.(?:png|jpe?g|gif|webp|avif|mp4|m4v|webm|ogv|mp3|m4a|oga|ogg|opus|woff2?|zip|gz)$/i;

/** The archive's bytes. Throws a RangeError when the files do not fit the format's limits. */
export function writeZip(files: readonly ZipFile[]): Uint8Array {
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
    const name = Buffer.from(file.name, "utf8");
    const deflated = STORE.test(file.name) ? undefined : deflateRawSync(file.data, { level: 9 });
    const stored = deflated === undefined || deflated.length >= file.data.length;
    const data = stored ? file.data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(file.data) >>> 0;
    if (file.data.length > ZIP_MAX_BYTES || offset > ZIP_MAX_BYTES) {
      throw new RangeError(`'${file.name}' does not fit in a ZIP without ZIP64 (4 GiB)`);
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION, 4); // made by MS-DOS (0), so no Unix mode is implied
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  if (offset > ZIP_MAX_BYTES || offset + centralSize + 22 > ZIP_MAX_BYTES) {
    throw new RangeError("the archive would be larger than 4 GiB, the limit without ZIP64");
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
