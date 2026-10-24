// Tracking core and resume codec (STD-01): standard-neutral status, write schedule and adapter
// interface, a debug adapter, the resume payload format every standard's adapter stores, and the
// SCORM 1.2 (STD-04) and SCORM 2004 (STD-05) adapters.
export type {
  AdapterCall,
  KeyValueStorage,
  MemoryAdapter,
  MemoryAdapterOptions,
} from "./memory.js";
export { createMemoryAdapter } from "./memory.js";
export type {
  DecodeResult,
  DropPart,
  EncodeOptions,
  EncodeResult,
  ResumeState,
  ResumeWarning,
} from "./resume.js";
export {
  checkResume,
  DROP_ORDER,
  decodeResume,
  encodeResume,
  pruneResume,
  RESUME_CAPS,
  RESUME_FORMAT,
} from "./resume.js";
export type { ScormWindow } from "./scorm.js";
export { API_SEARCH_DEPTH, ScormError } from "./scorm.js";
export type { Scorm12AdapterOptions, Scorm12Api } from "./scorm12.js";
export { createScorm12Adapter, findScorm12Api, timespan } from "./scorm12.js";
export type { Scorm2004AdapterOptions, Scorm2004Api } from "./scorm2004.js";
export { createScorm2004Adapter, duration, findScorm2004Api } from "./scorm2004.js";
export type {
  Clock,
  Completion,
  Launch,
  Mode,
  Session,
  Status,
  Success,
  Tracker,
  TrackerOptions,
  TrackingAdapter,
} from "./tracker.js";
export { createTracker } from "./tracker.js";
