// Package builder and exporters (STD-02, STD-04): one pipeline that turns a course into a validated,
// reproducible package for a standard, with one exporter plug-in per standard.
export type {
  BuildInput,
  BuiltPackage,
  CourseData,
  DescribeInput,
  Exporter,
  PackageFile,
  PlayerBundle,
  Standard,
} from "./builder.js";
export { buildPackage, MEDIA_FOLDER, unsafePath } from "./builder.js";
export type { Problem, Result } from "./result.js";
export { findModuleCode, findOutboundUrls, isAllowed, NAMESPACE_URIS, urlsIn } from "./scan.js";
export type { Scorm12Options } from "./scorm12.js";
export {
  SCORM12_IDS,
  SCORM12_MANIFEST,
  SCORM12_SCHEMAS,
  scorm12Exporter,
  scorm12Identifier,
} from "./scorm12.js";
export { writeZip, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES } from "./zip.js";
