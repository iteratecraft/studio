// Reads a ZIP archive held in memory without ever writing it to disk. Every entry name, size and
// byte range is checked before any data is inflated, and inflation itself is capped at the size
// the archive declares, so a hostile archive fails with a problem instead of exhausting memory.
// Files are inflated one at a time to verify them, and again when read, so the archive never
// holds all of its inflated files at once.
import { crc32 } from "./crc32.js";

/** One reason an archive was rejected. */
export interface ZipProblem {
  /** Entry name, or "" for the archive itself. */
  file: string;
  message: string;
}

export type ZipResult<T> = { ok: true; value: T } | { ok: false; problems: ZipProblem[] };

export interface ZipLimits {
  /** Most entries, directories included. */
  maxEntries: number;
  /** Most bytes all files may inflate to, together. */
  maxTotalBytes: number;
  /**
   * Highest inflated-to-compressed ratio, both for one entry and for the whole archive (the
   * declared sizes of all files over the archive's byte length).
   */
  maxRatio: number;
  /** An entry, or a whole archive, up to this inflated size skips the ratio check. */
  ratioFloorBytes: number;
}

export const defaultZipLimits: ZipLimits = {
  maxEntries: 10_000,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxRatio: 100,
  ratioFloorBytes: 1024 * 1024,
};

/** The verified files of an archive. Reading a file inflates it from the archive's bytes. */
export interface ZipArchive {
  /** File entry names in central-directory order; directory entries are dropped. */
  readonly names: readonly string[];
  has(name: string): boolean;
  /** The file's bytes, or undefined when the archive has no such file. */
  read(name: string): Promise<Uint8Array | undefined>;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const UNIX = 3;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it rejects
const FORBIDDEN = /[\u0000-\u001f<>:"|?*]/;
// Windows allows 255 UTF-16 units per name and most Unix file systems 255 UTF-8 bytes. The UTF-8
// byte count is never the smaller of the two, so one check covers both.
const MAX_SEGMENT_BYTES = 255;
/** Compressed bytes fed to the inflater at a time, so a lying entry overshoots by little. */
const INFLATE_SLICE = 16 * 1024;

const encoder = new TextEncoder();

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
    if (encoder.encode(segment).length > MAX_SEGMENT_BYTES) {
      return `has a segment longer than ${MAX_SEGMENT_BYTES} bytes`;
    }
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
  /** Byte range of the entry's data, set once its local header is checked. */
  start: number;
  end: number;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
const fail = <T>(problems: ZipProblem[]): ZipResult<T> => ({ ok: false, problems });

/** Checks every entry of `bytes` and returns its files. The archive keeps a view of `bytes`. */
export async function readZip(
  bytes: Uint8Array,
  limits: ZipLimits = defaultZipLimits,
): Promise<ZipResult<ZipArchive>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const archive = (message: string) => fail<ZipArchive>([{ file: "", message }]);

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
  // shortcut: no ZIP64, so archives stay under 4 GiB and 65,535 entries; add ZIP64 if one needs more.
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return archive("is a ZIP64 archive, which is not supported");
  }
  if (count > limits.maxEntries) {
    return archive(`has ${count} entries; the limit is ${limits.maxEntries}`);
  }
  if (cdOffset + cdSize > eocd) return archive("has a central directory outside the archive");

  const problems: ZipProblem[] = [];
  const entries: CentralEntry[] = [];
  const seen = new Map<string, string>();
  // Every folder that holds an entry, keyed like `seen`, to catch a file with a folder's name.
  const folders = new Set<string>();
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
    const key = nameKey(name);
    const clash = seen.get(key);
    if (clash !== undefined) {
      problem(`has the same name as '${clash}' (names are compared ignoring case)`);
      continue;
    }
    seen.set(key, name);
    for (let i = key.indexOf("/"); i >= 0; i = key.indexOf("/", i + 1)) {
      folders.add(key.slice(0, i));
    }
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
    entries.push({
      name,
      nameBytes,
      method,
      crc,
      compressedSize,
      size,
      localOffset,
      start: 0,
      end: 0,
    });
  }
  for (const entry of entries) {
    if (folders.has(nameKey(entry.name))) {
      problems.push({ file: entry.name, message: "is a file, but other entries sit inside it" });
    }
  }
  if (total > limits.maxTotalBytes) {
    problems.push({
      file: "",
      message: `inflates to ${total} bytes; the limit is ${limits.maxTotalBytes}`,
    });
  }
  // Many entries, each just inside the per-entry limits, still add up: bound the whole archive.
  if (total > limits.ratioFloorBytes && total > bytes.byteLength * limits.maxRatio) {
    problems.push({
      file: "",
      message: `inflates ${total} bytes from ${bytes.byteLength} (limit ${limits.maxRatio}:1)`,
    });
  }
  if (problems.length > 0) return fail(problems);

  // Entries whose data overlap let a small archive inflate the same bytes many times.
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
    entry.start = local + 30 + nameLength + view.getUint16(local + 28, true);
    entry.end = entry.start + entry.compressedSize;
    if (entry.end > cdOffset) {
      problem("has data that runs past the end of the file data");
      continue;
    }
    if (!sameBytes(bytes.subarray(local + 30, local + 30 + nameLength), entry.nameBytes)) {
      problem("has a different name in its local header than in the central directory");
      continue;
    }
    previousEnd = entry.end;
    previousName = entry.name;
  }
  if (problems.length > 0) return fail(problems);

  // Verify each file and drop its bytes before the next; stop at the first bad one.
  for (const entry of entries) {
    const data = await inflate(bytes, entry);
    if (typeof data === "string") return fail([{ file: entry.name, message: data }]);
  }

  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  return {
    ok: true,
    value: {
      names: entries.map((entry) => entry.name),
      has: (name) => byName.has(name),
      async read(name) {
        const entry = byName.get(name);
        if (!entry) return undefined;
        const data = await inflate(bytes, entry);
        if (typeof data === "string") {
          throw new Error(`'${name}' changed after the archive was verified: it ${data}`);
        }
        return data;
      },
    },
  };
}

/** How names are compared: without a trailing slash, NFC-normalised and ignoring case. */
function nameKey(name: string): string {
  return name.replace(/\/$/, "").normalize("NFC").toLowerCase();
}

/** The entry's inflated bytes, or why they are wrong. */
async function inflate(bytes: Uint8Array, entry: CentralEntry): Promise<Uint8Array | string> {
  const raw = bytes.subarray(entry.start, entry.end);
  // A stored file is copied so that no reader can change the archive's bytes through it.
  const data = entry.method === 0 ? raw.slice() : await inflateRaw(raw, entry.size);
  if (data === undefined) {
    return "has compressed data that is damaged or inflates beyond its declared size";
  }
  if (data.length !== entry.size) {
    return `inflates to ${data.length} bytes but declares ${entry.size}`;
  }
  if (crc32(data) !== entry.crc) return "fails its CRC-32 check";
  return data;
}

/**
 * Inflates raw deflate data, or returns undefined when it is damaged or inflates past `size`. The
 * input goes in slices and the output is counted as it comes, so inflation stops soon after `size`
 * whatever the data says.
 */
async function inflateRaw(raw: Uint8Array, size: number): Promise<Uint8Array | undefined> {
  const { readable, writable } = new DecompressionStream("deflate-raw");
  const writer = writable.getWriter();
  const reader = readable.getReader();
  let stop = false;
  // Errors reach the reader too, which reports them; the writer's own rejection is not needed.
  const writing = (async () => {
    for (let i = 0; i < raw.length && !stop; i += INFLATE_SLICE) {
      await writer.write(raw.subarray(i, i + INFLATE_SLICE) as Uint8Array<ArrayBuffer>);
    }
    if (!stop) await writer.close();
  })().catch(() => {});
  const out = new Uint8Array(size);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > size) {
        stop = true;
        await reader.cancel();
        return undefined;
      }
      out.set(value, length);
      length += value.length;
    }
  } catch {
    stop = true;
    return undefined;
  } finally {
    await writing;
  }
  return length === size ? out : out.slice(0, length);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
