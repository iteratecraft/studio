// Generated from course.schema.json by `pnpm format:types`. Do not edit.

/** A Blocks course document: the course content and nothing else (ADR-0002). */
export interface Course {
  schemaVersion: SchemaVersion;
  id: ProjectId;
  /** A full course, or a microlearning course shown one step at a time. */
  kind: "course" | "microlearning";
  title: string;
  description?: RichText;
  /** Authors shown to learners (the author byline). */
  authors?: Author[];
  /** Cover image. */
  cover?: MediaRef;
  /** Reserved: the theme or brand kit, owned by another container. */
  themeRef?: ExternalRef;
  labelSet?: LabelSetRef;
  sourceLanguage?: Language;
  /** Reserved: languages the course is translated into. */
  languages?: Language[];
  /** Reserved: translation glossary, owned by another container. */
  glossaryRef?: ExternalRef;
  publish?: PublishSettings;
  /** How learners move through the course. Every setting is optional; the default is given with each. */
  navigation?: {
    /** Lessons open only in order, each once the one before it is done; turns off learner mark-done. Default false; any quiz with skip-ahead turns it on. */
    restricted?: boolean;
    /** While navigation is free, learners may mark an unfinished lesson (not a quiz) done. Default false. */
    learnerMarkDone?: boolean;
    /** Learners may play videos from 0.25 to 2 times their speed. Default true. */
    videoSpeed?: boolean;
  };
  /** Ordered course outline. */
  entries: Entry[];
  /** Media index: every media file the document references, by storage key. */
  media: MediaEntry[];
  customBlocks?: CustomBlockDocument[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ext?: Ext;
}

/** MAJOR.MINOR. MINOR adds optional fields only; MAJOR is any other change. */
export type SchemaVersion = string;

/** Project id: a random version 4 UUID. */
export type ProjectId = string;

/** Content id, unique within the document: a lowercase letter and 9 lowercase letters or digits. */
export type Id = string;

/** Id of a lesson or quiz entry in this document. */
export type EntryRef = string;

/** Id of a quiz entry in this document. */
export type QuizRef = string;

/** Id of a category item in the same block. */
export type CategoryRef = string;

/** Id of a custom-block document in this document. */
export type CustomBlockRef = string;

/** Content id of an object in another container. */
export type ExternalId = string;

/** Reference to an object owned by another container (library, question bank, template); never reported as missing. */
export interface ExternalRef {
  containerId: ProjectId;
  id: ExternalId;
}

/** Extension data, keyed by reverse-DNS namespace; each value is any JSON and is kept verbatim. */
export type Ext = Record<string, unknown>;

/** An HTML fragment. */
export type RichText = string;

/** BCP 47 language tag. */
export type Language = string;

/** A lowercase kebab-case name. */
export type Token = string;

export type Color = string;

/** RFC 3339 date and time in UTC. */
export type Timestamp = string;

export type Url = string;

export type Percent = number;

/** Key of a media file in the project container. */
export type StorageKey = string;

/** Key of an optimised variant of a media file in the project container. */
export type VariantKey = string;

/** Storage key of an entry in the media index. */
export type MediaKeyRef = string;

/** One media file in the media index; the bytes live in the project container. */
export interface MediaEntry {
  id: Id;
  key: StorageKey;
  variantKey?: VariantKey;
  mimeType?: string;
  /** Original width in pixels. */
  width?: number;
  /** Original height in pixels. */
  height?: number;
  source: "upload" | "ai" | "stock" | "default";
  /** Reserved (AI provenance): the prompt that generated this file. */
  aiPrompt?: string;
  /** Reserved: licence of the file, an SPDX id where one exists. */
  licence?: string;
  /** Reserved: attribution text the licence requires. */
  attribution?: string;
  ext?: Ext;
}

/** Use of a media file from the media index. */
export interface MediaRef {
  key: MediaKeyRef;
  /** Alternative text; empty marks the image as decorative. */
  alt?: string;
  /** Caption tracks of a video, one WebVTT file per language. */
  captions?: CaptionTrack[];
}

/** A WebVTT caption file of a video, in one language. */
export interface CaptionTrack {
  key: MediaKeyRef;
  language: Language;
}

export interface Author {
  name: string;
  avatar?: MediaRef;
}

/** Learner-facing strings: the built-in set for a language, or a set owned by another container. */
export interface LabelSetRef {
  language: Language;
  set?: ExternalRef;
}

/** Default export settings. */
export interface PublishSettings {
  standard: "scorm12" | "scorm2004" | "xapi" | "cmi5" | "web";
  scorm2004Edition?: "2nd" | "3rd" | "4th";
  /** Status the LMS records when the course is done, and while it is not. */
  statusWording?: {
    done: "completed" | "passed";
    notDone: "incomplete" | "failed";
  };
  /** Score in percent at or above which the learner passes. */
  passingScore?: number;
  /** What decides completion: the completion rule, or the result of one quiz. */
  tracking?:
    | {
        kind: "completion";
      }
    | {
        kind: "quiz";
        quiz: QuizRef;
      };
  /** Base identifier of the SCORM manifest. */
  manifestIdentifier?: string;
  /** xAPI and cmi5 activity IRI. */
  activityId?: string;
  /** cmi5: what the LMS waits for before it counts the course as done. Default Passed when a quiz decides the result, otherwise Completed. */
  moveOn?: "Passed" | "Completed" | "CompletedAndPassed" | "CompletedOrPassed" | "NotApplicable";
  lom?: LomMetadata;
  /** Show an exit-course link in the course menu. Default false. */
  exitLink?: boolean;
}

/** Learning Object Metadata written into the package manifest. */
export interface LomMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  language?: Language;
}

/** One entry of the course outline. */
export type Entry = SectionEntry | LessonEntry | QuizEntry;

/** Section header: groups the lessons below it and holds no blocks. */
export interface SectionEntry {
  id: Id;
  kind: "section";
  title: string;
  ext?: Ext;
}

export interface LessonEntry {
  id: Id;
  kind: "lesson";
  title: string;
  description?: RichText;
  icon?: Token;
  headerImage?: MediaRef;
  /** Author shown on this lesson instead of the course authors. */
  author?: Author;
  blocks: Block[];
  ext?: Ext;
}

export interface QuizEntry {
  id: Id;
  kind: "quiz";
  title: string;
  description?: RichText;
  icon?: Token;
  headerImage?: MediaRef;
  author?: Author;
  settings?: QuizSettings;
  /** Questions in order, and draws from question banks. */
  questions: QuizQuestion[];
  ext?: Ext;
}

/** How a quiz is taken and passed. Every setting is optional; the default is given with each. */
export interface QuizSettings {
  /** Score in percent at or above which the learner passes. Default 80. */
  passingScore?: number;
  /** Attempts allowed after the first one. Default: unlimited. */
  retries?: number;
  /** A learner who fails must retry before going on; with no retries left the course cannot be completed. Default false. */
  requirePassing?: boolean;
  /** A learner who passes may jump to a later entry; skipped entries count as complete. Default: off. */
  skipAhead?: {
    entry: EntryRef;
    /** Let the learner choose whether to skip. Default false. */
    learnerChooses?: boolean;
  };
  /** Ask the questions in a new random order on each attempt. Default false. */
  shuffleQuestions?: boolean;
  /** Show answer choices in a new random order on each attempt. Default false. */
  shuffleAnswers?: boolean;
  /** What the results show: every answer with its feedback, nothing, or only the learner's wrong answers. Default all. */
  revealAnswers?: "all" | "none" | "incorrect";
  correctColor?: Color;
  incorrectColor?: Color;
  /** Time limit for each attempt. At zero the attempt is submitted and unanswered questions are wrong. Default: no timer. */
  timer?: {
    minutes: number;
    /** Time shown to the learner. Default remaining. */
    display?: "remaining" | "elapsed" | "elapsed-of-total";
    learnerCanHide?: boolean;
  };
  /** Include the quiz in the lesson count. Default true. */
  countAsLesson?: boolean;
  /** How the button after the results looks. Default next-lesson. */
  finishButton?: "next-lesson" | "continue";
}

/** One question of a quiz, or a draw of several from a question bank. */
export type QuizQuestion =
  | SingleChoiceQuestion
  | MultipleResponseQuestion
  | FillInQuestion
  | MatchingQuestion
  | QuestionDraw;

/** Random questions from a question bank. The pool is a copy of the bank's questions taken when the author adds or updates the draw; later bank edits reach it only then. */
export interface QuestionDraw {
  id: Id;
  kind: "draw";
  bank: ExternalRef;
  /** Questions drawn per attempt. Default: all of them, in random order. A knowledge check always shows one. */
  count?: number;
  /** Bank questions the author left out of the pool. */
  exclude?: ExternalId[];
  pool: PoolQuestion[];
  ext?: Ext;
}

/** A copy of a bank question. The copy has its own ids in this document, so several draws can copy the same bank question. */
export interface PoolQuestion {
  /** Id of the question in the bank, as used by exclude. */
  bankQuestion: ExternalId;
  question: Question;
}

/** Block envelope. The shape of variantSettings and items per variant is defined with each block. */
export interface Block {
  id: Id;
  category:
    | "text"
    | "statement"
    | "quote"
    | "list"
    | "image"
    | "gallery"
    | "multimedia"
    | "interactive"
    | "knowledge-check"
    | "chart"
    | "divider"
    | "code"
    | "custom"
    | "survey";
  variant: Token;
  settings?: BlockSettings;
  variantSettings?: VariantSettings;
  items?: Item[];
  question?: Question;
  /** Knowledge check: one random question from a question bank. */
  draw?: QuestionDraw;
  customBlock?: CustomBlockRef;
  media?: MediaRef[];
  /** Link to a shared block template or question-bank question. */
  link?: {
    kind: "template" | "bankQuestion";
    ref: ExternalRef;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ext?: Ext;
}

/** Settings of one block variant, keyed by camelCase name; each block's own schema narrows them. */
export type VariantSettings = Record<string, unknown>;

/** Settings common to every block. */
export interface BlockSettings {
  padding?: {
    top: number;
    bottom: number;
    linked?: boolean;
  };
  background?: Background;
  cardStyle?: Token;
  contentWidth?: "narrow" | "medium" | "wide" | "full";
  accentColor?: Color;
  textContrast?: "auto" | "light" | "dark";
  entranceAnimation?: boolean;
  narration?: Narration;
  /** Show this block and the next one in the same step (microlearning). */
  connectToNext?: boolean;
}

export type Background =
  | {
      kind: "none";
    }
  | {
      kind: "color";
      color: Color;
    }
  | {
      kind: "image";
      image: MediaRef;
      overlay?: "light" | "dark";
      opacity?: Percent;
    };

/** Audio narration of a block (AI provenance is on the media entry). */
export interface Narration {
  audio: MediaRef;
  transcript?: RichText;
  /** Where the narration player sits in the block. Default bottom. */
  position?: "top" | "bottom";
}

/** One record inside a block. */
export type Item =
  | ContentItem
  | MarkerItem
  | StepItem
  | FlashcardItem
  | ButtonItem
  | CategoryItem
  | SortingItem;

/** Title, text and optional media: accordion and tab panels, timeline events, list entries, gallery images. */
export interface ContentItem {
  id: Id;
  kind: "content";
  title?: RichText;
  text?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

/** Marker on an image, placed by percentage of the image size. */
export interface MarkerItem {
  id: Id;
  kind: "marker";
  x: Percent;
  y: Percent;
  icon?: Token;
  title?: RichText;
  text?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

/** Process card: an introduction, a numbered step or a summary. */
export interface StepItem {
  id: Id;
  kind: "step";
  role: "intro" | "step" | "summary";
  hidden?: boolean;
  title?: RichText;
  text?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

export interface FlashcardItem {
  id: Id;
  kind: "flashcard";
  front: CardSide;
  back: CardSide;
  ext?: Ext;
}

export interface CardSide {
  text?: RichText;
  media?: MediaRef;
}

export interface ButtonItem {
  id: Id;
  kind: "button";
  label: string;
  description?: RichText;
  destination: Destination;
  ext?: Ext;
}

export type Destination =
  | {
      kind: "lesson";
      entry: EntryRef;
    }
  | {
      kind: "url";
      url: Url;
    }
  | {
      kind: "exit";
    };

/** Sorting-activity category. */
export interface CategoryItem {
  id: Id;
  kind: "category";
  title: string;
  ext?: Ext;
}

/** Sorting-activity card and the category it belongs in. */
export interface SortingItem {
  id: Id;
  kind: "sorting";
  text: string;
  category: CategoryRef;
  ext?: Ext;
}

export type Question =
  | SingleChoiceQuestion
  | MultipleResponseQuestion
  | FillInQuestion
  | MatchingQuestion;

export interface SingleChoiceQuestion {
  id: Id;
  kind: "single-choice";
  prompt: RichText;
  answers: Answer[];
  feedbackMode?: FeedbackMode;
  correctFeedback?: RichText;
  incorrectFeedback?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

export interface MultipleResponseQuestion {
  id: Id;
  kind: "multiple-response";
  prompt: RichText;
  answers: Answer[];
  feedbackMode?: FeedbackMode;
  correctFeedback?: RichText;
  incorrectFeedback?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

export interface FillInQuestion {
  id: Id;
  kind: "fill-in";
  prompt: RichText;
  acceptedAnswers: string[];
  feedbackMode?: FeedbackMode;
  correctFeedback?: RichText;
  incorrectFeedback?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

export interface MatchingQuestion {
  id: Id;
  kind: "matching";
  prompt: RichText;
  pairs: MatchPair[];
  feedbackMode?: FeedbackMode;
  correctFeedback?: RichText;
  incorrectFeedback?: RichText;
  media?: MediaRef;
  ext?: Ext;
}

/** Feedback by correct or incorrect, or per answer choice. */
export type FeedbackMode = "correctness" | "perAnswer";

export interface Answer {
  id: Id;
  text: RichText;
  correct: boolean;
  feedback?: RichText;
  ext?: Ext;
}

export interface MatchPair {
  id: Id;
  prompt: RichText;
  match: RichText;
  ext?: Ext;
}

/** Placeholder for a free-form custom-block document; its object tree is defined with custom blocks. */
export interface CustomBlockDocument {
  id: Id;
  ext?: Ext;
}
