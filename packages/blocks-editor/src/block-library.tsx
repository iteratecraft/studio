// The block library (blocks-editor.md L3, L4, W7; blocks-interactions.md A2, A4): every block type
// by category, searchable by name. Choosing an available type inserts it where the library was
// opened; the others are listed as not available yet. With blocks copied, it also pastes them there.
import {
  Button,
  Dialog,
  EmptyState,
  Icon,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  SearchField,
  useStrings,
} from "@course-suite/ui";
import { useState } from "react";
import { BLOCK_TYPES, type BlockType, GROUP_LABEL, GROUPS } from "./blocks.js";

const keyOf = (type: BlockType) => `${type.group}/${type.variant}`;

export interface BlockLibraryProps {
  /** Blocks waiting to be pasted. */
  pasteCount: number;
  onInsert: (type: BlockType) => void;
  onPaste: () => void;
  onClose: () => void;
}

export function BlockLibrary({ pasteCount, onInsert, onPaste, onClose }: BlockLibraryProps) {
  const t = useStrings();
  const [search, setSearch] = useState("");
  const words = search.trim().toLocaleLowerCase();
  const matches = (type: BlockType) =>
    !words || `${t(type.label)} ${t(GROUP_LABEL[type.group])}`.toLocaleLowerCase().includes(words);
  const groups = GROUPS.map((group) => ({
    group,
    types: BLOCK_TYPES.filter((type) => type.group === group && matches(type)),
  })).filter(({ types }) => types.length > 0);
  const byKey = new Map(BLOCK_TYPES.map((type) => [keyOf(type), type]));
  return (
    <Dialog isOpen title={t("blocks.library")} onOpenChange={(open) => !open && onClose()}>
      <div className="be-library">
        {pasteCount > 0 && (
          <Button onPress={onPaste}>
            <Icon name="paste" />
            {t("blocks.pasteHere", { count: pasteCount })}
          </Button>
        )}
        <SearchField label={t("blocks.search")} autoFocus value={search} onChange={setSearch} />
        {groups.length === 0 ? (
          <EmptyState icon="search" title={t("blocks.noMatch")} level={3} />
        ) : (
          <ListBox
            aria-label={t("blocks.library")}
            disabledKeys={BLOCK_TYPES.filter((type) => !type.create).map(keyOf)}
            onAction={(key) => {
              const type = byKey.get(String(key));
              if (type?.create) onInsert(type);
            }}
          >
            {groups.map(({ group, types }) => (
              <ListBoxSection key={group} title={t(GROUP_LABEL[group])}>
                {types.map((type) => (
                  <ListBoxItem
                    key={keyOf(type)}
                    id={keyOf(type)}
                    {...(!type.create && { description: t("blocks.later") })}
                  >
                    {t(type.label)}
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            ))}
          </ListBox>
        )}
      </div>
    </Dialog>
  );
}
