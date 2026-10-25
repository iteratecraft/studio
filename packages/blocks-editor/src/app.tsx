// The blocks editor app (M2-08, BLK-01): the dashboard on launch and one open course at a time in
// the editor frame. It reaches files, dialogs and the window only through the host interface, so
// the desktop app and a browser run the same screens (ADR-0006).
import { applyCommands, copyCourse, copyEntryTo } from "@course-suite/doc-ops";
import type { Course, Entry } from "@course-suite/format";
import type { AppInfo, FileRef, HostInterface } from "@course-suite/host";
import {
  addAsset,
  copyProject,
  createProject,
  discardAutosaves,
  type Project,
  saveProject,
} from "@course-suite/project";
import { ToastQueue, ToastRegion, UiProvider, useStrings } from "@course-suite/ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { blankCourse, fileNameFor, shownTitle } from "./course.js";
import { Dashboard, type ItemAction, type LayoutKey } from "./dashboard.js";
import { ChoiceDialog, CoursePickerDialog, TitleDialog, useDialogs } from "./dialogs.js";
import { EditorFrame } from "./editor.js";
import {
  itemOf,
  type LibraryItem,
  loadLibrary,
  SORT_KEY,
  SORTS,
  type SortKey,
  saveLibrary,
  VIEW_KEY,
  withItem,
  without,
} from "./library.js";
import { CourseSession, newestOf, openCourseFile } from "./session.js";

export interface BlocksEditorAppProps {
  host: HostInterface;
  /** BCP 47 language of the editor UI. */
  locale?: string;
}

export function BlocksEditorApp({ host, locale = "en" }: BlocksEditorAppProps) {
  return (
    <UiProvider locale={locale}>
      <App host={host} />
    </UiProvider>
  );
}

type Answer = "save" | "discard" | "cancel";

function App({ host }: { host: HostInterface }) {
  const t = useStrings();
  const { dialog, ask } = useDialogs();
  const [toasts] = useState(() => new ToastQueue({ maxVisibleToasts: 3 }));
  const [app, setApp] = useState<AppInfo>();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const library = useRef<LibraryItem[]>([]);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("updated");
  const [layout, setLayout] = useState<LayoutKey>("grid");
  const [session, setSession] = useState<CourseSession>();
  const filters = [{ name: t("file.filter"), extensions: ["crs"] }];

  /** Changes the course list and keeps it in the host's storage. */
  const updateLibrary = useCallback(
    (change: (items: LibraryItem[]) => LibraryItem[]) => {
      library.current = change(library.current);
      setItems(library.current);
      return saveLibrary(host.storage, library.current);
    },
    [host],
  );

  const markMissing = (file: FileRef, lost: boolean) =>
    setMissing((old) => {
      const next = new Set(old);
      if (lost) next.add(file.id);
      else next.delete(file.id);
      return next;
    });

  // Launch: the app's name, the course list and the remembered sort and view, then which files are
  // gone and when the others last changed.
  useEffect(() => {
    let live = true;
    void (async () => {
      const [info, list, savedSort, savedLayout] = await Promise.all([
        host.appInfo(),
        loadLibrary(host.storage),
        host.storage.get(SORT_KEY),
        host.storage.get(VIEW_KEY),
      ]);
      if (!live) return;
      library.current = list;
      setItems(list);
      setSort(SORTS.find((key) => key === savedSort) ?? "updated");
      setLayout(savedLayout === "list" ? "list" : "grid");
      setApp(info);
      const times = await Promise.all(
        list.map((item) => host.files.modified(item.file).catch(() => undefined)),
      );
      if (!live) return;
      setMissing(
        new Set(list.filter((_, i) => times[i] === undefined).map((item) => item.file.id)),
      );
      const changed = new Map(list.map((item, i) => [item.file.id, times[i]]));
      await updateLibrary((items) =>
        items.map((item) => {
          const time = changed.get(item.file.id);
          return time !== undefined && time !== item.updated ? { ...item, updated: time } : item;
        }),
      );
    })();
    return () => {
      live = false;
    };
  }, [host, updateLibrary]);

  // The window title names the open course and marks unsaved changes.
  useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => {}),
    () => session?.version ?? 0,
  );
  useEffect(() => {
    if (!app) return;
    document.title = session
      ? t(session.dirty ? "window.titleUnsaved" : "window.title", {
          course: shownTitle(session.editor.document.title, t("course.untitled")),
          app: app.name,
        })
      : app.name;
  });

  const notify = (title: string, body: ReactNode) =>
    ask<null>((answer) => (
      <ChoiceDialog
        title={title}
        choices={[{ value: null, label: t("action.ok"), variant: "primary" }]}
        dismissed={null}
        answer={answer}
      >
        {body}
      </ChoiceDialog>
    ));
  const failure = (error: unknown) =>
    notify(
      t("save.failed", { message: error instanceof Error ? error.message : String(error) }),
      null,
    );
  const askTitle = (title: string, submit: string, initial?: string) =>
    ask<string | null>((answer) => (
      <TitleDialog
        title={title}
        submit={submit}
        answer={answer}
        {...(initial !== undefined && { initial })}
      />
    ));

  const remember = async (file: FileRef, course: Course) => {
    markMissing(file, false);
    const updated = (await host.files.modified(file).catch(() => undefined)) ?? Date.now();
    await updateLibrary((items) => withItem(items, itemOf(file, course, updated)));
  };

  const start = async (file: FileRef, project: Project, dirty: boolean) => {
    setSession(new CourseSession(host, file, project, dirty));
    await remember(file, project.course);
  };

  /** Opens a course file, offering autosaved work left by a crash (packages/project). */
  const open = async (file: FileRef) => {
    const opened = await openCourseFile(host, file);
    if (opened.kind === "missing") {
      markMissing(file, true);
      await notify(t("openError.title"), t("openError.missing", { name: file.name }));
      return;
    }
    if (opened.recovered) {
      const damaged = opened.kind === "damaged";
      const choice = await ask<"recover" | "saved" | "cancel">((answer) => (
        <ChoiceDialog
          title={t("recover.title")}
          dismissed="cancel"
          answer={answer}
          choices={[
            ...(damaged
              ? [{ value: "cancel" as const, label: t("action.cancel"), variant: "quiet" as const }]
              : [{ value: "saved" as const, label: t("recover.discard") }]),
            { value: "recover", label: t("recover.restore"), variant: "primary" },
          ]}
        >
          {t(damaged ? "recover.damaged" : "recover.body", { name: file.name })}
        </ChoiceDialog>
      ));
      if (choice === "recover") return start(file, opened.recovered, true);
      if (choice === "cancel" || opened.kind !== "ok") return;
      await discardAutosaves(host.files.projectFiles(file), file.name);
      return start(file, opened.project, false);
    }
    if (opened.kind === "damaged") {
      await notify(
        t("openError.title"),
        <>
          <p>{t("openError.damaged", { name: file.name })}</p>
          <details>
            <summary>{t("openError.details")}</summary>
            <ul>
              {opened.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </details>
        </>,
      );
      return;
    }
    return start(file, opened.project, false);
  };

  const createCourse = async (kind: Course["kind"]) => {
    const title = await askTitle(
      t(kind === "course" ? "newCourse.title" : "newMicrolearning.title"),
      t("action.create"),
    );
    if (!title) return;
    const file = await host.files.pickSave({
      title: t("newCourse.saveTitle"),
      suggestedName: fileNameFor(title, t("course.kind.course")),
      filters,
    });
    if (!file) return;
    const project = createProject(blankCourse(kind, title));
    await saveProject(host.files.projectFiles(file), file.name, project);
    await start(file, project, false);
  };

  /** The newest work of a listed course, or a notice why it cannot be had. */
  const newest = async (item: LibraryItem) => {
    const opened = await openCourseFile(host, item.file);
    const project = newestOf(opened);
    if (!project) {
      markMissing(item.file, opened.kind === "missing");
      const reason = opened.kind === "missing" ? "openError.missing" : "openError.damaged";
      await notify(t("openError.title"), t(reason, { name: item.file.name }));
    }
    return project;
  };

  const duplicate = async (item: LibraryItem) => {
    const source = await newest(item);
    if (!source) return;
    const title = shownTitle(source.course.title, t("course.untitled"));
    const name = await askTitle(
      t("duplicate.title"),
      t("action.duplicate"),
      t("duplicate.name", { title }),
    );
    if (!name) return;
    const file = await host.files.pickSave({
      title: t("duplicate.saveTitle"),
      suggestedName: fileNameFor(name, t("course.kind.course")),
      filters,
    });
    if (!file) return;
    const course = {
      ...copyCourse(source.course),
      title: name,
      createdAt: new Date().toISOString(),
    };
    const copy = copyProject(source, course);
    await saveProject(host.files.projectFiles(file), file.name, copy);
    await remember(file, course);
  };

  const rename = async (item: LibraryItem) => {
    const project = await newest(item);
    if (!project) return;
    const title = await askTitle(t("rename.title"), t("action.rename"), project.course.title);
    if (!title || title === project.course.title) return;
    const renamed = applyCommands(project.course, [{ type: "updateCourse", set: { title } }]);
    if (!renamed.ok) throw new Error(renamed.errors.map((error) => error.message).join("; "));
    project.course = renamed.document;
    await saveProject(host.files.projectFiles(item.file), item.file.name, project);
    await remember(item.file, project.course);
  };

  /**
   * Copies a lesson or quiz of the open course to the end of another course's outline, with its
   * media, and saves that course's file (rise.md 3B, blocks-editor.md W5, UI-BLOCKS-EDITOR-R10).
   * A microlearning holds one lesson and no quiz, so only courses are offered.
   */
  const copyEntry = async (entry: Entry) => {
    if (!session) return;
    const from = session;
    const title = shownTitle(entry.title, t("outline.untitledLesson"));
    const target = await ask<LibraryItem | null>((answer) => (
      <CoursePickerDialog
        title={t("copyTo.title", { title })}
        courses={library.current.filter(
          (item) =>
            item.kind === "course" &&
            item.deleted === undefined &&
            item.file.id !== from.file.id &&
            !missing.has(item.file.id),
        )}
        answer={answer}
      />
    ));
    if (!target) return;
    const project = await newest(target);
    if (!project) return;
    const copied = copyEntryTo(from.editor.document, entry.id, project.course);
    if (!copied) {
      await notify(t("copyTo.failed"), t("copyTo.custom", { title }));
      return;
    }
    const result = applyCommands(project.course, copied.commands);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join("; "));
    // shortcut: a key the target already has is taken to hold the same file, as keys are content
    // hashes by default; check the hashes once authors can name keys themselves.
    for (const key of copied.keys) {
      if (Object.hasOwn(project.assets, key)) continue;
      const asset = await from.asset(key);
      if (asset) await addAsset(project, asset.data, asset.info, key);
    }
    project.course = result.document;
    await saveProject(host.files.projectFiles(target.file), target.file.name, project);
    await remember(target.file, project.course);
    toasts.add(
      {
        title: t("copyTo.done", {
          title,
          course: shownTitle(project.course.title, t("course.untitled")),
        }),
        action: {
          label: t("copyTo.open"),
          onAction: () =>
            void closeCourse()
              .then((closed) => (closed ? open(target.file) : undefined))
              .catch(failure),
        },
      },
      { timeout: 8000 },
    );
  };

  const setDeleted = (item: LibraryItem, deleted: number | undefined) =>
    updateLibrary((items) =>
      items.map((other) => {
        if (other.file.id !== item.file.id) return other;
        const { deleted: _, ...kept } = other;
        return deleted === undefined ? kept : { ...kept, deleted };
      }),
    );

  const onAction = (action: ItemAction, item: LibraryItem) => {
    const run = async () => {
      switch (action) {
        case "open":
          return open(item.file);
        case "duplicate":
          return duplicate(item);
        case "rename":
          return rename(item);
        case "delete": {
          await setDeleted(item, Date.now());
          const title = shownTitle(item.title, t("course.untitled"));
          toasts.add(
            {
              title: t("dashboard.deletedToast", { title }),
              action: { label: t("action.undo"), onAction: () => void setDeleted(item, undefined) },
            },
            { timeout: 8000 },
          );
          return;
        }
        case "restore":
          return setDeleted(item, undefined);
        case "remove":
          markMissing(item.file, false);
          return updateLibrary((items) => without(items, item.file));
      }
    };
    run().catch(failure);
  };

  const openFromDialog = async () => {
    const [file] = await host.files.pickOpen({ title: t("dashboard.open"), filters });
    if (file) await open(file);
  };

  const emptyDeleted = async () => {
    const sure = await ask<boolean>((answer) => (
      <ChoiceDialog
        title={t("dashboard.emptyDeleted")}
        dismissed={false}
        answer={answer}
        choices={[
          { value: false, label: t("action.cancel"), variant: "quiet" },
          { value: true, label: t("dashboard.emptyDeleted"), variant: "danger" },
        ]}
      >
        {t("dashboard.emptyDeletedConfirm")}
      </ChoiceDialog>
    ));
    if (sure) await updateLibrary((items) => items.filter((item) => item.deleted === undefined));
  };

  const save = async () => {
    if (!session) return;
    try {
      await session.save();
      await remember(session.file, session.editor.document);
    } catch {
      // The failure shows in the save state; the file on disk is the previous one.
    }
  };

  /**
   * Leaves the open course, asking first when it has unsaved changes (Save, Don't save, Cancel);
   * resolves to whether it was left.
   */
  const closeCourse = async (): Promise<boolean> => {
    if (!session) return true;
    if (session.dirty) {
      const title = shownTitle(session.editor.document.title, t("course.untitled"));
      const answer = await ask<Answer>((answer) => (
        <ChoiceDialog
          title={t("unsaved.title", { title })}
          dismissed="cancel"
          answer={answer}
          choices={[
            { value: "cancel", label: t("action.cancel"), variant: "quiet" },
            { value: "discard", label: t("action.dontSave") },
            { value: "save", label: t("action.save"), variant: "primary" },
          ]}
        >
          {t("unsaved.body")}
        </ChoiceDialog>
      ));
      if (answer === "cancel") return false;
      try {
        if (answer === "save") {
          await session.save();
          await remember(session.file, session.editor.document);
        } else await session.discard();
      } catch {
        return false;
      }
    }
    session.close();
    setSession(undefined);
    return true;
  };

  // The window's close button asks the same question as leaving the course.
  const closing = useRef(closeCourse);
  closing.current = closeCourse;
  useEffect(() => host.onCloseRequested(() => closing.current()), [host]);
  // When the app itself goes away, the open course stops autosaving, as a crash would stop it.
  const current = useRef(session);
  current.current = session;
  useEffect(() => () => current.current?.close(), []);

  if (!app) return null;
  return (
    <>
      {session ? (
        <EditorFrame
          key={session.file.id}
          session={session}
          toasts={toasts}
          onSave={() => void save()}
          onClose={() => void closeCourse()}
          onCopyEntry={(entry) => void copyEntry(entry).catch(failure)}
        />
      ) : (
        <Dashboard
          appName={app.name}
          version={app.version}
          items={items}
          missing={missing}
          sort={sort}
          onSortChange={(key) => {
            setSort(key);
            void host.storage.set(SORT_KEY, key);
          }}
          layout={layout}
          onLayoutChange={(key) => {
            setLayout(key);
            void host.storage.set(VIEW_KEY, key);
          }}
          onNew={(kind) => void createCourse(kind).catch(failure)}
          onOpen={() => void openFromDialog().catch(failure)}
          onAction={onAction}
          onEmptyDeleted={() => void emptyDeleted()}
        />
      )}
      {dialog}
      <ToastRegion queue={toasts} />
    </>
  );
}
