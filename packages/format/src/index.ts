export type * from "./course.js";
export { activityIri, newContentId, newProjectId, withNewProjectId } from "./ids.js";
export type { JsonObject, MigrateResult, Migration } from "./migrate.js";
export { compareVersions, MIGRATIONS, migrate, parseVersion, SCHEMA_VERSION } from "./migrate.js";
export type { OpenResult } from "./open.js";
export { openCourse, serializeCourse } from "./open.js";
export type { AnswerIdOptions, Interaction, QuizResult, Response, Score } from "./quiz.js";
export {
  answerId,
  DEFAULT_PASSING_SCORE,
  drawAttempt,
  drawFrom,
  interactionId,
  isCorrect,
  isPassed,
  plainText,
  quizResult,
  scoreAttempt,
  shuffle,
  toInteraction,
} from "./quiz.js";
export type { ValidateOptions, ValidationError } from "./validate.js";
export { courseSchema, validateCourse } from "./validate.js";
