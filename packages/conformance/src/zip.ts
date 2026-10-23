// Reads a ZIP archive held in memory without ever writing it to disk. Every entry name, size and
// byte range is checked before any data is inflated, and inflation itself is capped at the size
// the archive declares, so a hostile archive fails with a problem instead of exhausting memory.
import { crc32, inflateRawSync } from "node:zlib";
import { fail, ok, type Problem, type Result } from "./result.js";

export interface ZipLimits {
  /** Most entries, directories included. */
  maxEntries: number;
  /** Most bytes all files may inflate to, together. */
  maxTotalBytes: number;
  /** Highest inflated-to-compressed ratio for an entry larger than `ratioFloorBytes`. */
  maxRatio: number;
  /** Entries up to this inflated size skip the ratio check; tiny text files compress very well. */
  ratioFloorBytes: number;
}

export const defaultZipLimits: ZipLimits = {
  maxEntries: 10_000,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxRatio: 100,
  ratioFloorBytes: 1024 * 1024,
};

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const UNIX = 3;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it rejects
const FORBIDDEN = /[\u0000-\u001f<>:"|?*]/;

/** Why `name` cannot be extracted safely on every supported OS, or undefined when it can. */
export function unsafeEntryName(name: string): string | undefined {
  if (name === "") return "has an empty name";
  if (name.includes("\\")) return "uses a backslash; ZIP names use forward slashes";
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return "is an absolute path";
  const segments = (name.endsWith("/") ? name.slice(0, -1) : name).split("/");
  for (const segment of segments) {
    if (segment === "..") return "climbs out of the package with '..'";
    if (segment === "" || segment === ".") return "has an empty or '.' path segment";
    if (FORBIDDEN.test(segment)) return "contains a character Windows does not allow in names";
    if (RESERVED.test(segment)) return `uses the reserved Windows device name '${segment}'`;
    if (/[. ]$/.test(segment)) return "has a segment ending in a dot or space";
  }
  return undefined;
}

interface CentralEntry {
  name: string;
  nameBytes: Uint8Array;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Inflates every file in `bytes`; returns them keyed by entry name. Directory entries are dropped. */
export function readZip(
  bytes: Uint8Array,
  limits: ZipLimits = defaultZipLimits,
): Result<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const archive = (message: string) => fail<Map<string, Uint8Array>>([{ file: "", message }]);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return archive("is not a ZIP archive (no end of central directory record)");
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 8, true) !== count) {
    return archive("spans several disks, which is not supported");
  }
  // shortcut: no ZIP64, so packages stay under 4 GiB and 65,535 entries; add ZIP64 if one needs more.
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return archive("is a ZIP64 archive, which is not supported");
  }
  if (count > limits.maxEntries) {
    return archive(`has ${count} entries; the limit is ${limits.maxEntries}`);
  }
  if (cdOffset + cdSize > eocd) return archive("has a central directory outside the archive");

  const problems: Problem[] = [];
  const entries: CentralEntry[] = [];
  const seen = new Map<string, string>();
  let total = 0;
  let at = cdOffset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > cdOffset + cdSize || view.getUint32(at, true) !== CENTRAL) {
      return archive(`has a damaged central directory at entry ${n + 1}`);
    }
    const madeBy = view.getUint16(at + 4, true) >> 8;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const mode = view.getUint32(at + 38, true) >>> 16;
    const localOffset = view.getUint32(at + 42, true);
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (at > cdOffset + cdSize) return archive(`has a damaged central directory at entry ${n + 1}`);

    let name: string;
    try {
      // shortcut: names must be UTF-8 (or ASCII); legacy code-page names are rejected, not guessed.
      name = utf8.decode(nameBytes);
    } catch {
      problems.push({ file: `entry ${n + 1}`, message: "has a name that is not valid UTF-8" });
      continue;
    }
    const problem = (message: string) => problems.push({ file: name, message });
    const unsafe = unsafeEntryName(name);
    if (unsafe) {
      problem(unsafe);
      continue;
    }
    const key = name.replace(/\/$/, "").normalize("NFC").toLowerCase();
    const clash = seen.get(key);
    if (clash !== undefined) {
      problem(`has the same name as '${clash}' (names are compared ignoring case)`);
      continue;
    }
    seen.set(key, name);
    if (madeBy === UNIX && (mode & S_IFMT) === S_IFLNK) {
      problem("is a symbolic link");
      continue;
    }
    if (name.endsWith("/")) continue;
    if (flags & 0x1) {
      problem("is encrypted");
      continue;
    }
    if (method !== 0 && method !== 8) {
      problem(`uses compression method ${method}; only stored (0) and deflate (8) are supported`);
      continue;
    }
    if (method === 0 && compressedSize !== size) {
      problem("is stored uncompressed but its two declared sizes differ");
      continue;
    }
    if (size > limits.ratioFloorBytes && size > compressedSize * limits.maxRatio) {
      problem(`inflates ${size} bytes from ${compressedSize} (limit ${limits.maxRatio}:1)`);
      continue;
    }
    total += size;
    entries.push({ name, nameBytes, method, crc, compressedSize, size, localOffset });
  }
  if (total > limits.maxTotalBytes) {
    problems.push({
      file: "",
      message: `inflates to ${total} bytes; the limit is ${limits.maxTotalBytes}`,
    });
  }
  if (problems.length > 0) return fail(problems);

  // Entries whose data overlap let a small archive inflate the same bytes many times.
  const files = new Map<string, Uint8Array>();
  let previousEnd = 0;
  let previousName = "";
  for (const entry of [...entries].sort((a, b) => a.localOffset - b.localOffset)) {
    const problem = (message: string) => problems.push({ file: entry.name, message });
    const local = entry.localOffset;
    if (local < previousEnd) {
      problem(`overlaps the data of '${previousName}'`);
      continue;
    }
    if (local + 30 > cdOffset || view.getUint32(local, true) !== LOCAL) {
      problem("has no local file header where the central directory points");
      continue;
    }
    const nameLength = view.getUint16(local + 26, true);
    const start = local + 30 + nameLength + view.getUint16(local + 28, true);
    const end = start + entry.compressedSize;
    if (end > cdOffset) {
      problem("has data that runs past the end of the file data");
      continue;
    }
    if (!sameBytes(bytes.subarray(local + 30, local + 30 + nameLength), entry.nameBytes)) {
      problem("has a different name in its local header than in the central directory");
      continue;
    }
    previousEnd = end;
    previousName = entry.name;
    const raw = bytes.subarray(start, end);
    let data: Uint8Array;
    try {
      // maxOutputLength stops inflation one byte past the declared size, whatever the data says.
      data = entry.method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: entry.size + 1 });
    } catch {
      problem("has compressed data that is damaged or inflates beyond its declared size");
      continue;
    }
    if (data.length !== entry.size) {
      problem(`inflates to ${data.length} bytes but declares ${entry.size}`);
      continue;
    }
    if (crc32(data) >>> 0 !== entry.crc) {
      problem("fails its CRC-32 check");
      continue;
    }
    files.set(entry.name, data);
  }
  return problems.length > 0 ? fail(problems) : ok(files);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
