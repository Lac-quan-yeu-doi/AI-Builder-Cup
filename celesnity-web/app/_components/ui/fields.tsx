'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';

import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from './field';
import { Input } from './input';
import { NativeSelect } from './native-select';
import { PasswordInput } from './password-input';
import { Textarea } from './textarea';
import { cn } from './utils';

/**
 * Labelled form controls, composed from shadcn/ui's `Field` primitives.
 *
 * The primitives are deliberately unopinionated: they leave the `id` on the
 * control, the `htmlFor` on the label and the `aria-describedby` that ties in
 * the hint and the error to the caller. Forty call sites hand-wiring those four
 * ids is forty chances to associate a label with nothing, so the wiring lives
 * here once and the screens pass `label`, `hint` and `error`.
 *
 * Reach past these for a control the shell cannot own — a Monaco editor, a
 * colour picker — and compose `Field` yourself.
 */
export interface FieldShellProps {
  readonly className?: string;
  /**
   * Marks the field as changed but not yet saved. Distinct from `error`, which
   * means invalid: the script and pipeline editors need to show an edit that is
   * perfectly valid and simply not written down yet.
   */
  readonly dirty?: boolean;
  readonly error?: ReactNode;
  /** Hint shown under the control. */
  readonly hint?: ReactNode;
  readonly label?: ReactNode;
}

/**
 * Warning chrome for an unsaved edit; `aria-invalid` stays free for real errors.
 * Celesnity addition: on the `status-warning` scale rather than a raw amber one,
 * so it is the same warning colour the badges and banners use.
 */
const dirtyClass =
  'border-status-warning/40 bg-status-warning-light/50 focus-visible:border-status-warning/40';

interface ShellRenderProps {
  readonly controlId: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

function FieldShell({
  children,
  className,
  error,
  hint,
  label,
}: FieldShellProps & { readonly children: (props: ShellRenderProps) => ReactNode }) {
  const id = useId();
  const controlId = `${id}-control`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint === undefined ? undefined : hintId, error ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      {label === undefined ? null : <FieldLabel htmlFor={controlId}>{label}</FieldLabel>}
      {children({ controlId, describedBy: describedBy || undefined, invalid: Boolean(error) })}
      {hint === undefined ? null : <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}

export type TextFieldProps = FieldShellProps &
  Omit<ComponentProps<'input'>, 'className' | 'id'> & {
    /** Applied to the control rather than the field block. */
    readonly inputClassName?: string;
  };

/** Single-line text field. */
export function TextField({
  className,
  dirty,
  error,
  hint,
  inputClassName,
  label,
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell className={className} error={error} hint={hint} label={label}>
      {({ controlId, describedBy, invalid }) => (
        <Input
          className={cn(dirty && dirtyClass, inputClassName)}
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export type PasswordFieldProps = FieldShellProps &
  Omit<ComponentProps<typeof PasswordInput>, 'className' | 'id'> & {
    /** Applied to the control rather than the field block. */
    readonly inputClassName?: string;
  };

/** Password field with a reveal toggle. */
export function PasswordField({
  className,
  dirty,
  error,
  hint,
  inputClassName,
  label,
  ...rest
}: PasswordFieldProps) {
  return (
    <FieldShell className={className} error={error} hint={hint} label={label}>
      {({ controlId, describedBy, invalid }) => (
        <PasswordInput
          className={cn(dirty && dirtyClass, inputClassName)}
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export type TextareaFieldProps = FieldShellProps &
  Omit<ComponentProps<'textarea'>, 'className' | 'id'> & {
    /** Applied to the control rather than the field block. */
    readonly textareaClassName?: string;
  };

/** Multi-line field sharing the label and error wiring of the single-line one. */
export function TextareaField({
  className,
  dirty,
  error,
  hint,
  label,
  textareaClassName,
  ...rest
}: TextareaFieldProps) {
  return (
    <FieldShell className={className} error={error} hint={hint} label={label}>
      {({ controlId, describedBy, invalid }) => (
        <Textarea
          className={cn(dirty && dirtyClass, textareaClassName)}
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export interface SelectOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
}

export type SelectFieldProps = FieldShellProps &
  Omit<ComponentProps<'select'>, 'className' | 'id' | 'onChange' | 'children' | 'size'> & {
    /** Options, as values or as value/label pairs. */
    readonly data: readonly (SelectOption | string)[];
    /** Receives the chosen value rather than the change event. */
    readonly onChange?: (value: string) => void;
  };

/**
 * Dropdown backed by a real `<select>`. The platform control already brings
 * native keyboard handling and the mobile picker, so this stays the default;
 * reach for the DS `Select` when the list is too long to scan.
 */
export function SelectField({
  className,
  data,
  dirty,
  error,
  hint,
  label,
  onChange,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell className={className} error={error} hint={hint} label={label}>
      {({ controlId, describedBy, invalid }) => (
        <NativeSelect
          className={cn('w-full', dirty && dirtyClass)}
          id={controlId}
          onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...rest}
        >
          {data.map((option) => {
            const item = typeof option === 'string' ? { label: option, value: option } : option;
            return (
              <option key={item.value} disabled={item.disabled} value={item.value}>
                {item.label}
              </option>
            );
          })}
        </NativeSelect>
      )}
    </FieldShell>
  );
}

export type FieldBlockProps = FieldShellProps & {
  readonly children: ReactNode;
};

/**
 * Labels a control the shell cannot own — a key/value editor, a Monaco pane, a
 * builder made of several inputs.
 *
 * There is no single control to point a `<label for>` at, so the group carries
 * the name instead: `Field` already renders `role="group"`, and `aria-labelledby`
 * ties it to a `FieldTitle`. A `<label>` with nothing to label would announce as
 * an orphan.
 */
export function FieldBlock({ children, className, error, hint, label }: FieldBlockProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;

  return (
    <Field
      className={className}
      data-invalid={error ? true : undefined}
      aria-describedby={hint === undefined ? undefined : hintId}
      aria-labelledby={label === undefined ? undefined : labelId}
    >
      {label === undefined ? null : <FieldTitle id={labelId}>{label}</FieldTitle>}
      {children}
      {hint === undefined ? null : <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
