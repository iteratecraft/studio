// The blocks editor in a plain browser against the in-memory host (M2-08): the dev and test route
// next to the kit gallery, which the Playwright tests drive. `?theme=light|dark` pins a theme.
// `window.editorTest` lets a test answer the file dialogs, read the in-memory disk, close the
// window and restart the app on the same disk, as after a crash.
import "@course-suite/ui/styles.css";
import "@course-suite/blocks-editor/styles.css";
import { BlocksEditorApp } from "@course-suite/blocks-editor";
import { createMemoryHost, type MemoryHost } from "@course-suite/host";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

interface EditorTest {
  host: MemoryHost;
  /** What the open dialog picks next; empty: the user cancels. */
  open: string[];
  /** What the save dialog picks next: an id, `null` to cancel, or undefined for the suggestion. */
  save: string | null | undefined;
  /** Unmounts the app without asking anything and starts it again on the same disk. */
  restart(): void;
}

declare global {
  interface Window {
    editorTest: EditorTest;
  }
}

const theme = new URLSearchParams(location.search).get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

const test: EditorTest = {
  host: createMemoryHost({
    onPickOpen: () => test.open,
    onPickSave: (options) =>
      test.save === undefined ? (options.suggestedName ?? null) : test.save,
  }),
  open: [],
  save: undefined,
  restart: () => {},
};
window.editorTest = test;

const element = document.getElementById("root");
if (!element) throw new Error("editor.html has no #root element");
let root = createRoot(element);
const render = () =>
  root.render(
    <StrictMode>
      <BlocksEditorApp host={test.host} />
    </StrictMode>,
  );
test.restart = () => {
  root.unmount();
  root = createRoot(element);
  render();
};
render();
