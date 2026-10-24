// Blocks player (ENG-04). The browser entry is `./boot` (built as one classic script, ADR-0003);
// this entry gives builders and tests the package contract: the data file, the index page, the
// chunk loader and lesson addresses.
export type { PlayerRegistry } from "./boot.js";
export type { CourseData } from "./data.js";
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
export { ChunkLoadError, createLoader, type Load } from "./loader.js";
export {
  COVER_HASH,
  lessonNumber,
  type Page,
  pageHash,
  pagesOf,
  parseRoute,
  type Route,
} from "./route.js";
