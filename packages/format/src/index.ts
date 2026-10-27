export { accentReadable, contrastRatio, luminance, SURFACE, textOn } from "./contrast.js";
export type * from "./course.js";
export { activityIri, newContentId, newProjectId, withNewProjectId } from "./ids.js";
export { mediaKeysIn, usedMediaKeys } from "./media.js";
export type { JsonObject, MigrateResult, Migration } from "./migrate.js";
export { compareVersions, MIGRATIONS, migrate, parseVersion, SCHEMA_VERSION } from "./migrate.js";
// M2-16: navigation settings and their rules.
export type { Navigation } from "./navigation.js";
export {
  hasSearch,
  isRestricted,
  isStepped,
  menuOf,
  pageButtonsOf,
  searchBlocked,
  skipAheadQuiz,
} from "./navigation.js";
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
export {
  isLessonLink,
  isSafeLink,
  LINK_PATTERN,
  lessonLink,
  RICH_TEXT_ATTRIBUTES,
  RICH_TEXT_DROPPED,
  RICH_TEXT_ELEMENTS,
} from "./richtext.js";
export type { BuiltinFontId, FontRole, ThemeColors } from "./theme.js";
export {
  BUILTIN_FONTS,
  contrastOf,
  cropOf,
  DEFAULT_HEADER_OVERLAY,
  DEFAULT_OVERLAY,
  DEFAULT_THEME_COLOR,
  FONT_PAIRINGS,
  fontKey,
  fontsOf,
  LAYOUT_STYLES,
  mix,
  nearestReadable,
  overlayColors,
  overlayFloor,
  PANEL,
  TEXT_SIZES,
  THEME_COLORS,
  textColor,
  themeColors,
  withLayoutStyle,
} from "./theme.js";
export type { CompiledSchema, Schema, ValidateOptions, ValidationError } from "./validate.js";
export { checkSchema, compileSchema, courseSchema, validateCourse } from "./validate.js";
export type { EmbedProvider, Setting } from "./variants.js";
export {
  deepestHeadingLevel,
  defaultHeadingLevel,
  EMBED_PROVIDERS,
  embedProvider,
  FULL_BLEED,
  headingLevel,
  settingsTable,
  VARIANTS,
  variantSettings,
} from "./variants.js";
export type { Cue, VttResult } from "./vtt.js";
export { cleanCueText, formatVttTime, parseVtt, parseVttTime, serializeVtt } from "./vtt.js";
