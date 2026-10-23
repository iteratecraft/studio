// Bit packing for resume payloads (standards.md §4.2). Content ids (ADR-0002) take 52 bits instead
// of 10 characters, small counts take a few bits, and the result is written in the URL-safe base64
// alphabet, which LMSs store unchanged. A general-purpose compressor gains almost nothing here: the
// payload is mostly random ids.

const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CONTENT_ID = /^[a-z][a-z0-9]{9}$/;
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Characters of a JavaScript number's shortest text form; code 14 ends a number. */
const NUMBER_CHARS = "0123456789.-e+";
const HALF = 2 ** 26;

export class BitWriter {
  #out = "";
  #buffer = 0;
  #bits = 0;

  /** Writes `value` (below 2^size) in `size` bits, size at most 26. */
  bits(value: number, size: number): void {
    this.#buffer = this.#buffer * 2 ** size + value;
    this.#bits += size;
    while (this.#bits >= 6) {
      this.#bits -= 6;
      const digit = Math.floor(this.#buffer / 2 ** this.#bits);
      this.#out += DIGITS[digit];
      this.#buffer -= digit * 2 ** this.#bits;
    }
  }

  /** A whole number in groups of `group` bits, each after a "more follows" bit. */
  uint(value: number, group: number): void {
    const base = 2 ** group;
    const groups: number[] = [];
    do {
      groups.push(value % base);
      value = Math.floor(value / base);
    } while (value > 0);
    for (let i = groups.length - 1; i >= 0; i--) {
      this.bits(i > 0 ? 1 : 0, 1);
      this.bits(groups[i] as number, group);
    }
  }

  text(value: string): void {
    this.uint(value.length, 4);
    for (let i = 0; i < value.length; i++) this.uint(value.charCodeAt(i), 7);
  }

  /** An id: 52 bits when it is a content id, otherwise its text. */
  id(value: string): void {
    if (!CONTENT_ID.test(value)) {
      this.bits(0, 1);
      this.text(value);
      return;
    }
    let packed = 0;
    for (const c of value) packed = packed * 36 + ID_CHARS.indexOf(c);
    this.bits(1, 1);
    this.bits(Math.floor(packed / HALF), 26);
    this.bits(packed % HALF, 26);
  }

  /** A finite number, exactly: its shortest text form at 4 bits a character. */
  number(value: number): void {
    for (const c of String(value)) this.bits(NUMBER_CHARS.indexOf(c), 4);
    this.bits(NUMBER_CHARS.length, 4);
  }

  /** The packed text; the last character is padded with zero bits. */
  end(): string {
    if (this.#bits > 0) this.bits(0, 6 - this.#bits);
    return this.#out;
  }
}

/** Thrown by BitReader on input a BitWriter cannot have written. */
export class Malformed extends Error {}

export class BitReader {
  #data: string;
  #position = 0;
  #buffer = 0;
  #bits = 0;

  constructor(data: string) {
    this.#data = data;
  }

  bits(size: number): number {
    while (this.#bits < size) {
      if (this.#position >= this.#data.length) throw new Malformed();
      const digit = DIGITS.indexOf(this.#data.charAt(this.#position++));
      if (digit < 0) throw new Malformed();
      this.#buffer = this.#buffer * 64 + digit;
      this.#bits += 6;
    }
    this.#bits -= size;
    const value = Math.floor(this.#buffer / 2 ** this.#bits);
    this.#buffer -= value * 2 ** this.#bits;
    return value;
  }

  uint(group: number): number {
    let value = 0;
    let more = 1;
    while (more) {
      more = this.bits(1);
      value = value * 2 ** group + this.bits(group);
      if (value > Number.MAX_SAFE_INTEGER) throw new Malformed();
    }
    return value;
  }

  text(): string {
    const length = this.uint(4);
    let value = "";
    for (let i = 0; i < length; i++) {
      const code = this.uint(7);
      if (code > 0xffff) throw new Malformed();
      value += String.fromCharCode(code);
    }
    return value;
  }

  id(): string {
    if (!this.bits(1)) return this.text();
    let packed = this.bits(26) * HALF + this.bits(26);
    let value = "";
    for (let i = 0; i < 10; i++) {
      value = ID_CHARS.charAt(packed % 36) + value;
      packed = Math.floor(packed / 36);
    }
    if (packed !== 0 || !CONTENT_ID.test(value)) throw new Malformed();
    return value;
  }

  number(): number {
    let text = "";
    for (let code = this.bits(4); code !== NUMBER_CHARS.length; code = this.bits(4)) {
      if (code > NUMBER_CHARS.length) throw new Malformed();
      text += NUMBER_CHARS[code];
    }
    const value = Number(text);
    if (text === "" || !Number.isFinite(value)) throw new Malformed();
    return value;
  }

  /** Throws unless everything was read and only zero padding is left. */
  end(): void {
    if (this.#position !== this.#data.length || this.#buffer !== 0) throw new Malformed();
  }
}
