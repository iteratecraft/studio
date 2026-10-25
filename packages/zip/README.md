# @course-suite/zip

ZIP writing and safe reading for course packages and project files. MIT. It has no dependencies
and uses only web-standard APIs (`CompressionStream` and `DecompressionStream` with
`deflate-raw`, `Blob`, `Response`, `TextEncoder`), so the same code runs in a browser, a Web Worker
and Node.js (ADR-0006).

- `writeZip(files)` returns the archive's bytes. Entries are sorted by name and carry one fixed
  timestamp, so the same files give the same bytes in the same runtime (STD-02). Data is deflated
  unless its name is an already compressed format, `compress: false` is set, or deflate would not
  make it smaller.
- `readZip(bytes, limits?)` checks every entry before inflating anything: unsafe names (`..`,
  absolute paths, backslashes, Windows device names and forbidden characters), duplicate names
  ignoring case, a file with a folder's name, symbolic links, encryption, unknown compression,
  overlapping data, entry count, total size and the inflate ratio per entry and per archive. Then it
  inflates each file once to verify its size and CRC-32, capped at the declared size. `read(name)`
  inflates a file again when it is needed, so the whole archive is never held inflated.
- `crc32(data, crc?)` and `deflateRaw(data)` are what both use.

Limits: no ZIP64 (at most 65,535 entries and 4 GiB), and entry names must be UTF-8. Deflate is the
runtime's own, so Chromium and Node.js may deflate the same file to different bytes.

`@course-suite/zip/test/make-zip` builds small and deliberately hostile archives for tests.
