// Toasts: short notices at the bottom start of the window that stack and close by themselves,
// such as the undo notice after a delete (blocks-editor.md C10, UI-BLOCKS-EDITOR-R12). React Aria
// marks its toast components unstable; this file is the one place that uses them.
import {
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue as AriaToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
  Text,
} from "react-aria-components";
import { Button, IconButton } from "./buttons.js";
import { useStrings } from "./provider.js";

export interface ToastContent {
  title: string;
  description?: string;
  /** One action, such as Undo; pressing it also closes the toast. */
  action?: { label: string; onAction: () => void };
}

/**
 * The toasts of an app. `add(content, { timeout })` shows one; a timeout (at least 5000 ms, so
 * people have time to read and reach it) pauses while the pointer or focus is on the toast.
 */
export class ToastQueue extends AriaToastQueue<ToastContent> {}

export function ToastRegion({ queue }: { queue: ToastQueue }) {
  const t = useStrings();
  return (
    <AriaToastRegion queue={queue} className="cs-ToastRegion">
      {({ toast }) => (
        <AriaToast toast={toast} className="cs-Toast">
          <AriaToastContent className="cs-Toast-content">
            <Text slot="title" className="cs-Toast-title">
              {toast.content.title}
            </Text>
            {toast.content.description !== undefined && (
              <Text slot="description">{toast.content.description}</Text>
            )}
          </AriaToastContent>
          {toast.content.action && (
            <Button
              variant="quiet"
              onPress={() => {
                toast.content.action?.onAction();
                queue.close(toast.key);
              }}
            >
              {toast.content.action.label}
            </Button>
          )}
          <IconButton slot="close" icon="close" label={t("toast.dismiss")} />
        </AriaToast>
      )}
    </AriaToastRegion>
  );
}
