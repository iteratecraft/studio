// Size gate for the desktop executable (M2-01, ADR-0006): the release build must stay at or under
// 15 MB. WebView2 is part of Windows and not counted. Run after `build:app`.
import { statSync } from "node:fs";
import { join } from "node:path";

const LIMIT_BYTES = 15_000_000;
const exe = join(import.meta.dirname, "../src-tauri/target/release/course-suite-desktop.exe");
const { size } = statSync(exe);
const mb = (bytes: number) => (bytes / 1_000_000).toFixed(2);
console.log(`Desktop executable: ${size} bytes (${mb(size)} MB), limit ${mb(LIMIT_BYTES)} MB.`);
if (size > LIMIT_BYTES) {
  console.error("The desktop executable is over its size limit; see ADR-0006.");
  process.exit(1);
}
