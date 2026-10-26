import { type ReactNode, useId } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  type ToggleButtonGroupProps as AriaToggleButtonGroupProps,
  type ToggleButtonProps as AriaToggleButtonProps,
  Toolbar as AriaToolbar,
  type ToolbarProps as AriaToolbarProps,
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  Separator,
  TooltipTrigger,
} from "react-aria-components";
import { Icon, type IconName } from "./icons.js";
import { useStrings } from "./provider.js";

export { TooltipTrigger };

/** Joins class names, skipping empty ones. */
export const cx = (...names: (string | false | undefined)[]): string =>
  names.filter(Boolean).join(" ");

export interface ButtonProps extends Omit<AriaButtonProps, "className" | "style"> {
  /** primary: the one main action of a view; danger: destroys something; quiet: no frame. */
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
}

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return <AriaButton {...props} className={cx("cs-Button", `cs-Button--${variant}`, className)} />;
}

export interface IconButtonProps extends Omit<ButtonProps, "children" | "aria-label"> {
  icon: IconName;
  /** The accessible name, also shown as a tooltip on hover and keyboard focus. */
  label: string;
}

export function IconButton({
  icon,
  label,
  variant = "quiet",
  className,
  ...props
}: IconButtonProps) {
  return (
    <TooltipTrigger delay={600}>
      <Button
        {...props}
        variant={variant}
        aria-label={label}
        className={cx("cs-IconButton", className)}
      >
        <Icon name={icon} />
      </Button>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  );
}

export interface TooltipProps extends Omit<AriaTooltipProps, "className" | "style" | "children"> {
  children: ReactNode;
}

/** A short text about the control that opens it; goes inside a TooltipTrigger. */
export function Tooltip({ children, ...props }: TooltipProps) {
  return (
    <AriaTooltip offset={6} {...props} className="cs-Tooltip">
      {children}
    </AriaTooltip>
  );
}

export interface ToolbarProps extends Omit<AriaToolbarProps, "className" | "style"> {
  className?: string;
}

/** A row of controls: one Tab stop, arrow keys move between the controls. */
export function Toolbar({ className, ...props }: ToolbarProps) {
  return <AriaToolbar {...props} className={cx("cs-Toolbar", className)} />;
}

/** A divider between groups of toolbar controls. */
export function ToolbarSeparator() {
  return <Separator orientation="vertical" className="cs-Toolbar-separator" />;
}

export interface ToggleButtonGroupProps
  extends Omit<AriaToggleButtonGroupProps, "className" | "style"> {
  className?: string;
}

/**
 * Buttons that stay pressed, one of them (`selectionMode="single"`) or several: a view switch
 * such as grid or list. Give the group an accessible name with `aria-label`.
 */
export function ToggleButtonGroup({ className, ...props }: ToggleButtonGroupProps) {
  return <AriaToggleButtonGroup {...props} className={cx("cs-ToggleButtonGroup", className)} />;
}

/** A key pressed with the command key (Ctrl, or Cmd on Apple devices), and Shift if `shift`. */
export interface Shortcut {
  key: string;
  shift?: boolean;
}

export interface ToggleButtonProps
  extends Omit<AriaToggleButtonProps, "className" | "style" | "children"> {
  icon: IconName;
  /** The accessible name, also shown as a tooltip on hover and keyboard focus. */
  label: string;
  /** Keys that do the same, named in the tooltip and in the accessible description. */
  shortcut?: Shortcut;
}

/** An icon button that stays pressed, inside a ToggleButtonGroup. */
export function ToggleButton({ icon, label, shortcut, ...props }: ToggleButtonProps) {
  const t = useStrings();
  const keysId = useId();
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  const keys =
    shortcut &&
    [
      t(apple ? "keys.cmd" : "keys.ctrl"),
      ...(shortcut.shift ? [t("keys.shift")] : []),
      shortcut.key,
    ].join("+");
  return (
    <TooltipTrigger delay={600}>
      <AriaToggleButton
        {...props}
        aria-label={label}
        {...(keys && { "aria-describedby": keysId })}
        className="cs-Button cs-Button--quiet cs-IconButton cs-ToggleButton"
      >
        <Icon name={icon} />
      </AriaToggleButton>
      {keys && (
        <span id={keysId} hidden>
          {keys}
        </span>
      )}
      <Tooltip>{keys ? t("keys.shortcut", { action: label, keys }) : label}</Tooltip>
    </TooltipTrigger>
  );
}
