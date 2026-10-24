export type * from "./course.js";
export { newContentId, newProjectId, withNewProjectId } from "./ids.js";
export type { JsonObject, MigrateResult, Migration } from "./migrate.js";
export { compareVersions, MIGRATIONS, migrate, parseVersion, SCHEMA_VERSION } from "./migrate.js";
export type { OpenResult } from "./open.js";
export { openCourse, serializeCourse } from "./open.js";
export type { ValidateOptions, ValidationError } from "./validate.js";
export { courseSchema, validateCourse } from "./validate.js";
