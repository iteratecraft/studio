// Media intake (M2-13, ENG-14 basic, BLK-05; blocks-editor.md L17, W15 to W17, 2.17): files come in
// through the host's open dialog or by drag and drop, are checked for type and size, and go into
// the project's content-addressed store, so the same file added twice is kept once. Images are
// scaled down in the app; audio and video that are not web-ready go to the host's converter, which
// the desktop app downloads after asking the first time it is needed (D-12, D-43). Downloading and
// converting run as jobs (@course-suite/jobs) with progress and cancel. Where the edition has no
// converter, the author is asked for a web-ready file instead.
import type { Command } from "@course-suite/doc-ops";
import { parseVtt, serializeVtt } from "@course-suite/format";
import type { ConvertedMedia, FileRef, HostInterface, HostMedia } from "@course-suite/host";
import { type JobRunner, memoryJobFiles, memoryJobStore, openJobRunner } from "@course-suite/jobs";
import {
  Button,
  Dialog,
  DialogActions,
  ProgressBar,
  type StringKey,
  useLocale,
  useStrings,
} from "@course-suite/ui";
import { createContext, type ReactNode, useContext, useRef, useState } from "react";
import { idMaker } from "./blocks.js";
import { ChoiceDialog, useDialogs } from "./dialogs.js";
import {
  EXTENSIONS,
  extensionOf,
  formatBytes,
  imageType,
  isWebReady,
  MEDIA_MAX_BYTES,
  type MediaKind,
  prepareImage,
  typeOfName,
  videoSize,
  webReadyType,
} from "./media.js";
import type { CourseSession } from "./session.js";

/** A file now in the course's store. */
export interface AddedMedia {
  key: string;
  /** The name the author knows it by. */
  name: string;
  type: string;
  size: number;
  /**
   * What puts the file in the media index when it is not there yet: dispatch it with the edit that
   * uses the file, in one list, so both are one undo step.
   */
  commands: Command[];
}

/** Where files come from: the open dialog (one, or several), or a drop. */
export type MediaFrom = "pick" | "pick-many" | readonly File[];

export interface MediaIntake {
  /**
   * Adds files of `kind`. What cannot be added is told to the author in one notice; resolves to the
   * files added, in order (none when the author cancels).
   */
  add(
    kind: MediaKind,
    from: MediaFrom,
    options?: { keepOriginal?: boolean },
  ): Promise<AddedMedia[]>;
  /** The name a file in the store was added with. */
  name(key: string): string | undefined;
  /** Saves a copy of a file in the store where the author picks, such as a caption track (B5). */
  saveCopy(key: string, suggestedName: string): Promise<void>;
}

const IntakeContext = createContext<MediaIntake | undefined>(undefined);

export function useMediaIntake(): MediaIntake {
  const intake = useContext(IntakeContext);
  if (!intake) throw new Error("Media fields need a MediaIntakeProvider");
  return intake;
}

/** A file the author gave: its name, size if known, how to read it, and the host's handle to it. */
interface Source {
  name: string;
  size?: number;
  read(): Promise<Uint8Array>;
  file?: FileRef;
}

/** A file that cannot be added, with the reason for the author. */
class Refused extends Error {}
/** The author stopped a download or a conversion. */
class Stopped extends Error {}

export const INSTALL_JOB = "media-install";
export const CONVERT_JOB = "media-convert";

interface ConvertInput {
  input: FileRef;
  kind: "audio" | "video";
  /** Where the result waits, outside the job store, which copies what it keeps. */
  token: string;
}

/** The job types of the media converter, over the host's converter. */
function mediaJobs(media: HostMedia, results: Map<string, ConvertedMedia>): Promise<JobRunner> {
  return openJobRunner({
    store: memoryJobStore(),
    files: memoryJobFiles(),
    concurrency: 1,
    handlers: {
      [INSTALL_JOB]: {
        resumable: false,
        run: async (_: unknown, { signal, progress }) => {
          await media.installConverter({
            signal,
            onProgress: (done, total) => progress({ done, total }),
          });
          return null;
        },
      },
      [CONVERT_JOB]: {
        resumable: false,
        run: async ({ input, kind, token }: ConvertInput, { signal, progress }) => {
          const converted = await media.convert(input, kind, {
            signal,
            onProgress: (done, total) => progress({ done, total }),
          });
          results.set(token, converted);
          return token;
        },
      },
    },
  });
}

interface Task {
  title: string;
  /** Bytes (a download) or milliseconds of media (a conversion). */
  unit: "bytes" | "time";
  done: number;
  total: number;
  cancel: () => void;
}

export function MediaIntakeProvider({
  host,
  session,
  children,
}: {
  host: HostInterface;
  session: CourseSession;
  children: ReactNode;
}) {
  const t = useStrings();
  const { locale } = useLocale();
  const { dialog, ask } = useDialogs();
  const [task, setTask] = useState<Task>();
  const runner = useRef<Promise<JobRunner> | undefined>(undefined);
  const results = useRef(new Map<string, ConvertedMedia>());

  /** Runs a converter job with its progress dialog; resolves once it succeeded. */
  const runJob = async (
    media: HostMedia,
    title: string,
    unit: Task["unit"],
    type: string,
    input: unknown,
  ) => {
    runner.current ??= mediaJobs(media, results.current);
    const jobs = await runner.current;
    const job = await jobs.submit(type, input);
    setTask({ title, unit, done: 0, total: 0, cancel: () => void jobs.cancel(job.id) });
    const stop = jobs.on(({ job: changed }) => {
      const progress = changed.progress;
      if (changed.id === job.id && progress) {
        setTask((shown) => shown && { ...shown, done: progress.done, total: progress.total });
      }
    });
    try {
      const finished = await jobs.finished(job.id);
      if (finished.state === "cancelled") throw new Stopped();
      if (finished.state === "failed") throw new Refused(finished.error?.message ?? "");
      return finished.result;
    } finally {
      stop();
      setTask(undefined);
      void jobs.forget(job.id).catch(() => {});
    }
  };

  /** Converts an audio or video file that is not web-ready, setting up the converter first. */
  const convert = async (
    kind: "audio" | "video",
    source: Source,
    data: Uint8Array,
  ): Promise<ConvertedMedia> => {
    const { media } = host;
    if (!media) throw new Refused(t("media.noConverter", { name: source.name }));
    const converter = await media.converter();
    if (!converter.installed) {
      const yes = await ask<boolean>((answer) => (
        <ChoiceDialog
          title={t("media.converterTitle")}
          dismissed={false}
          answer={answer}
          choices={[
            { value: false, label: t("media.converterLater"), variant: "quiet" },
            { value: true, label: t("media.converterDownload"), variant: "primary" },
          ]}
        >
          <p>{t("media.converterBody", { name: source.name })}</p>
          <p>
            {t("media.converterDetails", {
              converter: converter.name,
              size: formatBytes(converter.size, locale),
              licence: converter.licence,
            })}
          </p>
        </ChoiceDialog>
      ));
      if (!yes) throw new Refused(t("media.converterDeclined", { name: source.name }));
      await runJob(
        media,
        t("media.downloading", { converter: converter.name }),
        "bytes",
        INSTALL_JOB,
        null,
      );
    }
    // A dropped file has no handle the converter can open: it goes to the data folder first, and
    // the converter removes it from there once read.
    let input = source.file;
    if (!input) {
      input = await host.files.dataFile(
        `media-work/${crypto.randomUUID()}.${extensionOf(source.name)}`,
      );
      await host.files.write(input, data);
    }
    const token = crypto.randomUUID();
    await runJob(media, t("media.converting", { name: source.name }), "time", CONVERT_JOB, {
      input,
      kind,
      token,
    } satisfies ConvertInput);
    const converted = results.current.get(token);
    results.current.delete(token);
    if (!converted) throw new Refused(t("media.convertFailed", { name: source.name }));
    return converted;
  };

  /** One file into the store: checked, prepared, and its media index entry when it is new. */
  const addOne = async (
    kind: MediaKind,
    source: Source,
    keepOriginal: boolean,
    newId: () => string,
    known: Set<string>,
  ): Promise<AddedMedia> => {
    const { name } = source;
    const extension = extensionOf(name);
    if (kind !== "file" && !EXTENSIONS[kind].includes(extension)) {
      throw new Refused(
        t(`media.wrongType.${kind}` as StringKey, {
          name,
          types: EXTENSIONS[kind].join(", ").toUpperCase(),
        }),
      );
    }
    const tooLarge = () =>
      new Refused(t("media.tooLarge", { name, max: formatBytes(MEDIA_MAX_BYTES, locale) }));
    if ((source.size ?? 0) > MEDIA_MAX_BYTES) throw tooLarge();
    let data = await source.read();
    if (data.length > MEDIA_MAX_BYTES) throw tooLarge();
    if (data.length === 0) throw new Refused(t("media.empty", { name }));
    let type = typeOfName(name);
    let stored = name;
    let size: { width?: number | undefined; height?: number | undefined } = {};
    if (kind === "image") {
      const real = imageType(data);
      if (!real) throw new Refused(t("media.notImage", { name }));
      const image = await prepareImage(data, real, keepOriginal).catch(() => {
        throw new Refused(t("media.notImage", { name }));
      });
      ({ data, type, width: size.width, height: size.height } = image);
      stored = renamed(name, image.extension);
    } else if (kind === "captions") {
      const read = parseVtt(new TextDecoder().decode(data));
      if (!read.ok) {
        throw new Refused(t("media.badCaptions", { name, line: read.line, problem: read.message }));
      }
      // Markup the course does not keep goes now (accessibility.md B5).
      data = new TextEncoder().encode(serializeVtt(read.cues));
      type = "text/vtt";
    } else if (kind === "audio" || kind === "video") {
      if (isWebReady(data, name, kind)) type = webReadyType(name, kind);
      else {
        const converted = await convert(kind, source, data);
        ({ data, type } = converted);
        stored = renamed(name, converted.extension);
      }
      if (kind === "video") size = await videoSize(data, type);
    }
    const key = await session.addMedia(data, { name: stored, type, source: "upload" });
    const commands: Command[] = known.has(key)
      ? []
      : [
          {
            type: "insertMedia",
            value: {
              id: newId(),
              key,
              mimeType: /^[a-z]+\/[a-z0-9.+-]+$/.test(type) ? type : "application/octet-stream",
              ...(size.width && size.height && { width: size.width, height: size.height }),
              source: "upload",
            },
          },
        ];
    known.add(key);
    return { key, name: stored, type, size: data.length, commands };
  };

  const intake: MediaIntake = {
    name: (key) => session.mediaName(key),
    async saveCopy(key, suggestedName) {
      const data = await session.media(key);
      if (!data) return;
      const extension = extensionOf(suggestedName);
      const file = await host.files.pickSave({
        suggestedName,
        ...(extension && { filters: [{ name: extension.toUpperCase(), extensions: [extension] }] }),
      });
      if (file) await host.files.write(file, data);
    },
    async add(kind, from, { keepOriginal = false } = {}) {
      let sources: Source[];
      if (typeof from === "string") {
        const extensions = kind === "file" ? [] : [...EXTENSIONS[kind]];
        const picked = await host.files.pickOpen({
          title: t(`media.pickTitle.${kind}` as StringKey),
          multiple: from === "pick-many",
          ...(extensions.length > 0 && {
            filters: [{ name: t(`media.filter.${kind}` as StringKey), extensions }],
          }),
        });
        sources = picked.map((file) => ({
          name: file.name,
          file,
          read: () => host.files.read(file),
        }));
      } else {
        sources = from.map((file) => ({
          name: file.name,
          size: file.size,
          read: async () => new Uint8Array(await file.arrayBuffer()),
        }));
      }
      const newId = idMaker(session.editor.document);
      const known = new Set(session.editor.document.media.map((entry) => entry.key));
      const added: AddedMedia[] = [];
      const problems: string[] = [];
      for (const source of sources) {
        try {
          added.push(await addOne(kind, source, keepOriginal, newId, known));
        } catch (error) {
          if (error instanceof Stopped) continue;
          problems.push(
            error instanceof Refused
              ? error.message
              : t("media.failed", {
                  name: source.name,
                  problem: error instanceof Error ? error.message : String(error),
                }),
          );
        }
      }
      if (problems.length > 0) {
        await ask<null>((answer) => (
          <ChoiceDialog
            title={t("media.problemsTitle", { count: problems.length })}
            dismissed={null}
            answer={answer}
            choices={[{ value: null, label: t("action.ok"), variant: "primary" }]}
          >
            <ul className="be-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </ChoiceDialog>
        ));
      }
      return added;
    },
  };

  const percent = task && task.total > 0 ? Math.round((task.done * 100) / task.total) : undefined;
  return (
    <IntakeContext.Provider value={intake}>
      {children}
      {dialog}
      {task && (
        <Dialog isOpen title={task.title} onOpenChange={(open) => !open && task.cancel()}>
          <div className="be-task">
            <ProgressBar
              label={t("media.progress")}
              {...(percent === undefined
                ? { isIndeterminate: true }
                : {
                    value: percent,
                    valueLabel:
                      task.unit === "bytes"
                        ? t("media.progressBytes", {
                            done: formatBytes(task.done, locale),
                            total: formatBytes(task.total, locale),
                          })
                        : t("media.progressPercent", { percent }),
                  })}
            />
            <DialogActions>
              <Button onPress={task.cancel}>{t("action.cancel")}</Button>
            </DialogActions>
          </div>
        </Dialog>
      )}
    </IntakeContext.Provider>
  );
}

/** The file name with a new extension, when converting changed the file's format. */
function renamed(name: string, extension: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  return extensionOf(name) === extension || (extension === "jpg" && extensionOf(name) === "jpeg")
    ? name
    : `${base}.${extension}`;
}
