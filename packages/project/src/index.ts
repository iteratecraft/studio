// The project container (M2-04, ENG-11, D-4): one ZIP-based file per course with a
// content-addressed asset store and snapshots, crash-safe saves and autosave recovery. Runs in a
// browser, a Web Worker and Node.js; files are reached only through the ProjectFiles port.
export type { ProjectProblem } from "./container.js";
export { PROJECT_EXTENSION, PROJECT_FORMAT_VERSION } from "./container.js";
export type { ProjectFiles } from "./files.js";
export { memoryProjectFiles } from "./files.js";
export type { Asset, AssetInfo, Project, Snapshot, SnapshotTrigger } from "./project.js";
export {
  addAsset,
  createProject,
  readAsset,
  restoreAsNewCourse,
  restoreSnapshot,
  takeSnapshot,
} from "./project.js";
export type { OpenedProject } from "./store.js";
export {
  autosaveFolder,
  autosaveProject,
  discardAutosaves,
  openProject,
  saveProject,
} from "./store.js";
