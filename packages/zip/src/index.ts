// ZIP writing and safe reading on web-standard APIs (CompressionStream, DecompressionStream), so
// the same code runs in a browser, a Web Worker and Node.js (ADR-0006).
export { crc32 } from "./crc32.js";
export type { ZipArchive, ZipLimits, ZipProblem, ZipResult } from "./read.js";
export { defaultZipLimits, readZip, unsafeEntryName } from "./read.js";
export type { ZipFile } from "./write.js";
export { deflateRaw, writeZip, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES } from "./write.js";
