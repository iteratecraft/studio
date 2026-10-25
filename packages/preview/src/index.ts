// Real-player preview (ENG-13): the current course in the exact player bundle that gets published,
// in a sandboxed frame, built in memory and updated as the document changes. Runs in a browser
// (the desktop app's WebView2 and the server edition); the package builder parts also in Node.js.
export { type MediaSource, type PreviewPackage, previewPackage } from "./files.js";
export {
  FRAME_SCRIPT,
  FRAME_SCRIPT_HASH,
  FRAME_URL,
  type FromFrame,
  type PackageFile,
  type ToFrame,
} from "./frame.js";
export {
  createPreview,
  type Preview,
  type PreviewOptions,
  type PreviewSource,
  UPDATE_DELAY_MS,
} from "./preview.js";
