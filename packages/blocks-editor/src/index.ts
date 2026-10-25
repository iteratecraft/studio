// The blocks editor (M2-08 onward): runtime-neutral React screens that reach files, dialogs and the
// window only through @course-suite/host, used by apps/desktop and apps/web. Import
// "@course-suite/ui/styles.css" and "@course-suite/blocks-editor/styles.css" once in the app.
export { BlocksEditorApp, type BlocksEditorAppProps } from "./app.js";
export { AUTOSAVE_DELAY_MS, CourseSession, type SaveState } from "./session.js";
