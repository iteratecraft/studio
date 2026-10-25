import type { ReactNode } from "react";
import {
  Dialog as AriaDialog,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
  DialogTrigger,
  Heading,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Separator,
} from "react-aria-components";
import { cx, IconButton } from "./buttons.js";
import { useStrings } from "./provider.js";

export { DialogTrigger, MenuTrigger };

type SurfaceProps = Omit<AriaPopoverProps, "className" | "style" | "children"> & {
  children: ReactNode;
};

/** The floating surface under Select, Menu and Popover. */
export function PopoverSurface({ children, ...props }: SurfaceProps) {
  return (
    <AriaPopover offset={4} {...props} className="cs-Popover">
      {children}
    </AriaPopover>
  );
}

export interface PopoverProps extends SurfaceProps {
  /** Accessible name of the popover's content. */
  label: string;
}

/** Non-modal content next to the button that opens it; goes inside a DialogTrigger. */
export function Popover({ label, children, ...props }: PopoverProps) {
  return (
    <PopoverSurface {...props}>
      <AriaDialog aria-label={label} className="cs-Popover-dialog">
        {children}
      </AriaDialog>
    </PopoverSurface>
  );
}

export interface DialogProps {
  title: ReactNode;
  /** The content, or a function that gets `close` for buttons that end the dialog. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** alertdialog for a question that needs an answer, such as a confirmation. */
  role?: "dialog" | "alertdialog";
  /** Closes on a click outside; off by default so typed work is not lost by a stray click. */
  isDismissable?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/** A modal dialog with a title and a close button; Escape closes it and focus goes back. */
export function Dialog({
  title,
  children,
  role = "dialog",
  isDismissable = false,
  ...state
}: DialogProps) {
  const t = useStrings();
  return (
    <ModalOverlay {...state} isDismissable={isDismissable} className="cs-ModalOverlay">
      <Modal className="cs-Modal">
        <AriaDialog role={role} className="cs-Dialog">
          {({ close }) => (
            <>
              <div className="cs-Dialog-header">
                <Heading slot="title" className="cs-Dialog-title">
                  {title}
                </Heading>
                <IconButton icon="close" label={t("dialog.close")} onPress={close} />
              </div>
              {typeof children === "function" ? children(close) : children}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

/** A row of buttons at the end of a dialog. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="cs-Dialog-actions">{children}</div>;
}

export interface MenuProps<T extends object> extends Omit<AriaMenuProps<T>, "className" | "style"> {
  placement?: AriaPopoverProps["placement"];
}

/** A list of commands in a popover; goes inside a MenuTrigger after the button that opens it. */
export function Menu<T extends object>({ placement, ...props }: MenuProps<T>) {
  return (
    <PopoverSurface {...(placement && { placement })}>
      <AriaMenu {...props} className="cs-Menu" />
    </PopoverSurface>
  );
}

export interface MenuItemProps<T extends object>
  extends Omit<AriaMenuItemProps<T>, "className" | "style"> {
  /** Marks a command that deletes or discards something. */
  isDanger?: boolean;
}

export function MenuItem<T extends object>({ isDanger, ...props }: MenuItemProps<T>) {
  return (
    <AriaMenuItem {...props} className={cx("cs-MenuItem", isDanger && "cs-MenuItem--danger")} />
  );
}

export function MenuSeparator() {
  return <Separator className="cs-Menu-separator" />;
}
