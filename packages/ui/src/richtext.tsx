// A text field that holds formatted text (blocks-editor.md L11, L13, 2.6, W14; BLK-03): paragraphs,
// headings 2 to 5, bold, italic, underline, strikethrough, subscript, superscript, bulleted and
// numbered lists and links, which is what a course's rich text may hold today. It edits in place
// with the browser's own editing (contenteditable), so it needs no editor library; what it gives
// out is the browser's HTML, which the caller normalises before keeping it.
import { isSafeLink } from "@course-suite/format";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button, cx, IconButton, ToggleButton, Toolbar, ToolbarSeparator } from "./buttons.js";
import { TextField } from "./fields.js";
import { Icon, type IconName } from "./icons.js";
import { Dialog, DialogActions, Menu, MenuItem, MenuTrigger } from "./overlays.js";
import { useStrings } from "./provider.js";
import type { StringKey } from "./strings.js";

/** Text marks: the browser's command, its state query, the icon and the name. */
const MARKS: [command: string, icon: IconName, label: StringKey][] = [
  ["bold", "bold", "richtext.bold"],
  ["italic", "italic", "richtext.italic"],
  ["underline", "underline", "richtext.underline"],
  ["strikeThrough", "strike", "richtext.strike"],
  ["subscript", "subscript", "richtext.subscript"],
  ["superscript", "superscript", "richtext.superscript"],
];
const LISTS: [command: string, icon: IconName, label: StringKey][] = [
  ["insertUnorderedList", "bullets", "richtext.bullets"],
  ["insertOrderedList", "numbers", "richtext.numbers"],
];
/** Paragraph styles: normal text and headings 2 to 5 (UI-ACCESSIBILITY-R35). */
const BLOCKS = ["p", "h2", "h3", "h4", "h5"] as const;
type BlockTag = (typeof BLOCKS)[number];

export interface RichTextFieldProps {
  label: string;
  /** Keeps the label for screen readers only, where the place names the field. */
  hideLabel?: boolean;
  description?: string;
  /** The HTML shown; the field takes it whenever it differs from what the field holds. */
  value: string;
  /** Every change, with the field's HTML as the browser wrote it. */
  onChange: (html: string) => void;
  /** Focus left the field, its tools and their menus and dialogs. */
  onLeave?: () => void;
  /** Keys typed in the text, after the field's own shortcuts (Alt+F10, Ctrl/Cmd+K). */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
}

/** How many characters of `root`'s text come before a point in it. */
function offsetIn(root: Node, node: Node, offset: number): number {
  const before = document.createRange();
  before.setStart(root, 0);
  before.setEnd(node, offset);
  return before.toString().length;
}

/** The point after `offset` characters of `root`'s text. */
function pointAt(root: Node, offset: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = offset;
  let last: Node = root;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (left <= length) return [node, left];
    left -= length;
    last = node;
  }
  return [last, last === root ? 0 : (last.textContent?.length ?? 0)];
}

/** The link that holds the selection, if any. */
function linkAt(editor: HTMLElement): HTMLAnchorElement | undefined {
  let node = document.getSelection()?.anchorNode ?? null;
  while (node && node !== editor) {
    if (node instanceof HTMLAnchorElement) return node;
    node = node.parentNode;
  }
  return undefined;
}

/**
 * Formatted text edited in place, with a formatting toolbar that shows while the field is in use:
 * Shift+Tab or Alt+F10 reach it from the text, Escape goes back. Ctrl/Cmd+B, I and U format and
 * Ctrl/Cmd+K adds a link.
 */
export function RichTextField({
  label,
  hideLabel,
  description,
  value,
  onChange,
  onLeave,
  onKeyDown,
  className,
}: RichTextFieldProps) {
  const t = useStrings();
  const id = useId();
  const editor = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  const range = useRef<Range | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  // A menu or the link dialog is open: focus is out of the field, but the field is still in use.
  const overlay = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [link, setLink] = useState<
    { href: string; existing: boolean; range: Range | undefined } | undefined
  >();
  const [state, setState] = useState<{ marks: Set<string>; block: BlockTag }>({
    marks: new Set(),
    block: "p",
  });
  overlay.current = menuOpen || link !== undefined;

  // The field takes a value from outside (undo, Escape), never one it gave out itself: a value
  // that comes back after more typing must not undo that typing or move the caret.
  const sent = useRef<string[]>([]);
  const send = (html: string) => {
    sent.current = [...sent.current.slice(-19), html];
    onChange(html);
  };
  useLayoutEffect(() => {
    const element = editor.current;
    if (!element || sent.current.includes(value)) return;
    sent.current = [];
    if (element.innerHTML !== value) element.innerHTML = value;
  }, [value]);

  /** The marks and paragraph style where the selection is, and the selection, to put back. */
  const refresh = useCallback(() => {
    const element = editor.current;
    const selection = document.getSelection();
    if (!element || !selection?.rangeCount || !element.contains(selection.anchorNode)) return;
    range.current = selection.getRangeAt(0).cloneRange();
    const marks = new Set(
      [...MARKS, ...LISTS].map(([command]) => command).filter((c) => document.queryCommandState(c)),
    );
    if (linkAt(element)) marks.add("link");
    const block = document.queryCommandValue("formatBlock").toLowerCase();
    setState({
      marks,
      block: (BLOCKS as readonly string[]).includes(block) ? (block as BlockTag) : "p",
    });
  }, []);
  useEffect(() => {
    if (!focused) return;
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [focused, refresh]);

  /** Focus back in the text, with the selection `on` (the last one the author had). */
  const restore = (on = range.current) => {
    editor.current?.focus();
    const selection = document.getSelection();
    if (on && selection) {
      selection.removeAllRanges();
      selection.addRange(on);
    }
  };

  /** Runs a browser editing command on the selection the author last had in the text. */
  const run = (command: string, argument?: string, on = range.current) => {
    const element = editor.current;
    if (!element) return;
    restore(on);
    // Where the selection is, as text offsets, which outlast the browser rebuilding the nodes.
    const start = on && offsetIn(element, on.startContainer, on.startOffset);
    const end = on && offsetIn(element, on.endContainer, on.endOffset);
    // Tags rather than style attributes, which a content security policy may refuse.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, argument);
    if (command.endsWith("List")) {
      // Chromium puts a new list inside the paragraph it came from and moves the caret to the
      // start: the list takes the paragraph's place, and the selection stays where it was.
      for (const list of element.querySelectorAll(":is(p, h2, h3, h4, h5) > :is(ul, ol)")) {
        list.parentElement?.replaceWith(...(list.parentElement?.childNodes ?? []));
      }
      if (start !== undefined && end !== undefined) {
        document
          .getSelection()
          ?.setBaseAndExtent(...pointAt(element, start), ...pointAt(element, end));
      }
    }
    send(element.innerHTML);
    refresh();
  };

  const openLink = () => {
    const element = editor.current;
    const existing = element && linkAt(element);
    // The selection to link: focus coming back from the dialog moves the caret.
    setLink({
      href: existing?.getAttribute("href") ?? "",
      existing: existing !== undefined,
      range: range.current,
    });
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    if (event.altKey && event.key === "F10") {
      event.preventDefault();
      tools.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    } else if (mod && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openLink();
    } else {
      // Escape usually puts back an earlier value, which the field must then take.
      if (event.key === "Escape") sent.current = [];
      onKeyDown?.(event);
    }
  };

  const styleName = (tag: BlockTag) =>
    tag === "p" ? t("richtext.normal") : t("richtext.heading", { level: tag.slice(1) });
  const descriptionId = `${id}-description`;
  const show = focused || menuOpen || link !== undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only follows focus in and out of its own controls.
    <div
      className={cx("cs-Field", "cs-RichText", className)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (overlay.current || event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
        onLeave?.();
      }}
      onKeyDown={(event) => {
        // Escape in the tools goes back to the text.
        if (event.key === "Escape" && tools.current?.contains(event.target as Node)) {
          editor.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`} className={cx("cs-Label", hideLabel && "cs-visually-hidden")}>
        {label}
      </span>
      <div ref={tools}>
        {show && (
          <Toolbar aria-label={t("richtext.tools")} className="cs-RichText-tools">
            <MenuTrigger onOpenChange={setMenuOpen}>
              <Button
                variant="quiet"
                aria-label={`${t("richtext.style")}: ${styleName(state.block)}`}
              >
                {styleName(state.block)}
                <Icon name="chevron-down" />
              </Button>
              <Menu
                selectionMode="single"
                selectedKeys={[state.block]}
                onSelectionChange={(keys) => {
                  const [tag] = keys === "all" ? [] : keys;
                  // Once the menu has closed: while open, it keeps focus in itself.
                  if (tag !== undefined) {
                    requestAnimationFrame(() => run("formatBlock", `<${String(tag)}>`));
                  }
                }}
              >
                {BLOCKS.map((tag) => (
                  <MenuItem key={tag} id={tag}>
                    {styleName(tag)}
                  </MenuItem>
                ))}
              </Menu>
            </MenuTrigger>
            <ToolbarSeparator />
            {MARKS.map(([command, icon, name]) => (
              <ToggleButton
                key={command}
                icon={icon}
                label={t(name)}
                isSelected={state.marks.has(command)}
                onChange={() => run(command)}
              />
            ))}
            <ToolbarSeparator />
            {LISTS.map(([command, icon, name]) => (
              <ToggleButton
                key={command}
                icon={icon}
                label={t(name)}
                isSelected={state.marks.has(command)}
                onChange={() => run(command)}
              />
            ))}
            <ToolbarSeparator />
            <ToggleButton
              icon="link"
              label={t("richtext.link")}
              isSelected={state.marks.has("link")}
              onChange={openLink}
            />
            <IconButton
              icon="clear-format"
              label={t("richtext.clear")}
              onPress={() => {
                run("removeFormat");
                run("formatBlock", "<p>");
              }}
            />
          </Toolbar>
        )}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: no native element edits formatted text. */}
      <div
        ref={editor}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${id}-label`}
        aria-describedby={descriptionId}
        tabIndex={0}
        contentEditable
        className="cs-Input cs-RichText-editor"
        onInput={(event) => send(event.currentTarget.innerHTML)}
        onFocus={() => {
          // New paragraphs are paragraphs, not the browser's default division.
          document.execCommand("defaultParagraphSeparator", false, "p");
          refresh();
        }}
        onKeyDown={keyDown}
      />
      <span id={descriptionId} className="cs-Field-description">
        {description && <>{description} </>}
        <span className="cs-visually-hidden">{t("richtext.toolsHelp")}</span>
      </span>
      {link && (
        <LinkDialog
          href={link.href}
          existing={link.existing}
          onClose={(answer) => {
            const { range: selected } = link;
            setLink(undefined);
            // After the dialog has given focus back, so the command runs in the text.
            requestAnimationFrame(() => {
              if (answer === null) restore(selected);
              else if (answer === "") run("unlink", undefined, selected);
              else run("createLink", answer, selected);
            });
          }}
        />
      )}
    </div>
  );
}

/** Asks for a link address: the address, "" to remove the link, or null when cancelled. */
function LinkDialog({
  href,
  existing,
  onClose,
}: {
  href: string;
  existing: boolean;
  onClose: (answer: string | null) => void;
}) {
  const t = useStrings();
  const [value, setValue] = useState(href);
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = value.trim();
    if (!isSafeLink(address)) setInvalid(true);
    else onClose(address);
  };
  return (
    <Dialog isOpen title={t("link.title")} onOpenChange={(open) => !open && onClose(null)}>
      <form className="cs-Form" onSubmit={submit}>
        <TextField
          label={t("link.address")}
          description={t("link.help")}
          autoFocus
          type="url"
          value={value}
          onChange={(next) => {
            setValue(next);
            setInvalid(false);
          }}
          isInvalid={invalid}
          errorMessage={t("link.error")}
        />
        <DialogActions>
          {existing && (
            <Button variant="quiet" onPress={() => onClose("")}>
              {t("link.remove")}
            </Button>
          )}
          <Button variant="quiet" onPress={() => onClose(null)}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" variant="primary">
            {t("link.add")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
