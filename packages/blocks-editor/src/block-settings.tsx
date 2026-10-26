// The settings every block shares (blocks-editor.md L9, L10, 2.4, W10, W11; rise.md 3D): the style
// menu (background colour and its text contrast, white cards, the accent colour) and the format
// menu (padding, content width, the entrance animation, and in a microlearning the step it shows
// in). Each change is one doc-ops command list, so one undo step; the block's preview shows it.
import type { Command, Editor } from "@course-suite/doc-ops";
import {
  accentReadable,
  type Block,
  type BlockSettings,
  FULL_BLEED,
  SURFACE,
} from "@course-suite/format";
import {
  Button,
  DialogTrigger,
  IconButton,
  ListBoxItem,
  Popover,
  Select,
  SliderField,
  Switch,
  TextField,
  useStrings,
} from "@course-suite/ui";
import { useEffect, useId, useState } from "react";
import { typeOf } from "./blocks.js";
import { MediaDrop } from "./intake.js";

/** Background swatches (2.4): a fixed colour for each, none for light, the default. */
const SWATCHES = {
  light: undefined,
  gray: "#eef0f3",
  dark: "#2b3038",
  black: "#000000",
} as const;
type Background = keyof typeof SWATCHES | "theme" | "tint" | "custom" | "image";
/** Swatches that need the course theme (M2-17). */
const LATER = ["theme", "tint"];
const COLOR = /^#[0-9a-f]{6}$/;

/** UI-BLOCKS-EDITOR-R18: padding is 30 px top and bottom, linked, from 0 to 200 px. */
export const PADDING = { top: 30, bottom: 30, max: 200 };
/** The padding presets; the spec leaves their values open (open question 1). */
const PRESETS = { small: 15, medium: 30, large: 60 } as const;

/** New settings, where undefined leaves a setting out (back at its default). */
export type Settings = { [K in keyof BlockSettings]?: BlockSettings[K] | undefined };

/** The command that gives `block` the settings `next`, keeping its others; defaults are left out. */
export function withSettings(block: Block, next: Settings): Command {
  const kept = Object.fromEntries(
    Object.entries({ ...block.settings, ...next }).filter(([, value]) => value !== undefined),
  ) as BlockSettings;
  return Object.keys(kept).length > 0
    ? { type: "updateBlock", id: block.id, set: { settings: kept } }
    : { type: "updateBlock", id: block.id, unset: ["settings"] };
}

/**
 * Gives focus back to a menu's button when the menu closes. In a list row, the list would take it
 * to the row instead: the row first, then the button (see outline.tsx AfterRender).
 */
export function useReturnFocus() {
  const id = useId();
  return {
    id,
    onOpenChange(open: boolean) {
      if (open) return;
      requestAnimationFrame(() => {
        const button = document.getElementById(id);
        if (!button || document.activeElement === button) return;
        button.closest<HTMLElement>("[role=row]")?.focus();
        button.focus();
      });
    },
  };
}

function backgroundOf(settings: BlockSettings): Background {
  const background = settings.background;
  if (background?.kind === "image") return "image";
  if (background?.kind !== "color") return "light";
  const swatch = Object.entries(SWATCHES).find(([, color]) => color === background.color);
  return (swatch?.[0] as Background | undefined) ?? "custom";
}

/**
 * A block's background (2.4, W10): a swatch or a custom colour with its text, which may then be
 * fixed light or dark, or an image with a light or dark overlay (M2-13). `onChange` gets the new
 * background settings, and the commands that add a new image's media index entry; the manage-blocks
 * list gives them to every selected block at once (L16, W13 step 4).
 */
export function BackgroundFields({
  settings,
  onChange,
}: {
  settings: BlockSettings;
  onChange: (next: Settings, media?: Command[]) => void;
}) {
  const t = useStrings();
  const chosen = backgroundOf(settings);
  // A custom colour starts from the block's own one, or a colour no swatch has.
  const color =
    chosen === "custom" && settings.background?.kind === "color"
      ? settings.background.color
      : "#2f6f9f";
  const [typed, setTyped] = useState(color);
  useEffect(() => setTyped(color), [color]);
  const options: { id: Background; label: string; later?: string }[] = [
    { id: "light", label: t("style.light") },
    { id: "gray", label: t("style.gray") },
    { id: "theme", label: t("style.theme"), later: t("style.themeLater") },
    { id: "tint", label: t("style.themeTint"), later: t("style.themeLater") },
    { id: "dark", label: t("style.dark") },
    { id: "black", label: t("style.black") },
    { id: "custom", label: t("style.custom") },
    { id: "image", label: t("style.image") },
  ];
  // Choosing "image" asks for the image first; the background changes once there is one.
  const [picking, setPicking] = useState(false);
  const setBackground = (id: Background) => {
    setPicking(id === "image" && chosen !== "image");
    if (id === chosen || id === "image") return;
    if (id === "custom") {
      onChange({ background: { kind: "color", color } });
      return;
    }
    const swatch = SWATCHES[id as keyof typeof SWATCHES];
    // A swatch picks its text automatically; a fixed text choice belongs to a custom colour.
    onChange({
      background: swatch ? { kind: "color", color: swatch } : undefined,
      textContrast: undefined,
    });
  };
  const keepColor = () => {
    const value = typed.trim().toLowerCase();
    if (COLOR.test(value) && value !== color) {
      onChange({ background: { kind: "color", color: value } });
    }
  };
  return (
    <>
      <Select
        label={t("style.background")}
        items={options}
        selectedKey={picking ? "image" : chosen}
        disabledKeys={LATER}
        onSelectionChange={(key) => setBackground(key as Background)}
      >
        {(option) => (
          <ListBoxItem id={option.id} {...(option.later && { description: option.later })}>
            {option.label}
          </ListBoxItem>
        )}
      </Select>
      {(picking || chosen === "image") && (
        <ImageBackground
          settings={settings}
          onChange={(next, media) => {
            setPicking(false);
            onChange(next, media);
          }}
        />
      )}
      {chosen === "custom" && (
        <>
          <TextField
            label={t("style.color")}
            description={t("style.colorHelp")}
            value={typed}
            onChange={setTyped}
            onBlur={keepColor}
            onKeyDown={(event) => {
              if (event.key === "Enter") keepColor();
              else event.continuePropagation();
            }}
            isInvalid={!COLOR.test(typed.trim().toLowerCase())}
            errorMessage={t("style.colorError")}
          />
          <Select
            label={t("style.contrast")}
            selectedKey={settings.textContrast ?? "auto"}
            onSelectionChange={(key) =>
              onChange({ textContrast: key === "auto" ? undefined : (key as "light" | "dark") })
            }
          >
            <ListBoxItem id="auto">{t("style.contrastAuto")}</ListBoxItem>
            <ListBoxItem id="light">{t("style.contrastLight")}</ListBoxItem>
            <ListBoxItem id="dark">{t("style.contrastDark")}</ListBoxItem>
          </Select>
        </>
      )}
    </>
  );
}

/**
 * An image behind the block (2.4, W10, UI-BLOCKS-EDITOR-R22; M2-13): the image, which is
 * decoration, and a light or dark overlay with its opacity (dark at 50 % unless set). A dark overlay
 * makes the block's text light and a light one dark.
 */
function ImageBackground({
  settings,
  onChange,
}: {
  settings: BlockSettings;
  onChange: (next: Settings, media?: Command[]) => void;
}) {
  const t = useStrings();
  const background = settings.background?.kind === "image" ? settings.background : undefined;
  const opacity = background?.opacity ?? 50;
  const [live, setLive] = useState(opacity);
  useEffect(() => setLive(opacity), [opacity]);
  return (
    <>
      <MediaDrop
        kind="image"
        label={t(background ? "media.replaceImage" : "media.chooseImage")}
        onAdded={([added]) =>
          added &&
          onChange(
            {
              background: {
                overlay: "dark",
                opacity: 50,
                ...background,
                kind: "image",
                image: { key: added.key, alt: "" },
              },
              textContrast: undefined,
            },
            added.commands,
          )
        }
      />
      {background && (
        <>
          <Select
            label={t("style.overlay")}
            selectedKey={background.overlay ?? "dark"}
            onSelectionChange={(key) =>
              onChange({ background: { ...background, overlay: key as "light" | "dark" } })
            }
          >
            <ListBoxItem id="dark">{t("style.overlayDark")}</ListBoxItem>
            <ListBoxItem id="light">{t("style.overlayLight")}</ListBoxItem>
          </Select>
          <SliderField
            label={t("style.overlayOpacity")}
            unit="%"
            minValue={0}
            maxValue={100}
            value={live}
            onChange={setLive}
            onChangeEnd={(next) => onChange({ background: { ...background, opacity: next } })}
          />
        </>
      )}
    </>
  );
}

/**
 * The style menu (L9, W10): the block's background; for a block with item cards whether they stay
 * white (on by default); and its accent colour (rise.md 3D, BLK-03), which the player uses only
 * where it keeps 4.5:1 on the block's surface, with white or black text on it.
 */
export function StyleMenu({ editor, block }: { editor: Editor; block: Block }) {
  const t = useStrings();
  const settings = block.settings ?? {};
  const change = (next: Settings, media: Command[] = []) =>
    editor.dispatch([...media, withSettings(block, next)]);
  const accent = settings.accentColor ?? "";
  const [typed, setTyped] = useState(accent);
  useEffect(() => setTyped(accent), [accent]);
  const value = typed.trim().toLowerCase();
  const surface = settings.background?.kind === "color" ? settings.background.color : SURFACE;
  const keepAccent = () => {
    if (value !== accent && (value === "" || COLOR.test(value))) {
      change({ accentColor: value || undefined });
    }
  };
  const trigger = useReturnFocus();
  return (
    <DialogTrigger onOpenChange={trigger.onOpenChange}>
      <IconButton id={trigger.id} icon="style" label={t("style.title")} data-part="style" />
      <Popover label={t("style.title")} placement="bottom end">
        <div className="be-settings">
          <BackgroundFields settings={settings} onChange={change} />
          {typeOf(block)?.cards && (
            <Switch
              isSelected={settings.cardStyle !== "transparent"}
              onChange={(white) => change({ cardStyle: white ? undefined : "transparent" })}
            >
              {t("style.cards")}
            </Switch>
          )}
          <TextField
            label={t("style.accent")}
            description={t("style.accentHelp")}
            value={typed}
            onChange={setTyped}
            onBlur={keepAccent}
            onKeyDown={(event) => {
              if (event.key === "Enter") keepAccent();
              else event.continuePropagation();
            }}
            isInvalid={value !== "" && (!COLOR.test(value) || !accentReadable(value, surface))}
            errorMessage={t(COLOR.test(value) ? "style.accentUnreadable" : "style.colorError")}
          />
        </div>
      </Popover>
    </DialogTrigger>
  );
}

/**
 * The format menu (L10, W11): padding presets or exact values, content width, animation; in a
 * microlearning, whether the block shows in one step with the next (BLK-03, rise.md 3D), which
 * `next` (there is a block after it) allows.
 */
export function FormatMenu({
  editor,
  block,
  next = false,
}: {
  editor: Editor;
  block: Block;
  next?: boolean;
}) {
  const t = useStrings();
  const settings = block.settings ?? {};
  const change = (changed: Settings) => editor.dispatch(withSettings(block, changed));
  const padding = settings.padding ?? { top: PADDING.top, bottom: PADDING.bottom };
  const linked = padding.linked !== false;
  const [more, setMore] = useState(false);
  // While a slider moves, the number shows at once; the block changes when the move ends.
  const [live, setLive] = useState(padding);
  useEffect(
    () => setLive({ top: padding.top, bottom: padding.bottom }),
    [padding.top, padding.bottom],
  );
  const setPadding = (top: number, bottom: number, link = linked) =>
    change({
      padding:
        top === PADDING.top && bottom === PADDING.bottom && link
          ? undefined
          : { top, bottom, ...(!link && { linked: false }) },
    });
  const side = (which: "top" | "bottom") => (
    <SliderField
      label={t(which === "top" ? "format.top" : "format.bottom")}
      unit={t("format.pixels")}
      minValue={0}
      maxValue={PADDING.max}
      value={live[which]}
      onChange={(value) =>
        setLive(linked ? { top: value, bottom: value } : { ...live, [which]: value })
      }
      onChangeEnd={(value) =>
        linked
          ? setPadding(value, value)
          : setPadding(which === "top" ? value : live.top, which === "bottom" ? value : live.bottom)
      }
    />
  );
  // Full-bleed variants span the page whatever the width (UI-BLOCKS-EDITOR-R27).
  const fullImage = FULL_BLEED.has(`${block.category}/${block.variant}`);
  const Own = typeOf(block)?.Format;
  // rise.md 3D: the entrance animation is on by default for blocks other than text.
  const animates = settings.entranceAnimation ?? block.category !== "text";
  const trigger = useReturnFocus();
  return (
    <DialogTrigger onOpenChange={trigger.onOpenChange}>
      <IconButton id={trigger.id} icon="format" label={t("format.title")} data-part="format" />
      <Popover label={t("format.title")} placement="bottom end">
        <div className="be-settings">
          {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout. */}
          <div role="group" aria-label={t("format.paddingSize")} className="be-presets">
            <span className="cs-Label" aria-hidden="true">
              {t("format.padding")}
            </span>
            <div className="be-preset-buttons">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((preset) => {
                const value = PRESETS[preset];
                const on = padding.top === value && padding.bottom === value;
                return (
                  <Button
                    key={preset}
                    variant={on ? "primary" : "secondary"}
                    aria-pressed={on}
                    onPress={() => setPadding(value, value)}
                  >
                    {t(`format.${preset}`)}
                  </Button>
                );
              })}
            </div>
          </div>
          <Button variant="quiet" aria-expanded={more} onPress={() => setMore(!more)}>
            {t("format.more")}
          </Button>
          {more && (
            <>
              {side("top")}
              {side("bottom")}
              <Switch
                isSelected={linked}
                onChange={(link) =>
                  setPadding(padding.top, link ? padding.top : padding.bottom, link)
                }
              >
                {t("format.linked")}
              </Switch>
            </>
          )}
          {!fullImage && (
            <Select
              label={t("format.width")}
              selectedKey={settings.contentWidth ?? "medium"}
              onSelectionChange={(key) =>
                change({
                  contentWidth:
                    key === "medium" ? undefined : (key as BlockSettings["contentWidth"]),
                })
              }
            >
              <ListBoxItem id="narrow">{t("format.narrow")}</ListBoxItem>
              <ListBoxItem id="medium">{t("format.widthMedium")}</ListBoxItem>
              <ListBoxItem id="wide">{t("format.wide")}</ListBoxItem>
              <ListBoxItem id="full">{t("format.full")}</ListBoxItem>
            </Select>
          )}
          <Switch
            isSelected={animates}
            onChange={(on) =>
              change({
                entranceAnimation: on === (block.category !== "text") ? undefined : on,
              })
            }
          >
            {t("format.animation")}
          </Switch>
          {editor.document.kind === "microlearning" && (
            <Switch
              isSelected={settings.connectToNext === true}
              isDisabled={!next && settings.connectToNext !== true}
              onChange={(on) => change({ connectToNext: on || undefined })}
              aria-describedby={`${trigger.id}-connect`}
            >
              {t("format.connect")}
            </Switch>
          )}
          {editor.document.kind === "microlearning" && (
            <p id={`${trigger.id}-connect`} className="be-note">
              {t("format.connectHelp")}
            </p>
          )}
          {Own && <Own block={block} editor={editor} />}
        </div>
      </Popover>
    </DialogTrigger>
  );
}
