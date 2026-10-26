// The desktop app's page (M2-08): the blocks editor over the desktop host (ADR-0006).
import "@course-suite/ui/styles.css";
import "@course-suite/blocks-editor/styles.css";
import { BlocksEditorApp } from "@course-suite/blocks-editor";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createDesktopHost } from "./desktop-host.js";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <BlocksEditorApp host={createDesktopHost()} />
  </StrictMode>,
);
