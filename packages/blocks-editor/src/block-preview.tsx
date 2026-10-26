// Each block as learners see it, beside its fields (BLK-03: each block previews inline through the
// real player renderer). It is drawn again whenever the block changes, so every edit shows at once.
// The preview is a picture of the block: the fields edit it, so it takes no focus or clicks and
// screen readers skip it. The player's renderer loads with the first lesson opened.
import type { Block, Course } from "@course-suite/format";
import { useStrings } from "@course-suite/ui";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type FontLibrary, registerFont } from "./fonts.js";
import type { CourseSession } from "./session.js";

type Families = { heading: string; body: string; ui: string };
/** The families the editor registered for the course's heading, body and interface fonts. */
const ThemeFamilies = createContext<Families | undefined>(undefined);

/**
 * The course theme's fonts in the editor's page too, under the names the player gives them, for
 * the block previews below it (M2-17). They follow the theme and changes of the author's fonts.
 */
export function ThemeFonts({
  session,
  library,
  children,
}: {
  session: CourseSession;
  library: FontLibrary;
  children: ReactNode;
}) {
  useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.version,
  );
  const version = useSyncExternalStore(
    (listener) => library.subscribe(listener),
    () => library.version,
  );
  const theme = session.editor.document.theme;
  const [families, setFamilies] = useState<Families>();
  useEffect(() => {
    let live = true;
    const fonts = library.resolve(theme);
    void Promise.all([
      registerFont(fonts.heading, library),
      registerFont(fonts.body, library),
      registerFont(fonts.ui, library),
    ])
      .then(([heading, body, ui]) => live && setFamilies({ heading, body, ui }))
      .catch(() => {});
    return () => {
      live = false;
    };
    // `version`: a changed library font registers again.
  }, [theme, library, version]);
  return <ThemeFamilies.Provider value={families}>{children}</ThemeFamilies.Provider>;
}

/** The bytes of a project media file by storage key (CourseSession.media). */
export type MediaSource = (key: string) => Promise<Uint8Array | undefined>;

let view: Promise<typeof import("./player-view.js")> | undefined;
/** The player's renderer, loaded once. */
const playerView = () => {
  view ??= import("./player-view.js");
  return view;
};

export function BlockPreview({
  block,
  course,
  media,
}: {
  block: Block;
  course: Course;
  media: MediaSource;
}) {
  const t = useStrings();
  const host = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  // Only the media index matters besides the block: other edits of the course do not redraw it.
  const index = course.media;
  // A theme change redraws too: colours and fonts (M2-17).
  const theme = course.theme;
  const families = useContext(ThemeFamilies);
  const latest = useRef(course);
  latest.current = course;
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    void (async () => {
      const { draw } = await playerView();
      // The block's media files as in-memory addresses, which the editor's policy allows.
      const files = new Map<string, string>();
      for (const ref of block.media ?? []) {
        const entry = index.find((media) => media.key === ref.key);
        const key = entry && (entry.variantKey ?? entry.key);
        if (!key || files.has(key)) continue;
        const bytes = await media(key);
        if (!live) return;
        if (!bytes) continue;
        const url = URL.createObjectURL(
          new Blob([bytes as BlobPart], { ...(entry.mimeType && { type: entry.mimeType }) }),
        );
        urls.push(url);
        files.set(key, url);
      }
      if (!live || !host.current) return;
      setEmpty(!draw(host.current, block, latest.current, (key) => files.get(key) ?? "", families));
    })();
    return () => {
      live = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [block, index, media, theme, families]);
  return (
    <div className="be-block-preview" inert>
      <span className="be-block-preview-label">{t("blocks.preview")}</span>
      <div ref={host} hidden={empty} />
      {empty && <p className="be-note">{t("blocks.noPreview")}</p>}
    </div>
  );
}
