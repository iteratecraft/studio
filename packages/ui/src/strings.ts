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
  "list.selected": "{count} selected",
  "pages.label": "Pages of {label}",
  "pages.range": "{start}–{end} of {total}",
  "pages.previous": "Previous page",
  "pages.next": "Next page",
  "pages.page": "Page",
  "pages.of": "{page} of {pages}",

  // Common actions
  "action.cancel": "Cancel",
  "action.ok": "OK",
  "action.create": "Create",
  "action.save": "Save",
  "action.dontSave": "Don't save",
  "action.undo": "Undo",
  "action.duplicate": "Duplicate",
  "action.rename": "Rename",
  "action.delete": "Delete",
  "action.restore": "Restore",
  "action.remove": "Remove from list",
  "action.clearSelection": "Clear selection",
  "error.title": "That did not work",

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
  "dashboard.deletedManyToast": {
    one: "Moved {count} course to Deleted",
    other: "Moved {count} courses to Deleted",
  },
  "dashboard.selection": "Selected courses",
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
  "recover.rename":
    "{name} was not closed properly last time. A copy saved automatically has changes the file does not have. Renaming saves the file, and the version you do not use is dropped.",
  "recover.duplicate":
    "{name} was not closed properly last time. A copy saved automatically has changes the file does not have. Which version should be copied?",
  "recover.useRecovered": "Use the recovered changes",
  "recover.useSaved": "Use the saved file",
  "saveAs.title": "Save the course as",
  "unsaved.title": "Save changes to {title}?",
  "unsaved.body": "If you don't save, the changes since you last saved are lost.",

  // Blocks editor: the course editor frame (M2-08)
  "editor.back": "Back to your courses",
  "editor.tools": "Course tools",
  "editor.undo": "Undo",
  "editor.redo": "Redo",
  "editor.save": "Save",
  "editor.saveAs": "Save as",
  "editor.theme": "Theme",
  "editor.preview": "Preview",
  "editor.publish": "Publish",
  "editor.courseTitle": "Course title",
  "editor.sourceLanguage": "Source language",
  "editor.sourceLanguageHelp":
    "The language the course is written in, as a code such as en-US or fr-CA.",
  "editor.sourceLanguageInvalid": "Enter a language code such as en-US or fr-CA.",
  "editor.outline": "Outline",
  "editor.outlinePending": "Lessons and sections are added here in the next build.",
  "save.saved": "Saved",
  "save.unsaved": "Unsaved changes",
  "save.saving": "Saving…",
  "save.failed": "Could not save: {message}",
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
