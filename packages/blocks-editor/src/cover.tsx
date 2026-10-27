// Cover and lesson header images (M2-13 with D-38; rise.md 3B, 3E; blocks-editor.md 2.2 cover
// image, T4, T6, H8): the course cover on the overview, a lesson's header image on the lesson, each
// with alt text or the decorative mark; and the small copy of the cover that a dashboard card shows,
// kept in the app data folder so the dashboard never reads course files.
import type { Editor } from "@course-suite/doc-ops";
import type { Course, LessonEntry } from "@course-suite/format";
import type { HostInterface } from "@course-suite/host";
import { useStrings } from "@course-suite/ui";
import { imageType, prepareImage } from "./media.js";
import { ImageSlot } from "./static-blocks.js";

/** The course cover (2.2, T4): shown on the cover page and on the dashboard card. */
export function CoverImageField({ editor }: { editor: Editor }) {
  const t = useStrings();
  return (
    <ImageSlot
      editor={editor}
      label={t("media.cover")}
      image={editor.document.cover}
      command={(cover) => ({ type: "updateCourse", set: { cover } })}
      remove={{
        label: t("media.removeCover"),
        command: { type: "updateCourse", unset: ["cover"] },
      }}
    />
  );
}

/** A lesson's header image (rise.md 3B, T6). */
export function HeaderImageField({ editor, lesson }: { editor: Editor; lesson: LessonEntry }) {
  const t = useStrings();
  return (
    <ImageSlot
      editor={editor}
      label={t("media.header")}
      image={lesson.headerImage}
      command={(headerImage) => ({ type: "updateEntry", id: lesson.id, set: { headerImage } })}
      remove={{
        label: t("media.removeHeader"),
        command: { type: "updateEntry", id: lesson.id, unset: ["headerImage"] },
      }}
    />
  );
}

/** Long side of a dashboard card's cover copy, in pixels. */
const CARD_EDGE = 480;

/**
 * The data file that holds a small copy of the course's cover for its dashboard card (H8), made
 * once per cover file; undefined when the course has no cover or its file cannot be read.
 */
export async function coverThumbnail(
  host: HostInterface,
  course: Course,
  read: (key: string) => Promise<Uint8Array | undefined>,
): Promise<string | undefined> {
  const ref = course.cover;
  const entry = ref && course.media.find((media) => media.key === ref.key);
  if (!entry) return undefined;
  const key = entry.variantKey ?? entry.key;
  const name = `covers/${key}`;
  try {
    const file = await host.files.dataFile(name);
    if ((await host.files.modified(file)) !== undefined) return name;
    const bytes = await read(key);
    const type = bytes && imageType(bytes);
    if (!bytes || !type) return undefined;
    const small = await prepareImage(bytes, type, false, CARD_EDGE);
    await host.files.write(file, small.data);
    return name;
  } catch {
    // A card without its picture is no reason to stop a save or an open.
    return undefined;
  }
}

/** A blob address for a cover copy, to show on a card; the caller revokes it. */
export async function coverUrl(host: HostInterface, name: string): Promise<string | undefined> {
  try {
    const bytes = await host.files.read(await host.files.dataFile(name));
    const type = imageType(bytes);
    return URL.createObjectURL(new Blob([bytes as BlobPart], { ...(type && { type }) }));
  } catch {
    return undefined;
  }
}
