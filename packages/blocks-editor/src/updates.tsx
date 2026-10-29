// Updates of the desktop app (M2-20; M0-09, D-29, ADR-0004; teams-collab.md 3R R12, R13): the
// editor decides when the host checks the project's latest published release, asks the author
// before anything is downloaded, saves or asks about their work before the app restarts, and puts
// every failure in plain words. Automatic checks are on by default (R13); they run when the app
// starts, at most once a day, only while online, and never when the author turned them off in
// settings. Help > Check for updates in the app's menu checks at once. Only a host with `updates`
// (the desktop app) shows any of this.
import type { AppUpdate, HostInterface } from "@course-suite/host";
import {
  Button,
  Dialog,
  DialogActions,
  ProgressBar,
  Switch,
  useLocale,
  useStrings,
} from "@course-suite/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ChoiceDialog } from "./dialogs.js";
import { formatBytes } from "./media.js";

/** Storage keys: automatic checks (`off` when turned off) and when the last check started (ms). */
export const AUTO_KEY = "updates.auto";
export const LAST_KEY = "updates.lastCheck";
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the app checks for updates as it starts: automatic checks are on, the computer is
 * online, and a day has passed since the last check (or the clock went back past it).
 */
export function checkDue(state: {
  auto: boolean;
  online: boolean;
  last: number | undefined;
  now: number;
}): boolean {
  const { auto, online, last, now } = state;
  if (!auto || !online) return false;
  return last === undefined || now - last >= DAY_MS || now < last;
}

/** A dialog the hook's caller shows one at a time: resolves with the author's answer. */
type Ask = <T>(render: (answer: (value: T) => void) => ReactNode) => Promise<T>;

interface Task {
  title: string;
  done: number;
  total: number;
  cancel?: () => void;
}

/**
 * The update flow over `host.updates`: checks at start when due, and when the author asks (Help >
 * Check for updates, or settings); `beforeRestart` saves or asks about open work and says whether
 * the app may restart. Returns the progress dialog to render, the settings dialog's opener, and
 * whether there is anything to show.
 */
export function useUpdates({
  host,
  app,
  version,
  ask,
  beforeRestart,
}: {
  host: HostInterface;
  /** The app's name, as the host gives it; empty until it is known, which holds the start check. */
  app: string;
  /** The running version. */
  version: string;
  ask: Ask;
  beforeRestart: () => Promise<boolean>;
}) {
  const t = useStrings();
  const { locale } = useLocale();
  const { updates } = host;
  const [task, setTask] = useState<Task>();
  const busy = useRef(false);

  const notify = (title: string, ...lines: string[]) =>
    ask<null>((answer) => (
      <ChoiceDialog
        title={title}
        choices={[{ value: null, label: t("action.ok"), variant: "primary" }]}
        dismissed={null}
        answer={answer}
      >
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </ChoiceDialog>
    ));
  /** Plain words for a failure, by its reason; anything else says what it was. */
  const why = (error: unknown) => {
    const reason = error instanceof Error && "reason" in error ? String(error.reason) : "failed";
    const details = error instanceof Error ? error.message : String(error);
    return reason === "network" ||
      reason === "invalid" ||
      reason === "signature" ||
      reason === "unavailable"
      ? t(`update.failed.${reason}`, { app })
      : t("update.failed.failed", { details });
  };

  /** Asks the release site, then offers what it found; `manual` says every outcome. */
  const run = async (manual: boolean) => {
    if (!updates || busy.current) return;
    busy.current = true;
    try {
      if (!(await updates.available())) {
        if (manual) await notify(t("update.title"), t("update.failed.unavailable", { app }));
        return;
      }
      // Offline, nothing is attempted (ADR-0004).
      if (!navigator.onLine) {
        if (manual) await notify(t("update.title"), t("update.offline"));
        return;
      }
      if (manual) setTask({ title: t("update.checking"), done: 0, total: 0 });
      await host.storage.set(LAST_KEY, String(Date.now()));
      let found: AppUpdate | null;
      try {
        found = await updates.check();
      } catch (error) {
        setTask(undefined);
        // A failed automatic check stays quiet: the next start tries again.
        if (manual) await notify(t("update.checkFailed"), why(error));
        return;
      }
      setTask(undefined);
      if (!found) {
        if (manual) await notify(t("update.title"), t("update.none", { app, version }));
        return;
      }
      if (await offer(found)) await install(found);
    } finally {
      setTask(undefined);
      busy.current = false;
    }
  };

  const offer = (found: AppUpdate) =>
    ask<boolean>((answer) => (
      <ChoiceDialog
        title={t("update.found", { app, version: found.version })}
        dismissed={false}
        answer={answer}
        choices={[
          { value: false, label: t("update.later"), variant: "quiet" },
          { value: true, label: t("update.install"), variant: "primary" },
        ]}
      >
        <p>{t("update.foundBody", { app, current: version })}</p>
        {found.notes.trim() && <Notes notes={found.notes} />}
      </ChoiceDialog>
    ));

  /** Downloads and checks the update, saves or asks about open work, then restarts into it. */
  const install = async (found: AppUpdate) => {
    if (!updates) return;
    const stop = new AbortController();
    const title = t("update.downloading", { app, version: found.version });
    setTask({ title, done: 0, total: 0, cancel: () => stop.abort() });
    try {
      await updates.download({
        signal: stop.signal,
        onProgress: (done, total) => setTask({ title, done, total, cancel: () => stop.abort() }),
      });
    } catch (error) {
      setTask(undefined);
      if (stop.signal.aborted) return;
      await notify(t("update.failedTitle"), why(error), t("update.keepsWorking"));
      return;
    }
    setTask(undefined);
    if (!(await beforeRestart())) {
      await notify(t("update.failedTitle"), t("update.notRestarted"));
      return;
    }
    setTask({ title: t("update.installing", { app, version: found.version }), done: 0, total: 0 });
    try {
      await updates.install();
    } catch (error) {
      setTask(undefined);
      await notify(t("update.failedTitle"), why(error), t("update.keepsWorking"));
    }
  };

  // The latest flow, for the listeners below, which are set once.
  const latest = useRef(run);
  latest.current = run;

  // At start, once the app has its name: the automatic check, when it is due.
  const named = app !== "";
  useEffect(() => {
    if (!updates || !named) return;
    let live = true;
    void (async () => {
      const [auto, last] = await Promise.all([
        host.storage.get(AUTO_KEY),
        host.storage.get(LAST_KEY),
      ]);
      const due = checkDue({
        auto: auto !== "off",
        online: navigator.onLine,
        last: last === undefined ? undefined : Number(last),
        now: Date.now(),
      });
      if (live && due) await latest.current(false);
    })();
    return () => {
      live = false;
    };
  }, [host, updates, named]);

  // Help > Check for updates.
  useEffect(() => updates?.onCheckRequested(() => void latest.current(true)), [updates]);

  /** The app settings dialog; its Check now button checks at once. */
  const openSettings = async () => {
    if (!updates) return;
    const [ready, auto] = await Promise.all([updates.available(), host.storage.get(AUTO_KEY)]);
    const checkNow = await ask<boolean>((answer) => (
      <SettingsDialog
        ready={ready}
        auto={auto !== "off"}
        version={version}
        onAuto={(on) => void host.storage.set(AUTO_KEY, on ? "on" : "off")}
        answer={answer}
      />
    ));
    if (checkNow) await run(true);
  };

  const percent = task && task.total > 0 ? Math.round((task.done * 100) / task.total) : undefined;
  const progress = task && (
    <Dialog
      isOpen
      title={task.title}
      onOpenChange={(open) => {
        if (!open) task.cancel?.();
      }}
    >
      <div className="be-task">
        <ProgressBar
          label={t("media.progress")}
          {...(percent === undefined
            ? { isIndeterminate: true }
            : {
                value: percent,
                valueLabel: t("media.progressBytes", {
                  done: formatBytes(task.done, locale),
                  total: formatBytes(task.total, locale),
                }),
              })}
        />
        {task.cancel && (
          <DialogActions>
            <Button onPress={task.cancel}>{t("action.cancel")}</Button>
          </DialogActions>
        )}
      </div>
    </Dialog>
  );

  return {
    /** The progress dialog of a check, download or install, while one runs. */
    progress,
    /** Opens the app settings; undefined where the host cannot update the app. */
    openSettings: updates ? () => void openSettings() : undefined,
  };
}

/** The release's notes, as plain text in a box that scrolls (and takes focus to scroll). */
function Notes({ notes }: { notes: string }) {
  const t = useStrings();
  const id = useId();
  return (
    <>
      <p id={id}>{t("update.notes")}</p>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling box takes focus so the keyboard can scroll it */}
      <section className="be-update-notes" aria-labelledby={id} tabIndex={0}>
        {notes.trim()}
      </section>
    </>
  );
}

/** App settings: for now, the updates of the desktop app. */
function SettingsDialog({
  ready,
  auto,
  version,
  onAuto,
  answer,
}: {
  /** Whether this build can update itself. */
  ready: boolean;
  auto: boolean;
  version: string;
  onAuto: (on: boolean) => void;
  /** True for Check now, false when closed. */
  answer: (checkNow: boolean) => void;
}) {
  const t = useStrings();
  const [on, setOn] = useState(auto);
  const help = useId();
  const heading = useId();
  return (
    <Dialog isOpen title={t("settings.title")} onOpenChange={(open) => !open && answer(false)}>
      <section className="be-form" aria-labelledby={heading}>
        <h3 id={heading} className="be-settings-heading">
          {t("update.title")}
        </h3>
        <Switch
          isSelected={ready && on}
          isDisabled={!ready}
          aria-describedby={help}
          onChange={(value) => {
            setOn(value);
            onAuto(value);
          }}
        >
          {t("update.auto")}
        </Switch>
        <p id={help} className="be-update-help">
          {t(ready ? "update.autoHelp" : "update.unavailableHelp")}
        </p>
        <p className="be-update-help">{t("update.current", { version })}</p>
      </section>
      <DialogActions>
        <Button isDisabled={!ready} onPress={() => answer(true)}>
          {t("update.checkNow")}
        </Button>
        <Button variant="primary" onPress={() => answer(false)}>
          {t("settings.done")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
