// Writes small ZIP archives for tests, including deliberately hostile ones. Test code only.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data?: Uint8Array | string;
  /** Default 8 (deflate); 0 stores the data. */
  method?: number;
  /** Overrides written into the headers to build broken or hostile archives. */
  declaredSize?: number;
  crc?: number;
  /** Unix mode; 0o120777 makes a symbolic link. */
  unixMode?: number;
  flags?: number;
}

export function makeZip(entries: ZipEntry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  // Entries that share one data value are deflated once, so big hostile archives build quickly.
  const deflated = new Map<Uint8Array | string, Buffer>();
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.data ?? "");
    const method = entry.method ?? 8;
    const source = entry.data ?? "";
    const data = method === 8 ? (deflated.get(source) ?? deflateRawSync(raw)) : raw;
    if (method === 8) deflated.set(source, data);
    const crc = entry.crc ?? crc32(raw);
    const size = entry.declaredSize ?? raw.length;
    const flags = (entry.flags ?? 0) | 0x800;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.unixMode === undefined ? 20 : (3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.unixMode ?? 0) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

/** Zips every file under `dir`, named by its path relative to `dir` with forward slashes. */
export function zipDirectory(dir: string): Uint8Array {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const path = join(e.parentPath, e.name);
      return { name: relative(dir, path).split(sep).join("/"), data: readFileSync(path) };
    });
  return makeZip(entries);
}
