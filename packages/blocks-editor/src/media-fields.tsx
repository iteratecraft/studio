// The content of the media blocks (M2-13, BLK-05; blocks-editor.md 2.10 to 2.12, L17 to L20, W15
// to W18): choosing or dropping a file, alt text or the decorative mark, captions and text, and
// each variant's options. Every change is one doc-ops command list, so one undo step; a new file's
// media index entry goes in the same list as the edit that uses it.
import type { Command, Editor } from "@course-suite/doc-ops";
import type { Block, ContentItem, MediaRef } from "@course-suite/format";
import {
  Button,
  Checkbox,
  cx,
  Icon,
  IconButton,
  ListBoxItem,
  Select,
  SliderField,
  Switch,
  useLocale,
  useStrings,
} from "@course-suite/ui";
import { type DragEvent, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { type FieldsProps, idMaker, setContent } from "./blocks.js";
import { CaptionTracks } from "./captions.js";
import { embedFor, PROVIDER_NAMES } from "./embed.js";
import { DraftField, DraftSession, RichDraftField } from "./fields.js";
import { type AddedMedia, type MediaFrom, useMediaIntake } from "./intake.js";
import { formatBytes, type MediaKind } from "./media.js";

const items = (block: Block): ContentItem[] =>
  (block.items ?? []).filter((item): item is ContentItem => item.kind === "content");

/** The command that sets (or, with undefined, removes) one of the block's variant settings. */
export function withVariantSetting(block: Block, name: string, value: unknown): Command {
  const { [name]: _, ...others } = block.variantSettings ?? {};
  const next = value === undefined ? others : { ...others, [name]: value };
  return Object.keys(next).length > 0
    ? { type: "updateBlock", id: block.id, set: { variantSettings: next } }
    : { type: "updateBlock", id: block.id, unset: ["variantSettings"] };
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/**
 * Where a file comes in (L17, W15): a button that opens the host's file dialog, and a drop zone
 * for files dragged from the desktop. Images offer to keep the original quality (2.10, 2.17).
 */
export function MediaDrop({
  kind,
  label,
  multiple = false,
  isDisabled = false,
  onAdded,
}: {
  kind: MediaKind;
  label: string;
  multiple?: boolean;
  isDisabled?: boolean;
  onAdded: (added: AddedMedia[]) => void;
}) {
  const t = useStrings();
  const intake = useMediaIntake();
  const [keep, setKeep] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const take = async (from: MediaFrom) => {
    setBusy(true);
    try {
      const added = await intake.add(kind, from, { keepOriginal: keep });
      if (added.length > 0) onAdded(added);
    } finally {
      setBusy(false);
    }
  };
  // The list around a block reorders by dragging rows; a file dropped here is this zone's alone.
  const own = (event: DragEvent) => {
    if (!hasFiles(event) || isDisabled) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the button inside does the same by keyboard.
    <div
      className={cx("be-drop", over && "is-over")}
      onDragEnter={(event) => own(event) && setOver(true)}
      onDragOver={(event) => {
        if (own(event)) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!own(event)) return;
        setOver(false);
        const files = [...event.dataTransfer.files];
        void take(multiple ? files : files.slice(0, 1));
      }}
    >
      <Button
        onPress={() => void take(multiple ? "pick-many" : "pick")}
        isDisabled={busy || isDisabled}
      >
        <Icon name="add" />
        {label}
      </Button>
      <span className="be-note">{t(multiple ? "media.dropMany" : "media.dropOne")}</span>
      {kind === "image" && (
        <Checkbox isSelected={keep} onChange={setKeep}>
          {t("media.keepOriginal")}
        </Checkbox>
      )}
    </div>
  );
}

/** The file a media reference uses, by the name it was added with. */
function FileName({ media }: { media: MediaRef | undefined }) {
  const t = useStrings();
  const intake = useMediaIntake();
  if (!media) return <p className="be-note">{t("media.none")}</p>;
  return (
    <p className="be-note">{t("media.file", { name: intake.name(media.key) ?? media.key })}</p>
  );
}

/**
 * Alt text, or the decorative mark (blocks-editor.md W17, UI-ACCESSIBILITY-R34): an image with no
 * alt text that is not marked decorative carries a warning (BLK-04 done-when).
 */
export function AltFields({
  media,
  editor,
  set,
}: {
  media: MediaRef;
  editor: Editor;
  /** The command that stores the reference with its new alt text (undefined: none written). */
  set: (alt: string | undefined) => Command | Command[];
}) {
  const t = useStrings();
  const decorative = media.alt === "";
  return (
    <div className="be-alt">
      <DraftField
        label={t("media.alt")}
        description={t("media.altHelp")}
        value={media.alt ?? ""}
        isDisabled={decorative}
        command={(text) => set(text.trim() || undefined)}
      />
      <Checkbox
        isSelected={decorative}
        onChange={(on) => editor.dispatch(set(on ? "" : undefined))}
      >
        {t("media.decorative")}
      </Checkbox>
      {media.alt === undefined && (
        <p className="be-warning">
          <Icon name="warning" size={14} />
          {t("media.altMissing")}
        </p>
      )}
    </div>
  );
}

/** The reference with alt text set, or without any (undefined). */
const withAlt = (media: MediaRef, alt: string | undefined): MediaRef => {
  const { alt: _, ...rest } = media;
  return alt === undefined ? rest : { ...rest, alt };
};

/** A switch for a boolean variant setting that is on unless set to false. */
function OnByDefault({
  block,
  editor,
  name,
  label,
}: FieldsProps & { name: string; label: string }) {
  return (
    <Switch
      isSelected={block.variantSettings?.[name] !== false}
      onChange={(on) => editor.dispatch(withVariantSetting(block, name, on ? undefined : false))}
    >
      {label}
    </Switch>
  );
}

/** Corner radius 0 to 30 (blocks-editor.md 2.4, UI-BLOCKS-EDITOR-R26). */
function CornerRadius({ block, editor }: FieldsProps) {
  const t = useStrings();
  const stored = block.variantSettings?.cornerRadius;
  const value = typeof stored === "number" ? stored : 0;
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  return (
    <SliderField
      label={t("media.radius")}
      unit={t("format.pixels")}
      minValue={0}
      maxValue={30}
      value={live}
      onChange={setLive}
      onChangeEnd={(next) =>
        editor.dispatch(withVariantSetting(block, "cornerRadius", next === 0 ? undefined : next))
      }
    />
  );
}

/** Image blocks (blocks-editor.md 2.10, W15). */
export function ImageFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const media = block.media?.[0];
  const variant = block.variant;
  const item = items(block)[0];
  const newId = () => idMaker(editor.document)();
  const choose = ([added]: AddedMedia[]) => {
    if (!added) return;
    editor.dispatch([
      ...added.commands,
      { type: "updateBlock", id: block.id, set: { media: [{ key: added.key }] } },
    ]);
  };
  const setAlt = (alt: string | undefined): Command =>
    media
      ? { type: "updateBlock", id: block.id, set: { media: [withAlt(media, alt)] } }
      : { type: "updateBlock", id: block.id, set: {} };
  const bleed = variant === "full-width" || variant === "banner" || variant === "text-on-image";
  const textLabel =
    variant === "centered" || variant === "full-width" ? t("media.caption") : t("field.text");
  return (
    <>
      <MediaDrop
        kind="image"
        label={t(media ? "media.replaceImage" : "media.chooseImage")}
        onAdded={choose}
      />
      <FileName media={media} />
      {media && <AltFields media={media} editor={editor} set={setAlt} />}
      {variant !== "banner" && (
        <RichDraftField
          label={textLabel}
          value={item?.text ?? ""}
          command={(html) => setContent(block, newId, "text", html)}
        />
      )}
      {variant !== "banner" && variant !== "text-on-image" && (
        <OnByDefault block={block} editor={editor} name="zoom" label={t("media.zoom")} />
      )}
      {!bleed && <CornerRadius block={block} editor={editor} />}
      {variant === "image-text" && (
        <>
          <Select
            label={t("media.position")}
            selectedKey={block.variantSettings?.imagePosition === "right" ? "right" : "left"}
            onSelectionChange={(key) =>
              editor.dispatch(
                withVariantSetting(block, "imagePosition", key === "right" ? "right" : undefined),
              )
            }
          >
            <ListBoxItem id="left">{t("media.left")}</ListBoxItem>
            <ListBoxItem id="right">{t("media.right")}</ListBoxItem>
          </Select>
          <Select
            label={t("media.size")}
            selectedKey={String(block.variantSettings?.imageSize ?? "medium")}
            onSelectionChange={(key) =>
              editor.dispatch(
                withVariantSetting(block, "imageSize", key === "medium" ? undefined : key),
              )
            }
          >
            <ListBoxItem id="small">{t("media.small")}</ListBoxItem>
            <ListBoxItem id="medium">{t("media.medium")}</ListBoxItem>
            <ListBoxItem id="large">{t("media.large")}</ListBoxItem>
          </Select>
        </>
      )}
      {variant === "text-on-image" && <Overlay block={block} editor={editor} />}
    </>
  );
}

/** Overlay opacity of text on an image (2.10): black at 50 % by default. */
function Overlay({ block, editor }: FieldsProps) {
  const t = useStrings();
  const stored = block.variantSettings?.overlayOpacity;
  const value = typeof stored === "number" ? stored : 50;
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  return (
    <SliderField
      label={t("media.overlay")}
      unit="%"
      minValue={0}
      maxValue={100}
      value={live}
      onChange={setLive}
      onChangeEnd={(next) =>
        editor.dispatch(withVariantSetting(block, "overlayOpacity", next === 50 ? undefined : next))
      }
    />
  );
}

/** Galleries (2.11): images added one or many at a time, each with alt text and a caption. */
export function GalleryFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const slides = items(block);
  const add = (added: AddedMedia[]) => {
    const newId = idMaker(editor.document);
    editor.dispatch([
      ...added.flatMap((one) => one.commands),
      ...added.map(
        (one): Command => ({
          type: "insertItem",
          parent: block.id,
          value: { id: newId(), kind: "content", media: { key: one.key } },
        }),
      ),
    ]);
  };
  return (
    <>
      <MediaDrop kind="image" label={t("media.addImages")} multiple onAdded={add} />
      {slides.length === 0 && <p className="be-note">{t("media.noImages")}</p>}
      <ol className="be-media-list">
        {slides.map((slide, i) => (
          <li key={slide.id}>
            {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout. */}
            <div role="group" aria-label={t("media.imageNumber", { number: i + 1 })}>
              <div className="be-media-row">
                <span className="be-block-type">{t("media.imageNumber", { number: i + 1 })}</span>
                <IconButton
                  icon="arrow-up"
                  label={t("media.moveUp", { number: i + 1 })}
                  isDisabled={i === 0}
                  onPress={() => editor.dispatch({ type: "moveItem", id: slide.id, index: i - 1 })}
                />
                <IconButton
                  icon="arrow-down"
                  label={t("media.moveDown", { number: i + 1 })}
                  isDisabled={i === slides.length - 1}
                  onPress={() => editor.dispatch({ type: "moveItem", id: slide.id, index: i + 1 })}
                />
                <IconButton
                  icon="trash"
                  label={t("media.removeImage", { number: i + 1 })}
                  onPress={() => editor.dispatch({ type: "deleteItem", id: slide.id })}
                />
              </div>
              <FileName media={slide.media} />
              {slide.media && (
                <AltFields
                  media={slide.media}
                  editor={editor}
                  set={(alt) => ({
                    type: "updateItem",
                    id: slide.id,
                    set: { media: withAlt(slide.media as MediaRef, alt) },
                  })}
                />
              )}
              <RichDraftField
                label={t("media.caption")}
                value={slide.text ?? ""}
                command={(html) =>
                  html
                    ? { type: "updateItem", id: slide.id, set: { text: html } }
                    : { type: "updateItem", id: slide.id, unset: ["text"] }
                }
              />
            </div>
          </li>
        ))}
      </ol>
      <OnByDefault block={block} editor={editor} name="zoom" label={t("media.zoom")} />
      <CornerRadius block={block} editor={editor} />
    </>
  );
}

/** The forward-seeking switch of audio and video (2.12, UI-BLOCKS-EDITOR-R37). */
function Seeking(props: FieldsProps) {
  const t = useStrings();
  return (
    <>
      <OnByDefault {...props} name="forwardSeeking" label={t("media.seeking")} />
      <p className="be-note">{t("media.seekingHelp")}</p>
    </>
  );
}

/** Audio (2.12): the clip, its caption, its transcript, forward seeking. */
export function AudioFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const media = block.media?.[0];
  const newId = () => idMaker(editor.document)();
  return (
    <>
      <MediaDrop
        kind="audio"
        label={t(media ? "media.replaceAudio" : "media.chooseAudio")}
        onAdded={([added]) =>
          added &&
          editor.dispatch([
            ...added.commands,
            { type: "updateBlock", id: block.id, set: { media: [{ key: added.key }] } },
          ])
        }
      />
      <FileName media={media} />
      <RichDraftField
        label={t("media.caption")}
        value={items(block)[0]?.text ?? ""}
        command={(html) => setContent(block, newId, "text", html)}
      />
      <Transcript block={block} editor={editor} />
      <Seeking block={block} editor={editor} />
    </>
  );
}

/** The transcript learners open under an audio clip or a video (2.12): plain text. */
function Transcript({ block }: FieldsProps) {
  const t = useStrings();
  const transcript = block.variantSettings?.transcript;
  return (
    <DraftField
      label={t("media.transcript")}
      description={t("media.transcriptHelp")}
      multiline
      value={typeof transcript === "string" ? transcript : ""}
      command={(text) => withVariantSetting(block, "transcript", text.trim() || undefined)}
    />
  );
}

/** A video's thumbnail (2.12 custom thumbnail, W17 step 3): shown until it plays. */
function Thumbnail({ block, editor }: FieldsProps) {
  const t = useStrings();
  const intake = useMediaIntake();
  const poster = block.variantSettings?.poster as MediaRef | undefined;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div role="group" aria-label={t("media.thumbnail")} className="be-image-setting">
      <span className="cs-Label" aria-hidden="true">
        {t("media.thumbnail")}
      </span>
      <MediaDrop
        kind="image"
        label={t(poster ? "media.replaceThumbnail" : "media.chooseThumbnail")}
        onAdded={([added]) =>
          added &&
          editor.dispatch([
            ...added.commands,
            withVariantSetting(block, "poster", { key: added.key }),
          ])
        }
      />
      {poster && (
        <>
          <p className="be-note">
            {t("media.file", { name: intake.name(poster.key) ?? poster.key })}
          </p>
          <Button
            variant="quiet"
            onPress={() => editor.dispatch(withVariantSetting(block, "poster", undefined))}
          >
            {t("media.removeThumbnail")}
          </Button>
        </>
      )}
    </div>
  );
}

/** Video (2.12, W17): the clip, its caption, caption tracks per language, seeking and speed. */
export function VideoFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const media = block.media?.[0];
  const newId = () => idMaker(editor.document)();
  // A course setting: a list row redraws only when its block changes, so it follows the course.
  const session = useContext(DraftSession);
  const speed = useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => {}),
    () => editor.document.navigation?.videoSpeed !== false,
  );
  return (
    <>
      <MediaDrop
        kind="video"
        label={t(media ? "media.replaceVideo" : "media.chooseVideo")}
        onAdded={([added]) =>
          added &&
          editor.dispatch([
            ...added.commands,
            {
              type: "updateBlock",
              id: block.id,
              // A new video keeps the caption tracks only when the author adds them again.
              set: { media: [{ key: added.key }] },
            },
          ])
        }
      />
      <FileName media={media} />
      <RichDraftField
        label={t("media.caption")}
        value={items(block)[0]?.text ?? ""}
        command={(html) => setContent(block, newId, "text", html)}
      />
      {media && <CaptionTracks block={block} editor={editor} />}
      <Transcript block={block} editor={editor} />
      <Thumbnail block={block} editor={editor} />
      <Seeking block={block} editor={editor} />
      <Switch
        isSelected={speed}
        onChange={(on) => {
          const { videoSpeed: _, ...others } = editor.document.navigation ?? {};
          const navigation = on ? others : { ...others, videoSpeed: false };
          editor.dispatch(
            Object.keys(navigation).length > 0
              ? { type: "updateCourse", set: { navigation } }
              : { type: "updateCourse", unset: ["navigation"] },
          );
        }}
      >
        {t("media.speed")}
      </Switch>
      <p className="be-note">{t("media.speedHelp")}</p>
      <CornerRadius block={block} editor={editor} />
    </>
  );
}

/** A web embed (2.12, L20, W18; D-44): an address or embed code from a listed provider. */
export function EmbedFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const settings = block.variantSettings ?? {};
  const url = typeof settings.url === "string" ? settings.url : "";
  const provider = typeof settings.provider === "string" ? settings.provider : undefined;
  const newId = () => idMaker(editor.document)();
  return (
    <>
      <DraftField
        label={t("media.embedAddress")}
        description={t("media.embedHelp", { providers: PROVIDER_NAMES.join(", ") })}
        errorMessage={t("media.embedUnknown", { providers: PROVIDER_NAMES.join(", ") })}
        value={url}
        command={(text) => {
          if (!text.trim()) {
            const { url: _, embedUrl: __, provider: ___, ...rest } = settings;
            return Object.keys(rest).length > 0
              ? { type: "updateBlock", id: block.id, set: { variantSettings: rest } }
              : { type: "updateBlock", id: block.id, unset: ["variantSettings"] };
          }
          const embed = embedFor(text);
          return (
            embed && {
              type: "updateBlock",
              id: block.id,
              set: { variantSettings: { ...settings, ...embed } },
            }
          );
        }}
      />
      <p className="be-note">
        {provider ? t("media.embedFrom", { provider }) : t("media.embedNone")}
      </p>
      <RichDraftField
        label={t("media.caption")}
        value={items(block)[0]?.text ?? ""}
        command={(html) => setContent(block, newId, "text", html)}
      />
      <Switch
        isSelected={settings.border === true}
        onChange={(on) => editor.dispatch(withVariantSetting(block, "border", on || undefined))}
      >
        {t("media.border")}
      </Switch>
    </>
  );
}

/** A file to download (2.12, rise.md 3C Attachment): the file and a description. */
export function AttachmentFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const { locale } = useLocale();
  const media = block.media?.[0];
  const newId = () => idMaker(editor.document)();
  const size = block.variantSettings?.fileSize;
  return (
    <>
      <MediaDrop
        kind="file"
        label={t(media ? "media.replaceFile" : "media.chooseFile")}
        onAdded={([added]) =>
          added &&
          editor.dispatch([
            ...added.commands,
            {
              type: "updateBlock",
              id: block.id,
              set: {
                media: [{ key: added.key }],
                variantSettings: {
                  ...block.variantSettings,
                  fileName: added.name,
                  fileSize: added.size,
                },
              },
            },
          ])
        }
      />
      {media && typeof size === "number" ? (
        <p className="be-note">
          {t("media.fileSized", {
            name: String(block.variantSettings?.fileName ?? media.key),
            size: formatBytes(size, locale),
          })}
        </p>
      ) : (
        <FileName media={media} />
      )}
      <RichDraftField
        label={t("media.description")}
        value={items(block)[0]?.text ?? ""}
        command={(html) => setContent(block, newId, "text", html)}
      />
    </>
  );
}
