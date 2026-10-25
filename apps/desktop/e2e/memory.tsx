// The desktop page with the in-memory host instead of Tauri, for page.e2e.ts.
import "@course-suite/ui/styles.css";
import "@course-suite/blocks-editor/styles.css";
import { BlocksEditorApp } from "@course-suite/blocks-editor";
import { createMemoryHost } from "@course-suite/host";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("memory.html has no #root element");
createRoot(root).render(<BlocksEditorApp host={createMemoryHost({ app: { version: "9.9.9" } })} />);
