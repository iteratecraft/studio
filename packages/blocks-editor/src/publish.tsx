// The publish panel and export (M2-18, BLK-10, STD-08; blocks-publish-collab.md A8, A9, A11, A13,
// A14, 2.1 to 2.3, W1 to W3, UI-PUBCOLLAB-R1, R2, R4; rise.md 3M): the output (SCORM 1.2, SCORM
// 2004, xAPI, cmi5 or a web package), the package's identifier, title, description and keywords,
// what completes the course and how it is reported, cmi5's move-on rule, and the options of the
// output, all saved in the course as they change (one undo step each), so a republish uses them.
// Export checks the course, asks where to save the zip through the host, and builds it in the
// background with progress and cancel. Advanced exporter options (STD-11, STD-12) come in M2b.
import type { Command } from "@course-suite/doc-ops";
import {
  activityIdOf,
  type Course,
  type CourseCheck,
  completionThreshold,
  courseChecks,
  DEFAULT_PASSING_SCORE,
  defaultActivityId,
  defaultManifestIdentifier,
  exportCourseOf,
  isPackageIdentifier,
  type LomMetadata,
  manifestIdentifierOf,
  mediaKeysIn,
  nextPackageVersion,
  type PublishSettings,
  publishProblems,
  publishSettingsOf,
  quizzesOf,
  STANDARDS,
  type Standard,
  trackedQuiz,
  usedMediaKeys,
} from "@course-suite/format";
import type { HostInterface } from "@course-suite/host";
import {
  Button,
  Dialog,
  DialogActions,
  type FontSource,
  IconButton,
  ListBoxItem,
  ProgressBar,
  Select,
  SliderField,
  Switch,
  TextField,
  type ToastQueue,
  type Translate,
  useAnnouncer,
  useLocale,
  useStrings,
} from "@course-suite/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ChoiceDialog, useDialogs } from "./dialogs.js";
import type { ExportJob, Exports } from "./export.js";
import { DraftField } from "./fields.js";
import { formatBytes } from "./media.js";
import type { CourseSession } from "./session.js";

type Wording = NonNullable<PublishSettings["statusWording"]>;
/** Settings to change; undefined removes one. */
type Patch = { [K in keyof PublishSettings]?: PublishSettings[K] | undefined };
type MoveOn = NonNullable<PublishSettings["moveOn"]>;

type WordingKey = `${Wording["done"]}-${Wording["notDone"]}`;
const WORDINGS: Record<WordingKey, Wording> = {
  "passed-incomplete": { done: "passed", notDone: "incomplete" },
  "passed-failed": { done: "passed", notDone: "failed" },
  "completed-incomplete": { done: "completed", notDone: "incomplete" },
  "completed-failed": { done: "completed", notDone: "failed" },
};
const MOVE_ON: readonly MoveOn[] = [
  "Completed",
  "Passed",
  "CompletedAndPassed",
  "CompletedOrPassed",
  "NotApplicable",
];

const isIri = (standard: Standard) => standard === "xapi" || standard === "cmi5";

/** The settings without unset values. */
const cleaned = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

/** The course's current settings with `patch` over them. */
const patched = (course: Course, patch: Patch) =>
  cleaned({ ...publishSettingsOf(course), ...patch }) as PublishSettings;

/** The command that saves `patch` over the course's current settings. */
function publishCommand(course: Course, patch: Patch): Command {
  return { type: "updateCourse", set: { publish: patched(course, patch) } };
}

/** A name for a page of the course, for the checks. */
const entryName = (course: Course, id: string, t: Translate) => {
  const entry = course.entries.find((other) => other.id === id);
  const title = entry?.title.trim();
  if (title) return title;
  return t(entry?.kind === "quiz" ? "outline.untitledQuiz" : "outline.untitledLesson");
};

/** Media files a package of the course holds that the project lacks, with where each is used. */
function missingMedia(course: Course, session: CourseSession) {
  const used = usedMediaKeys(course);
  return course.media.flatMap((entry) => {
    const key = entry.variantKey ?? entry.key;
    if (!used.has(entry.key) || session.mediaName(key) !== undefined) return [];
    const page = course.entries.find((other) => mediaKeysIn(other).has(entry.key));
    return [{ key, entry: page?.id }];
  });
}

/** One line per check, for the panel and the prompt before an export. */
function checkLines(course: Course, session: CourseSession, t: Translate) {
  const name = (id: string | undefined) => (id ? entryName(course, id, t) : course.title);
  return {
    missing: missingMedia(course, session).map((file) =>
      t("publish.check.missing", { name: file.key, entry: name(file.entry) }),
    ),
    checks: courseChecks(course).map((check: CourseCheck) =>
      t(`publish.check.${check.code}`, { entry: name(check.entry) }),
    ),
  };
}

/** A switch with its note below it, read as its description. */
function Described({
  note,
  children,
  ...props
}: {
  note: string;
  children: string;
  isSelected: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="be-publish-switch">
      <Switch {...props} aria-describedby={id}>
        {children}
      </Switch>
      <p id={id} className="be-note">
        {note}
      </p>
    </div>
  );
}

/**
 * The package identifier (BLK-10, standards.md E-6, E-16). Unlike the other text settings, what
 * the author typed stays in the field while it is not valid, marked with the reason, so the
 * export it blocks says where to look; a valid identifier is kept on Enter or on leaving the field.
 */
function IdentifierField({
  standard,
  value,
  keep,
}: {
  standard: Standard;
  value: string;
  keep: (value: string) => void;
}) {
  const t = useStrings();
  const [typed, setTyped] = useState<string>();
  // Shown again from the course when the course changes it (an undo, another output).
  useEffect(() => setTyped(undefined), [value]);
  const shown = typed ?? value;
  const valid = shown.trim() === "" || isPackageIdentifier(standard, shown.trim());
  const end = () => {
    if (typed === undefined || !valid) return;
    keep(typed);
    setTyped(undefined);
  };
  return (
    <TextField
      label={t("publish.identifier")}
      description={t(isIri(standard) ? "publish.identifierHelpIri" : "publish.identifierHelp")}
      errorMessage={t(isIri(standard) ? "publish.identifierErrorIri" : "publish.identifierError")}
      value={shown}
      isInvalid={!valid}
      onChange={setTyped}
      onBlur={end}
      onKeyDown={(event) => {
        if (event.key === "Enter") end();
        else if (event.key === "Escape") setTyped(undefined);
        else event.continuePropagation();
      }}
    />
  );
}

/** A heading and its settings. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="be-publish-section" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

/** What an export dialog shows: its progress, then how it ended. */
type Run =
  | { state: "running"; percent: number | undefined; cancel: () => void }
  | { state: "done"; job: ExportJob; name: string };

export function PublishView({
  session,
  host,
  exports,
  fonts,
  toasts,
  onClose,
}: {
  session: CourseSession;
  host: HostInterface;
  /** The app's exports; without them (an app that builds no packages) Export is unavailable. */
  exports: Exports | undefined;
  /** The theme's fonts: bundled, or from the author's library (ENG-08). */
  fonts: FontSource;
  toasts: ToastQueue;
  onClose: () => void;
}) {
  const t = useStrings();
  const { locale } = useLocale();
  const { editor } = session;
  const course = editor.document;
  const settings = publishSettingsOf(course);
  const { standard } = settings;
  const lms = standard !== "web";
  const quizzes = quizzesOf(course);
  const quiz = trackedQuiz(course, settings);
  const tracking = settings.tracking?.kind === "quiz" ? "quiz" : "completion";
  const micro = course.kind === "microlearning";
  const savedThreshold = completionThreshold(course);
  const [threshold, setThreshold] = useState(savedThreshold);
  useEffect(() => setThreshold(savedThreshold), [savedThreshold]);
  const problems = publishProblems(course);
  const moveOn = settings.moveOn ?? (quiz ? "Passed" : "Completed");
  const { dialog, ask } = useDialogs();
  const { region, announce } = useAnnouncer();
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<Run>();
  /** The export dialog was sent to the background: its end comes as a notice. */
  const background = useRef(false);
  const [resume, setResume] = useState<{ size: number; cap: number }>();

  useEffect(() => heading.current?.focus(), []);
  // The live estimate of learner progress against the output's limit (STD-08, M2-07). The code
  // that measures it is the player's, loaded only when this panel opens.
  useEffect(() => {
    let gone = false;
    void import("./resume-size.js").then(({ resumeSize }) => {
      if (!gone) setResume(resumeSize(course, standard));
    });
    return () => {
      gone = true;
    };
  }, [course, standard]);

  const set = (patch: Patch) => editor.dispatch(publishCommand(course, patch));
  const theme = course.theme ?? {};
  // LMS packages skip the cover by the theme's setting (BLK-09); a web package by its own, kept
  // apart (blocks-publish-collab.md 2.3, UI-PUBCOLLAB-R4).
  const hideCover = lms ? theme.cover?.skip === true : settings.webSkipCover === true;
  const setHideCover = (on: boolean) => {
    if (!lms) return set({ webSkipCover: on || undefined });
    const cover = cleaned({ ...theme.cover, skip: on || undefined });
    const next = cleaned({
      ...theme,
      cover: Object.keys(cover).length > 0 ? cover : undefined,
    }) as typeof theme;
    editor.dispatch(
      Object.keys(next).length > 0
        ? { type: "updateCourse", set: { theme: next } }
        : { type: "updateCourse", unset: ["theme"] },
    );
  };
  const setReset = async (on: boolean) => {
    // A confirm step (blocks-publish-collab.md 2.2): it affects every learner in progress.
    if (on) {
      const sure = await ask<boolean>((answer) => (
        <ChoiceDialog
          title={t("publish.resetConfirmTitle")}
          choices={[
            { value: false, label: t("action.cancel"), variant: "quiet" },
            { value: true, label: t("publish.resetConfirmYes"), variant: "primary" },
          ]}
          dismissed={false}
          answer={answer}
        >
          <p>{t("publish.resetConfirm")}</p>
        </ChoiceDialog>
      ));
      if (!sure) return;
    }
    set({ resetOnUpdate: on });
  };

  /** A text setting of the package, saved as it is typed when it is valid. */
  const textCommand =
    (key: "manifestIdentifier" | "activityId" | "lomTitle" | "lomDescription" | "lomKeywords") =>
    (text: string): Command | Command[] | undefined => {
      const now = editor.document;
      const value = text.trim();
      const current = publishSettingsOf(now);
      if (key === "manifestIdentifier" || key === "activityId") {
        const fallback =
          key === "activityId" ? defaultActivityId(now) : defaultManifestIdentifier(now);
        if (value !== "" && !isPackageIdentifier(current.standard, value)) return undefined;
        const kept = value === "" || value === fallback ? undefined : value;
        return publishCommand(
          now,
          key === "activityId" ? { activityId: kept } : { manifestIdentifier: kept },
        );
      }
      const lom: { [K in keyof LomMetadata]?: LomMetadata[K] | undefined } = { ...current.lom };
      if (key === "lomTitle") lom.title = value || undefined;
      if (key === "lomDescription") lom.description = value || undefined;
      if (key === "lomKeywords") {
        const words = [...new Set(value.split(",").map((word) => word.trim()))].filter(Boolean);
        lom.keywords = words.length > 0 ? words : undefined;
      }
      const kept = cleaned(lom) as LomMetadata;
      return publishCommand(now, { lom: Object.keys(kept).length > 0 ? kept : undefined });
    };

  const exportCourse = async () => {
    session.commitDrafts();
    // A setting that cannot be exported is marked on its field (BLK-10: an invalid identifier
    // blocks export with a message on that field).
    const invalid = form.current?.querySelector<HTMLElement>(
      "[aria-invalid=true], [data-invalid] button",
    );
    if (invalid || publishProblems(editor.document).length > 0) {
      (invalid ?? form.current?.querySelector<HTMLElement>("[data-invalid] button"))?.focus();
      announce(t("publish.invalid"));
      return;
    }
    if (!exports) return;
    const now = editor.document;
    const { missing, checks } = checkLines(now, session, t);
    // A file the package needs is missing: say which, where, and stop (BLK-10).
    if (missing.length > 0) {
      await ask<void>((answer) => (
        <ChoiceDialog
          title={t("publish.missingTitle")}
          choices={[{ value: undefined, label: t("action.ok"), variant: "primary" }]}
          dismissed={undefined}
          answer={answer}
        >
          <p>{t("publish.missingIntro")}</p>
          <ul className="be-publish-list">
            {missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </ChoiceDialog>
      ));
      return;
    }
    // A13, UI-PUBCOLLAB-R2: go back and edit, or export anyway.
    if (checks.length > 0) {
      const go = await ask<boolean>((answer) => (
        <ChoiceDialog
          title={t("publish.checkTitle")}
          choices={[
            { value: false, label: t("publish.checkEdit"), variant: "quiet" },
            { value: true, label: t("publish.checkContinue"), variant: "primary" },
          ]}
          dismissed={false}
          answer={answer}
        >
          <p>{t("publish.checkIntro")}</p>
          <ul className="be-publish-list">
            {checks.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </ChoiceDialog>
      ));
      if (!go) return;
    }
    const file = await host.files.pickSave({
      title: t("publish.saveTitle"),
      suggestedName: `${fileStem(now.title) || "course"}-${standard}.zip`,
      filters: [{ name: t("publish.zipFilter"), extensions: ["zip"] }],
    });
    if (!file) return;
    // The package version is taken as the export starts, so an export started before this one
    // ends gets the next one (rise.md rule 12). With it, the settings published with are kept in
    // the course, defaults included (UI-PUBCOLLAB-R4). Both record the export rather than edit
    // the course, so they stay out of the undo history: an undo never hands out a shipped version
    // again, and the export adds no undo step.
    const packageVersion = nextPackageVersion(editor.document);
    editor.dispatch(
      {
        type: "updateCourse",
        set: { packageVersion, publish: patched(editor.document, {}) },
      },
      { history: false },
    );
    const exported = exportCourseOf(editor.document);
    background.current = false;
    let percent: number | undefined;
    const started = await exports.start(
      exported,
      { media: session.media, fonts },
      exported.publish?.standard ?? standard,
      packageVersion,
      file,
      ({ done, total }) => {
        percent = total > 0 ? Math.round((done * 100) / total) : undefined;
        setRun((current) => (current?.state === "running" ? { ...current, percent } : current));
      },
    );
    setRun({ state: "running", percent, cancel: started.cancel });
    const job = await started.finished;
    if (job.state === "cancelled") {
      setRun(undefined);
      announce(t("publish.cancelled"));
      return;
    }
    if (background.current) {
      toasts.add(
        {
          title:
            job.state === "succeeded"
              ? t("publish.doneToast", { name: file.name })
              : t("publish.failedTitle"),
        },
        { timeout: 8000 },
      );
      return;
    }
    setRun({ state: "done", job, name: file.name });
  };

  const identifierKey = isIri(standard) ? "activityId" : "manifestIdentifier";
  const identifier = isIri(standard) ? activityIdOf(course) : manifestIdentifierOf(course);
  const wordings = (Object.keys(WORDINGS) as WordingKey[]).filter(
    // A microlearning has no quiz, so it never fails (rise.md 3M).
    (key) => course.kind === "course" || !key.endsWith("failed"),
  );
  const wording = settings.statusWording ?? WORDINGS["passed-incomplete"];
  const wordingKey: WordingKey = `${wording.done}-${wording.notDone}`;

  return (
    <main className="be-publish">
      <div className="be-publish-bar">
        <IconButton icon="back" label={t("publish.close")} onPress={onClose} />
        <h2 ref={heading} tabIndex={-1}>
          {t("publish.title")}
        </h2>
        <span className="be-publish-spacer" />
        <Button variant="primary" isDisabled={!exports} onPress={() => void exportCourse()}>
          {t("publish.export")}
        </Button>
      </div>
      <div ref={form} className="be-publish-form">
        <Select
          label={t("publish.output")}
          description={t(lms ? "publish.output.lmsHelp" : "publish.output.webHelp")}
          selectedKey={standard}
          onSelectionChange={(key) => key !== standard && set({ standard: key as Standard })}
        >
          {STANDARDS.map((id) => (
            <ListBoxItem key={id} id={id}>
              {t(`publish.output.${id}`)}
            </ListBoxItem>
          ))}
        </Select>

        {lms && (
          <Section title={t("publish.section.details")}>
            <IdentifierField
              key={identifierKey}
              standard={standard}
              value={identifier}
              keep={(value) => {
                const command = textCommand(identifierKey)(value);
                if (command) editor.dispatch(command);
              }}
            />
            <DraftField
              label={t("publish.lomTitle")}
              description={t("publish.lomTitleHelp")}
              value={settings.lom?.title ?? ""}
              command={textCommand("lomTitle")}
            />
            <DraftField
              label={t("publish.lomDescription")}
              description={t("publish.lomDescriptionHelp")}
              value={settings.lom?.description ?? ""}
              command={textCommand("lomDescription")}
              multiline
            />
            <DraftField
              label={t("publish.lomKeywords")}
              description={t("publish.lomKeywordsHelp")}
              value={settings.lom?.keywords?.join(", ") ?? ""}
              command={textCommand("lomKeywords")}
            />
          </Section>
        )}

        {lms && (
          <Section title={t("publish.section.tracking")}>
            {/* A microlearning has no quiz and completes at 100 % viewed (rise.md 3M, rule 16). */}
            {micro && <p className="be-note">{t("publish.tracking.micro")}</p>}
            {!micro && (
              <Select
                label={t("publish.tracking")}
                description={quizzes.length === 0 ? t("publish.tracking.noQuiz") : undefined}
                selectedKey={tracking}
                disabledKeys={quizzes.length === 0 ? ["quiz"] : []}
                onSelectionChange={(key) => {
                  if (key === tracking) return;
                  // UI-PUBCOLLAB-R5: the first quiz is the one offered.
                  const first = quizzes[0];
                  set({
                    tracking:
                      key === "quiz" && first
                        ? { kind: "quiz", quiz: first.id }
                        : { kind: "completion" },
                  });
                }}
              >
                <ListBoxItem id="completion">{t("publish.tracking.completion")}</ListBoxItem>
                <ListBoxItem id="quiz">{t("publish.tracking.quiz")}</ListBoxItem>
              </Select>
            )}
            {micro ? null : tracking === "completion" ? (
              <SliderField
                label={t("publish.threshold")}
                unit={t("publish.thresholdUnit")}
                value={threshold}
                minValue={1}
                maxValue={100}
                onChange={setThreshold}
                onChangeEnd={(value) =>
                  value !== savedThreshold &&
                  set({
                    tracking: { kind: "completion", ...(value < 100 && { threshold: value }) },
                  })
                }
              />
            ) : (
              <>
                <Select
                  label={t("publish.quiz")}
                  selectedKey={quiz?.id ?? null}
                  onSelectionChange={(key) =>
                    key !== quiz?.id && set({ tracking: { kind: "quiz", quiz: String(key) } })
                  }
                >
                  {quizzes.map((other) => (
                    <ListBoxItem key={other.id} id={other.id}>
                      {entryName(course, other.id, t)}
                    </ListBoxItem>
                  ))}
                </Select>
                <p className="be-note">
                  {t("publish.passing", {
                    score: quiz?.settings?.passingScore ?? DEFAULT_PASSING_SCORE,
                  })}
                </p>
              </>
            )}
            <Select
              label={t("publish.reporting")}
              description={t("publish.reportingHelp")}
              selectedKey={wordingKey}
              onSelectionChange={(key) => {
                if (key !== wordingKey) set({ statusWording: WORDINGS[key as WordingKey] });
              }}
            >
              {wordings.map((id) => (
                <ListBoxItem key={id} id={id}>
                  {t(`publish.reporting.${id}`)}
                </ListBoxItem>
              ))}
            </Select>
            {standard === "cmi5" && (
              <Select
                label={t("publish.moveOn")}
                description={t("publish.moveOnHelp")}
                errorMessage={t("publish.moveOnError")}
                isInvalid={problems.some((problem) => problem.setting === "moveOn")}
                selectedKey={moveOn}
                onSelectionChange={(key) => key !== moveOn && set({ moveOn: key as MoveOn })}
              >
                {MOVE_ON.map((id) => (
                  <ListBoxItem key={id} id={id}>
                    {t(`publish.moveOn.${id}`)}
                  </ListBoxItem>
                ))}
              </Select>
            )}
          </Section>
        )}

        <Section title={t("publish.section.options")}>
          {lms && (
            <Described
              note={t("publish.exitLinkHelp")}
              isSelected={settings.exitLink === true}
              onChange={(on) => set({ exitLink: on })}
            >
              {t("publish.exitLink")}
            </Described>
          )}
          <Described
            note={t(lms ? "publish.hideCoverHelp" : "publish.hideCoverWebHelp")}
            isSelected={hideCover}
            onChange={setHideCover}
          >
            {t("publish.hideCover")}
          </Described>
        </Section>

        {lms && (
          // A10, W1 step 6: reset on update and LMS-only launch are the LMS panel's advanced options.
          <Section title={t("publish.section.advanced")}>
            <Described
              note={t("publish.resetHelp")}
              isSelected={settings.resetOnUpdate === true}
              onChange={(on) => void setReset(on)}
            >
              {t("publish.reset")}
            </Described>
            <Described
              note={t("publish.lmsOnlyHelp")}
              isSelected={settings.lmsOnly === true}
              onChange={(on) => set({ lmsOnly: on })}
            >
              {t("publish.lmsOnly")}
            </Described>
          </Section>
        )}

        <Section title={t("publish.section.checks")}>
          <Checks course={course} session={session} standard={standard} resume={resume} />
        </Section>
      </div>
      {region}
      {dialog}
      {run && (
        <Dialog
          isOpen
          title={t(
            run.state === "running"
              ? "publish.exporting"
              : run.job.state === "succeeded"
                ? "publish.doneTitle"
                : "publish.failedTitle",
          )}
          onOpenChange={(open) => {
            if (open) return;
            // Closing the dialog while it runs sends the export to the background (A14).
            if (run.state === "running") background.current = true;
            setRun(undefined);
          }}
        >
          {run.state === "running" ? (
            <div className="be-task">
              <ProgressBar
                label={t("publish.progress")}
                {...(run.percent === undefined
                  ? { isIndeterminate: true }
                  : {
                      value: run.percent,
                      valueLabel: t("media.progressPercent", { percent: run.percent }),
                    })}
              />
              <DialogActions>
                <Button variant="quiet" onPress={run.cancel}>
                  {t("publish.cancel")}
                </Button>
                <Button
                  variant="primary"
                  autoFocus
                  onPress={() => {
                    background.current = true;
                    setRun(undefined);
                  }}
                >
                  {t("publish.background")}
                </Button>
              </DialogActions>
            </div>
          ) : (
            <Finished run={run} lms={lms} locale={locale} close={() => setRun(undefined)} />
          )}
        </Dialog>
      )}
    </main>
  );
}

/** The end of an export: where the package is and what to do with it, or why it failed. */
function Finished({
  run,
  lms,
  locale,
  close,
}: {
  run: Extract<Run, { state: "done" }>;
  lms: boolean;
  locale: string;
  close: () => void;
}) {
  const t = useStrings();
  const { job, name } = run;
  const details = Array.isArray(job.error?.details)
    ? (job.error.details as { file?: string; message?: string }[])
    : [];
  return (
    <div className="be-dialog-body">
      {job.state === "succeeded" && job.result ? (
        <>
          <p role="status">
            {t("publish.done", { name, size: formatBytes(job.result.size, locale) })}
          </p>
          <p>{t(lms ? "publish.doneLms" : "publish.doneWeb")}</p>
          {job.result.warnings.length > 0 && (
            <>
              <p>{t("publish.warnings")}</p>
              <ul className="be-publish-list">
                {job.result.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p role="alert">{job.error?.message}</p>
          {details.length > 0 && (
            <ul className="be-publish-list">
              {details.map((problem, i) => (
                <li key={i}>{[problem.file, problem.message].filter(Boolean).join(" ")}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <DialogActions>
        <Button variant="primary" autoFocus onPress={close}>
          {t("action.ok")}
        </Button>
      </DialogActions>
    </div>
  );
}

/** The live checks: learner progress against the output's limit, and what to look at. */
function Checks({
  course,
  session,
  standard,
  resume,
}: {
  course: Course;
  session: CourseSession;
  standard: Standard;
  resume: { size: number; cap: number } | undefined;
}) {
  const t = useStrings();
  const { missing, checks } = checkLines(course, session, t);
  const lines = [...missing, ...checks];
  return (
    <>
      {standard !== "web" && resume && (
        <p className={resume.size > resume.cap ? "be-publish-warning" : "be-note"}>
          {t(resume.size > resume.cap ? "publish.resumeOver" : "publish.resume", {
            size: resume.size,
            cap: resume.cap,
          })}
        </p>
      )}
      {lines.length === 0 ? (
        <p className="be-note">{t("publish.checksNone")}</p>
      ) : (
        <ul className="be-publish-list">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A file name from the course title: letters, digits and dashes, as the save dialog suggests. */
const fileStem = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
