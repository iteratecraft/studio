// UI string catalogue of the editors (ENG-12). Editor text lives here, by key, with the built-in
// English as the fallback; learner text lives in @course-suite/labels and never mixes with it.
// A translation is a partial catalogue for one BCP 47 language: any language Intl knows works,
// right-to-left ones included, and plurals follow that language's Intl.PluralRules categories.

/** A text with plural forms, picked by the `count` value: CLDR categories, `other` required. */
export type PluralMessage = { readonly other: string } & {
  readonly [category in Exclude<Intl.LDMLPluralRule, "other">]?: string;
};

export type Message = string | PluralMessage;

/** The built-in English catalogue. Our own wording; `{name}` is a placeholder filled at run time. */
export const english = {
  "dialog.close": "Close",
  "toast.dismiss": "Dismiss",
  "search.clear": "Clear search",
  "list.items": { one: "{count} item", other: "{count} items" },

  // Common actions
  "action.cancel": "Cancel",
  "action.ok": "OK",
  "action.create": "Create",
  "action.save": "Save",
  "action.dontSave": "Don't save",
  "action.undo": "Undo",
  "action.duplicate": "Duplicate",
  "action.copy": "Copy",
  "action.rename": "Rename",
  "action.delete": "Delete",
  "action.restore": "Restore",
  "action.remove": "Remove from list",

  // Blocks editor: the window and the dashboard (M2-08)
  "app.version": "Version {version}",
  "window.title": "{course} – {app}",
  "window.titleUnsaved": "*{course} – {app}",
  "file.filter": "Course files",
  "course.untitled": "Untitled course",
  "course.kind.course": "Course",
  "course.kind.microlearning": "Microlearning",
  "course.lessons": { one: "{count} lesson", other: "{count} lessons" },
  "course.modified": "Changed {date}",
  "course.missing": "File not found",
  "course.actions": "Actions for {title}",
  "dashboard.title": "Your courses",
  "dashboard.new": "New",
  "dashboard.newCourse": "Blank course",
  "dashboard.newMicrolearning": "Blank microlearning",
  "dashboard.open": "Open a course file",
  "dashboard.sections": "Course lists",
  "dashboard.courses": "Courses",
  "dashboard.deleted": "Deleted",
  "dashboard.search": "Search by title",
  "dashboard.sort": "Sort by",
  "dashboard.sortUpdated": "Last updated",
  "dashboard.sortCreated": "Date created",
  "dashboard.sortTitle": "Title A–Z",
  "dashboard.type": "Type",
  "dashboard.typeAll": "All types",
  "dashboard.view": "View",
  "dashboard.viewGrid": "Grid",
  "dashboard.viewList": "List",
  "dashboard.emptyTitle": "No courses yet",
  "dashboard.emptyBody": "Create a course, or open a course file you already have.",
  "dashboard.noMatch": "No courses match",
  "dashboard.noMatchBody": "Try another title or type.",
  "dashboard.deletedNote": "Courses you delete wait here. Their files stay on your computer.",
  "dashboard.deletedEmpty": "Nothing deleted",
  "dashboard.emptyDeleted": "Empty Deleted",
  "dashboard.emptyDeletedConfirm":
    "Remove every deleted course from this list? Their files stay on your computer.",
  "dashboard.deletedToast": "Moved to Deleted: {title}",
  "newCourse.title": "New course",
  "newMicrolearning.title": "New microlearning",
  "newCourse.saveTitle": "Save the new course",
  "field.title": "Title",
  "field.titleHelp": "Up to {max} characters.",
  "rename.title": "Rename course",
  "duplicate.title": "Duplicate course",
  "duplicate.name": "Copy of {title}",
  "duplicate.saveTitle": "Save the copy",
  "openError.title": "The course could not be opened",
  "openError.damaged":
    "{name} is damaged, is not a course file, or was made by a newer version of this app. The file was not changed.",
  "openError.missing":
    "{name} could not be found. If it was moved or renamed, open it again from its new place.",
  "openError.details": "Details",
  "recover.title": "Recover unsaved changes?",
  "recover.body":
    "{name} was not closed properly last time. A copy saved automatically has changes the file does not have.",
  "recover.damaged": "{name} could not be opened, but a copy saved automatically was found.",
  "recover.restore": "Recover changes",
  "recover.discard": "Open the saved file",
  "unsaved.title": "Save changes to {title}?",
  "unsaved.body": "If you don't save, the changes since you last saved are lost.",

  // Blocks editor: the course editor frame (M2-08)
  "editor.back": "Back to your courses",
  "editor.tools": "Course tools",
  "editor.undo": "Undo",
  "editor.redo": "Redo",
  "editor.save": "Save",
  "editor.theme": "Theme",
  "editor.preview": "Preview",
  "editor.publish": "Publish",
  "editor.courseTitle": "Course title",
  "editor.outline": "Outline",
  "editor.author": "Author shown to learners",
  "editor.authorHelp": "Leave it empty to hide the author.",
  "editor.description": "Description",
  "editor.descriptionHelp": "Shown on the cover, above the outline.",

  // Blocks editor: the course outline and lessons (M2-09)
  "action.open": "Open",
  "outline.empty": "No lessons yet",
  "outline.emptyBody": "A course needs at least one lesson. Type a title below and press Enter.",
  "outline.newTitle": "New lesson or section",
  "outline.newHelp": "Enter adds a lesson, Shift+Enter a section header.",
  "outline.newPlaceholder": "Type a title",
  "outline.add": "Add",
  "outline.addLesson": "Lesson",
  "outline.addQuiz": "Quiz",
  "outline.addSection": "Section header",
  "outline.addLessonBelow": "Add lesson below",
  "outline.addQuizBelow": "Add quiz below",
  "outline.addSectionBelow": "Add section header below",
  "outline.lessonTitle": "Lesson title",
  "outline.quizTitle": "Quiz title",
  "outline.sectionTitle": "Section header title",
  "outline.untitledLesson": "Untitled lesson",
  "outline.untitledQuiz": "Untitled quiz",
  "outline.untitledSection": "Untitled section",
  "outline.open": "Open {title}",
  "outline.delete": "Delete {title}",
  "outline.toggle": "Lessons under {title}",
  "outline.moveUp": "Move up",
  "outline.moveDown": "Move down",
  "outline.copyTo": "Copy to another course…",
  "outline.moved": "Moved {title} to place {position} of {count}",
  "outline.added": "Added {title}",
  "outline.duplicated": "Added a copy of {title} below it",
  "outline.deleted": "Deleted {title}",
  "copyTo.title": "Copy {title} to another course",
  "copyTo.courses": "Courses",
  "copyTo.none": "No other courses",
  "copyTo.noneBody": "Create or open another course first.",
  "copyTo.done": "Copied {title} to the end of {course}",
  "copyTo.open": "Open that course",
  "copyTo.failed": "The lesson was not copied",
  "copyTo.custom": "{title} has a custom block, which cannot be copied to another course yet.",
  "lesson.goTo": "Go to",
  "lesson.author": "Author shown on this lesson",
  "lesson.authorHelp": "Leave it empty to show the course author.",
  "lesson.overview": "Course overview",
  "lesson.blocks": "Blocks",
  "lesson.empty": "No blocks yet",
  "lesson.emptyBody": "Blocks are added and edited here in the next build.",
  "quiz.pending": "Quiz questions",
  "quiz.pendingBody": "Questions are added and edited here in a later build.",
  "block.text": "Text",
  "block.statement": "Statement",
  "block.quote": "Quote",
  "block.list": "List",
  "block.image": "Image",
  "block.gallery": "Gallery",
  "block.multimedia": "Multimedia",
  "block.interactive": "Interactive",
  "block.knowledge-check": "Knowledge check",
  "block.chart": "Chart",
  "block.divider": "Divider",
  "block.code": "Code",
  "block.custom": "Custom",
  "block.survey": "Survey",

  "save.saved": "Saved",
  "save.unsaved": "Unsaved changes",
  "save.saving": "Saving…",
  "save.failed": "Could not save: {message}",

  // Course preview (M2-11)
  "preview.label": "Preview",
  "preview.frame": "Course preview",
  "preview.edit": "Edit",
  "preview.restart": "Restart",
  "preview.device": "Device",
  "preview.computer": "Computer",
  "preview.tablet": "Tablet",
  "preview.phone": "Phone",
} as const satisfies Record<string, Message>;

export type StringKey = keyof typeof english;

/** A translation: some or all keys, each a text or plural forms in the translation's language. */
export type Strings = { readonly [key in StringKey]?: Message };

export type Translate = (
  key: StringKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/**
 * A function that gives the text for a key in `locale`: the translation's text when it has the
 * key, else the English one. Numbers in placeholders are formatted for the locale; a placeholder
 * without a value stays as it is, so a missing value shows instead of vanishing.
 */
export function createTranslator(locale: string, strings: Strings = {}): Translate {
  const plurals = new Intl.PluralRules(locale);
  const englishPlurals = new Intl.PluralRules("en");
  const numbers = new Intl.NumberFormat(locale);
  return (key, values = {}) => {
    const own = strings[key];
    const message: Message = own ?? english[key];
    let text: string;
    if (typeof message === "string") text = message;
    else {
      // The English forms follow English rules: Arabic "few" must not look for an English "few".
      const category = (own ? plurals : englishPlurals).select(Number(values.count));
      text = message[category] ?? message.other;
    }
    return text.replace(PLACEHOLDER, (placeholder, name: string) => {
      if (!Object.hasOwn(values, name)) return placeholder;
      const value = values[name];
      return typeof value === "number" ? numbers.format(value) : String(value);
    });
  };
}

/**
 * The pseudo-languages: English with accents and about 40 % more length, to find layout bugs and
 * text that skips the catalogue; left to right (en-XA) and right to left (ar-XB).
 */
export const PSEUDO_LOCALES = ["en-XA", "ar-XB"] as const;

const ACCENTED = "àƀçðèƒĝĥìĵķľɱñòþǫŕšţùṽŵẋýžÀƁÇÐÈƑĜĤÌĴĶĽṀÑÒÞǪŔŠŢÙṼŴẊÝŽ";
const PLAIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Accents every letter outside placeholders and pads the text, in brackets to spot cut-offs. */
export function pseudoLocalise(text: string): string {
  const accented = text.replace(/\{[A-Za-z]+\}|[A-Za-z]/g, (match) =>
    match.length > 1 ? match : (ACCENTED[PLAIN.indexOf(match)] ?? match),
  );
  return `[${accented}${"~".repeat(Math.ceil(text.length * 0.4))}]`;
}

/** The whole English catalogue, pseudo-localised. */
export function pseudoStrings(): Strings {
  return Object.fromEntries(
    Object.entries(english).map(([key, message]) => [
      key,
      typeof message === "string"
        ? pseudoLocalise(message)
        : Object.fromEntries(Object.entries(message).map(([c, text]) => [c, pseudoLocalise(text)])),
    ]),
  );
}
