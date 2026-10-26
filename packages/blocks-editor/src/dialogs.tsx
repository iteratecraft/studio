// The editor's questions to the author, each a modal dialog from the kit that resolves to an
// answer: a title (new, rename, duplicate), a choice of buttons, a course or lesson, or a notice.
import {
  Button,
  Dialog,
  DialogActions,
  EmptyState,
  type Key,
  ListBox,
  ListBoxItem,
  TextField,
  useStrings,
} from "@course-suite/ui";
import { type FormEvent, type ReactNode, useCallback, useState } from "react";
import { TITLE_MAX } from "./course.js";

/** Shows one dialog at a time: `ask` renders it and resolves with its answer. */
export function useDialogs() {
  const [dialog, setDialog] = useState<ReactNode>(null);
  const ask = useCallback(
    <T,>(render: (answer: (value: T) => void) => ReactNode) =>
      new Promise<T>((resolve) => {
        setDialog(
          render((value) => {
            setDialog(null);
            resolve(value);
          }),
        );
      }),
    [],
  );
  return { dialog, ask };
}

/** Asks for a course title; `null` when cancelled. */
export function TitleDialog({
  title,
  initial = "",
  submit,
  answer,
}: {
  title: string;
  initial?: string;
  submit: string;
  answer: (value: string | null) => void;
}) {
  const t = useStrings();
  const [value, setValue] = useState(initial);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) answer(value.trim());
  };
  return (
    <Dialog isOpen title={title} onOpenChange={(open) => !open && answer(null)}>
      <form className="be-form" onSubmit={onSubmit}>
        <TextField
          label={t("field.title")}
          description={t("field.titleHelp", { max: TITLE_MAX })}
          value={value}
          onChange={setValue}
          maxLength={TITLE_MAX}
          isRequired
          autoFocus
        />
        <DialogActions>
          <Button variant="quiet" onPress={() => answer(null)}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" type="submit" isDisabled={!value.trim()}>
            {submit}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export interface Choice<T> {
  value: T;
  label: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
}

/**
 * A question with a few answers as buttons (an alert dialog); Escape and the close button give
 * `dismissed`. The first choice with the primary variant takes focus.
 */
export function ChoiceDialog<T>({
  title,
  children,
  choices,
  dismissed,
  answer,
}: {
  title: string;
  children: ReactNode;
  choices: Choice<T>[];
  dismissed: T;
  answer: (value: T) => void;
}) {
  return (
    <Dialog
      isOpen
      role="alertdialog"
      title={title}
      onOpenChange={(open) => !open && answer(dismissed)}
    >
      <div className="be-dialog-body">{children}</div>
      <DialogActions>
        {choices.map((choice) => (
          <Button
            key={choice.label}
            variant={choice.variant ?? "secondary"}
            autoFocus={choice.variant === "primary"}
            onPress={() => answer(choice.value)}
          >
            {choice.label}
          </Button>
        ))}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Asks the author to pick one of `items`: a course to copy to (blocks-editor.md C8, W5;
 * blocks-publish-collab.md B7) or a lesson (W12 step 3). Resolves to the item's id, or `null` when
 * cancelled. Arrows select one; Enter, a double click or the submit button picks it at once.
 */
export function PickerDialog({
  title,
  label,
  items,
  submit,
  empty,
  answer,
}: {
  title: string;
  /** The list's name. */
  label: string;
  items: readonly { id: string; title: string }[];
  submit: string;
  /** What an empty list says. */
  empty: { title: string; body: string };
  answer: (value: string | null) => void;
}) {
  const t = useStrings();
  const [selected, setSelected] = useState<Key | undefined>(items[0]?.id);
  const pick = (key: Key | undefined) => {
    const item = items.find((other) => other.id === key);
    if (item) answer(item.id);
  };
  return (
    <Dialog isOpen title={title} onOpenChange={(open) => !open && answer(null)}>
      {items.length === 0 ? (
        <EmptyState icon="file" title={empty.title} level={3}>
          {empty.body}
        </EmptyState>
      ) : (
        <ListBox
          aria-label={label}
          items={items}
          selectionMode="single"
          selectionBehavior="replace"
          // Escape then closes the dialog instead of clearing the choice.
          disallowEmptySelection
          selectedKeys={selected === undefined ? [] : [selected]}
          onSelectionChange={(keys) => keys !== "all" && setSelected([...keys][0])}
          onAction={pick}
          autoFocus="first"
        >
          {(item) => <ListBoxItem id={item.id}>{item.title}</ListBoxItem>}
        </ListBox>
      )}
      <DialogActions>
        <Button variant="quiet" onPress={() => answer(null)}>
          {t("action.cancel")}
        </Button>
        {items.length > 0 && (
          <Button variant="primary" onPress={() => pick(selected)}>
            {submit}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
