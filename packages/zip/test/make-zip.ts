// Writes small ZIP archives for tests, including deliberately hostile ones. Test code only.
import { crc32, deflateRaw } from "../src/index.js";

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

const utf8 = new TextEncoder();

export async function makeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  // Entries that share one data value are deflated once, so big hostile archives build quickly.
  const deflated = new Map<Uint8Array | string, Uint8Array>();
  let offset = 0;
  for (const entry of entries) {
    const name = utf8.encode(entry.name);
    const source = entry.data ?? "";
    const raw = typeof source === "string" ? utf8.encode(source) : source;
    const method = entry.method ?? 8;
    let data = raw;
    if (method === 8) {
      data = deflated.get(source) ?? (await deflateRaw(raw));
      deflated.set(source, data);
    }
    const crc = entry.crc ?? crc32(raw);
    const size = entry.declaredSize ?? raw.length;
    const flags = (entry.flags ?? 0) | 0x800;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc >>> 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, entry.unixMode === undefined ? 20 : (3 << 8) | 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, flags, true);
    central.setUint16(10, method, true);
    central.setUint32(16, crc >>> 0, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(38, ((entry.unixMode ?? 0) << 16) >>> 0, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
