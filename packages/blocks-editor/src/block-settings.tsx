// The settings every block shares (blocks-editor.md L9, L10, 2.4, W10, W11; rise.md 3D): the style
// menu (background colour and its text contrast) and the format menu (padding, content width and
// the entrance animation). Each change is one doc-ops command, so one undo step; the preview shows
// it in the real player.
import type { Editor } from "@course-suite/doc-ops";
import type { Block, BlockSettings } from "@course-suite/format";
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

/** Background swatches (2.4): a fixed colour for each, none for light, the default. */
const SWATCHES = {
  light: undefined,
  gray: "#eef0f3",
  dark: "#2b3038",
  black: "#000000",
} as const;
type Background = keyof typeof SWATCHES | "theme" | "tint" | "custom" | "image";
/** Swatches that need the course theme (M2-17) or images (M2-13). */
const LATER = ["theme", "tint", "image"];
const COLOR = /^#[0-9a-f]{6}$/;

/** UI-BLOCKS-EDITOR-R18: padding is 30 px top and bottom, linked, from 0 to 200 px. */
export const PADDING = { top: 30, bottom: 30, max: 200 };
/** The padding presets; the spec leaves their values open (open question 1). */
const PRESETS = { small: 15, medium: 30, large: 60 } as const;

/** New settings, where undefined leaves a setting out (back at its default). */
type Settings = { [K in keyof BlockSettings]?: BlockSettings[K] | undefined };

/**
 * Gives focus back to a menu's button when the menu closes. In a list row, the list would take it
 * to the row instead: the row first, then the button (see outline.tsx AfterRender).
 */
function useReturnFocus() {
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

/** Changes a block's settings, leaving out what is back at its default. */
function useSettings(editor: Editor, block: Block) {
  const settings = block.settings ?? {};
  return {
    settings,
    change(next: Settings) {
      const kept = Object.fromEntries(
        Object.entries(next).filter(([, value]) => value !== undefined),
      ) as BlockSettings;
      editor.dispatch(
        Object.keys(kept).length > 0
          ? { type: "updateBlock", id: block.id, set: { settings: kept } }
          : { type: "updateBlock", id: block.id, unset: ["settings"] },
      );
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

/** The style menu (L9, W10): the block's background, and for a custom colour, its text. */
export function StyleMenu({ editor, block }: { editor: Editor; block: Block }) {
  const t = useStrings();
  const { settings, change } = useSettings(editor, block);
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
    { id: "image", label: t("style.image"), later: t("style.imageLater") },
  ];
  const setBackground = (id: Background) => {
    if (id === chosen) return;
    if (id === "custom") {
      change({ ...settings, background: { kind: "color", color } });
      return;
    }
    const swatch = SWATCHES[id as keyof typeof SWATCHES];
    // A swatch picks its text automatically; a fixed text choice belongs to a custom colour.
    change({
      ...settings,
      background: swatch ? { kind: "color", color: swatch } : undefined,
      textContrast: undefined,
    });
  };
  const trigger = useReturnFocus();
  const keepColor = () => {
    const value = typed.trim().toLowerCase();
    if (COLOR.test(value) && value !== color) {
      change({ ...settings, background: { kind: "color", color: value } });
    }
  };
  return (
    <DialogTrigger onOpenChange={trigger.onOpenChange}>
      <IconButton id={trigger.id} icon="style" label={t("style.title")} data-part="style" />
      <Popover label={t("style.title")} placement="bottom end">
        <div className="be-settings">
          <Select
            label={t("style.background")}
            items={options}
            selectedKey={chosen}
            disabledKeys={LATER}
            onSelectionChange={(key) => setBackground(key as Background)}
          >
            {(option) => (
              <ListBoxItem id={option.id} {...(option.later && { description: option.later })}>
                {option.label}
              </ListBoxItem>
            )}
          </Select>
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
                  change({
                    ...settings,
                    textContrast: key === "auto" ? undefined : (key as "light" | "dark"),
                  })
                }
              >
                <ListBoxItem id="auto">{t("style.contrastAuto")}</ListBoxItem>
                <ListBoxItem id="light">{t("style.contrastLight")}</ListBoxItem>
                <ListBoxItem id="dark">{t("style.contrastDark")}</ListBoxItem>
              </Select>
            </>
          )}
        </div>
      </Popover>
    </DialogTrigger>
  );
}

/** The format menu (L10, W11): padding presets or exact values, content width, animation. */
export function FormatMenu({ editor, block }: { editor: Editor; block: Block }) {
  const t = useStrings();
  const { settings, change } = useSettings(editor, block);
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
      ...settings,
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
  // Full-width images span the page whatever the width (UI-BLOCKS-EDITOR-R27).
  const fullImage = block.category === "image" && block.variant === "full-width";
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
                  ...settings,
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
                ...settings,
                entranceAnimation: on === (block.category !== "text") ? undefined : on,
              })
            }
          >
            {t("format.animation")}
          </Switch>
        </div>
      </Popover>
    </DialogTrigger>
  );
}
