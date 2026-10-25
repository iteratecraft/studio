// The preview pane (ENG-13; UI-BLOCKS-EDITOR P1, 2.20, W23): the course in the real player, with an
// edit button that returns to the lesson on show, a restart that forgets the learner's progress,
// and device buttons for computer, tablet and phone widths. The player runs in a sandboxed frame
// from @course-suite/preview; this is only its frame of controls.
import type { MediaSource, Preview, PreviewSource } from "@course-suite/preview";
import {
  type CSSProperties,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button, ToggleButton, ToggleButtonGroup, Toolbar } from "./buttons.js";
import { Icon } from "./icons.js";
import { useStrings } from "./provider.js";

export type { MediaSource, Preview, PreviewSource };

/** Widths the author previews at (UI-BLOCKS-EDITOR 2.20, R53); a computer gets the whole pane. */
export const DEVICE_WIDTHS = { computer: undefined, tablet: 768, phone: 375 } as const;
export type Device = keyof typeof DEVICE_WIDTHS;

export interface PreviewPaneProps {
  /** The document and its change events; a doc-ops Editor is one. */
  source: PreviewSource;
  /** The bytes of a project media file by storage key. Keep it stable: a new one reloads. */
  media: MediaSource;
  /** Id of the lesson or quiz being edited, to open first; the overview when absent. */
  start?: string | undefined;
  /** The edit button: back to the editor at the lesson on show (undefined on the overview). */
  onEdit?: (page: string | undefined) => void;
  /** Each time the preview shows the course: milliseconds the load took. */
  onRender?: (ms: number) => void;
  /** The running preview: where the learner is, the debug adapter's calls, restart. */
  ref?: Ref<Pick<Preview, "page" | "scrollY" | "calls" | "restart">>;
}

export function PreviewPane({ source, media, start, onEdit, onRender, ref }: PreviewPaneProps) {
  const t = useStrings();
  const [device, setDevice] = useState<Device>("computer");
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
  const title = t("preview.frame");
  // shortcut: a new frame title (another language) applies from the next load, not at once.
  const latest = useRef({ title, onRender });
  useEffect(() => {
    latest.current = { title, onRender };
  });

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    let running: Preview | undefined;
    let gone = false;
    // The player bundle loads with the first preview, so an editor that never previews skips it.
    void import("@course-suite/preview").then(({ createPreview }) => {
      if (gone) return;
      running = createPreview(container, {
        source,
        media,
        start,
        title: latest.current.title,
        onRender: (ms) => latest.current.onRender?.(ms),
      });
      preview.current = running;
    });
    return () => {
      gone = true;
      running?.dispose();
      preview.current = null;
    };
  }, [source, media, start]);

  useImperativeHandle(
    ref,
    () => ({
      get page() {
        return preview.current?.page;
      },
      get scrollY() {
        return preview.current?.scrollY ?? 0;
      },
      calls: () => preview.current?.calls() ?? Promise.resolve([]),
      restart: () => preview.current?.restart(),
    }),
    [],
  );

  const width = DEVICE_WIDTHS[device];
  return (
    <section className="cs-Preview" aria-label={t("preview.label")}>
      <Toolbar aria-label={t("preview.label")} className="cs-Preview-bar">
        {onEdit && (
          <Button onPress={() => onEdit(preview.current?.page)}>
            <Icon name="edit" />
            {t("preview.edit")}
          </Button>
        )}
        <span className="cs-Preview-spacer" />
        <Button variant="quiet" onPress={() => preview.current?.restart()}>
          <Icon name="restore" />
          {t("preview.restart")}
        </Button>
        <ToggleButtonGroup
          aria-label={t("preview.device")}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[device]}
          onSelectionChange={(keys) => {
            const [next] = keys;
            if (next) setDevice(next as Device);
          }}
        >
          {(Object.keys(DEVICE_WIDTHS) as Device[]).map((id) => (
            <ToggleButton key={id} id={id} icon={id} label={t(`preview.${id}`)} />
          ))}
        </ToggleButtonGroup>
      </Toolbar>
      <div className="cs-Preview-stage">
        <div
          ref={stage}
          className="cs-Preview-device"
          data-device={device}
          style={
            { "--cs-preview-width": width === undefined ? "100%" : `${width}px` } as CSSProperties
          }
        />
      </div>
    </section>
  );
}
