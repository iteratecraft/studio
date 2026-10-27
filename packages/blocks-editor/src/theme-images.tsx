// Pictures of the theme (BLK-09; blocks-editor.md T4, T6, 2.18): the cover logo and the lesson header
// picture, chosen through the media intake like every other picture (M2-13), each with its
// alternative text; and the crop of those and of the cover picture. A crop is a rectangle kept in
// the theme; the player shows that part of the picture (themePicture), so the file stays as picked
// and the author can change the crop at any time.
import type { Crop, MediaEntry, ThemeImage } from "@course-suite/format";
import {
  Button,
  Dialog,
  DialogActions,
  SliderField,
  TextField,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useState } from "react";
import { useDialogs } from "./dialogs.js";
import { MediaDrop } from "./intake.js";
import type { CourseSession } from "./session.js";

/** SVG and GIF are not cropped (blocks-editor.md 2.18 logo). */
export const croppable = (entry: MediaEntry | undefined) =>
  entry !== undefined && entry.mimeType !== "image/svg+xml" && entry.mimeType !== "image/gif";

/** A blob address for bytes of type `type`, for an <img> of the editor; the caller revokes it. */
const blobUrl = (data: Uint8Array, type?: string) =>
  URL.createObjectURL(new Blob([data as BlobPart], { ...(type && { type }) }));

/** A blob address of a media file of the course, while the component shows it. */
function usePictureUrl(session: CourseSession, entry: MediaEntry | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!entry) return;
    let made: string | undefined;
    let live = true;
    void session.media(entry.variantKey ?? entry.key).then((data) => {
      if (!live || !data) return;
      made = blobUrl(data, entry.mimeType);
      setUrl(made);
    });
    return () => {
      live = false;
      setUrl(undefined);
      if (made) URL.revokeObjectURL(made);
    };
  }, [session, entry]);
  return url;
}

/**
 * The crop button and its dialog for a picture; `onCrop` gets the new crop, or undefined to show
 * the whole picture.
 */
export function CropButton({
  session,
  entry,
  crop,
  label,
  onCrop,
}: {
  session: CourseSession;
  entry: MediaEntry | undefined;
  crop: Crop | undefined;
  label: string;
  onCrop: (crop: Crop | undefined) => void;
}) {
  const t = useStrings();
  const { dialog, ask } = useDialogs();
  const url = usePictureUrl(session, entry);
  if (!croppable(entry)) return <p className="be-note">{t("themeImage.noCrop")}</p>;
  const open = async () => {
    const answer = await ask<Crop | null | undefined>((reply) => (
      <CropDialog url={url} crop={crop} answer={reply} />
    ));
    if (answer !== undefined) onCrop(answer ?? undefined);
  };
  return (
    <div className="be-image-crop">
      <Button onPress={() => void open()} isDisabled={!url}>
        {label}
      </Button>
      <span className="be-note">{t(crop ? "themeImage.cropped" : "themeImage.whole")}</span>
      {dialog}
    </div>
  );
}

const WHOLE: Crop = { x: 0, y: 0, width: 100, height: 100 };

/**
 * The crop dialog: the picture with the kept part outlined, and its edges and size in percent, by
 * slider or typed. Resolves to the crop, `null` for the whole picture, or undefined when cancelled.
 */
function CropDialog({
  url,
  crop,
  answer,
}: {
  url: string | undefined;
  crop: Crop | undefined;
  answer: (value: Crop | null | undefined) => void;
}) {
  const t = useStrings();
  const { key: _, ...start } = crop ?? WHOLE;
  const [box, setBox] = useState<Crop>(start);
  const whole = box.x === 0 && box.y === 0 && box.width === 100 && box.height === 100;
  // Moving an edge in keeps the opposite edge where it is: the size shrinks to fit.
  const fit = (next: Crop): Crop => ({
    ...next,
    width: Math.min(next.width, 100 - next.x),
    height: Math.min(next.height, 100 - next.y),
  });
  const slider = (field: keyof Crop, label: string, min: number, max: number) => (
    <SliderField
      label={label}
      unit={t("theme.percent")}
      minValue={min}
      maxValue={max}
      value={box[field] as number}
      onChange={(value) => setBox((old) => fit({ ...old, [field]: value }))}
      onChangeEnd={(value) => setBox((old) => fit({ ...old, [field]: value }))}
    />
  );
  return (
    <Dialog
      isOpen
      title={t("themeImage.cropTitle")}
      onOpenChange={(open) => !open && answer(undefined)}
    >
      <div className="be-form">
        <div className="be-crop-view">
          {url && <img src={url} alt="" />}
          <span
            className="be-crop-box"
            aria-hidden="true"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          />
        </div>
        {slider("x", t("themeImage.left"), 0, 99)}
        {slider("y", t("themeImage.top"), 0, 99)}
        {slider("width", t("themeImage.width"), 1, 100 - box.x)}
        {slider("height", t("themeImage.height"), 1, 100 - box.y)}
        <DialogActions>
          <Button variant="quiet" onPress={() => setBox(WHOLE)} isDisabled={whole}>
            {t("themeImage.reset")}
          </Button>
          <Button variant="quiet" onPress={() => answer(undefined)}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" onPress={() => answer(whole ? null : box)}>
            {t("action.save")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

/**
 * A picture setting of the theme (logo, header picture): choose, drop or replace it through the
 * media intake, its alternative text, its crop, and remove it. `onChange` gets the new setting and,
 * for a picture new to the course, its media index entry, which goes in when the section is saved.
 */
export function ThemePictureField({
  session,
  label,
  image,
  entry,
  onChange,
}: {
  session: CourseSession;
  label: string;
  image: ThemeImage | undefined;
  /** The media index entry of `image`. */
  entry: MediaEntry | undefined;
  onChange: (image: ThemeImage | undefined, added?: MediaEntry) => void;
}) {
  const t = useStrings();
  const [alt, setAlt] = useState(image?.alt ?? "");
  useEffect(() => setAlt(image?.alt ?? ""), [image?.alt]);
  const url = usePictureUrl(session, entry);
  const keepAlt = () => {
    if (!image || alt === (image.alt ?? "")) return;
    const { alt: _, ...rest } = image;
    onChange(alt ? { ...rest, alt } : rest);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div className="be-image-setting" role="group" aria-label={label}>
      <span className="cs-Label" aria-hidden="true">
        {label}
      </span>
      {url && <img className="be-image-thumb" src={url} alt="" />}
      <div className="be-face-actions">
        <MediaDrop
          kind="image"
          label={t(image ? "media.replaceImage" : "media.chooseImage")}
          onAdded={([added]) => {
            if (!added) return;
            // A picture already in the course brings no command; a new one its media index entry.
            const insert = added.commands.find((command) => command.type === "insertMedia");
            // A new picture keeps the alternative text typed for the old one; a crop belongs to the old.
            onChange(
              { key: added.key, ...(image?.alt !== undefined && { alt: image.alt }) },
              insert?.type === "insertMedia" ? insert.value : undefined,
            );
          }}
        />
        {image && (
          <Button variant="quiet" onPress={() => onChange(undefined)}>
            {t("themeImage.remove")}
          </Button>
        )}
      </div>
      {image && (
        <>
          <TextField
            label={t("themeImage.alt")}
            description={t("themeImage.altHelp")}
            value={alt}
            onChange={setAlt}
            onBlur={keepAlt}
            onKeyDown={(event) => {
              if (event.key === "Enter") keepAlt();
              else event.continuePropagation();
            }}
          />
          <CropButton
            session={session}
            entry={entry}
            crop={image.crop}
            label={t("themeImage.crop")}
            onCrop={(crop) => {
              const { crop: _, ...rest } = image;
              onChange(crop ? { ...rest, crop } : rest);
            }}
          />
        </>
      )}
    </div>
  );
}
