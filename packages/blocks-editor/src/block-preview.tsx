// Each block as learners see it, beside its fields (BLK-03: each block previews inline through the
// real player renderer). It is drawn again whenever the block changes, so every edit shows at once.
// The preview is a picture of the block: the fields edit it, so it takes no focus or clicks and
// screen readers skip it. The player's renderer loads with the first lesson opened.
import { type Block, type Course, mediaKeysIn } from "@course-suite/format";
import { useStrings } from "@course-suite/ui";
import { useEffect, useRef, useState } from "react";

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
  const latest = useRef(course);
  latest.current = course;
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    void (async () => {
      const { draw } = await playerView();
      // The block's pictures as in-memory addresses, which the editor's policy allows. Audio and
      // video stay out: the preview is a picture of the block, and their files can be large.
      const files = new Map<string, string>();
      for (const used of mediaKeysIn(block)) {
        const entry = index.find((media) => media.key === used);
        const key = entry && (entry.variantKey ?? entry.key);
        if (!key || files.has(key) || !entry.mimeType?.startsWith("image/")) continue;
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
      setEmpty(!draw(host.current, block, latest.current, (key) => files.get(key) ?? ""));
    })();
    return () => {
      live = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [block, index, media]);
  return (
    <div className="be-block-preview" inert>
      <span className="be-block-preview-label">{t("blocks.preview")}</span>
      <div ref={host} hidden={empty} />
      {empty && <p className="be-note">{t("blocks.noPreview")}</p>}
    </div>
  );
}
