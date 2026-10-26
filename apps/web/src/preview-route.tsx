// Dev and test page of the preview pane (M2-11, ENG-13), next to the kit gallery: a course in an
// in-memory editing session, shown in the real player. It runs under the desktop app's content
// security policy (vite.config.ts), so the browser tests prove the preview works inside it.
// A test hands in its course before the page loads (`window.previewInput`), then changes the course
// through `window.previewEditor`, as the editor would. `?theme=light|dark` pins the theme and
// `?lesson=<id>` opens the preview at that lesson.
import "@course-suite/ui/styles.css";
import "./preview-route.css";
import { createEditor, type Editor } from "@course-suite/doc-ops";
import type { Course } from "@course-suite/format";
import { sampleCourse } from "@course-suite/format/test/courses";
import { type Preview, PreviewPane, UiProvider } from "@course-suite/ui";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    /** The course to preview and its media files as base64, by storage key. */
    previewInput?: { course: Course; media?: Record<string, string> };
    previewEditor?: Editor;
    previewHandle?: Pick<Preview, "page" | "scrollY" | "calls" | "restart"> | null;
    /** Milliseconds each load took to show the course. */
    previewRenders?: number[];
  }
}

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
const input = window.previewInput ?? { course: sampleCourse() };
const editor = createEditor(input.course);
window.previewEditor = editor;
window.previewRenders = [];
const bytes = new Map(
  Object.entries(input.media ?? {}).map(([key, base64]) => [
    key,
    Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
  ]),
);
const media = (key: string) => bytes.get(key);

function Route() {
  const [status, setStatus] = useState("");
  return (
    <main className="route">
      <p className="route-status" role="status">
        {status}
      </p>
      <div className="route-pane">
        <PreviewPane
          source={editor}
          media={media}
          start={params.get("lesson") ?? undefined}
          onEdit={(page) => {
            const title = editor.document.entries.find((entry) => entry.id === page)?.title;
            setStatus(title ? `Editing ${title}` : "Editing the course overview");
          }}
          onRender={(ms) => window.previewRenders?.push(ms)}
          ref={(handle) => {
            window.previewHandle = handle;
          }}
        />
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("preview.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <UiProvider locale="en">
      <Route />
    </UiProvider>
  </StrictMode>,
);
