import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  type CheckboxProps as AriaCheckboxProps,
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
  Select as AriaSelect,
  type SelectProps as AriaSelectProps,
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
  className?: string;
}

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  className,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className={cx("cs-Field", className)}>
      <Label className="cs-Label">{label}</Label>
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
  className,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className={cx("cs-Field", className)}>
      <Label className="cs-Label">{label}</Label>
      <AriaTextArea
        className="cs-Input cs-TextArea"
        {...(placeholder !== undefined && { placeholder })}
      />
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}

export interface CheckboxProps extends Omit<AriaCheckboxProps, "className" | "style" | "children"> {
  children: ReactNode;
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

/** Picks one value from a list in a popover; type to jump to an option. */
export function Select<T extends object>({
  label,
  description,
  errorMessage,
  items,
  children,
  className,
  ...props
}: SelectProps<T>) {
  return (
    <AriaSelect {...props} className={cx("cs-Field", className)}>
      <Label className="cs-Label">{label}</Label>
      <AriaButton className="cs-Button cs-Button--secondary cs-Select-button">
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
