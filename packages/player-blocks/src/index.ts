// Blocks player (ENG-04). The browser entry is `./boot` (built as one classic script, ADR-0003);
// this entry gives builders and tests the package contract: the data file, the index page, the
// chunk loader, lesson addresses, the progress engine, the player lifecycle, and the block renderer,
// which the editor's block previews use.
export { type BlockContext, renderBlock } from "./blocks.js";
export type { PlayerRegistry } from "./boot.js";
export type { CourseData, PlayerFiles } from "./data.js";
export {
  CHUNK_DIR,
  CHUNK_NAME,
  CHUNK_TIMEOUT_MS,
  courseDataScript,
  DATA_CHUNK,
  DATA_FILE,
  DATA_TIMEOUT_MS,
  decodeCourseData,
  indexPage,
  REGISTRY_GLOBAL,
} from "./data.js";
export { fileUrl, HOOKS_GLOBAL, type PlayerHooks } from "./hooks.js";
export { ChunkLoadError, createLoader, type Load } from "./loader.js";
export {
  type Attempt,
  createProgress,
  ESTIMATED_ATTEMPTS,
  largestResume,
  type PageStatus,
  type Progress,
  type QuizState,
  type Requirement,
  requirement,
  requiresCorrect,
} from "./progress.js";
export {
  COVER_HASH,
  lessonNumber,
  type Page,
  pageHash,
  pagesOf,
  parseRoute,
  type Route,
} from "./route.js";
export {
  COMMIT_INTERVAL_MS,
  courseStatus,
  type PlayerEvent,
  RESUME_DELAY_MS,
  type Runtime,
  type RuntimeOptions,
  startRuntime,
  type TimedEvent,
} from "./runtime.js";
