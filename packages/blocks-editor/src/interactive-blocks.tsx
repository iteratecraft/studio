// The interactive block types (M2-14, BLK-06; rise.md 3C; blocks-interactions.md 2.2 to 2.5, 2.8,
// 2.10, A4, A6, A7, W1 to W3, W6, W8): accordion, tabs, labeled graphic, process, flashcard grid and
// stack, button and button stack. Each brings sample content (`create`), its items edited in place
// with add, move and remove (`Fields`) and its own format options (`Format`); every change is one
// undo step. An item's picture, video, web embed and audio come in through the media intake (A10,
// A11). A labeled graphic's markers are placed on its picture by pointer (click to add, drag to
// move) and by keyboard (arrow keys).
import type { Command, Editor } from "@course-suite/doc-ops";
import {
  type Block,
  type ButtonItem,
  type CardSide,
  type ContentItem,
  deepestHeadingLevel,
  type FlashcardItem,
  type Item,
  isEmail,
  isRelativeLink,
  type LessonEntry,
  MARKER_ICONS,
  type MarkerItem,
  type StepItem,
  variantSettings,
} from "@course-suite/format";
import {
  Button,
  IconButton,
  ListBoxItem,
  Select,
  type StringKey,
  Switch,
  type Translate,
  TextField as UiTextField,
  useStrings,
} from "@course-suite/ui";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { BlockType, FieldsProps } from "./blocks.js";
import { CaptionTracks } from "./captions.js";
import { embedFor, PROVIDER_NAMES } from "./embed.js";
import { DraftField, DraftSession, inlineHtml, RichDraftField, textOf } from "./fields.js";
import { idMaker } from "./ids.js";
import { MediaDrop, useMediaIntake } from "./intake.js";
import { CONTRASTS, Controls, ImageSlot, withVariantSettings } from "./static-blocks.js";
import { usePictureUrl } from "./theme-images.js";

type Of<K extends Item["kind"]> = Extract<Item, { kind: K }>;
const itemsOf = <K extends Item["kind"]>(block: Block, kind: K) =>
  (block.items ?? []).filter((item): item is Of<K> => item.kind === kind);
const para = (t: Translate, key: StringKey) => `<p>${inlineHtml(t(key))}</p>`;
/** The same, one decimal place, as markers are stored (blocks-interactions.md 2.4). */
const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
/** A web address a button can go to: the format's Url (http or https, no spaces). */
const WEB = /^https?:\/\/\S+$/;

/**
 * The items `items` of a block, one group each, with move up, move down and remove (never below
 * `min`), and an add button when `add` makes a new one. `offset` is where the first of them sits in
 * the block's items, for a process whose steps follow its introduction.
 */
function ItemList<T extends Item>({
  block,
  editor,
  items,
  name,
  min = 1,
  offset = 0,
  add,
  children,
}: FieldsProps & {
  items: T[];
  name: (number: number) => string;
  min?: number;
  offset?: number;
  add?: () => Omit<T, "id">;
  children: (item: T, number: number) => ReactNode;
}) {
  const t = useStrings();
  const move = (item: T, index: number) =>
    editor.dispatch({ type: "moveItem", id: item.id, index: offset + index });
  return (
    <>
      {items.map((item, i) => (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
        <div key={item.id} role="group" aria-label={name(i + 1)} className="be-item">
          <div className="be-item-head">
            <span className="be-item-name">{name(i + 1)}</span>
            <IconButton
              icon="arrow-up"
              label={t("items.up", { name: name(i + 1) })}
              isDisabled={i === 0}
              onPress={() => move(item, i - 1)}
            />
            <IconButton
              icon="arrow-down"
              label={t("items.down", { name: name(i + 1) })}
              isDisabled={i === items.length - 1}
              onPress={() => move(item, i + 1)}
            />
            <IconButton
              icon="trash"
              label={t("items.remove", { name: name(i + 1) })}
              isDisabled={items.length <= min}
              onPress={() => editor.dispatch({ type: "deleteItem", id: item.id })}
            />
          </div>
          {children(item, i + 1)}
        </div>
      ))}
      {add && (
        <Button
          onPress={() =>
            editor.dispatch({
              type: "insertItem",
              parent: block.id,
              index: offset + items.length,
              value: { ...add(), id: idMaker(editor.document)() } as Item,
            })
          }
        >
          {t("items.add", { name: name(items.length + 1) })}
        </Button>
      )}
    </>
  );
}

/** A plain-text title of an item, kept as inline rich text. */
function TitleField({ item, label }: { item: { id: string; title?: string }; label: string }) {
  return (
    <DraftField
      label={label}
      value={textOf(item.title ?? "")}
      command={(text) =>
        text.trim()
          ? { type: "updateItem", id: item.id, set: { title: inlineHtml(text) } }
          : { type: "updateItem", id: item.id, unset: ["title"] }
      }
    />
  );
}

/** An item's formatted text: its `text`, or a button's `description`. */
function BodyField({
  id,
  value,
  label,
  field = "text",
}: {
  id: string;
  value: string | undefined;
  label: string;
  field?: "text" | "description";
}) {
  return (
    <RichDraftField
      label={label}
      value={value ?? ""}
      command={(html) =>
        html
          ? { type: "updateItem", id, set: { [field]: html } }
          : { type: "updateItem", id, unset: [field] }
      }
    />
  );
}

/** The same object, where a part left undefined is one to unset. */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };
/** An item's media and audio (ContentItem, MarkerItem, StepItem, CardSide). */
type MediaParts = Loose<Pick<ContentItem, "media" | "embed" | "audio">>;
type MediaKind = "none" | "picture" | "video" | "embed";
const MEDIA_FIELDS = ["media", "embed", "audio"] as const;

/** The edit that gives item `id` these media parts, unsetting the ones left out. */
const itemMedia =
  (id: string) =>
  (next: MediaParts): Command => ({
    type: "updateItem",
    id,
    set: Object.fromEntries(
      MEDIA_FIELDS.flatMap((name) => (next[name] ? [[name, next[name]]] : [])),
    ),
    unset: MEDIA_FIELDS.filter((name) => !next[name]),
  });

/** What an item shows now: its embed, its video or its picture (by the file's type), or nothing. */
function kindOf({ media, embed }: MediaParts, editor: Editor): MediaKind {
  if (embed) return "embed";
  if (!media) return "none";
  const entry = editor.document.media.find((file) => file.key === media.key);
  return entry?.mimeType?.startsWith("video/") ? "video" : "picture";
}

/**
 * An item's media (blocks-interactions.md 2.1 to 2.4, 2.8, A10): none, a picture with its alt text,
 * a video with its caption tracks, or a web embed from a listed provider, one at a time; and its
 * audio (A11). `change` is the edit that gives the item its new parts, with what a new file needs
 * in the media index first, so each change is one undo step.
 */
function ItemMedia({
  parts,
  editor,
  label,
  change,
}: {
  parts: MediaParts;
  editor: Editor;
  label: string;
  change: (next: MediaParts) => Command;
}) {
  const t = useStrings();
  const intake = useMediaIntake();
  const shown = kindOf(parts, editor);
  const [kind, setKind] = useState<MediaKind>(shown);
  useEffect(() => setKind(shown), [shown]);
  const { media: _, embed: __, ...without } = parts;
  const name = (key: string) => t("media.file", { name: intake.name(key) ?? key });
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div role="group" aria-label={label} className="be-item-media">
      <Select
        label={t("interactive.mediaShows")}
        selectedKey={kind}
        onSelectionChange={(key) => {
          const next = key as MediaKind;
          setKind(next);
          if (next === "none" && shown !== "none") editor.dispatch(change(without));
        }}
      >
        <ListBoxItem id="none">{t("interactive.mediaNone")}</ListBoxItem>
        <ListBoxItem id="picture">{t("interactive.mediaPicture")}</ListBoxItem>
        <ListBoxItem id="video">{t("interactive.mediaVideo")}</ListBoxItem>
        <ListBoxItem id="embed">{t("interactive.mediaEmbed")}</ListBoxItem>
      </Select>
      {kind === "picture" && (
        <ImageSlot
          label={t("image.image")}
          image={shown === "picture" ? parts.media : undefined}
          editor={editor}
          command={(media) => change({ ...without, media })}
          remove={{ label: t("media.removeImageFile"), command: change(without) }}
        />
      )}
      {kind === "video" && (
        <>
          <MediaDrop
            kind="video"
            label={t(shown === "video" ? "media.replaceVideo" : "media.chooseVideo")}
            onAdded={([added]) =>
              added &&
              editor.dispatch([
                ...added.commands,
                change({ ...without, media: { key: added.key } }),
              ])
            }
          />
          {shown === "video" && parts.media && (
            <>
              <p className="be-note">{name(parts.media.key)}</p>
              <CaptionTracks
                media={parts.media}
                editor={editor}
                command={(media) => change({ ...parts, media })}
              />
            </>
          )}
        </>
      )}
      {kind === "embed" && (
        <>
          <DraftField
            label={t("media.embedAddress")}
            description={t("media.embedHelp", { providers: PROVIDER_NAMES.join(", ") })}
            errorMessage={t("media.embedUnknown", { providers: PROVIDER_NAMES.join(", ") })}
            value={parts.embed?.url ?? parts.embed?.embedUrl ?? ""}
            command={(text) => {
              if (!text.trim()) return change(without);
              const embed = embedFor(text);
              return embed && change({ ...without, embed });
            }}
          />
          <p className="be-note">
            {parts.embed
              ? t("media.embedFrom", { provider: parts.embed.provider })
              : t("media.embedNone")}
          </p>
        </>
      )}
      <MediaDrop
        kind="audio"
        label={t(parts.audio ? "interactive.replaceAudio" : "interactive.addAudio")}
        onAdded={([added]) =>
          added &&
          editor.dispatch([...added.commands, change({ ...parts, audio: { key: added.key } })])
        }
      />
      {parts.audio && (
        <>
          <p className="be-note">{name(parts.audio.key)}</p>
          <Button
            variant="quiet"
            onPress={() => editor.dispatch(change({ ...parts, audio: undefined }))}
          >
            {t("interactive.removeAudio")}
          </Button>
        </>
      )}
    </div>
  );
}

/** Where the items' audio players sit (2.1 "audio position"): below their text, or above it. */
const AUDIO_POSITION = {
  name: "audioPosition",
  label: "interactive.audioPosition",
  kind: "choice",
  options: [
    ["bottom", "interactive.audioBottom"],
    ["top", "interactive.audioTop"],
  ],
} as const;

/** The lesson that holds `block`. */
const lessonOf = (editor: Editor, block: Block) =>
  editor.document.entries.find(
    (entry): entry is LessonEntry =>
      entry.kind === "lesson" && entry.blocks.some((other) => other.id === block.id),
  );

const LEVELS = [2, 3, 4, 5, 6];

/**
 * The heading level of the item titles (blocks-interactions.md A12; accessibility.md BA3, W18): by
 * default one below the heading above the block, and never a level that would skip one.
 */
function ItemHeadingLevel({ block, editor }: FieldsProps) {
  const t = useStrings();
  const blocks = lessonOf(editor, block)?.blocks ?? [block];
  const deepest = deepestHeadingLevel(
    blocks,
    blocks.findIndex((other) => other.id === block.id),
  );
  const { headingLevel } = variantSettings<{ headingLevel?: number }>(block);
  const asked = headingLevel ?? deepest;
  return (
    <Select
      label={t("blockFormat.headingLevel")}
      description={t("interactive.headingHelp")}
      disabledKeys={LEVELS.filter((level) => level > deepest && level !== asked).map(String)}
      selectedKey={String(asked)}
      onSelectionChange={(key) => {
        const level = Number(key);
        editor.dispatch(
          withVariantSettings(block, { headingLevel: level === deepest ? undefined : level }),
        );
      }}
    >
      {LEVELS.map((level) => (
        <ListBoxItem key={level} id={String(level)}>
          {t(`blockFormat.level${level}` as StringKey)}
        </ListBoxItem>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------------------------------------
// Accordion and tabs (2.2, 2.3, W1)

function SectionFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const tabs = block.variant === "tabs";
  const name = (number: number) => t(tabs ? "interactive.tab" : "interactive.section", { number });
  return (
    <ItemList
      block={block}
      editor={editor}
      items={itemsOf(block, "content")}
      name={name}
      add={() => ({
        kind: "content",
        title: inlineHtml(t(tabs ? "sample.tabTitle" : "sample.sectionTitle")),
        text: para(t, tabs ? "sample.tabText" : "sample.sectionText"),
      })}
    >
      {(item) => (
        <>
          <TitleField item={item} label={t("field.title")} />
          <BodyField id={item.id} value={item.text} label={t("field.text")} />
          <ItemMedia
            parts={item}
            editor={editor}
            label={t("interactive.itemMedia")}
            change={itemMedia(item.id)}
          />
        </>
      )}
    </ItemList>
  );
}

function SectionFormat(props: FieldsProps) {
  return (
    <>
      <Controls
        {...props}
        controls={[
          {
            name: "oneAtATime",
            label: "interactive.oneAtATime",
            kind: "switch",
            show: props.block.variant === "accordion",
          },
          { name: "zoom", label: "blockFormat.zoom", kind: "switch" },
          AUDIO_POSITION,
        ]}
      />
      {props.block.variant === "accordion" && <ItemHeadingLevel {...props} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Labeled graphic (2.4, W2)

/**
 * The picture with its markers where the author places them: a click on the picture adds a marker
 * there; a marker dragged moves where it is let go; a focused marker moves by 1 % with the arrow
 * keys, 10 % with Shift. Each placement is one undo step and is announced.
 */
function MarkerCanvas({ block, editor }: FieldsProps) {
  const t = useStrings();
  const session = useContext(DraftSession);
  const entry = editor.document.media.find((media) => media.key === block.media?.[0]?.key);
  const url = usePictureUrl(session as NonNullable<typeof session>, entry);
  const markers = itemsOf(block, "marker");
  const frame = useRef<HTMLDivElement>(null);
  const pressed = useRef<{ x: number; y: number }>(undefined);
  const helpId = useId();
  const [said, say] = useState("");
  // Where a marker is while it is dragged, before it is let go.
  const [dragged, setDragged] = useState<{ id: string; x: number; y: number; moved: boolean }>();
  const name = (number: number) => t("interactive.marker", { number });

  const at = (event: { clientX: number; clientY: number }) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return undefined;
    return {
      x: round(((event.clientX - box.left) / box.width) * 100),
      y: round(((event.clientY - box.top) / box.height) * 100),
    };
  };
  const place = (marker: MarkerItem, number: number, x: number, y: number) => {
    const result = editor.dispatch({ type: "updateItem", id: marker.id, set: { x, y } });
    if (result.ok) say(t("interactive.markerAt", { name: name(number), x, y }));
  };
  const add = (x: number, y: number) => {
    const result = editor.dispatch({
      type: "insertItem",
      parent: block.id,
      value: { id: idMaker(editor.document)(), kind: "marker", x, y },
    });
    if (result.ok) say(t("interactive.markerAt", { name: name(markers.length + 1), x, y }));
  };
  const keys = (marker: MarkerItem, number: number) => (event: KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 1;
    const by = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!by) return;
    event.preventDefault();
    place(marker, number, round(marker.x + (by[0] ?? 0)), round(marker.y + (by[1] ?? 0)));
  };

  if (!entry) return <p className="be-note">{t("interactive.noPicture")}</p>;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div className="be-marker-place" role="group" aria-label={t("interactive.canvas")}>
      <span className="cs-Label">{t("interactive.canvas")}</span>
      <p id={helpId} className="be-note">
        {t("interactive.canvasHelp")}
      </p>
      <div
        ref={frame}
        className="be-marker-canvas"
        // A press on the picture itself (not on a marker) adds a marker there. The block's row
        // never sees these presses, so none of them starts a drag of the whole block.
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          const own =
            event.target === event.currentTarget || event.target instanceof HTMLImageElement;
          pressed.current = own ? { x: event.clientX, y: event.clientY } : undefined;
        }}
        onPointerUp={(event) => {
          const start = pressed.current;
          pressed.current = undefined;
          if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
          const point = at(event);
          if (point) add(point.x, point.y);
        }}
      >
        {url && <img src={url} alt="" draggable={false} />}
        {markers.map((marker, i) => {
          const here = dragged?.id === marker.id ? dragged : marker;
          return (
            <button
              key={marker.id}
              type="button"
              className="be-marker"
              style={{ left: `${here.x}%`, top: `${here.y}%` }}
              aria-label={t("interactive.markerAt", { name: name(i + 1), x: here.x, y: here.y })}
              aria-describedby={helpId}
              onKeyDown={keys(marker, i + 1)}
              onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                // No native drag of the block's row from here: the marker moves instead.
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragged({ id: marker.id, x: marker.x, y: marker.y, moved: false });
              }}
              onPointerMove={(event) => {
                if (dragged?.id !== marker.id) return;
                const point = at(event);
                if (point) setDragged({ id: marker.id, ...point, moved: true });
              }}
              onPointerUp={() => {
                if (dragged?.id === marker.id && dragged.moved) {
                  place(marker, i + 1, dragged.x, dragged.y);
                }
                setDragged(undefined);
              }}
              onPointerCancel={() => setDragged(undefined)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <Button onPress={() => add(50, 50)}>{t("interactive.addMarker")}</Button>
      <p className="cs-visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

const ICON_NAMES: Record<(typeof MARKER_ICONS)[number], StringKey> = {
  number: "interactive.iconNumber",
  plus: "interactive.iconPlus",
  info: "interactive.iconInfo",
  question: "interactive.iconQuestion",
  star: "interactive.iconStar",
  pin: "interactive.iconPin",
  eye: "interactive.iconEye",
};

function LabeledGraphicFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const [first, ...others] = block.media ?? [];
  return (
    <>
      <ImageSlot
        label={t("image.image")}
        image={first}
        editor={editor}
        command={(image) => ({
          type: "updateBlock",
          id: block.id,
          set: { media: [image, ...others] },
        })}
      />
      <MarkerCanvas block={block} editor={editor} />
      <ItemList
        block={block}
        editor={editor}
        items={itemsOf(block, "marker")}
        name={(number) => t("interactive.marker", { number })}
        min={0}
      >
        {(marker) => (
          <>
            <TitleField item={marker} label={t("field.title")} />
            <BodyField id={marker.id} value={marker.text} label={t("field.text")} />
            <Select
              label={t("interactive.icon")}
              selectedKey={marker.icon ?? "number"}
              onSelectionChange={(key) =>
                editor.dispatch(
                  key === "number"
                    ? { type: "updateItem", id: marker.id, unset: ["icon"] }
                    : { type: "updateItem", id: marker.id, set: { icon: String(key) } },
                )
              }
            >
              {MARKER_ICONS.map((icon) => (
                <ListBoxItem key={icon} id={icon}>
                  {t(ICON_NAMES[icon])}
                </ListBoxItem>
              ))}
            </Select>
            <ItemMedia
              parts={marker}
              editor={editor}
              label={t("interactive.itemMedia")}
              change={itemMedia(marker.id)}
            />
          </>
        )}
      </ItemList>
    </>
  );
}

function LabeledGraphicFormat(props: FieldsProps) {
  const s = variantSettings<{ markerColor?: string }>(props.block);
  return (
    <>
      <Controls
        {...props}
        controls={[
          {
            name: "markerColor",
            label: "blockFormat.markerColor",
            kind: "color",
            help: "blockFormat.colorHelp",
          },
          {
            name: "markerContrast",
            label: "interactive.markerContrast",
            kind: "choice",
            options: CONTRASTS,
            show: s.markerColor !== undefined,
          },
          {
            name: "cornerRadius",
            label: "blockFormat.cornerRadius",
            kind: "number",
            min: 0,
            max: 30,
          },
          { name: "zoom", label: "blockFormat.zoom", kind: "switch" },
          AUDIO_POSITION,
        ]}
      />
      <ItemHeadingLevel {...props} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Process (2.5, W3)

/** A process card's title, text, media, and whether learners see it (UI-BLOCKS-R7). */
function StepParts({ step, editor }: { step: StepItem; editor: Editor }) {
  const t = useStrings();
  return (
    <>
      <Switch
        isSelected={step.hidden === true}
        onChange={(hidden) =>
          editor.dispatch(
            hidden
              ? { type: "updateItem", id: step.id, set: { hidden: true } }
              : { type: "updateItem", id: step.id, unset: ["hidden"] },
          )
        }
      >
        {t("interactive.hide")}
      </Switch>
      <TitleField item={step} label={t("field.title")} />
      <BodyField id={step.id} value={step.text} label={t("field.text")} />
      <ItemMedia
        parts={step}
        editor={editor}
        label={t("interactive.itemMedia")}
        change={itemMedia(step.id)}
      />
    </>
  );
}

function ProcessFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const all = itemsOf(block, "step");
  const intro = all[0]?.role === "intro" ? all[0] : undefined;
  const summary = all.at(-1)?.role === "summary" ? all.at(-1) : undefined;
  const steps = all.filter((step) => step.role === "step");
  const end = (step: StepItem, label: StringKey) => (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div role="group" aria-label={t(label)} className="be-item">
      <span className="be-item-name">{t(label)}</span>
      <StepParts step={step} editor={editor} />
    </div>
  );
  return (
    <>
      {intro && end(intro, "interactive.intro")}
      <ItemList
        block={block}
        editor={editor}
        items={steps}
        offset={intro ? 1 : 0}
        name={(number) => t("interactive.step", { number })}
        add={() => ({
          kind: "step",
          role: "step" as const,
          title: inlineHtml(t("sample.stepTitle")),
          text: para(t, "sample.stepText"),
        })}
      >
        {(step) => <StepParts step={step} editor={editor} />}
      </ItemList>
      {summary && end(summary, "interactive.summary")}
    </>
  );
}

/**
 * A short word of the format menu, kept on Enter or on leaving the field; empty puts the default
 * back. Escape goes on to close the menu, as in the menu's other fields.
 */
function WordField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string | undefined) => void;
}) {
  const [typed, setTyped] = useState(value);
  useEffect(() => setTyped(value), [value]);
  const keep = () => {
    const next = typed.trim();
    if (next !== value) onChange(next || undefined);
  };
  return (
    <UiTextField
      label={label}
      description={description}
      maxLength={40}
      value={typed}
      onChange={setTyped}
      onBlur={keep}
      onKeyDown={(event) => {
        if (event.key === "Enter") keep();
        else event.continuePropagation();
      }}
    />
  );
}

function ProcessFormat(props: FieldsProps) {
  const t = useStrings();
  const { block, editor } = props;
  const s = variantSettings<{ stepLabel: boolean; stepWord?: string }>(block);
  return (
    <>
      <Controls
        {...props}
        controls={[
          { name: "stepLabel", label: "interactive.stepLabel", kind: "switch" },
          { name: "zoom", label: "blockFormat.zoom", kind: "switch" },
          AUDIO_POSITION,
        ]}
      />
      {s.stepLabel && (
        <WordField
          label={t("interactive.stepWord")}
          description={t("interactive.stepWordHelp")}
          value={s.stepWord ?? ""}
          onChange={(word) => editor.dispatch(withVariantSettings(block, { stepWord: word }))}
        />
      )}
      <ItemHeadingLevel block={block} editor={editor} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Flashcards (2.8, W6)

/** A card side without the parts left undefined, which JSON cannot hold. */
const defined = (side: Loose<CardSide>): CardSide =>
  Object.fromEntries(Object.entries(side).filter(([, value]) => value !== undefined));

/**
 * One side of a card (2.8, W6): its text, its media and audio, and its own picture style, centred
 * with a frame or across the whole side ("per side").
 */
function CardSideFields({
  card,
  side,
  editor,
}: {
  card: FlashcardItem;
  side: "front" | "back";
  editor: Editor;
}) {
  const t = useStrings();
  const part = card[side];
  const set = (next: Loose<CardSide>): Command =>
    ({ type: "updateItem", id: card.id, set: { [side]: defined(next) } }) as Command;
  const { media, embed, audio, ...rest } = part;
  return (
    <>
      <RichDraftField
        label={t(side === "front" ? "interactive.front" : "interactive.back")}
        value={part.text ?? ""}
        command={(html) => set({ ...part, text: html || undefined })}
      />
      <ItemMedia
        parts={{ media, embed, audio }}
        editor={editor}
        label={t(side === "front" ? "interactive.frontMedia" : "interactive.backMedia")}
        change={(next) => set({ ...rest, ...next })}
      />
      {kindOf(part, editor) === "picture" && (
        <Select
          label={t(side === "front" ? "interactive.frontStyle" : "interactive.backStyle")}
          selectedKey={part.imageStyle ?? "centered"}
          onSelectionChange={(key) =>
            editor.dispatch(set({ ...part, imageStyle: key === "full" ? "full" : undefined }))
          }
        >
          <ListBoxItem id="centered">{t("interactive.imageCentered")}</ListBoxItem>
          <ListBoxItem id="full">{t("interactive.imageFull")}</ListBoxItem>
        </Select>
      )}
    </>
  );
}

function FlashcardFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  return (
    <ItemList
      block={block}
      editor={editor}
      items={itemsOf(block, "flashcard")}
      name={(number) => t("interactive.card", { number })}
      add={() => ({
        kind: "flashcard",
        front: { text: para(t, "sample.cardFront") },
        back: { text: para(t, "sample.cardBack") },
      })}
    >
      {(card) => (
        <>
          <CardSideFields card={card} side="front" editor={editor} />
          <CardSideFields card={card} side="back" editor={editor} />
        </>
      )}
    </ItemList>
  );
}

function FlashcardFormat(props: FieldsProps) {
  const s = variantSettings<{ autosize: boolean }>(props.block);
  return (
    <Controls
      {...props}
      controls={[
        { name: "flipHint", label: "interactive.flipHint", kind: "switch" },
        { name: "autosize", label: "interactive.autosize", kind: "switch" },
        {
          name: "cardHeight",
          label: "interactive.cardHeight",
          kind: "number",
          min: 120,
          max: 600,
          show: !s.autosize,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Button and button stack (2.10, W8)

/**
 * Where a button goes (2.10, W8): another lesson, a web address or an address relative to the
 * course (each checked as typed), a new email to one or more addresses, or the end of the course,
 * which learning-system packages alone show.
 */
function DestinationFields({ item, editor }: { item: ButtonItem; editor: Editor }) {
  const t = useStrings();
  const pages = editor.document.entries.filter((entry) => entry.kind !== "section");
  const { destination } = item;
  const go = (next: ButtonItem["destination"]): Command => ({
    type: "updateItem",
    id: item.id,
    set: { destination: next },
  });
  const first = pages[0];
  return (
    <>
      <Select
        label={t("interactive.destination")}
        selectedKey={destination.kind}
        onSelectionChange={(key) => {
          if (key === destination.kind) return;
          if (key === "lesson" && first) editor.dispatch(go({ kind: "lesson", entry: first.id }));
          else if (key === "url") editor.dispatch(go({ kind: "url", url: "https://example.org/" }));
          // shortcut: like the web address, a placeholder the author replaces.
          else if (key === "relative") editor.dispatch(go({ kind: "relative", path: "page.html" }));
          else if (key === "email") {
            editor.dispatch(go({ kind: "email", addresses: ["someone@example.org"] }));
          } else if (key === "exit") editor.dispatch(go({ kind: "exit" }));
        }}
      >
        <ListBoxItem id="lesson">{t("interactive.toLesson")}</ListBoxItem>
        <ListBoxItem id="url">{t("interactive.toUrl")}</ListBoxItem>
        <ListBoxItem id="relative">{t("interactive.toRelative")}</ListBoxItem>
        <ListBoxItem id="email">{t("interactive.toEmail")}</ListBoxItem>
        <ListBoxItem id="exit">{t("interactive.toExit")}</ListBoxItem>
      </Select>
      {destination.kind === "lesson" && (
        <Select
          label={t("interactive.lesson")}
          selectedKey={destination.entry}
          onSelectionChange={(key) => editor.dispatch(go({ kind: "lesson", entry: String(key) }))}
        >
          {pages.map((page) => (
            <ListBoxItem key={page.id} id={page.id}>
              {page.title}
            </ListBoxItem>
          ))}
        </Select>
      )}
      {destination.kind === "url" && (
        <DraftField
          label={t("interactive.url")}
          description={t("interactive.urlHelp")}
          errorMessage={t("interactive.urlError")}
          maxLength={2048}
          value={destination.url}
          command={(text) =>
            WEB.test(text.trim()) ? go({ kind: "url", url: text.trim() }) : undefined
          }
        />
      )}
      {destination.kind === "relative" && (
        <DraftField
          label={t("interactive.relative")}
          description={t("interactive.relativeHelp")}
          errorMessage={t("interactive.relativeError")}
          maxLength={2048}
          value={destination.path}
          command={(text) =>
            isRelativeLink(text.trim()) ? go({ kind: "relative", path: text.trim() }) : undefined
          }
        />
      )}
      {destination.kind === "email" && (
        <DraftField
          label={t("interactive.email")}
          description={t("interactive.emailHelp")}
          errorMessage={t("interactive.emailError")}
          value={destination.addresses.join(", ")}
          command={(text) => {
            const addresses = text
              .split(",")
              .map((address) => address.trim())
              .filter(Boolean);
            return addresses.length > 0 && addresses.length <= 50 && addresses.every(isEmail)
              ? go({ kind: "email", addresses })
              : undefined;
          }}
        />
      )}
      {destination.kind === "exit" && <p className="be-note">{t("interactive.exitHelp")}</p>}
    </>
  );
}

function ButtonFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const all = itemsOf(block, "button");
  const stack = block.variant === "button-stack";
  const parts = (item: ButtonItem) => (
    <>
      <TitleField item={item} label={t("interactive.heading")} />
      <DraftField
        label={t("interactive.buttonLabel")}
        errorMessage={t("interactive.labelError")}
        value={item.label}
        command={(text) =>
          text.trim() ? { type: "updateItem", id: item.id, set: { label: text.trim() } } : undefined
        }
      />
      <BodyField
        id={item.id}
        value={item.description}
        field="description"
        label={t("interactive.description")}
      />
      <DestinationFields item={item} editor={editor} />
    </>
  );
  if (!stack) {
    const item = all[0];
    if (item) return parts(item);
    // A button whose lesson was deleted goes with it (D-36): the block offers a new one.
    return (
      <>
        <p className="be-note">{t("interactive.noButton")}</p>
        <Button
          onPress={() =>
            editor.dispatch({
              type: "insertItem",
              parent: block.id,
              value: { ...sampleButton(t), id: idMaker(editor.document)() },
            })
          }
        >
          {t("interactive.addButton")}
        </Button>
      </>
    );
  }
  return (
    <ItemList
      block={block}
      editor={editor}
      items={all}
      name={(number) => t("interactive.button", { number })}
      add={() => sampleButton(t)}
    >
      {(item) => parts(item)}
    </ItemList>
  );
}

function ButtonFormat(props: FieldsProps) {
  const { block } = props;
  const s = variantSettings<{ buttonColor?: string; cornerRadius?: number }>(block);
  // The corners follow the theme until the author sets them; the slider starts at the theme's.
  const shown = { ...block, variantSettings: { cornerRadius: 6, ...block.variantSettings } };
  return (
    <>
      <Controls
        {...props}
        controls={[
          { name: "showDescription", label: "interactive.showDescription", kind: "switch" },
          {
            name: "align",
            label: "blockFormat.align",
            kind: "choice",
            options: [
              ["left", "blockFormat.left"],
              ["center", "blockFormat.center"],
              ["right", "blockFormat.right"],
            ],
          },
          {
            name: "width",
            label: "interactive.width",
            kind: "choice",
            options: [
              ["fit", "interactive.widthFit"],
              ["wide", "interactive.widthWide"],
              ["full", "interactive.widthFull"],
            ],
          },
          {
            name: "buttonColor",
            label: "interactive.buttonColor",
            kind: "color",
            help: "blockFormat.colorHelp",
          },
          {
            name: "buttonContrast",
            label: "style.contrast",
            kind: "choice",
            options: CONTRASTS,
            show: s.buttonColor !== undefined,
          },
          {
            name: "spacing",
            label: "interactive.spacing",
            kind: "number",
            min: 0,
            max: 48,
            show: block.variant === "button-stack",
          },
        ]}
      />
      <ItemHeadingLevel {...props} />
      <Controls
        {...props}
        block={shown}
        controls={[
          {
            name: "cornerRadius",
            label: "blockFormat.cornerRadius",
            kind: "number",
            min: 0,
            max: 30,
          },
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Sample content and the types

const sampleButton = (t: Translate): Omit<ButtonItem, "id"> => ({
  kind: "button",
  label: t("sample.buttonLabel"),
  description: para(t, "sample.buttonText"),
  // shortcut: sample content points at a placeholder page the author replaces, like sample text.
  destination: { kind: "url", url: "https://example.org/" },
});

/** A new block whose items `items` makes, each with a new id. */
const make =
  (variant: string, items: (t: Translate) => Omit<Item, "id">[]) =>
  (id: () => string, t: Translate): Block => ({
    id: id(),
    category: "interactive",
    variant,
    items: items(t).map((item) => ({ ...item, id: id() }) as Item),
  });

const sections = (t: Translate, title: StringKey, text: StringKey) =>
  [1, 2, 3].map(() => ({
    kind: "content" as const,
    title: inlineHtml(t(title)),
    text: para(t, text),
  }));

const step = (t: Translate, role: StepItem["role"], title: StringKey, text: StringKey) => ({
  kind: "step" as const,
  role,
  title: inlineHtml(t(title)),
  text: para(t, text),
});

const cards = (t: Translate) =>
  [1, 2, 3].map(() => ({
    kind: "flashcard" as const,
    front: { text: para(t, "sample.cardFront") },
    back: { text: para(t, "sample.cardBack") },
  }));

const type = (
  variant: string,
  parts: Pick<BlockType, "create" | "Fields" | "Format" | "switchable" | "family" | "cards">,
): BlockType => ({
  group: "interactive",
  variant,
  label: `variant.interactive.${variant}` as StringKey,
  ...parts,
});

/** The interactive types, in the library's order, with the later epics' types between them. */
export function interactiveTypes(later: (variants: string[]) => BlockType[]): BlockType[] {
  return [
    ...(["accordion", "tabs"] as const).map((variant) =>
      type(variant, {
        create: make(variant, (t) =>
          variant === "tabs"
            ? sections(t, "sample.tabTitle", "sample.tabText")
            : sections(t, "sample.sectionTitle", "sample.sectionText"),
        ),
        Fields: SectionFields,
        Format: SectionFormat,
        switchable: true,
        family: "sections",
        cards: true,
      }),
    ),
    type("labeled-graphic", {
      // The picture comes from the media intake; the markers wait for it.
      create: make("labeled-graphic", (t) =>
        [
          [30, 40],
          [70, 60],
        ].map(([x, y]) => ({
          kind: "marker" as const,
          x: x as number,
          y: y as number,
          title: inlineHtml(t("sample.markerTitle")),
          text: para(t, "sample.markerText"),
        })),
      ),
      Fields: LabeledGraphicFields,
      Format: LabeledGraphicFormat,
    }),
    type("process", {
      create: make("process", (t) => [
        step(t, "intro", "sample.introTitle", "sample.introText"),
        step(t, "step", "sample.stepTitle", "sample.stepText"),
        step(t, "step", "sample.stepTitle", "sample.stepText"),
        step(t, "step", "sample.stepTitle", "sample.stepText"),
        step(t, "summary", "sample.summaryTitle", "sample.summaryText"),
      ]),
      Fields: ProcessFields,
      Format: ProcessFormat,
      cards: true,
    }),
    ...later(["scenario", "sorting", "timeline"]),
    ...(["flashcard-grid", "flashcard-stack"] as const).map((variant) =>
      type(variant, {
        create: make(variant, cards),
        Fields: FlashcardFields,
        Format: FlashcardFormat,
        switchable: true,
        family: "flashcards",
        cards: true,
      }),
    ),
    ...(["button", "button-stack"] as const).map((variant) =>
      type(variant, {
        create: make(variant, (t) =>
          variant === "button" ? [sampleButton(t)] : [sampleButton(t), sampleButton(t)],
        ),
        Fields: ButtonFields,
        Format: ButtonFormat,
        switchable: true,
        family: "buttons",
      }),
    ),
    ...later(["slides"]),
  ];
}
