// The content of the multimedia blocks (M2-13, BLK-05; blocks-editor.md 2.5, 2.12, L17 to L20,
// W16 to W18): the file, captions and text, and each variant's options. Every change is one doc-ops
// command list, so one undo step; a new file's media index entry goes in the same list as the edit
// that uses it. Images and galleries are static blocks (static-blocks.tsx).
import { type Block, type ContentItem, type MediaRef, variantSettings } from "@course-suite/format";
import { Button, SliderField, Switch, useLocale, useStrings } from "@course-suite/ui";
import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { type FieldsProps, setContent } from "./blocks.js";
import { CaptionTracks } from "./captions.js";
import { embedFor, PROVIDER_NAMES } from "./embed.js";
import { DraftField, DraftSession, RichDraftField } from "./fields.js";
import { idMaker } from "./ids.js";
import { MediaDrop, useMediaIntake } from "./intake.js";
import { formatBytes } from "./media.js";
import { CONTRASTS, Controls, withVariantSettings } from "./static-blocks.js";

const items = (block: Block): ContentItem[] =>
  (block.items ?? []).filter((item): item is ContentItem => item.kind === "content");

/** The file a media reference uses, by the name it was added with. */
function FileName({ media }: { media: MediaRef | undefined }) {
  const t = useStrings();
  const intake = useMediaIntake();
  if (!media) return <p className="be-note">{t("media.none")}</p>;
  return (
    <p className="be-note">{t("media.file", { name: intake.name(media.key) ?? media.key })}</p>
  );
}

/** A switch for a boolean variant setting that is on unless set to false. */
function OnByDefault({
  block,
  editor,
  name,
  label,
}: FieldsProps & { name: string; label: string }) {
  return (
    <Switch
      isSelected={variantSettings(block)[name] === true}
      onChange={(on) => editor.dispatch(withVariantSettings(block, { [name]: on }))}
    >
      {label}
    </Switch>
  );
}

/** Corner radius 0 to 30 (blocks-editor.md 2.4, UI-BLOCKS-EDITOR-R26). */
function CornerRadius({ block, editor }: FieldsProps) {
  const t = useStrings();
  const value = variantSettings<{ cornerRadius: number }>(block).cornerRadius;
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
      onChangeEnd={(next) => editor.dispatch(withVariantSettings(block, { cornerRadius: next }))}
    />
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
      command={(text) => withVariantSettings(block, { transcript: text.trim() || undefined })}
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
            withVariantSettings(block, { poster: { key: added.key } }),
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
            onPress={() => editor.dispatch(withVariantSettings(block, { poster: undefined }))}
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
            return withVariantSettings(block, {
              url: undefined,
              embedUrl: undefined,
              provider: undefined,
            });
          }
          const embed = embedFor(text);
          return embed && withVariantSettings(block, { ...embed });
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
        onChange={(on) => editor.dispatch(withVariantSettings(block, { border: on }))}
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

/**
 * A code snippet (blocks-editor.md 2.5, 2.12): the code exactly as typed, its language's name and
 * a caption. Learners read it and copy it (text only: no colouring, BLK-05).
 */
export function CodeSnippetFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const s = variantSettings<{ code?: string; language?: string }>(block);
  const newId = () => idMaker(editor.document)();
  return (
    <>
      <div className="be-code">
        <DraftField
          label={t("code.code")}
          description={t("code.codeHelp")}
          multiline
          value={s.code ?? ""}
          command={(text) => withVariantSettings(block, { code: text.trim() ? text : undefined })}
        />
      </div>
      <DraftField
        label={t("code.language")}
        description={t("code.languageHelp")}
        value={s.language ?? ""}
        command={(text) =>
          text.trim().length <= 40
            ? withVariantSettings(block, { language: text.trim() || undefined })
            : undefined
        }
      />
      <RichDraftField
        label={t("media.caption")}
        value={items(block)[0]?.text ?? ""}
        command={(html) => setContent(block, newId, "text", html)}
      />
    </>
  );
}

/** A code snippet's format options (2.5): word wrap, and its colour with the text on it. */
export function CodeSnippetFormat(props: FieldsProps) {
  return (
    <Controls
      {...props}
      controls={[
        { name: "wrap", label: "code.wrap", kind: "switch" },
        {
          name: "background",
          label: "code.background",
          kind: "color",
          help: "blockFormat.colorHelp",
        },
        { name: "contrast", label: "style.contrast", kind: "choice", options: CONTRASTS },
      ]}
    />
  );
}
