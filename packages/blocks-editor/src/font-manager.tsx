// The author's fonts (blocks-editor.md T9, W21; BLK-09): the list with edit and delete, and the form
// that adds or changes one: a name and WOFF or WOFF2 files for the regular face (required) and the
// bold and italic faces (optional), with a notice that the licence is the author's responsibility.
// Fonts live in the app data folder and every course can use them (FontLibrary).
import { type FontFace as Face, FONT_FACES } from "@course-suite/fonts";
import {
  Button,
  Dialog,
  DialogActions,
  TextField,
  type ToastQueue,
  useStrings,
} from "@course-suite/ui";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { ChoiceDialog, useDialogs } from "./dialogs.js";
import {
  type FaceChange,
  FONT_NAME_MAX,
  type FontLibrary,
  fontFileProblem,
  type LibraryFont,
} from "./fonts.js";

export function FontManager({ library, toasts }: { library: FontLibrary; toasts: ToastQueue }) {
  const t = useStrings();
  const { dialog, ask } = useDialogs();
  useSyncExternalStore(
    (listener) => library.subscribe(listener),
    () => library.version,
  );
  const edit = async (font?: LibraryFont) => {
    const saved = await ask<LibraryFont | null>((answer) => (
      <FontDialog library={library} font={font} answer={answer} />
    ));
    if (saved) toasts.add({ title: t("fontForm.saved", { name: saved.name }) }, { timeout: 5000 });
  };
  const remove = async (font: LibraryFont) => {
    const sure = await ask<boolean>((answer) => (
      <ChoiceDialog
        title={t("fontDelete.title", { name: font.name })}
        dismissed={false}
        answer={answer}
        choices={[
          { value: false, label: t("action.cancel"), variant: "quiet" },
          { value: true, label: t("action.delete"), variant: "danger" },
        ]}
      >
        <p>{t("fontDelete.body")}</p>
      </ChoiceDialog>
    ));
    if (!sure) return;
    await library.remove(font.id);
    toasts.add({ title: t("fontDelete.done", { name: font.name }) }, { timeout: 5000 });
  };
  return (
    <section className="be-fonts" aria-labelledby="be-fonts-title">
      <h3 id="be-fonts-title">{t("theme.fonts.yours")}</h3>
      {library.fonts.length === 0 ? (
        <p className="be-note">{t("theme.fonts.none")}</p>
      ) : (
        <ul className="be-font-list">
          {library.fonts.map((font) => (
            <li key={font.id}>
              <span className="be-font-name">{font.name}</span>
              <Button
                variant="quiet"
                aria-label={t("theme.fonts.edit", { name: font.name })}
                onPress={() => void edit(font)}
              >
                {t("fontForm.edit")}
              </Button>
              <Button
                variant="quiet"
                aria-label={t("theme.fonts.delete", { name: font.name })}
                onPress={() => void remove(font)}
              >
                {t("action.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button onPress={() => void edit()}>{t("theme.fonts.add")}</Button>
      {dialog}
    </section>
  );
}

/** Adds a font (no `font`) or changes one; resolves to what was saved, or `null` when cancelled. */
function FontDialog({
  library,
  font,
  answer,
}: {
  library: FontLibrary;
  font: LibraryFont | undefined;
  answer: (value: LibraryFont | null) => void;
}) {
  const t = useStrings();
  const [name, setName] = useState(font?.name ?? "");
  const [faces, setFaces] = useState<Partial<Record<Face, FaceChange>>>({});
  const [picked, setPicked] = useState<Partial<Record<Face, string>>>({});
  const [problems, setProblems] = useState<Partial<Record<Face, string>>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const taken = library.fonts.some(
    (other) =>
      other.id !== font?.id && other.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  /** Whether the face will have a file: a new one, or the saved one kept. */
  const has = (face: Face) =>
    faces[face] === undefined ? font?.faces[face] !== undefined : faces[face] !== null;
  const ready = trimmed !== "" && !taken && has("regular") && !busy;

  const choose = async (face: Face) => {
    const file = await library.pickFile(t("fontForm.filter")).catch(() => undefined);
    if (!file) return;
    const problem = fontFileProblem(file.bytes);
    setProblems((old) => ({
      ...old,
      [face]:
        problem &&
        t(problem === "tooLarge" ? "fontForm.tooLarge" : "fontForm.notFont", { file: file.name }),
    }));
    if (problem) return;
    setFaces((old) => ({ ...old, [face]: file.bytes }));
    setPicked((old) => ({ ...old, [face]: file.name }));
    // A new font takes the name of its first file until the author types one.
    if (!font && !trimmed) setName(file.name.replace(/\.woff2?$/i, "").replace(/[-_]+/g, " "));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      answer(await library.save({ ...(font && { id: font.id }), name: trimmed, faces }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFailure(t("fontForm.failed", { message }));
      setBusy(false);
    }
  };
  return (
    <Dialog
      isOpen
      title={t(font ? "fontForm.edit" : "fontForm.add")}
      onOpenChange={(open) => !open && answer(null)}
    >
      <form className="be-form" onSubmit={submit}>
        <TextField
          label={t("fontForm.name")}
          value={name}
          onChange={setName}
          maxLength={FONT_NAME_MAX}
          isRequired
          isInvalid={taken}
          errorMessage={t("fontForm.nameTaken")}
          autoFocus
        />
        {FONT_FACES.map((face) => {
          const label = t(`fontForm.${face}`);
          const lower = label.toLocaleLowerCase();
          const status = picked[face] ?? (has(face) ? t("fontForm.kept") : t("fontForm.noFile"));
          return (
            // biome-ignore lint/a11y/useSemanticElements: a fieldset would add its own frame and legend layout.
            <div key={face} role="group" aria-labelledby={`be-face-${face}`} className="be-face">
              <span id={`be-face-${face}`} className="cs-Label">
                {label} ({t(face === "regular" ? "fontForm.required" : "fontForm.optional")})
              </span>
              <span className="be-note">{status}</span>
              <div className="be-face-actions">
                <Button onPress={() => void choose(face)}>
                  {t("fontForm.choose", { face: lower })}
                </Button>
                {face !== "regular" && has(face) && (
                  <Button
                    variant="quiet"
                    onPress={() => {
                      setFaces((old) => ({ ...old, [face]: font?.faces[face] ? null : undefined }));
                      setPicked((old) => ({ ...old, [face]: undefined }));
                    }}
                  >
                    {t("fontForm.remove", { face: lower })}
                  </Button>
                )}
              </div>
              {problems[face] && (
                <p className="be-error" role="alert">
                  {problems[face]}
                </p>
              )}
            </div>
          );
        })}
        {!has("regular") && <p className="be-note">{t("fontForm.needRegular")}</p>}
        <p className="be-note">{t("fontForm.licence")}</p>
        {font && <p className="be-note">{t("fontForm.everyCourse")}</p>}
        {failure && (
          <p className="be-error" role="alert">
            {failure}
          </p>
        )}
        <DialogActions>
          <Button variant="quiet" onPress={() => answer(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" type="submit" isDisabled={!ready}>
            {t("action.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
