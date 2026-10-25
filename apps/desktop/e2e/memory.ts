// The desktop page with the in-memory host instead of Tauri, for page.e2e.ts.
import { createMemoryHost } from "@course-suite/host";
import { showPage } from "../src/page.js";

const root = document.getElementById("app");
if (!root) throw new Error("memory.html has no #app element");
await showPage(createMemoryHost({ app: { version: "9.9.9" } }), root);
