// Narration on any block (rise.md 3D; blocks-editor.md L7, W16, 2.4 audio placement; BLK-05): an
// audio file with its transcript, played at the top or the bottom (the default) of the block.
// Heading and subheading blocks carry none (2.4). AI speech and recording come with later epics.
import type { Editor } from "@course-suite/doc-ops";
import type { Block, Narration } from "@course-suite/format";
import {
  Button,
  DialogTrigger,
  IconButton,
  ListBoxItem,
  Popover,
  Select,
  useStrings,
} from "@course-suite/ui";
import { useReturnFocus, withSettings } from "./block-settings.js";
import { RichDraftField } from "./fields.js";
import { MediaDrop, useMediaIntake } from "./intake.js";

/** Whether a block can carry narration (2.4: not heading and subheading blocks). */
export const narratable = (block: Block) =>
  !(block.category === "text" && (block.variant === "heading" || block.variant === "subheading"));

export function NarrationMenu({ editor, block }: { editor: Editor; block: Block }) {
  const t = useStrings();
  const intake = useMediaIntake();
  const trigger = useReturnFocus();
  const narration = block.settings?.narration;
  const set = (next: Narration | undefined) => withSettings(block, { narration: next });
  return (
    <DialogTrigger onOpenChange={trigger.onOpenChange}>
      <IconButton
        id={trigger.id}
        icon="audio"
        label={t(narration ? "narration.titleOn" : "narration.title")}
        data-part="narration"
      />
      <Popover label={t("narration.title")} placement="bottom end">
        <div className="be-settings">
          <MediaDrop
            kind="audio"
            label={t(narration ? "media.replaceAudio" : "narration.add")}
            onAdded={([added]) =>
              added &&
              editor.dispatch([...added.commands, set({ ...narration, audio: { key: added.key } })])
            }
          />
          {narration && (
            <>
              <p className="be-note">
                {t("media.file", {
                  name: intake.name(narration.audio.key) ?? narration.audio.key,
                })}
              </p>
              <RichDraftField
                label={t("media.transcript")}
                value={narration.transcript ?? ""}
                command={(html) => {
                  const { transcript: _, ...rest } = narration;
                  return set(html ? { ...rest, transcript: html } : rest);
                }}
              />
              <Select
                label={t("narration.position")}
                selectedKey={narration.position ?? "bottom"}
                onSelectionChange={(key) => {
                  const { position: _, ...rest } = narration;
                  editor.dispatch(set(key === "top" ? { ...rest, position: "top" } : rest));
                }}
              >
                <ListBoxItem id="top">{t("narration.top")}</ListBoxItem>
                <ListBoxItem id="bottom">{t("narration.bottom")}</ListBoxItem>
              </Select>
              <Button variant="danger" onPress={() => editor.dispatch(set(undefined))}>
                {t("narration.remove")}
              </Button>
            </>
          )}
        </div>
      </Popover>
    </DialogTrigger>
  );
}
