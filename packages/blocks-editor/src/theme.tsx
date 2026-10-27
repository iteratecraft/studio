// The theme panel (BLK-09, ENG-08; blocks-editor.md T1 to T10, 2.18, W20, W21): a menu of sections,
// each edited on its own screen with save and cancel, beside the course in the real player, which
// shows every change as it is made ("previewed on selection", T3). Saving a section is one doc-ops
// command, so one undo step. Colours are checked against WCAG AA as the author picks them, with the
// nearest colour that passes on offer; automatic contrast keeps them readable in the player anyway.

import type { Command } from "@course-suite/doc-ops";
import {
  BUILTIN_FONTS,
  type Course,
  contrastOf,
  DEFAULT_HEADER_OVERLAY,
  DEFAULT_OVERLAY,
  DEFAULT_THEME_COLOR,
  FONT_PAIRINGS,
  type FontRef,
  type FontRole,
  fontsOf,
  LAYOUT_STYLES,
  type MediaEntry,
  nearestReadable,
  overlayColors,
  overlayFloor,
  THEME_COLORS,
  type Theme,
  textColor,
  themeColors,
  withLayoutStyle,
} from "@course-suite/format";
import {
  Button,
  type FontSource,
  IconButton,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  PreviewPane,
  type PreviewSource,
  Select,
  SliderField,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
  type ToastQueue,
  useAnnouncer,
  useStrings,
} from "@course-suite/ui";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FontManager } from "./font-manager.js";
import { type FontLibrary, registerFont } from "./fonts.js";
import type { CourseSession } from "./session.js";
import { CropButton, ThemePictureField } from "./theme-images.js";

type Section = "layout" | "cover" | "headers" | "colors" | "fonts" | "blocks";
const COLOR = /^#[0-9a-f]{6}$/;

/** Settings where undefined leaves one out (back at its default); `cleaned` drops them. */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };
type Cover = NonNullable<Theme["cover"]>;
type Headers = NonNullable<Theme["headers"]>;

const NO_MEDIA: MediaEntry[] = [];

/** The media keys the theme's own pictures use. */
const themeKeys = (theme: Theme | undefined) =>
  [theme?.cover?.logo?.key, theme?.headers?.image?.key].filter((key) => key !== undefined);

/**
 * The course with the theme being edited, and the media entries of pictures chosen for it and not
 * yet saved, for the preview; and its change events.
 */
class DraftSource implements PreviewSource {
  readonly #session: CourseSession;
  #theme: Theme | undefined | null = null;
  #media: MediaEntry[] = [];
  readonly #listeners = new Set<(event: { document: PreviewSource["document"] }) => void>();

  constructor(session: CourseSession) {
    this.#session = session;
  }

  get document(): Course {
    const course = this.#session.editor.document;
    if (this.#theme === null) return course;
    const { theme: _, ...rest } = course;
    const known = new Set(course.media.map((media) => media.key));
    const added = this.#media.filter((media) => !known.has(media.key));
    const withMedia = added.length > 0 ? { ...rest, media: [...rest.media, ...added] } : rest;
    return this.#theme ? { ...withMedia, theme: this.#theme } : withMedia;
  }

  /**
   * Shows `theme` in the preview, with the new pictures in `media`; `null` shows the course's own.
   * Nothing new, nothing to do.
   */
  show(theme: Theme | undefined | null, media: MediaEntry[] = NO_MEDIA) {
    const sameMedia =
      media.length === this.#media.length && media.every((entry, i) => entry === this.#media[i]);
    // A reload for nothing would swap the frame under the author (and under a test).
    if (sameMedia && JSON.stringify(theme) === JSON.stringify(this.#theme)) return;
    this.#theme = theme;
    this.#media = media;
    this.refresh();
  }

  /** Shows the course again, such as after a change of a font it uses. */
  refresh() {
    for (const listener of [...this.#listeners]) listener({ document: this.document });
  }

  subscribe(listener: (event: { document: PreviewSource["document"] }) => void) {
    this.#listeners.add(listener);
    const stop = this.#session.editor.subscribe(() => listener({ document: this.document }));
    return () => {
      this.#listeners.delete(listener);
      stop();
    };
  }
}

/** A theme without unset values and empty groups; undefined when nothing is left. */
function cleaned(theme: Loose<Theme>): Theme | undefined {
  const clean = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([, item]) =>
          item !== undefined &&
          !(typeof item === "object" && item !== null && Object.keys(item).length === 0),
      ),
    );
  const result = clean({
    ...theme,
    ...(theme.cover && { cover: clean(theme.cover) }),
    ...(theme.headers && { headers: clean(theme.headers) }),
    ...(theme.fonts && { fonts: clean(theme.fonts) }),
  });
  return Object.keys(result).length > 0 ? (result as Theme) : undefined;
}

export function ThemeView({
  session,
  library,
  fonts,
  media,
  toasts,
  onClose,
}: {
  session: CourseSession;
  library: FontLibrary;
  fonts: FontSource;
  media: (key: string) => Promise<Uint8Array | undefined>;
  toasts: ToastQueue;
  onClose: () => void;
}) {
  const t = useStrings();
  const { editor } = session;
  const course = editor.document;
  const [source] = useState(() => new DraftSource(session));
  const [section, setSection] = useState<Section>();
  const [draft, setDraft] = useState<Theme>({});
  // Pictures chosen in this panel: their media index entries go in with the theme that uses them.
  const [added, setAdded] = useState<MediaEntry[]>([]);
  const { region, announce } = useAnnouncer();
  const heading = useRef<HTMLHeadingElement>(null);
  const back = useRef<Section>(undefined);
  useSyncExternalStore(
    (listener) => library.subscribe(listener),
    () => library.version,
  );

  useEffect(() => {
    heading.current?.focus();
    // On the menu, focus goes back to the section just left.
    if (!section && back.current) {
      document.querySelector<HTMLElement>(`[data-section="${back.current}"]`)?.focus();
    }
  }, [section]);
  useEffect(() => () => source.show(null), [source]);
  // A change of a library font the course shows reaches the preview (UI-BLOCKS-EDITOR-R48).
  useEffect(
    () =>
      library.subscribe(() => {
        const fonts = Object.values(fontsOf(source.document.theme));
        if (fonts.some((font) => font.kind === "custom")) source.refresh();
      }),
    [library, source],
  );

  const change = (next: Loose<Theme>, picture?: MediaEntry) => {
    // One entry per file, however often it is chosen.
    const media =
      picture && !added.some((entry) => entry.key === picture.key) ? [...added, picture] : added;
    if (picture) setAdded(media);
    setDraft(next as Theme);
    source.show(cleaned(next), media);
  };
  /** The media index entry of a picture: the course's, or one chosen in this panel. */
  const entryOf = (key: string | undefined) =>
    key === undefined
      ? undefined
      : (course.media.find((media) => media.key === key) ??
        added.find((media) => media.key === key));
  const open = (next: Section) => {
    setDraft(course.theme ?? {});
    setSection(next);
  };
  const leave = () => {
    back.current = section;
    source.show(null);
    setSection(undefined);
  };
  const save = () => {
    const theme = cleaned(draft);
    const same = JSON.stringify(theme) === JSON.stringify(course.theme);
    if (!same) {
      // A new picture's media index entry and the theme that uses it: one undo step.
      const known = new Set(course.media.map((media) => media.key));
      const used = new Set(themeKeys(theme));
      const pictures: Command[] = added
        .filter((entry) => used.has(entry.key) && !known.has(entry.key))
        .map((value) => ({ type: "insertMedia", value }));
      editor.dispatch([
        ...pictures,
        theme
          ? { type: "updateCourse", set: { theme } }
          : { type: "updateCourse", unset: ["theme"] },
      ]);
    }
    if (section) announce(t("theme.saved", { section: t(`theme.section.${section}`) }));
    leave();
  };

  const sections: Section[] = [
    "layout",
    "cover",
    // Lesson headers belong to courses only (blocks-editor.md 2.18).
    ...(course.kind === "course" ? (["headers"] as const) : []),
    "colors",
    "fonts",
    "blocks",
  ];
  const theme = course.theme;
  const resolved = library.resolve(theme);
  const fontName = (font: FontRef | undefined) =>
    !font
      ? t("theme.fonts.deviceOne")
      : font.kind === "builtin"
        ? (BUILTIN_FONTS.find((f) => f.id === font.id)?.name ?? font.id)
        : (library.find(font.id)?.name ?? font.name);
  const summary: Record<Section, string> = {
    layout: t(`theme.layout.${theme?.layout ?? "classic"}`),
    cover: t(`theme.cover.${theme?.cover?.layout ?? "split-left"}`),
    headers: theme?.headers?.hidden
      ? t("theme.off")
      : t(headerLabel(theme?.headers?.layout ?? "light")),
    colors: theme?.color ?? DEFAULT_THEME_COLOR,
    fonts:
      resolved.heading || resolved.body
        ? t("theme.fonts.pairing", {
            heading: fontName(resolved.heading),
            body: fontName(resolved.body),
          })
        : t("theme.fonts.device"),
    blocks: t(theme?.animations === false ? "theme.off" : "theme.on"),
  };

  return (
    <main className="be-theme">
      <aside className="be-theme-panel" aria-labelledby="be-theme-heading">
        {section ? (
          <>
            <div className="be-theme-actions">
              <Button variant="primary" onPress={save}>
                {t("action.save")}
              </Button>
              <Button variant="quiet" onPress={leave}>
                {t("action.cancel")}
              </Button>
            </div>
            <h2 id="be-theme-heading" ref={heading} tabIndex={-1}>
              {t(`theme.section.${section}`)}
            </h2>
            <div className="be-theme-fields">
              {section === "layout" && <LayoutFields draft={draft} change={change} />}
              {section === "cover" && (
                <CoverFields draft={draft} change={change} session={session} entryOf={entryOf} />
              )}
              {section === "headers" && (
                <HeaderFields draft={draft} change={change} session={session} entryOf={entryOf} />
              )}
              {section === "colors" && <ColorFields draft={draft} change={change} />}
              {section === "fonts" && (
                <FontFields draft={draft} change={change} library={library} toasts={toasts} />
              )}
              {section === "blocks" && <BlockFields draft={draft} change={change} />}
            </div>
          </>
        ) : (
          <>
            <div className="be-theme-actions">
              <IconButton icon="back" label={t("theme.close")} onPress={onClose} />
              <h2 id="be-theme-heading" ref={heading} tabIndex={-1}>
                {t("theme.title")}
              </h2>
            </div>
            <nav aria-label={t("theme.sections")}>
              <ul className="be-theme-menu">
                {sections.map((name) => (
                  <li key={name}>
                    <Button variant="quiet" data-section={name} onPress={() => open(name)}>
                      <span className="be-theme-menu-name">{t(`theme.section.${name}`)}</span>
                      <span className="be-theme-menu-value">{summary[name]}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}
        {region}
      </aside>
      <div className="be-theme-preview">
        <PreviewPane source={source} media={media} fonts={fonts} />
      </div>
    </main>
  );
}

const headerLabel = (layout: NonNullable<NonNullable<Theme["headers"]>["layout"]>) =>
  (
    ({
      light: "style.light",
      gray: "style.gray",
      theme: "style.theme",
      tint: "style.themeTint",
      dark: "style.dark",
      black: "style.black",
      color: "style.custom",
      image: "style.image",
    }) as const
  )[layout];

interface FieldsProps {
  draft: Theme;
  change: (next: Loose<Theme>, picture?: MediaEntry) => void;
}

/** What the sections with pictures need: the course and its media entries. */
interface PictureProps {
  session: CourseSession;
  entryOf: (key: string | undefined) => MediaEntry | undefined;
}

type OverlaySetting = { color: "light" | "dark" | "theme"; opacity: number };

/**
 * The overlay over a picture behind text, with its strength, and a warning with the fix when the
 * text could drop below 4.5:1 over a light picture (rise.md rule 18).
 */
function OverlayFields({
  draft,
  overlay,
  hasImage,
  weakText,
  set,
}: {
  draft: Theme;
  overlay: OverlaySetting;
  hasImage: boolean;
  weakText: (percent: number) => string;
  set: (overlay: OverlaySetting) => void;
}) {
  const t = useStrings();
  const [opacity, setOpacity] = useState(overlay.opacity);
  useEffect(() => setOpacity(overlay.opacity), [overlay.opacity]);
  const colors = overlayColors(overlay, draft);
  const floor = overlayFloor(colors.color, colors.text);
  const weak = hasImage && floor !== undefined && overlay.opacity < floor;
  return (
    <>
      <Select
        label={t("theme.cover.overlay")}
        selectedKey={overlay.color}
        onSelectionChange={(key) => set({ ...overlay, color: key as OverlaySetting["color"] })}
      >
        <ListBoxItem id="dark">{t("style.dark")}</ListBoxItem>
        <ListBoxItem id="light">{t("style.light")}</ListBoxItem>
        <ListBoxItem id="theme">{t("style.theme")}</ListBoxItem>
      </Select>
      <SliderField
        label={t("theme.cover.opacity")}
        unit={t("theme.percent")}
        minValue={0}
        maxValue={100}
        value={opacity}
        onChange={setOpacity}
        onChangeEnd={(value) => set({ ...overlay, opacity: value })}
      />
      {weak && (
        <Warning
          text={weakText(floor)}
          action={t("theme.cover.overlayUse", { percent: floor })}
          onAction={() => set({ ...overlay, opacity: floor })}
        />
      )}
    </>
  );
}

/** T3: the three layout styles; a style sets the cover and header layouts only (R43). */
function LayoutFields({ draft, change }: FieldsProps) {
  const t = useStrings();
  const styles = Object.keys(LAYOUT_STYLES) as (keyof typeof LAYOUT_STYLES)[];
  return (
    <>
      <ListBox
        aria-label={t("theme.section.layout")}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[draft.layout ?? "classic"]}
        onSelectionChange={(keys) => {
          const [style] = [...(keys as Set<string>)];
          if (style) change(withLayoutStyle(draft, style as keyof typeof LAYOUT_STYLES));
        }}
      >
        {styles.map((style) => (
          <ListBoxItem key={style} id={style} description={t(`theme.layout.${style}Help`)}>
            {t(`theme.layout.${style}`)}
          </ListBoxItem>
        ))}
      </ListBox>
      <p className="be-note">{t("theme.layout.keeps")}</p>
    </>
  );
}

/**
 * T4: the cover layout, the crop of the cover picture and its overlay, the logo with its size and
 * square, the start button, the authors and skipping the cover.
 */
function CoverFields({ draft, change, session, entryOf }: FieldsProps & PictureProps) {
  const t = useStrings();
  const cover = draft.cover ?? {};
  const set = (next: Loose<Cover>, picture?: MediaEntry) =>
    change({ ...draft, cover: { ...cover, ...next } as Cover }, picture);
  const layout = cover.layout ?? "split-left";
  const picture = session.editor.document.cover;
  const pictureEntry = entryOf(picture?.key);
  // A crop made for another picture no longer applies (cropOf).
  const crop = cover.crop?.key === picture?.key ? cover.crop : undefined;
  return (
    <>
      <Select
        label={t("theme.cover.layout")}
        selectedKey={layout}
        onSelectionChange={(key) =>
          set({ layout: key as NonNullable<NonNullable<Theme["cover"]>["layout"]> })
        }
      >
        {(["split-left", "split-right", "full-image", "plain"] as const).map((id) => (
          <ListBoxItem key={id} id={id}>
            {t(`theme.cover.${id}`)}
          </ListBoxItem>
        ))}
      </Select>
      {picture && layout !== "plain" && (
        <CropButton
          session={session}
          entry={pictureEntry}
          crop={crop}
          label={t("theme.cover.crop")}
          onCrop={(next) => set({ crop: next && { ...next, key: picture.key } })}
        />
      )}
      {layout === "full-image" && (
        <OverlayFields
          draft={draft}
          overlay={cover.overlay ?? DEFAULT_OVERLAY}
          hasImage={picture !== undefined}
          weakText={(percent) => t("theme.cover.overlayWeak", { percent })}
          set={(overlay) => set({ overlay })}
        />
      )}
      <ThemePictureField
        session={session}
        label={t("theme.cover.logo")}
        image={cover.logo}
        entry={entryOf(cover.logo?.key)}
        onChange={(logo, added) => set({ logo }, added)}
      />
      {cover.logo && (
        <>
          <Select
            label={t("theme.cover.logoSize")}
            selectedKey={cover.logoSize ?? "small"}
            onSelectionChange={(key) =>
              set({ logoSize: key === "small" ? undefined : (key as "medium" | "large") })
            }
          >
            <ListBoxItem id="small">{t("theme.cover.logoSmall")}</ListBoxItem>
            <ListBoxItem id="medium">{t("theme.cover.logoMedium")}</ListBoxItem>
            <ListBoxItem id="large">{t("theme.cover.logoLarge")}</ListBoxItem>
          </Select>
          <Switch
            isSelected={cover.logoSquare === true}
            onChange={(on) => set({ logoSquare: on || undefined })}
            aria-describedby="be-cover-square"
          >
            {t("theme.cover.logoSquare")}
          </Switch>
          <p id="be-cover-square" className="be-note">
            {t("theme.cover.logoSquareHelp")}
          </p>
        </>
      )}
      <Switch
        isSelected={cover.startButton !== false}
        onChange={(on) => set({ startButton: on ? undefined : false })}
        aria-describedby="be-cover-start"
      >
        {t("theme.cover.start")}
      </Switch>
      <p id="be-cover-start" className="be-note">
        {t("theme.cover.startHelp")}
      </p>
      <Switch
        isSelected={cover.author !== false}
        onChange={(on) => set({ author: on ? undefined : false })}
        aria-describedby="be-cover-authors"
      >
        {t("theme.cover.authors")}
      </Switch>
      <p id="be-cover-authors" className="be-note">
        {t("theme.cover.authorsHelp")}
      </p>
      <Switch
        isSelected={cover.skip === true}
        onChange={(on) => set({ skip: on || undefined })}
        aria-describedby="be-cover-skip"
      >
        {t("theme.cover.skip")}
      </Switch>
      <p id="be-cover-skip" className="be-note">
        {t("theme.cover.skipHelp")}
      </p>
    </>
  );
}

/**
 * T6: hide headers (R46 greys out the rest), layout, colour and text or picture and overlay,
 * height, count, author.
 */
function HeaderFields({ draft, change, session, entryOf }: FieldsProps & PictureProps) {
  const t = useStrings();
  const headers = draft.headers ?? {};
  const set = (next: Loose<Headers>, picture?: MediaEntry) =>
    change({ ...draft, headers: { ...headers, ...next } as Headers }, picture);
  const hidden = headers.hidden === true;
  const layout = headers.layout ?? "light";
  return (
    <>
      <Switch
        isSelected={hidden}
        onChange={(on) => set({ hidden: on || undefined })}
        aria-describedby="be-headers-hide"
      >
        {t("theme.headers.hide")}
      </Switch>
      <p id="be-headers-hide" className="be-note">
        {t("theme.headers.hideHelp")}
      </p>
      <Select
        label={t("theme.headers.layout")}
        selectedKey={layout}
        isDisabled={hidden}
        onSelectionChange={(key) => {
          const next = key as NonNullable<NonNullable<Theme["headers"]>["layout"]>;
          set({
            layout: next === "light" ? undefined : next,
            ...(next === "color" && !headers.color && { color: "#2f6f9f" }),
          });
        }}
      >
        {(["light", "gray", "theme", "tint", "dark", "black", "color", "image"] as const).map(
          (id) => (
            <ListBoxItem key={id} id={id}>
              {t(headerLabel(id))}
            </ListBoxItem>
          ),
        )}
      </Select>
      {layout === "color" && !hidden && (
        <ColorWithContrast
          label={t("theme.headers.color")}
          color={headers.color ?? "#2f6f9f"}
          contrast={headers.contrast ?? "auto"}
          onColor={(color) => set({ color })}
          onContrast={(contrast) => set({ contrast: contrast === "auto" ? undefined : contrast })}
        />
      )}
      {layout === "image" && !hidden && (
        <>
          <ThemePictureField
            session={session}
            label={t("theme.headers.image")}
            image={headers.image}
            entry={entryOf(headers.image?.key)}
            onChange={(image, added) => set({ image }, added)}
          />
          <p className="be-note">{t("theme.headers.imageHelp")}</p>
          <OverlayFields
            draft={draft}
            overlay={headers.overlay ?? DEFAULT_HEADER_OVERLAY}
            hasImage={headers.image !== undefined}
            weakText={(percent) => t("theme.headers.overlayWeak", { percent })}
            set={(overlay) => set({ overlay })}
          />
        </>
      )}
      <Select
        label={t("theme.headers.height")}
        selectedKey={headers.height ?? "medium"}
        isDisabled={hidden}
        onSelectionChange={(key) =>
          set({ height: key === "medium" ? undefined : (key as "small" | "large") })
        }
      >
        <ListBoxItem id="small">{t("format.small")}</ListBoxItem>
        <ListBoxItem id="medium">{t("format.medium")}</ListBoxItem>
        <ListBoxItem id="large">{t("format.large")}</ListBoxItem>
      </Select>
      <Switch
        isSelected={headers.lessonCount !== false}
        isDisabled={hidden}
        onChange={(on) => set({ lessonCount: on ? undefined : false })}
      >
        {t("theme.headers.count")}
      </Switch>
      <Switch
        isSelected={headers.author !== false}
        isDisabled={hidden}
        onChange={(on) => set({ author: on ? undefined : false })}
      >
        {t("theme.headers.author")}
      </Switch>
    </>
  );
}

/** A colour typed as hex, with its text choice and the contrast check (UI-BLOCKS-EDITOR-R19). */
function ColorWithContrast({
  label,
  color,
  contrast,
  onColor,
  onContrast,
  children,
}: {
  label: string;
  color: string;
  contrast: "auto" | "light" | "dark";
  onColor: (color: string) => void;
  onContrast: (contrast: "auto" | "light" | "dark") => void;
  children?: ReactNode;
}) {
  const t = useStrings();
  const [typed, setTyped] = useState(color);
  useEffect(() => setTyped(color), [color]);
  const keep = () => {
    const value = typed.trim().toLowerCase();
    if (COLOR.test(value) && value !== color) onColor(value);
  };
  const text = textColor(color, contrast);
  const ratio = contrastOf(text, color);
  // The nearest colour on which the chosen text keeps 4.5:1 (WCAG 1.4.3).
  const nearest = ratio < 4.5 ? nearestReadable(color, text, 4.5) : undefined;
  const eyedropper = (
    globalThis as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }
  ).EyeDropper;
  return (
    <>
      <div className="be-theme-color">
        <span className="be-swatch" style={{ background: color }} aria-hidden="true" />
        <TextField
          label={label}
          description={t("style.colorHelp")}
          value={typed}
          onChange={setTyped}
          onBlur={keep}
          onKeyDown={(event) => {
            if (event.key === "Enter") keep();
            else event.continuePropagation();
          }}
          isInvalid={!COLOR.test(typed.trim().toLowerCase())}
          errorMessage={t("style.colorError")}
        />
        {/* UI-BLOCKS-EDITOR-R32: only where the browser has an eyedropper. */}
        {eyedropper && (
          <IconButton
            icon="style"
            label={t("theme.colors.pick")}
            onPress={() => {
              void new eyedropper()
                .open()
                .then(({ sRGBHex }) => {
                  const value = sRGBHex.toLowerCase();
                  if (COLOR.test(value)) onColor(value);
                })
                .catch(() => {});
            }}
          />
        )}
      </div>
      {children}
      <Select
        label={t("style.contrast")}
        selectedKey={contrast}
        onSelectionChange={(key) => onContrast(key as "auto" | "light" | "dark")}
      >
        <ListBoxItem id="auto">{t("style.contrastAuto")}</ListBoxItem>
        <ListBoxItem id="light">{t("style.contrastLight")}</ListBoxItem>
        <ListBoxItem id="dark">{t("style.contrastDark")}</ListBoxItem>
      </Select>
      {nearest ? (
        <Warning
          text={t("theme.colors.textFails", { ratio: ratio.toFixed(1) })}
          action={t("theme.colors.useNearest", { color: nearest })}
          onAction={() => onColor(nearest)}
        />
      ) : (
        <p className="be-note">{t("theme.colors.textPasses", { ratio: ratio.toFixed(1) })}</p>
      )}
    </>
  );
}

/** A contrast problem and the change that fixes it. */
function Warning({
  text,
  action,
  onAction,
}: {
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="be-theme-warning">
      <p>{text}</p>
      <Button onPress={onAction}>{action}</Button>
    </div>
  );
}

/** T7: the suggested theme colours or a custom one, and the contrast mode (rise.md rule 18). */
function ColorFields({ draft, change }: FieldsProps) {
  const t = useStrings();
  const color = draft.color ?? DEFAULT_THEME_COLOR;
  const colors = themeColors(draft);
  const setColor = (next: string) =>
    change({ ...draft, color: next === DEFAULT_THEME_COLOR ? undefined : next });
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout. */}
      <div role="group" aria-labelledby="be-suggested" className="be-swatches">
        <span id="be-suggested" className="cs-Label">
          {t("theme.colors.suggested")}
        </span>
        {THEME_COLORS.map((swatch) => (
          <Button
            key={swatch}
            variant={swatch === color ? "primary" : "secondary"}
            aria-pressed={swatch === color}
            onPress={() => setColor(swatch)}
          >
            <span className="be-swatch" style={{ background: swatch }} aria-hidden="true" />
            {swatch}
          </Button>
        ))}
      </div>
      <ColorWithContrast
        label={t("theme.colors.custom")}
        color={color}
        contrast={draft.contrast ?? "auto"}
        onColor={setColor}
        onContrast={(contrast) =>
          change({ ...draft, contrast: contrast === "auto" ? undefined : contrast })
        }
      >
        {colors.accent !== color && (
          <Warning
            text={t("theme.colors.accentShade", { color: colors.accent })}
            action={t("theme.colors.useNearest", { color: colors.accent })}
            onAction={() => setColor(colors.accent)}
          />
        )}
      </ColorWithContrast>
    </>
  );
}

/** T8, T9: recommended pairings, or heading, body and interface fonts, and the author's fonts. */
function FontFields({
  draft,
  change,
  library,
  toasts,
}: FieldsProps & { library: FontLibrary; toasts: ToastQueue }) {
  const t = useStrings();
  const fonts = library.resolve(draft);
  const chosen = draft.fonts ?? {};
  // The bundled fonts show in their own faces; they load when first drawn.
  useEffect(() => {
    for (const font of BUILTIN_FONTS) void registerFont({ kind: "builtin", id: font.id }, library);
  }, [library]);
  const setFonts = (next: Loose<NonNullable<Theme["fonts"]>>) =>
    change({ ...draft, fonts: next as Theme["fonts"] });
  const keyOf = (font: FontRef) =>
    font.kind === "builtin" ? `builtin:${font.id}` : `custom:${font.id}`;
  const fontOf = (key: string): FontRef | undefined => {
    const [kind, id] = key.split(":");
    if (kind === "builtin") {
      const found = BUILTIN_FONTS.find((font) => font.id === id);
      return found && { kind: "builtin", id: found.id };
    }
    const found = id === undefined ? undefined : library.find(id);
    return found && { kind: "custom", id: found.id, name: found.name };
  };
  // The device's fonts, or a recommended pairing; none of them for a mix of the author's own.
  const pairing =
    !fonts.heading && !fonts.body
      ? DEVICE
      : String(
          FONT_PAIRINGS.findIndex(
            ([heading, body]) =>
              fonts.heading?.kind === "builtin" &&
              fonts.heading.id === heading &&
              fonts.body?.kind === "builtin" &&
              fonts.body.id === body,
          ),
        );
  const name = (id: string) => BUILTIN_FONTS.find((font) => font.id === id)?.name ?? id;
  const missing = (["heading", "body", "ui"] as const).flatMap((role) => {
    const font = chosen[role];
    return font?.kind === "custom" && !library.find(font.id) ? [[role, font] as const] : [];
  });
  const menu = (role: FontRole, extra?: ReactNode) => (
    <Select
      label={t(`theme.fonts.${role}`)}
      {...(role === "ui" && { description: t("theme.fonts.uiHelp") })}
      selectedKey={role === "ui" && !chosen.ui ? "same" : fonts[role] ? keyOf(fonts[role]) : DEVICE}
      onSelectionChange={(key) => {
        const font = key === "same" || key === DEVICE ? undefined : fontOf(String(key));
        setFonts({ ...chosen, [role]: font });
      }}
    >
      {extra}
      {role !== "ui" && <ListBoxItem id={DEVICE}>{t("theme.fonts.deviceOne")}</ListBoxItem>}
      <ListBoxSection title={t("theme.fonts.bundled")}>
        {BUILTIN_FONTS.map((font) => (
          <ListBoxItem key={font.id} id={`builtin:${font.id}`}>
            {font.name}
          </ListBoxItem>
        ))}
      </ListBoxSection>
      {library.fonts.length > 0 && (
        <ListBoxSection title={t("theme.fonts.yours")}>
          {library.fonts.map((font) => (
            <ListBoxItem key={font.id} id={`custom:${font.id}`}>
              {font.name}
            </ListBoxItem>
          ))}
        </ListBoxSection>
      )}
    </Select>
  );
  return (
    <>
      {missing.map(([role, font]) => (
        <p key={role} className="be-note">
          {t("theme.fonts.missing", { name: font.name })}
        </p>
      ))}
      <Tabs>
        <TabList aria-label={t("theme.section.fonts")}>
          <Tab id="pairings">{t("theme.fonts.pairings")}</Tab>
          <Tab id="mix">{t("theme.fonts.mix")}</Tab>
        </TabList>
        <TabPanel id="pairings">
          <ListBox
            aria-label={t("theme.fonts.pairings")}
            selectionMode="single"
            selectedKeys={pairing === "-1" ? [] : [pairing]}
            onSelectionChange={(keys) => {
              const [index] = [...(keys as Set<string>)];
              if (index === DEVICE) {
                setFonts({ ...chosen, heading: undefined, body: undefined });
                return;
              }
              const chosenPair = index === undefined ? undefined : FONT_PAIRINGS[Number(index)];
              if (!chosenPair) return;
              const [heading, body] = chosenPair;
              // A pairing sets heading and body; the interface keeps following the heading.
              setFonts({
                ...chosen,
                heading: { kind: "builtin", id: heading },
                body: { kind: "builtin", id: body },
              });
            }}
          >
            <ListBoxItem
              key={DEVICE}
              id={DEVICE}
              textValue={t("theme.fonts.device")}
              description={t("theme.fonts.deviceHelp")}
            >
              {t("theme.fonts.device")}
            </ListBoxItem>
            {FONT_PAIRINGS.map(([heading, body], i) => (
              <ListBoxItem
                key={`${heading}-${body}`}
                id={String(i)}
                textValue={t("theme.fonts.pairing", { heading: name(heading), body: name(body) })}
                aria-label={t("theme.fonts.pairing", { heading: name(heading), body: name(body) })}
              >
                <span className="be-pairing">
                  <span style={{ fontFamily: heading, fontWeight: 700 }}>{name(heading)}</span>
                  <span style={{ fontFamily: body }}>{name(body)}</span>
                </span>
              </ListBoxItem>
            ))}
          </ListBox>
        </TabPanel>
        <TabPanel id="mix">
          <div className="be-theme-fields">
            {menu("heading")}
            {menu("body")}
            {menu("ui", <ListBoxItem id="same">{t("theme.fonts.sameAsHeading")}</ListBoxItem>)}
            <FontManager library={library} toasts={toasts} />
          </div>
        </TabPanel>
      </Tabs>
    </>
  );
}

/** The choice of the learner's device fonts in the font lists. */
const DEVICE = "device";

/** T10: the course-wide entrance animation, and block and button corners. */
function BlockFields({ draft, change }: FieldsProps) {
  const t = useStrings();
  return (
    <>
      <Switch
        isSelected={draft.animations !== false}
        onChange={(on) => change({ ...draft, animations: on ? undefined : false })}
        aria-describedby="be-blocks-animations"
      >
        {t("theme.blocks.animations")}
      </Switch>
      <p id="be-blocks-animations" className="be-note">
        {t("theme.blocks.animationsHelp")}
      </p>
      {(["corners", "buttons"] as const).map((which) => (
        <Select
          key={which}
          label={t(`theme.blocks.${which}`)}
          selectedKey={draft[which] ?? "rounded"}
          onSelectionChange={(key) =>
            change({ ...draft, [which]: key === "rounded" ? undefined : "square" })
          }
        >
          <ListBoxItem id="rounded">{t("theme.rounded")}</ListBoxItem>
          <ListBoxItem id="square">{t("theme.square")}</ListBoxItem>
        </Select>
      ))}
    </>
  );
}
