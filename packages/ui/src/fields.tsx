import { type ReactNode, useRef, useState } from "react";
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  type CheckboxProps as AriaCheckboxProps,
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  Select as AriaSelect,
  type SelectProps as AriaSelectProps,
  Slider as AriaSlider,
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  type FieldErrorProps,
  Input,
  Label,
  ListBox,
  SelectValue,
  SliderThumb,
  SliderTrack,
  Text,
} from "react-aria-components";
import { cx, IconButton } from "./buttons.js";
import { Icon } from "./icons.js";
import { PopoverSurface } from "./overlays.js";
import { useStrings } from "./provider.js";

interface FieldTexts {
  label: ReactNode;
  /** Help under the field, linked to it for screen readers. */
  description?: ReactNode;
  /** Shown when the field is invalid; the browser's message when left out. */
  errorMessage?: FieldErrorProps["children"];
}

function FieldFooter({ description, errorMessage }: Omit<FieldTexts, "label">) {
  return (
    <>
      {description !== undefined && (
        <Text slot="description" className="cs-Field-description">
          {description}
        </Text>
      )}
      <FieldError className="cs-Field-error">{errorMessage}</FieldError>
    </>
  );
}

export interface TextFieldProps
  extends FieldTexts,
    Omit<AriaTextFieldProps, "className" | "style" | "children"> {
  placeholder?: string;
  /** Keeps the label for screen readers only, where the place names the field (a list row). */
  hideLabel?: boolean;
  className?: string;
}

const labelClass = (hidden?: boolean) => cx("cs-Label", hidden && "cs-visually-hidden");

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  hideLabel,
  className,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className={cx("cs-Field", className)}>
      <Label className={labelClass(hideLabel)}>{label}</Label>
      <Input className="cs-Input" {...(placeholder !== undefined && { placeholder })} />
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}

/** A text field for several lines. */
export function TextArea({
  label,
  description,
  errorMessage,
  placeholder,
  hideLabel,
  className,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className={cx("cs-Field", className)}>
      <Label className={labelClass(hideLabel)}>{label}</Label>
      <AriaTextArea
        className="cs-Input cs-TextArea"
        {...(placeholder !== undefined && { placeholder })}
      />
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}

export interface CheckboxProps extends Omit<AriaCheckboxProps, "className" | "style" | "children"> {
  /** The label; leave it out only where the checkbox is named for you, as `slot="selection"` in a
   * GridListItem is ("Select" and the row's name). */
  children?: ReactNode;
}

export function Checkbox({ children, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className="cs-Checkbox">
      {({ isIndeterminate }) => (
        <>
          <span className="cs-Checkbox-box">
            <Icon name={isIndeterminate ? "minus" : "check"} size={14} />
          </span>
          {children}
        </>
      )}
    </AriaCheckbox>
  );
}

export interface SwitchProps extends Omit<AriaSwitchProps, "className" | "style" | "children"> {
  children: ReactNode;
}

/** An on/off setting that takes effect at once. */
export function Switch({ children, ...props }: SwitchProps) {
  return (
    <AriaSwitch {...props} className="cs-Switch">
      <span className="cs-Switch-track">
        <span className="cs-Switch-thumb" />
      </span>
      {children}
    </AriaSwitch>
  );
}

export interface SelectProps<T extends object>
  extends FieldTexts,
    Omit<AriaSelectProps<T>, "className" | "style" | "children"> {
  items?: Iterable<T>;
  /** ListBoxItem elements, or a function that makes one per item. */
  children: ReactNode | ((item: T) => ReactNode);
  className?: string;
}

/**
 * Keeps focus on a select's button after its list closes. Inside a list row (the lesson's blocks,
 * the outline: React Aria grid lists), focus coming back from the list's popover lands on the row
 * instead of the button; in a menu opened from a row, on that row, outside the menu that is still
 * open. So the first focus after the list closes decides: when it lands on the select's own row,
 * or leaves the open menu around the select for a row or the page, it goes on to the button,
 * through its row as the menus do (useReturnFocus in the blocks editor); anywhere else it stays.
 * A key or a press first ends the watch. A select in neither a row nor a menu is left alone.
 */
function returnFocusTo(button: HTMLElement): void {
  const row = button.closest<HTMLElement>("[role=row]");
  const menu = button.closest<HTMLElement>("[role=dialog]");
  if (!row && !menu) return;
  const stop = () => {
    document.removeEventListener("focusin", landed, true);
    document.removeEventListener("keydown", stop, true);
    document.removeEventListener("pointerdown", stop, true);
  };
  function landed(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    stop();
    const escaped =
      menu?.isConnected === true &&
      !menu.contains(target) &&
      (target === document.body || target.getAttribute("role") === "row");
    if (!button.isConnected || (target !== row && !escaped)) return;
    queueMicrotask(() => {
      row?.focus();
      button.focus();
    });
  }
  document.addEventListener("focusin", landed, true);
  document.addEventListener("keydown", stop, true);
  document.addEventListener("pointerdown", stop, true);
}

/** Picks one value from a list in a popover; type to jump to an option. */
export function Select<T extends object>({
  label,
  description,
  errorMessage,
  items,
  children,
  className,
  onOpenChange,
  ...props
}: SelectProps<T>) {
  const button = useRef<HTMLButtonElement>(null);
  return (
    <AriaSelect
      {...props}
      className={cx("cs-Field", className)}
      onOpenChange={(open) => {
        onOpenChange?.(open);
        if (!open && button.current) returnFocusTo(button.current);
      }}
    >
      <Label className="cs-Label">{label}</Label>
      <AriaButton ref={button} className="cs-Button cs-Button--secondary cs-Select-button">
        <SelectValue className="cs-Select-value" />
        <Icon name="chevron-down" />
      </AriaButton>
      <FieldFooter description={description} errorMessage={errorMessage} />
      <PopoverSurface>
        <ListBox {...(items && { items })} className="cs-ListBox">
          {children}
        </ListBox>
      </PopoverSurface>
    </AriaSelect>
  );
}

export interface SearchFieldProps
  extends FieldTexts,
    Omit<AriaSearchFieldProps, "className" | "style" | "children"> {
  placeholder?: string;
  className?: string;
}

/** A search box: a clear button, and Escape clears it; filter as the value changes or on Enter. */
export function SearchField({
  label,
  description,
  errorMessage,
  placeholder,
  className,
  ...props
}: SearchFieldProps) {
  const t = useStrings();
  return (
    <AriaSearchField {...props} className={cx("cs-Field", "cs-SearchField", className)}>
      <Label className="cs-Label">{label}</Label>
      <div className="cs-SearchField-box">
        <Icon name="search" />
        <Input className="cs-Input" {...(placeholder !== undefined && { placeholder })} />
        <IconButton icon="close" label={t("search.clear")} className="cs-SearchField-clear" />
      </div>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaSearchField>
  );
}

export interface SliderFieldProps {
  label: string;
  /** The unit after the number, for screen readers too, such as "pixels". */
  unit: string;
  value: number;
  minValue: number;
  maxValue: number;
  step?: number;
  /** Every change while dragging or typing. */
  onChange: (value: number) => void;
  /** The value the author settled on: a drag or key press ended, or the typed number was kept. */
  onChangeEnd: (value: number) => void;
  isDisabled?: boolean;
}

/**
 * A number set with a slider or typed in the box beside it (blocks-editor.md 2.4: padding). The box
 * keeps a typed number on Enter or when it loses focus, held to the range.
 */
export function SliderField({
  label,
  unit,
  value,
  minValue,
  maxValue,
  step = 1,
  onChange,
  onChangeEnd,
  isDisabled,
}: SliderFieldProps) {
  const [typed, setTyped] = useState<string>();
  const keep = () => {
    if (typed === undefined) return;
    setTyped(undefined);
    const number = Number.parseInt(typed, 10);
    if (Number.isNaN(number)) return;
    const next = Math.min(maxValue, Math.max(minValue, number));
    onChange(next);
    onChangeEnd(next);
  };
  return (
    <AriaSlider
      className="cs-Field cs-Slider"
      value={value}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      onChange={onChange}
      onChangeEnd={onChangeEnd}
      {...(isDisabled !== undefined && { isDisabled })}
    >
      <Label className="cs-Label">{label}</Label>
      <div className="cs-Slider-row">
        <SliderTrack className="cs-Slider-track">
          <SliderThumb className="cs-Slider-thumb" />
        </SliderTrack>
        <input
          type="number"
          className="cs-Input cs-Slider-input"
          aria-label={`${label} (${unit})`}
          min={minValue}
          max={maxValue}
          step={step}
          disabled={isDisabled}
          value={typed ?? String(value)}
          onChange={(event) => setTyped(event.currentTarget.value)}
          onBlur={keep}
          onKeyDown={(event) => {
            if (event.key === "Enter") keep();
          }}
        />
        <span className="cs-Slider-unit" aria-hidden="true">
          {unit}
        </span>
      </div>
    </AriaSlider>
  );
}
