// CRC-32 (ISO 3309, the checksum ZIP stores per entry), for runtimes without zlib. Slicing by 8:
// eight tables let the loop take 8 bytes a step, about 2.5 times the speed of one table in V8.
const TABLES = new Uint32Array(256 * 8);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLES[n] = c;
}
for (let i = 256; i < TABLES.length; i++) {
  const previous = TABLES[i - 256] as number;
  TABLES[i] = (previous >>> 8) ^ (TABLES[previous & 0xff] as number);
}

/** The CRC-32 of `data`; pass the previous result as `crc` to continue over several chunks. */
export function crc32(data: Uint8Array, crc = 0): number {
  const t = TABLES;
  const at = (i: number) => data[i] as number;
  const table = (i: number) => t[i] as number;
  let c = ~crc;
  let i = 0;
  for (const end = data.length - (data.length % 8); i < end; i += 8) {
    const a = (at(i) | (at(i + 1) << 8) | (at(i + 2) << 16) | (at(i + 3) << 24)) ^ c;
    c =
      table(1792 + (a & 0xff)) ^
      table(1536 + ((a >>> 8) & 0xff)) ^
      table(1280 + ((a >>> 16) & 0xff)) ^
      table(1024 + (a >>> 24)) ^
      table(768 + at(i + 4)) ^
      table(512 + at(i + 5)) ^
      table(256 + at(i + 6)) ^
      table(at(i + 7));
  }
  for (; i < data.length; i++) c = table((c ^ at(i)) & 0xff) ^ (c >>> 8);
  return ~c >>> 0;
}
