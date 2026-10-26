// The dashboard's list of courses (BLK-01, blocks-editor.md H6 to H13): every course file the author
// created or opened, kept in the host's storage, with what a card shows so the dashboard never
// reads the files themselves. Deleting moves a course to the Deleted list; the file stays.
import type { Course } from "@course-suite/format";
import type { FileRef, HostStorage } from "@course-suite/host";

export interface LibraryItem {
  file: FileRef;
  title: string;
  kind: Course["kind"];
  /** Lessons and quizzes; section headers are not lessons. */
  lessons: number;
  /** Milliseconds since 1970. */
  created: number;
  /** When the file last changed, as far as the app knows. */
  updated: number;
  /** When the author deleted it: it shows in the Deleted list. */
  deleted?: number;
}

export type SortKey = "updated" | "created" | "title";
export type KindFilter = "all" | Course["kind"];

const LIST_KEY = "library";
export const SORT_KEY = "library.sort";
export const VIEW_KEY = "library.view";
export const SORTS: readonly SortKey[] = ["updated", "created", "title"];

/** The saved list; entries that do not have the expected shape are left out. */
export async function loadLibrary(storage: HostStorage): Promise<LibraryItem[]> {
  let value: unknown;
  try {
    value = JSON.parse((await storage.get(LIST_KEY)) ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(value) ? value.filter(isItem) : [];
}

export function saveLibrary(storage: HostStorage, items: readonly LibraryItem[]): Promise<void> {
  return storage.set(LIST_KEY, JSON.stringify(items));
}

function isItem(value: unknown): value is LibraryItem {
  const item = value as Partial<LibraryItem> | null;
  return (
    typeof item === "object" &&
    item !== null &&
    typeof item.file?.id === "string" &&
    typeof item.file.name === "string" &&
    typeof item.title === "string" &&
    (item.kind === "course" || item.kind === "microlearning") &&
    Number.isFinite(item.lessons) &&
    Number.isFinite(item.created) &&
    Number.isFinite(item.updated) &&
    (item.deleted === undefined || Number.isFinite(item.deleted))
  );
}

/** The card of a course file, from its document; `created` stays when the list already has it. */
export function itemOf(file: FileRef, course: Course, updated: number): LibraryItem {
  const created = course.createdAt ? Date.parse(course.createdAt) : updated;
  return {
    file: { id: file.id, name: file.name },
    title: course.title,
    kind: course.kind,
    lessons: course.entries.filter((entry) => entry.kind !== "section").length,
    created,
    updated,
  };
}

/** Puts the item in the list in place of the one for the same file, keeping its creation time. */
export function withItem(items: readonly LibraryItem[], item: LibraryItem): LibraryItem[] {
  const old = items.find((other) => other.file.id === item.file.id);
  const { deleted: _, ...kept } = item;
  return [{ ...kept, created: old?.created ?? item.created }, ...without(items, item.file)];
}

export function without(items: readonly LibraryItem[], file: FileRef): LibraryItem[] {
  return items.filter((item) => item.file.id !== file.id);
}

export interface View {
  query: string;
  sort: SortKey;
  kind: KindFilter;
  /** The Deleted list instead of the courses. */
  deleted: boolean;
}

/** The items a list shows: search by title, filter by type, sort (UI-BLOCKS-EDITOR-R2). */
export function visibleItems(
  items: readonly LibraryItem[],
  view: View,
  locale: string,
): LibraryItem[] {
  const query = view.query.trim().toLocaleLowerCase(locale);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const compare: Record<SortKey, (a: LibraryItem, b: LibraryItem) => number> = {
    updated: (a, b) => b.updated - a.updated,
    created: (a, b) => b.created - a.created,
    title: (a, b) => collator.compare(a.title, b.title),
  };
  return items
    .filter(
      (item) =>
        (item.deleted !== undefined) === view.deleted &&
        (view.kind === "all" || item.kind === view.kind) &&
        item.title.toLocaleLowerCase(locale).includes(query),
    )
    .sort(compare[view.sort]);
}
