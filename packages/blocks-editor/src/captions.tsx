// Caption tracks of a video (ENG-07 captions, BLK-05; accessibility.md BA4, BA5, B5, W19, W20, D3):
// any number of WebVTT tracks, one per language, which learners pick from the player's captions
// menu; and the caption editor, where each caption's text and times are edited, split with Enter
// and joined with Backspace at its start or Delete at its end. Saving stores the edited track as a
// new WebVTT file, in one undo step, so the preview and the published package show it at once.
import type { Command } from "@course-suite/doc-ops";
import {
  type CaptionTrack,
  type Cue,
  formatVttTime,
  parseVtt,
  parseVttTime,
  serializeVtt,
} from "@course-suite/format";
import {
  Button,
  Dialog,
  DialogActions,
  IconButton,
  TextArea,
  TextField,
  useLocale,
  useStrings,
} from "@course-suite/ui";
import { type KeyboardEvent, useContext, useEffect, useRef, useState } from "react";
import { type FieldsProps, idMaker } from "./blocks.js";
import { languageCode } from "./course.js";
import { DraftSession } from "./fields.js";
import { useMediaIntake } from "./intake.js";
import { MediaDrop } from "./media-fields.js";

/** A language's name in the editor's language, with its code. */
function languageName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export function CaptionTracks({ block, editor }: FieldsProps) {
  const t = useStrings();
  const { locale } = useLocale();
  const session = useContext(DraftSession);
  const intake = useMediaIntake();
  const media = block.media?.[0];
  const [typed, setTyped] = useState("");
  const [editing, setEditing] = useState<CaptionTrack>();
  if (!media) return null;
  const tracks = media.captions ?? [];
  const code = languageCode(typed);
  const taken = code !== undefined && tracks.some((track) => track.language === code);
  /** The command that gives the video these tracks; `extra` goes first in the same list. */
  const withTracks = (next: CaptionTrack[], extra: Command[] = []): Command[] => {
    const { captions: _, ...rest } = media;
    return [
      ...extra,
      {
        type: "updateBlock",
        id: block.id,
        set: { media: [next.length > 0 ? { ...rest, captions: next } : rest] },
      },
    ];
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
    <div className="be-captions" role="group" aria-label={t("captions.title")}>
      <span className="cs-Label" aria-hidden="true">
        {t("captions.title")}
      </span>
      {tracks.length === 0 ? (
        <p className="be-note">{t("captions.none")}</p>
      ) : (
        <ul className="be-media-list">
          {tracks.map((track) => {
            const name = languageName(track.language, locale);
            return (
              <li key={track.language} className="be-media-row">
                <span>{name}</span>
                <IconButton
                  icon="edit"
                  label={t("captions.edit", { language: name })}
                  onPress={() => setEditing(track)}
                />
                <IconButton
                  icon="save"
                  label={t("captions.download", { language: name })}
                  onPress={() => {
                    const base = intake.name(track.key)?.replace(/\.vtt$/i, "") ?? "captions";
                    void intake.saveCopy(track.key, `${base}.${track.language}.vtt`);
                  }}
                />
                <IconButton
                  icon="trash"
                  label={t("captions.remove", { language: name })}
                  onPress={() =>
                    editor.dispatch(withTracks(tracks.filter((other) => other !== track)))
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <TextField
        label={t("captions.language")}
        description={t("captions.languageHelp")}
        value={typed}
        onChange={setTyped}
        isInvalid={typed.trim() !== "" && (code === undefined || taken)}
        errorMessage={t(taken ? "captions.languageTaken" : "captions.languageInvalid")}
      />
      <MediaDrop
        kind="captions"
        label={t("captions.add")}
        isDisabled={code === undefined || taken}
        onAdded={([added]) => {
          if (!added || code === undefined) return;
          const result = editor.dispatch(
            withTracks([...tracks, { key: added.key, language: code }], added.commands),
          );
          if (result.ok) setTyped("");
        }}
      />
      {editing && session && (
        <CaptionEditor
          track={editing}
          others={tracks.filter((track) => track !== editing).map((track) => track.language)}
          title={t("captions.editorTitle", { language: languageName(editing.language, locale) })}
          read={() => session.media(editing.key)}
          onSave={async (cues, language) => {
            const data = new TextEncoder().encode(serializeVtt(cues));
            const key = await session.addMedia(data, {
              name: `${intake.name(editing.key)?.replace(/\.vtt$/i, "") ?? "captions"}.vtt`,
              type: "text/vtt",
              source: "upload",
            });
            const known = editor.document.media.some((entry) => entry.key === key);
            const insert: Command[] = known
              ? []
              : [
                  {
                    type: "insertMedia",
                    value: {
                      id: idMaker(editor.document)(),
                      key,
                      mimeType: "text/vtt",
                      source: "upload",
                    },
                  },
                ];
            editor.dispatch(
              withTracks(
                tracks.map((track) => (track === editing ? { key, language } : track)),
                insert,
              ),
            );
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

/** A caption while it is edited: its times as typed, and its identifier and settings as read. */
interface Draft {
  id: number;
  start: string;
  end: string;
  text: string;
  kept: Pick<Cue, "id" | "settings">;
}

let nextDraft = 0;
const draftOf = ({ start, end, text, ...kept }: Cue): Draft => ({
  id: ++nextDraft,
  start: formatVttTime(start),
  end: formatVttTime(end),
  text,
  kept,
});

/** The cues the drafts stand for, or undefined while a time is not valid. */
function cuesOf(drafts: readonly Draft[]): Cue[] | undefined {
  const cues: Cue[] = [];
  for (const draft of drafts) {
    const start = parseVttTime(draft.start);
    const end = parseVttTime(draft.end);
    if (start === undefined || end === undefined || end <= start) return undefined;
    cues.push({ ...draft.kept, start, end, text: draft.text });
  }
  return cues;
}

/** The caption editor (BA5, W20, D3): the track's language and its captions. */
function CaptionEditor({
  track,
  others,
  title,
  read,
  onSave,
  onClose,
}: {
  track: CaptionTrack;
  /** Languages of the video's other tracks, which this one cannot take. */
  others: readonly string[];
  title: string;
  read: () => Promise<Uint8Array | undefined>;
  onSave: (cues: Cue[], language: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useStrings();
  const [typed, setTyped] = useState(track.language);
  const language = languageCode(typed);
  const taken = language !== undefined && others.includes(language);
  const [drafts, setDrafts] = useState<Draft[]>();
  const [problem, setProblem] = useState<string>();
  const [focus, setFocus] = useState<{ id: number; at: number }>();
  const body = useRef<HTMLDivElement>(null);
  const load = useRef(read);
  useEffect(() => {
    let live = true;
    void load.current().then((bytes) => {
      if (!live) return;
      const parsed = bytes && parseVtt(new TextDecoder().decode(bytes));
      if (parsed?.ok) setDrafts(parsed.cues.map(draftOf));
      else setProblem(t("captions.unreadable"));
    });
    return () => {
      live = false;
    };
  }, [t]);
  // After a split or a join, the caption's text field takes focus at the joint.
  useEffect(() => {
    if (!focus) return;
    const field = body.current?.querySelector<HTMLTextAreaElement>(
      `[data-cue="${focus.id}"] textarea`,
    );
    field?.focus();
    field?.setSelectionRange(focus.at, focus.at);
    setFocus(undefined);
  }, [focus]);
  const list = drafts ?? [];
  const cues = cuesOf(list);
  const change = (id: number, part: Partial<Draft>) =>
    setDrafts(list.map((draft) => (draft.id === id ? { ...draft, ...part } : draft)));
  /**
   * Enter splits at the cursor, or adds a caption after this one at its end; Backspace at the start
   * and Delete at the end join (D3).
   */
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
    const draft = list[index] as Draft;
    const field = event.currentTarget;
    const { selectionStart: from, selectionEnd: to, value } = field;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const start = parseVttTime(draft.start);
      const end = parseVttTime(draft.end);
      if (start === undefined || end === undefined || end <= start) return;
      if (from === value.length && value !== "") {
        const added = draftOf({ start: end, end: end + 2000, text: "" });
        setDrafts([...list.slice(0, index + 1), added, ...list.slice(index + 1)]);
        setFocus({ id: added.id, at: 0 });
        return;
      }
      // The split time sits as far into the caption as the cursor is into its text.
      const at = Math.round(start + ((end - start) * from) / Math.max(1, value.length));
      const middle = formatVttTime(Math.min(end - 1, Math.max(start + 1, at)));
      // The second half keeps the position settings, not the identifier.
      const second: Draft = {
        id: ++nextDraft,
        start: middle,
        end: draft.end,
        text: value.slice(to),
        kept: draft.kept.settings ? { settings: draft.kept.settings } : {},
      };
      setDrafts([
        ...list.slice(0, index),
        { ...draft, end: middle, text: value.slice(0, from) },
        second,
        ...list.slice(index + 1),
      ]);
      setFocus({ id: second.id, at: 0 });
    } else if (event.key === "Backspace" && from === 0 && to === 0 && index > 0) {
      event.preventDefault();
      const before = list[index - 1] as Draft;
      const joined = [before.text, draft.text].filter(Boolean).join(" ");
      setDrafts([
        ...list.slice(0, index - 1),
        { ...before, end: draft.end, text: joined },
        ...list.slice(index + 1),
      ]);
      setFocus({ id: before.id, at: before.text.length + (before.text && draft.text ? 1 : 0) });
    } else if (event.key === "Delete" && from === value.length && to === value.length) {
      const after = list[index + 1];
      if (!after) return;
      event.preventDefault();
      setDrafts([
        ...list.slice(0, index),
        { ...draft, end: after.end, text: [draft.text, after.text].filter(Boolean).join(" ") },
        ...list.slice(index + 2),
      ]);
      setFocus({ id: draft.id, at: value.length });
    }
  };
  const add = () => {
    const last = cues?.at(-1)?.end ?? 0;
    const added = draftOf({ start: last, end: last + 2000, text: "" });
    setDrafts([...list, added]);
    setFocus({ id: added.id, at: 0 });
  };
  return (
    <Dialog isOpen title={title} onOpenChange={(open) => !open && onClose()}>
      <div className="be-caption-editor" ref={body}>
        <TextField
          label={t("captions.trackLanguage")}
          description={t("captions.languageHelp")}
          value={typed}
          onChange={setTyped}
          isInvalid={language === undefined || taken}
          errorMessage={t(taken ? "captions.languageTaken" : "captions.languageInvalid")}
        />
        <p className="be-note">{t("captions.keys")}</p>
        {problem && <p className="be-warning">{problem}</p>}
        <ol className="be-cues">
          {list.map((draft, index) => {
            const number = index + 1;
            const start = parseVttTime(draft.start);
            const end = parseVttTime(draft.end);
            return (
              <li key={draft.id} data-cue={draft.id}>
                {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout. */}
                <div role="group" aria-label={t("captions.cue", { number })} className="be-cue">
                  <div className="be-cue-times">
                    <TextField
                      label={t("captions.start")}
                      value={draft.start}
                      onChange={(value) => change(draft.id, { start: value })}
                      isInvalid={start === undefined}
                      errorMessage={t("captions.timeInvalid")}
                    />
                    <TextField
                      label={t("captions.end")}
                      value={draft.end}
                      onChange={(value) => change(draft.id, { end: value })}
                      isInvalid={end === undefined || (start !== undefined && end <= start)}
                      errorMessage={t("captions.endInvalid")}
                    />
                    <IconButton
                      icon="trash"
                      label={t("captions.removeCue", { number })}
                      onPress={() => setDrafts(list.filter((other) => other.id !== draft.id))}
                    />
                  </div>
                  <TextArea
                    label={t("captions.text", { number })}
                    value={draft.text}
                    onChange={(value) => change(draft.id, { text: value })}
                    onKeyDown={(event) =>
                      onKeyDown(index, event as unknown as KeyboardEvent<HTMLTextAreaElement>)
                    }
                  />
                </div>
              </li>
            );
          })}
        </ol>
        <Button onPress={add}>{t("captions.addCue")}</Button>
        <DialogActions>
          <Button variant="quiet" onPress={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            variant="primary"
            isDisabled={!cues || drafts === undefined || language === undefined || taken}
            onPress={() => cues && language && !taken && void onSave(cues, language)}
          >
            {t("action.save")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
