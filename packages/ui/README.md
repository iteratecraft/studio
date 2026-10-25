# @course-suite/ui

The editor UI kit (M2-05, ENG-12): React Aria Components with our own plain CSS, design tokens,
an original icon set and the editor string catalogue. The same kit runs in the desktop window and
in the browser; `apps/web` shows every component in its gallery.

## Use

```tsx
import "@course-suite/ui/styles.css"; // tokens and component styles, once per app
import { Button, ToastQueue, ToastRegion, UiProvider } from "@course-suite/ui";

const toasts = new ToastQueue();

<UiProvider locale="en">
  <Button variant="primary" onPress={() => toasts.add({ title: "Saved" }, { timeout: 5000 })}>
    Save
  </Button>
  <ToastRegion queue={toasts} />
</UiProvider>;
```

Components: `Button`, `IconButton`, `ToggleButton`, `ToggleButtonGroup`, `Toolbar`, `Tooltip`,
`TextField`, `TextArea`, `Checkbox`, `Switch`, `Select`, `Menu`, `Tabs`, `Dialog`, `Popover`,
`ToastRegion`, `ListBox`, `GridList` (reorder with `useReorder`), `Tree`, `Splitter`, `EmptyState`,
`ProgressBar` and `Icon`.

`PreviewPane` (M2-11, UI-BLOCKS-EDITOR P1) shows a course in the real player from
`@course-suite/preview`, with an edit button back to the lesson on show, Restart, and device
buttons for computer, tablet (768 px) and phone (375 px) widths. It loads the player bundle the first
time a pane opens, so an editor that never previews does not download it. `apps/web/preview.html`
is its dev and test page.

## Tokens and themes

`src/tokens.css` holds every colour, size, radius, focus ring and motion value as a `--cs-*`
custom property. Colours are `light-dark()` pairs: the page follows the system theme, and
`data-theme="light"` or `"dark"` on `<html>` (or any element) pins one. Motion drops to zero under
`prefers-reduced-motion`, and high-contrast themes (`forced-colors`) get system colours.
`src/tokens.test.ts` checks the contrast of every colour pair the components use.

## Strings

Editor text comes from the catalogue in `src/strings.ts`: keys with English text, plural forms by
`Intl.PluralRules`, and placeholders filled with locale-formatted numbers. A translation is a
partial catalogue passed to `UiProvider` with its BCP 47 `locale`; missing keys fall back to
English, and right-to-left languages turn the layout round. Learner text is not here: it lives in
`@course-suite/labels`. The pseudo-languages `en-XA` (longer, accented) and `ar-XB` (the same,
right to left) find text that skips the catalogue and layouts that break.

## Rules

- Editor UI code (`packages/ui/src`, `apps/web/src`) never imports Node.js modules or
  `@tauri-apps/*`: files, dialogs and processes go through the host interface (ADR-0006).
  `pnpm lint` enforces it; `tools/lint/editor-imports.test.ts` shows what it reports.
- No ports: the kit needs no files, storage or time of its own. `PreviewPane` takes the media
  bytes it shows from its caller.
