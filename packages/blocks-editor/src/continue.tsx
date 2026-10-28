// The continue block in the editor (M2-16, BLK-08; blocks-interactions.md 2.11, W9; rise.md 3G,
// rule 13; UI-BLOCKS-R19, R44, R45): what it waits for, with the block above offered only when
// learners can finish it, and the blocks learners must finish listed; its label and hint; and in
// the format menu its colour with the text on it, width and corners. Which blocks can be required
// comes from the player's progress engine, where each block type declares how it is finished.
import {
  type Block,
  contrastOf,
  type LessonEntry,
  textColor,
  variantSettings,
} from "@course-suite/format";
import { canBeRequired, isContinue, requirement } from "@course-suite/player-blocks";
import { ListBoxItem, Select, useStrings } from "@course-suite/ui";
import { useId } from "react";
import { blockName, type FieldsProps } from "./blocks.js";
import { DraftField } from "./fields.js";
import { CONTRASTS, Controls, withVariantSettings } from "./static-blocks.js";

/** The blocks of the lesson that holds `block`. */
const blocksAround = (block: Block, course: FieldsProps["editor"]["document"]): Block[] =>
  course.entries.find(
    (entry): entry is LessonEntry =>
      entry.kind === "lesson" && entry.blocks.some((one) => one.id === block.id),
  )?.blocks ?? [];

export function ContinueFields({ block, editor }: FieldsProps) {
  const t = useStrings();
  const listId = useId();
  const course = editor.document;
  const blocks = blocksAround(block, course);
  const index = Math.max(
    0,
    blocks.findIndex((one) => one.id === block.id),
  );
  const above = blocks[index - 1];
  const aboveOk = above !== undefined && canBeRequired(course, above);
  const why = above ? t("continue.cannot", { name: blockName(above, t) }) : t("continue.noAbove");
  const kind = requirement(block);
  // Rule 13: all above counts only the blocks since the previous continue block.
  const since = blocks.slice(blocks.slice(0, index).findLastIndex(isContinue) + 1, index);
  const waits =
    kind === "block-above" && above && aboveOk
      ? [above]
      : kind === "all-above"
        ? since.filter((one) => canBeRequired(course, one))
        : [];
  const text = (name: string) => {
    const value = block.variantSettings?.[name];
    return typeof value === "string" ? value : "";
  };
  const setText = (name: "buttonLabel" | "hintText", value: string) =>
    withVariantSettings(block, { [name]: value.trim() || undefined });
  return (
    <>
      <Select
        label={t("continue.requirement")}
        selectedKey={kind}
        // The block above is refused when learners cannot finish it, with the reason (BLK-08).
        disabledKeys={aboveOk || kind === "block-above" ? [] : ["block-above"]}
        {...(!aboveOk && { description: why })}
        onSelectionChange={(key) =>
          editor.dispatch(withVariantSettings(block, { completionType: String(key) }))
        }
      >
        <ListBoxItem id="none">{t("continue.none")}</ListBoxItem>
        <ListBoxItem id="block-above" {...(!aboveOk && { description: why })}>
          {t("continue.blockAbove")}
        </ListBoxItem>
        <ListBoxItem id="all-above">{t("continue.allAbove")}</ListBoxItem>
      </Select>
      {kind !== "none" &&
        (waits.length > 0 ? (
          <div className="be-waits">
            <p id={listId} className="be-note">
              {t("continue.waitsFor")}
            </p>
            <ul aria-labelledby={listId}>
              {waits.map((one) => (
                <li key={one.id}>{blockName(one, t)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="be-note">{t("continue.waitsSeen")}</p>
        ))}
      <DraftField
        label={t("field.buttonLabel")}
        description={t("field.buttonLabelHelp")}
        value={text("buttonLabel")}
        command={(value) => setText("buttonLabel", value)}
      />
      <DraftField
        label={t("field.hint")}
        description={t("field.hintHelp")}
        value={text("hintText")}
        command={(value) => setText("hintText", value)}
      />
    </>
  );
}

/**
 * The continue button's look (blocks-interactions.md 2.11, A13): the theme's button colour or its
 * own with the text on it and the contrast it reads at, its width and its corners (unset: the
 * theme's button style).
 */
export function ContinueFormat(props: FieldsProps) {
  const t = useStrings();
  const { block, editor } = props;
  const s = variantSettings<{
    color?: string;
    contrast: "auto" | "light" | "dark";
    cornerRadius?: number;
  }>(block);
  const ratio = s.color ? contrastOf(textColor(s.color, s.contrast), s.color) : undefined;
  const radius = s.cornerRadius ?? (editor.document.theme?.buttons === "square" ? 0 : 6);
  return (
    <>
      <Controls
        {...props}
        controls={[
          { name: "color", label: "continue.color", kind: "color", help: "continue.colorHelp" },
          {
            name: "contrast",
            label: "style.contrast",
            kind: "choice",
            options: CONTRASTS,
            show: s.color !== undefined,
          },
        ]}
      />
      {ratio !== undefined && ratio < 4.5 && (
        <p className="be-warning">{t("continue.textFails", { ratio: ratio.toFixed(1) })}</p>
      )}
      <Controls
        {...props}
        controls={[
          {
            name: "width",
            label: "continue.width",
            kind: "number",
            min: 20,
            max: 100,
            unit: "theme.percent",
          },
        ]}
      />
      {/* Shown at the theme's rounding until the author sets the block's own. */}
      <Controls
        editor={editor}
        block={{ ...block, variantSettings: { ...block.variantSettings, cornerRadius: radius } }}
        controls={[
          {
            name: "cornerRadius",
            label: "blockFormat.cornerRadius",
            kind: "number",
            min: 0,
            max: 30,
          },
        ]}
      />
    </>
  );
}
