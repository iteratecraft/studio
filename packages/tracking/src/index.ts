// Tracking core and resume codec (STD-01): standard-neutral status, write schedule and adapter
// interface, a debug adapter, the resume payload format every standard's adapter stores, and the
// SCORM 1.2 adapter (STD-04), and the xAPI adapter with its LRS client (STD-06).

export type {
  HttpRequest,
  HttpResponse,
  Lrs,
  LrsOptions,
  StateParams,
  Transport,
} from "./lrs.js";
export {
  createLrs,
  LrsError,
  MAX_QUEUED_STATEMENTS,
  OFFLINE_RETRY_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  XAPI_VERSION,
} from "./lrs.js";
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
export type { Scorm12AdapterOptions, Scorm12Api, ScormWindow } from "./scorm12.js";
export {
  API_SEARCH_DEPTH,
  createScorm12Adapter,
  findScorm12Api,
  ScormError,
  timespan,
} from "./scorm12.js";
export type {
  Clock,
  Completion,
  Launch,
  Mode,
  QuestionRef,
  QuizAttempt,
  Session,
  Status,
  Success,
  Tracker,
  TrackerOptions,
  TrackingAdapter,
} from "./tracker.js";
export { createTracker } from "./tracker.js";
export type { Agent, LrsSettings, XapiAdapterOptions, XapiLaunch, XapiVerb } from "./xapi.js";
export {
  createXapiAdapter,
  interactionType,
  isoDuration,
  readXapiLaunch,
  response as xapiResponse,
  XAPI_ACTIVITY_TYPES,
  XAPI_STATE_ID,
  XAPI_VERBS,
} from "./xapi.js";
