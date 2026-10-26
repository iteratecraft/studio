// The text and static block types (BLK-04; rise.md 3C; blocks-editor.md 2.5, 2.7 to 2.11, 2.14,
// 3): columns, tables, statements and notes, quotes and the quote carousel, lists, images,
// galleries and dividers, plus the format options of the text blocks M2-10 brought. Each type
// brings sample content (`create`), its content edited in place (`Fields`) and its own format
// options (`Format`, shown in the format menu after the common ones, L10). Settings and their
// defaults come from the format (`variantSettings`), which closes them for these variants.
// Pictures use the media slots of the format; adding a picture comes with the media library
// (M2-13), so until then a slot without one says so.
import type { Command, Editor } from "@course-suite/doc-ops";
import {
  type Block,
  type ContentItem,
  type MediaRef,
  settingsTable,
  variantSettings,
} from "@course-suite/format";
import {
  Button,
  Checkbox,
  IconButton,
  ListBoxItem,
  Select,
  SliderField,
  type StringKey,
  Switch,
  TextField,
  type Translate,
  useStrings,
} from "@course-suite/ui";
import { type ComponentType, type ReactNode, useEffect, useId, useState } from "react";
import type { BlockType, FieldsProps } from "./blocks.js";
import { DraftField, inlineHtml, RichDraftField, textOf } from "./fields.js";
import { idMaker } from "./ids.js";

const COLOR = /^#[0-9a-f]{6}$/;
const contents = (block: Block): ContentItem[] =>
  (block.items ?? []).filter((item): item is ContentItem => item.kind === "content");

/**
 * The command that sets the variant settings `changes` of `block`, keeping its others; a setting
 * set to undefined or to its default is left out (back at its default).
 */
export function withVariantSettings(block: Block, changes: Record<string, unknown>): Command {
  const table = settingsTable(block) ?? {};
  const kept = Object.fromEntries(
    Object.entries({ ...block.variantSettings, ...changes }).filter(
      ([name, value]) => value !== undefined && value !== table[name]?.default,
    ),
  );
  return Object.keys(kept).length > 0
    ? { type: "updateBlock", id: block.id, set: { variantSettings: kept } }
    : { type: "updateBlock", id: block.id, unset: ["variantSettings"] };
}

/** The edit that puts `html` in field `field` of a block's item, or adds the item with it. */
function setItem(
  block: Block,
  item: ContentItem | undefined,
  field: "title" | "text",
  html: string,
  editor: Editor,
): Command[] {
  if (!item) {
    if (!html) return [];
    return [
      {
        type: "insertItem",
        parent: block.id,
        value: { id: idMaker(editor.document)(), kind: "content", [field]: html },
      },
    ];
  }
  return [
    html
      ? { type: "updateItem", id: item.id, set: { [field]: html } }
      : { type: "updateItem", id: item.id, unset: [field] },
  ];
}

// ---------------------------------------------------------------------------------------------
// Format options

/** One format option of a variant: a switch, a choice, a number or a colour. */
type Control = { name: string; label: StringKey; show?: boolean } & (
  | { kind: "switch" }
  | { kind: "choice"; options: readonly (readonly [value: string | number, label: StringKey])[] }
  | { kind: "number"; min: number; max: number; unit?: StringKey }
  | { kind: "color"; help: StringKey }
);

/** A number by slider or typed in the box beside it; the block changes when the move ends. */
function NumberControl({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  return (
    <SliderField
      label={label}
      unit={unit}
      minValue={min}
      maxValue={max}
      value={live}
      onChange={setLive}
      onChangeEnd={onChange}
    />
  );
}

/** A colour typed as # and six hex digits; empty puts the default back. */
function ColorControl({
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
  const t = useStrings();
  const [typed, setTyped] = useState(value);
  useEffect(() => setTyped(value), [value]);
  const next = typed.trim().toLowerCase();
  const keep = () => {
    if (next !== value && (next === "" || COLOR.test(next))) onChange(next || undefined);
  };
  return (
    <TextField
      label={label}
      description={description}
      value={typed}
      onChange={setTyped}
      onBlur={keep}
      onKeyDown={(event) => {
        if (event.key === "Enter") keep();
        else event.continuePropagation();
      }}
      isInvalid={next !== "" && !COLOR.test(next)}
      errorMessage={t("style.colorError")}
    />
  );
}

/** The format options `controls` of a block, each change one undo step. */
function Controls({ block, editor, controls }: FieldsProps & { controls: Control[] }) {
  const t = useStrings();
  const settings = variantSettings(block);
  const change = (name: string, value: unknown) =>
    editor.dispatch(withVariantSettings(block, { [name]: value }));
  return (
    <>
      {controls
        .filter((control) => control.show !== false)
        .map((control) => {
          const value = settings[control.name];
          switch (control.kind) {
            case "switch":
              return (
                <Switch
                  key={control.name}
                  isSelected={value === true}
                  onChange={(on) => change(control.name, on)}
                >
                  {t(control.label)}
                </Switch>
              );
            case "choice":
              return (
                <Select
                  key={control.name}
                  label={t(control.label)}
                  selectedKey={String(value)}
                  onSelectionChange={(key) => {
                    const option = control.options.find(([option]) => String(option) === key);
                    if (option) change(control.name, option[0]);
                  }}
                >
                  {control.options.map(([option, label]) => (
                    <ListBoxItem key={String(option)} id={String(option)}>
                      {t(label)}
                    </ListBoxItem>
                  ))}
                </Select>
              );
            case "number":
              return (
                <NumberControl
                  key={control.name}
                  label={t(control.label)}
                  unit={t(control.unit ?? "format.pixels")}
                  value={Number(value)}
                  min={control.min}
                  max={control.max}
                  onChange={(next) => change(control.name, next)}
                />
              );
            default:
              return (
                <ColorControl
                  key={control.name}
                  label={t(control.label)}
                  description={t(control.help)}
                  value={typeof value === "string" ? value : ""}
                  onChange={(next) => change(control.name, next)}
                />
              );
          }
        })}
    </>
  );
}

const SIZES = [
  ["small", "format.small"],
  ["medium", "format.medium"],
  ["large", "format.large"],
] as const;
const CONTRASTS = [
  ["auto", "style.contrastAuto"],
  ["light", "style.contrastLight"],
  ["dark", "style.contrastDark"],
] as const;
const LEVELS = [2, 3, 4, 5, 6].map(
  (level) => [level, `blockFormat.level${level}` as StringKey] as const,
);

/**
 * Text blocks (2.5, rise.md 3C): the heading level for accessibility (2 to 6, so the lesson title
 * stays the only level 1), the columns the body text flows in, and the space after the heading.
 */
function TextFormat({ block, editor }: FieldsProps) {
  const t = useStrings();
  const heading = block.variant !== "paragraph";
  const body = block.variant.startsWith("paragraph");
  const fallback = block.variant.endsWith("subheading") ? 3 : 2;
  const settings = variantSettings<{ headingLevel?: number }>(block);
  return (
    <>
      {heading && (
        <Select
          label={t("blockFormat.headingLevel")}
          description={t("blockFormat.headingLevelHelp")}
          selectedKey={String(settings.headingLevel ?? fallback)}
          onSelectionChange={(key) => {
            const level = Number(key);
            editor.dispatch(
              withVariantSettings(block, { headingLevel: level === fallback ? undefined : level }),
            );
          }}
        >
          {LEVELS.map(([level, label]) => (
            <ListBoxItem key={level} id={String(level)}>
              {t(label)}
            </ListBoxItem>
          ))}
        </Select>
      )}
      <Controls
        block={block}
        editor={editor}
        controls={[
          {
            name: "columns",
            label: "blockFormat.textColumns",
            kind: "choice",
            options: [
              [1, "blockFormat.one"],
              [2, "blockFormat.two"],
              [3, "blockFormat.three"],
            ],
            show: body,
          },
          {
            name: "headingSpace",
            label: "blockFormat.headingSpace",
            kind: "number",
            min: 0,
            max: 100,
            show: heading && body,
          },
        ]}
      />
    </>
  );
}

/** Columns (2.5): two to four, with images or not; more columns add sample text, fewer hide it. */
function ColumnsFormat({ block, editor }: FieldsProps) {
  const t = useStrings();
  const { columns } = variantSettings<{ columns: number }>(block);
  const setColumns = (count: number) => {
    const items = contents(block);
    const id = idMaker(editor.document);
    const added = Array.from(
      { length: Math.max(0, count - items.length) },
      (): Command => ({
        type: "insertItem",
        parent: block.id,
        value: { id: id(), kind: "content", text: `<p>${inlineHtml(t("sample.column"))}</p>` },
      }),
    );
    editor.dispatch([withVariantSettings(block, { columns: count }), ...added]);
  };
  return (
    <>
      <Select
        label={t("blockFormat.columns")}
        selectedKey={String(columns)}
        onSelectionChange={(key) => setColumns(Number(key))}
      >
        <ListBoxItem id="2">{t("blockFormat.two")}</ListBoxItem>
        <ListBoxItem id="3">{t("blockFormat.three")}</ListBoxItem>
        <ListBoxItem id="4">{t("blockFormat.four")}</ListBoxItem>
      </Select>
      <Controls
        block={block}
        editor={editor}
        controls={[
          { name: "images", label: "blockFormat.images", kind: "switch" },
          {
            name: "zoom",
            label: "blockFormat.zoom",
            kind: "switch",
            show: variantSettings(block).images === true,
          },
        ]}
      />
    </>
  );
}

const tableFormat = (props: FieldsProps) => (
  <Controls
    {...props}
    controls={[
      { name: "cellPadding", label: "blockFormat.cellPadding", kind: "choice", options: SIZES },
    ]}
  />
);

/** Statements and notes (2.7). */
function StatementFormat(props: FieldsProps) {
  const { block } = props;
  const s = variantSettings<{ divider: boolean; noteColor?: string; noteIcon: boolean }>(block);
  const note = block.variant === "note";
  const ruled = block.variant === "statement-c" || block.variant === "statement-d";
  return (
    <Controls
      {...props}
      controls={[
        { name: "divider", label: "blockFormat.divider", kind: "switch", show: ruled },
        {
          name: "dividerSize",
          label: "blockFormat.dividerSize",
          kind: "number",
          min: 1,
          max: 10,
          show: ruled && s.divider,
        },
        {
          name: "dividerSpace",
          label: "blockFormat.dividerSpace",
          kind: "number",
          min: 0,
          max: 100,
          show: ruled && s.divider,
        },
        {
          name: "noteSize",
          label: "blockFormat.noteSize",
          kind: "choice",
          options: SIZES,
          show: note,
        },
        {
          name: "noteColor",
          label: "blockFormat.noteColor",
          kind: "color",
          help: "blockFormat.colorHelp",
          show: note,
        },
        {
          name: "noteContrast",
          label: "style.contrast",
          kind: "choice",
          options: CONTRASTS,
          show: note && s.noteColor !== undefined,
        },
        { name: "noteIcon", label: "blockFormat.noteIcon", kind: "switch", show: note },
        {
          name: "noteIconColor",
          label: "blockFormat.noteIconColor",
          kind: "color",
          help: "blockFormat.colorHelp",
          show: note && s.noteIcon,
        },
        {
          name: "cornerRadius",
          label: "blockFormat.cornerRadius",
          kind: "number",
          min: 0,
          max: 30,
          show: note,
        },
      ]}
    />
  );
}

/** Quotes (2.8) and our own quote carousel options: the look of every quote in it. */
function QuoteFormat(props: FieldsProps) {
  const { variant } = props.block;
  const s = variantSettings<{ avatar: boolean; divider: boolean }>(props.block);
  const onImage = variant === "on-image";
  return (
    <Controls
      {...props}
      controls={[
        {
          name: "look",
          label: "blockFormat.look",
          kind: "choice",
          options: [
            ["a", "variant.quote.a"],
            ["b", "variant.quote.b"],
            ["c", "variant.quote.c"],
            ["d", "variant.quote.d"],
          ],
          show: variant === "carousel",
        },
        { name: "avatar", label: "blockFormat.avatar", kind: "switch", show: !onImage },
        {
          name: "avatarSize",
          label: "blockFormat.avatarSize",
          kind: "number",
          min: 32,
          max: 160,
          show: !onImage && s.avatar,
        },
        { name: "quoteIcon", label: "blockFormat.quoteIcon", kind: "switch" },
        { name: "divider", label: "blockFormat.quoteDivider", kind: "switch" },
        {
          name: "dividerSize",
          label: "blockFormat.dividerSize",
          kind: "number",
          min: 1,
          max: 10,
          show: s.divider,
        },
        { name: "quoteSpace", label: "blockFormat.quoteSpace", kind: "number", min: 0, max: 100 },
        {
          name: "align",
          label: "blockFormat.align",
          kind: "choice",
          options: [
            ["left", "blockFormat.left"],
            ["center", "blockFormat.center"],
            ["right", "blockFormat.right"],
          ],
          show: onImage,
        },
        {
          name: "overlay",
          label: "blockFormat.overlay",
          kind: "color",
          help: "blockFormat.colorHelp",
          show: onImage,
        },
        {
          name: "overlayOpacity",
          label: "blockFormat.overlayOpacity",
          kind: "number",
          min: 0,
          max: 100,
          unit: "blockFormat.percent",
          show: onImage,
        },
      ]}
    />
  );
}

/** Lists (2.9): space after the marker, the item colour and its text, the first number. */
function ListFormat(props: FieldsProps) {
  const s = variantSettings<{ markerColor?: string }>(props.block);
  return (
    <Controls
      {...props}
      controls={[
        { name: "markerSpace", label: "blockFormat.markerSpace", kind: "number", min: 0, max: 60 },
        {
          name: "markerColor",
          label: "blockFormat.markerColor",
          kind: "color",
          help: "blockFormat.colorHelp",
        },
        {
          name: "markerContrast",
          label: "blockFormat.markerContrast",
          kind: "choice",
          options: CONTRASTS,
          show: s.markerColor !== undefined && props.block.variant === "numbered",
        },
        {
          name: "start",
          label: "blockFormat.start",
          kind: "number",
          min: 0,
          max: 9999,
          unit: "blockFormat.unitNumber",
          show: props.block.variant === "numbered",
        },
      ]}
    />
  );
}

/** Images (2.10): zoom, corners except where the image fills the page (R26), side and size, overlay. */
function ImageFormat(props: FieldsProps) {
  const { variant } = props.block;
  return (
    <Controls
      {...props}
      controls={[
        {
          name: "zoom",
          label: "blockFormat.zoom",
          kind: "switch",
          show: variant !== "text-on-image",
        },
        {
          name: "cornerRadius",
          label: "blockFormat.cornerRadius",
          kind: "number",
          min: 0,
          max: 30,
          show: variant === "centered" || variant === "image-text",
        },
        {
          name: "position",
          label: "blockFormat.position",
          kind: "choice",
          options: [
            ["left", "blockFormat.left"],
            ["right", "blockFormat.right"],
          ],
          show: variant === "image-text",
        },
        {
          name: "size",
          label: "blockFormat.imageSize",
          kind: "choice",
          options: SIZES,
          show: variant === "image-text",
        },
        {
          name: "overlay",
          label: "blockFormat.overlay",
          kind: "color",
          help: "blockFormat.colorHelp",
          show: variant === "text-on-image",
        },
        {
          name: "overlayOpacity",
          label: "blockFormat.overlayOpacity",
          kind: "number",
          min: 0,
          max: 100,
          unit: "blockFormat.percent",
          show: variant === "text-on-image",
        },
      ]}
    />
  );
}

const galleryFormat = (props: FieldsProps) => (
  <Controls
    {...props}
    controls={[
      { name: "zoom", label: "blockFormat.zoom", kind: "switch" },
      { name: "cornerRadius", label: "blockFormat.cornerRadius", kind: "number", min: 0, max: 30 },
    ]}
  />
);

/** A numbered divider (2.14) counts on from the one before it, or restarts at its own number. */
function DividerFormat(props: FieldsProps) {
  const { restart } = variantSettings<{ restart: boolean }>(props.block);
  return (
    <Controls
      {...props}
      controls={[
        { name: "restart", label: "blockFormat.restart", kind: "switch" },
        {
          name: "start",
          label: "blockFormat.restartAt",
          kind: "number",
          min: 1,
          max: 999,
          unit: "blockFormat.unitNumber",
          show: restart,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Content

/**
 * A picture of the block or of an item (blocks-editor.md W15 step 3, BLK-04): its alt text, or
 * marked decorative (empty alt, ADR-0002), with a warning while it has neither. Without a picture
 * yet, the add button waits for the media library (M2-13).
 */
function ImageSlot({
  label,
  image,
  editor,
  command,
}: {
  label: string;
  image: MediaRef | undefined;
  editor: Editor;
  /** The edit that keeps the picture with its new alt text: "" is decorative, none is not set. */
  command: (image: MediaRef) => Command;
}) {
  const t = useStrings();
  const noteId = useId();
  if (!image) {
    return (
      <div className="be-image-slot">
        <span className="cs-Label">{label}</span>
        <Button isDisabled aria-describedby={noteId}>
          {t("image.add")}
        </Button>
        <p id={noteId} className="be-note">
          {t("image.addLater")}
        </p>
      </div>
    );
  }
  const { alt, ...rest } = image;
  const decorative = alt === "";
  return (
    <div className="be-image-slot">
      <span className="cs-Label">{t("image.file", { label, name: image.key })}</span>
      {!decorative && (
        <DraftField
          label={t("image.alt", { label })}
          description={alt === undefined ? t("image.altMissing") : t("image.altHelp")}
          value={alt ?? ""}
          command={(text) => command(text.trim() ? { ...rest, alt: text.trim() } : rest)}
        />
      )}
      {alt === undefined && (
        <p className="be-warning" aria-hidden="true">
          {t("image.altMissing")}
        </p>
      )}
      <Checkbox
        isSelected={decorative}
        onChange={(on) => editor.dispatch(command(on ? { ...rest, alt: "" } : rest))}
      >
        {t("image.decorative")}
      </Checkbox>
    </div>
  );
}

/** The block's own picture (media[0]). */
function BlockImage({ block, editor, label }: FieldsProps & { label: StringKey }) {
  const t = useStrings();
  const [first, ...others] = block.media ?? [];
  return (
    <ImageSlot
      label={t(label)}
      image={first}
      editor={editor}
      command={(image) => ({
        type: "updateBlock",
        id: block.id,
        set: { media: [image, ...others] },
      })}
    />
  );
}

/** An item's picture. */
function ItemImage({ item, editor, label }: { item: ContentItem; editor: Editor; label: string }) {
  return (
    <ImageSlot
      label={label}
      image={item.media}
      editor={editor}
      command={(image) => ({ type: "updateItem", id: item.id, set: { media: image } })}
    />
  );
}

/**
 * The items of a block, one group each, with move up, move down and remove (never the last
 * `min`), and an add button that adds `sample` at the end; each change one undo step.
 */
function Items({
  block,
  editor,
  name,
  min = 1,
  sample,
  children,
}: FieldsProps & {
  name: (number: number) => string;
  min?: number;
  sample: () => Partial<ContentItem>;
  children: (item: ContentItem, number: number) => ReactNode;
}) {
  const t = useStrings();
  const items = contents(block);
  const move = (item: ContentItem, index: number) =>
    editor.dispatch({ type: "moveItem", id: item.id, index });
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
      <Button
        onPress={() =>
          editor.dispatch({
            type: "insertItem",
            parent: block.id,
            value: { ...sample(), id: idMaker(editor.document)(), kind: "content" },
          })
        }
      >
        {t("items.add", { name: name(items.length + 1) })}
      </Button>
    </>
  );
}

/** A rich text field of an item: its text, or the item's title for a heading. */
function ItemText({
  block,
  editor,
  item,
  label,
}: FieldsProps & { item: ContentItem | undefined; label: string }) {
  return (
    <RichDraftField
      label={label}
      value={item?.text ?? ""}
      command={(html) => setItem(block, item, "text", html, editor)}
    />
  );
}

/** Statements and notes: their text. */
function StatementFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  return (
    <>
      <ItemText block={block} editor={editor} item={contents(block)[0]} label={t("field.text")} />
      {block.variant === "note" && block.media?.[0] && (
        <BlockImage block={block} editor={editor} label="image.noteIcon" />
      )}
    </>
  );
}

/** One quote: its text, the name of the person quoted and their photo. */
function QuoteItem({
  block,
  editor,
  item,
  avatar,
}: FieldsProps & { item: ContentItem | undefined; avatar: boolean }) {
  const t = useStrings();
  return (
    <>
      <ItemText block={block} editor={editor} item={item} label={t("field.quote")} />
      <DraftField
        label={t("field.quoteName")}
        value={textOf(item?.title ?? "")}
        command={(text) => setItem(block, item, "title", inlineHtml(text), editor)}
      />
      {avatar && item && <ItemImage item={item} editor={editor} label={t("image.photo")} />}
    </>
  );
}

function QuoteFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const avatar = variantSettings(block).avatar === true && block.variant !== "on-image";
  if (block.variant === "carousel") {
    return (
      <Items
        block={block}
        editor={editor}
        name={(number) => t("items.quote", { number })}
        sample={() => sampleQuote(t)}
      >
        {(item) => <QuoteItem block={block} editor={editor} item={item} avatar={avatar} />}
      </Items>
    );
  }
  return (
    <>
      <QuoteItem block={block} editor={editor} item={contents(block)[0]} avatar={avatar} />
      {block.variant === "on-image" && (
        <BlockImage block={block} editor={editor} label="image.background" />
      )}
    </>
  );
}

function ListFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const name = (number: number) => t("items.listItem", { number });
  return (
    <Items
      block={block}
      editor={editor}
      name={name}
      sample={() => ({ text: `<p>${inlineHtml(t("sample.listItem"))}</p>` })}
    >
      {(item, number) => (
        <ItemText block={block} editor={editor} item={item} label={name(number)} />
      )}
    </Items>
  );
}

/** Columns: the text of each column shown, and its picture when columns have pictures. */
function ColumnsFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const s = variantSettings<{ columns: number; images: boolean }>(block);
  return (
    <>
      {contents(block)
        .slice(0, s.columns)
        .map((item, i) => (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
          <div
            key={item.id}
            role="group"
            aria-label={t("items.column", { number: i + 1 })}
            className="be-item"
          >
            <span className="be-item-name">{t("items.column", { number: i + 1 })}</span>
            {s.images && <ItemImage item={item} editor={editor} label={t("image.image")} />}
            <ItemText block={block} editor={editor} item={item} label={t("field.text")} />
          </div>
        ))}
    </>
  );
}

/** A table as rows of cell texts, and whether its first row is a header. */
interface Grid {
  header: boolean;
  rows: string[][];
}

/** The table in a block's rich text, read by the browser into an inert template. */
export function readTable(html: string): Grid {
  const template = document.createElement("template");
  template.innerHTML = html;
  const table = template.content.querySelector("table");
  const rows = [...(table?.rows ?? [])].map((row) =>
    [...row.cells].map((cell) => textOf(cell.innerHTML)),
  );
  const width = Math.max(1, ...rows.map((row) => row.length));
  return {
    header: table?.tHead !== null && table?.tHead !== undefined,
    rows: (rows.length > 0 ? rows : [[""]]).map((row) => [
      ...row,
      ...Array(width - row.length).fill(""),
    ]),
  };
}

/** The rich text of a table: a header row in `thead` with `th` cells, the others in `tbody`. */
export function writeTable({ header, rows }: Grid): string {
  const row = (cells: string[], tag: "th" | "td") =>
    `<tr>${cells.map((cell) => `<${tag}>${inlineHtml(cell)}</${tag}>`).join("")}</tr>`;
  const [first = [], ...rest] = rows;
  const head = header ? `<thead>${row(first, "th")}</thead>` : "";
  const body = (header ? rest : rows).map((cells) => row(cells, "td")).join("");
  return `<table>${head}${body ? `<tbody>${body}</tbody>` : ""}</table>`;
}

/**
 * A table (2.5): a text field per cell, a header row or none, and rows and columns added or
 * removed at the end; each change one undo step.
 */
function TableFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const item = contents(block)[0];
  const grid = readTable(item?.text ?? "");
  const save = (next: Grid) => setItem(block, item, "text", writeTable(next), editor);
  const change = (next: Grid) => editor.dispatch(save(next));
  const columns = grid.rows[0]?.length ?? 1;
  return (
    <div className="be-table">
      <Switch isSelected={grid.header} onChange={(header) => change({ ...grid, header })}>
        {t("table.header")}
      </Switch>
      {/* biome-ignore lint/a11y/useSemanticElements: the cells are text fields, not table data. */}
      <div role="group" aria-label={t("table.cells")} className="be-table-grid">
        {grid.rows.map((cells, r) => (
          <div key={`row-${r}`} className="be-table-row">
            {cells.map((cell, c) => (
              <DraftField
                key={`cell-${r}-${c}`}
                label={t(r === 0 && grid.header ? "table.headerCell" : "table.cell", {
                  row: r + 1,
                  column: c + 1,
                })}
                hideLabel
                value={cell}
                command={(text) =>
                  save({
                    ...grid,
                    rows: grid.rows.map((other, i) =>
                      i === r ? other.map((old, j) => (j === c ? text : old)) : other,
                    ),
                  })
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="be-table-actions">
        <Button onPress={() => change({ ...grid, rows: [...grid.rows, Array(columns).fill("")] })}>
          {t("table.addRow")}
        </Button>
        <Button onPress={() => change({ ...grid, rows: grid.rows.map((cells) => [...cells, ""]) })}>
          {t("table.addColumn")}
        </Button>
        <Button
          isDisabled={grid.rows.length <= 1}
          onPress={() => change({ ...grid, rows: grid.rows.slice(0, -1) })}
        >
          {t("table.removeRow")}
        </Button>
        <Button
          isDisabled={columns <= 1}
          onPress={() => change({ ...grid, rows: grid.rows.map((cells) => cells.slice(0, -1)) })}
        >
          {t("table.removeColumn")}
        </Button>
      </div>
    </div>
  );
}

/** Images: the picture and, but for a banner, its caption or text. */
function ImageFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const caption = block.variant === "centered" || block.variant === "full-width";
  return (
    <>
      <BlockImage block={block} editor={editor} label="image.image" />
      {block.variant !== "banner" && (
        <ItemText
          block={block}
          editor={editor}
          item={contents(block)[0]}
          label={t(caption ? "field.caption" : "field.text")}
        />
      )}
    </>
  );
}

function GalleryFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const name = (number: number) => t("items.image", { number });
  return (
    <Items
      block={block}
      editor={editor}
      name={name}
      sample={() => ({ text: `<p>${inlineHtml(t("sample.caption"))}</p>` })}
    >
      {(item) => (
        <>
          <ItemImage item={item} editor={editor} label={t("image.image")} />
          <ItemText block={block} editor={editor} item={item} label={t("field.caption")} />
        </>
      )}
    </Items>
  );
}

// ---------------------------------------------------------------------------------------------
// Sample content and the types

const para = (t: Translate, key: StringKey) => `<p>${inlineHtml(t(key))}</p>`;
const sampleQuote = (t: Translate): Partial<ContentItem> => ({
  text: para(t, "sample.quote"),
  title: inlineHtml(t("sample.quoteName")),
});

/** A new block of a category and variant, with its items made from `items`. */
const make =
  (category: Block["category"], variant: string, items: (t: Translate) => Partial<ContentItem>[]) =>
  (id: () => string, t: Translate): Block => ({
    id: id(),
    category,
    variant,
    ...(items(t).length > 0 && {
      items: items(t).map((item) => ({ ...item, id: id(), kind: "content" as const })),
    }),
  });

const type = (
  group: BlockType["group"],
  variant: string,
  label: StringKey,
  parts: Pick<BlockType, "create" | "Fields" | "Format" | "switchable">,
): BlockType => ({ group, variant, label, ...parts });

/** The text blocks' own format options, for the five types M2-10 brought (blocks.tsx). */
export const TEXT_FORMAT: ComponentType<FieldsProps> = TextFormat;

const sampleTable = (t: Translate) =>
  writeTable({
    header: true,
    rows: [
      [t("sample.tableHead1"), t("sample.tableHead2")],
      [t("sample.tableCell1"), t("sample.tableCell2")],
      [t("sample.tableCell3"), t("sample.tableCell4")],
    ],
  });

/** Columns and tables: after the five text blocks. */
export const MORE_TEXT_TYPES: readonly BlockType[] = [
  type("text", "columns", "variant.text.columns", {
    create: make("text", "columns", (t) => [
      { text: para(t, "sample.column") },
      { text: para(t, "sample.column") },
    ]),
    Fields: ColumnsFields,
    Format: ColumnsFormat,
  }),
  type("text", "table", "variant.text.table", {
    create: make("text", "table", (t) => [{ text: sampleTable(t) }]),
    Fields: TableFields,
    Format: tableFormat,
  }),
];

export const STATEMENT_TYPES: readonly BlockType[] = (
  [
    ["statement-a", "variant.statement.a"],
    ["statement-b", "variant.statement.b"],
    ["statement-c", "variant.statement.c"],
    ["statement-d", "variant.statement.d"],
    ["note", "variant.statement.note"],
  ] as const
).map(([variant, label]) =>
  type("statement", variant, label, {
    create: make("statement", variant, (t) => [
      { text: para(t, variant === "note" ? "sample.note" : "sample.statement") },
    ]),
    Fields: StatementFields,
    Format: StatementFormat,
    switchable: true,
  }),
);

export const QUOTE_TYPES: readonly BlockType[] = (
  [
    ["quote-a", "variant.quote.a"],
    ["quote-b", "variant.quote.b"],
    ["quote-c", "variant.quote.c"],
    ["quote-d", "variant.quote.d"],
    ["on-image", "variant.quote.on-image"],
    ["carousel", "variant.quote.carousel"],
  ] as const
).map(([variant, label]) =>
  type("quote", variant, label, {
    create: make("quote", variant, (t) =>
      variant === "carousel" ? [sampleQuote(t), sampleQuote(t), sampleQuote(t)] : [sampleQuote(t)],
    ),
    Fields: QuoteFields,
    Format: QuoteFormat,
    switchable: true,
  }),
);

export const LIST_TYPES: readonly BlockType[] = (["numbered", "bulleted", "checkbox"] as const).map(
  (variant) =>
    type("list", variant, `variant.list.${variant}`, {
      create: make("list", variant, (t) =>
        (["sample.listItem1", "sample.listItem2", "sample.listItem3"] as const).map((key) => ({
          text: para(t, key),
        })),
      ),
      Fields: ListFields,
      Format: ListFormat,
      switchable: true,
    }),
);

export const IMAGE_TYPES: readonly BlockType[] = (
  ["centered", "full-width", "image-text", "text-on-image", "banner"] as const
).map((variant) =>
  type("image", variant, `variant.image.${variant}`, {
    // A new image block has no picture yet: it waits for the media library (M2-13).
    create: make("image", variant, (t) =>
      variant === "banner"
        ? []
        : [
            {
              text: para(
                t,
                variant === "image-text" || variant === "text-on-image"
                  ? "sample.imageText"
                  : "sample.caption",
              ),
            },
          ],
    ),
    Fields: ImageFields,
    Format: ImageFormat,
    switchable: true,
  }),
);

export const GALLERY_TYPES: readonly BlockType[] = (
  ["carousel", "grid-2", "grid-3", "grid-4"] as const
).map((variant) =>
  type("gallery", variant, `variant.gallery.${variant}`, {
    create: make("gallery", variant, (t) =>
      [1, 2, 3].map(() => ({ text: para(t, "sample.caption") })),
    ),
    Fields: GalleryFields,
    Format: galleryFormat,
    switchable: true,
  }),
);

export const DIVIDER_TYPES: readonly BlockType[] = (["line", "numbered", "spacer"] as const).map(
  (variant) =>
    type("divider", variant, `variant.divider.${variant}`, {
      create: (id) => ({ id: id(), category: "divider", variant }),
      ...(variant === "numbered" && { Format: DividerFormat }),
      switchable: true,
    }),
);
