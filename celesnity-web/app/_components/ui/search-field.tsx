'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { Field, FieldDescription, FieldLabel } from './field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';
import { cn } from './utils';

export type SearchFieldProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'id'> & {
  /** Accessible name of the clear control. */
  readonly clearLabel?: string;
  /** Hint shown under the control. */
  readonly hint?: ReactNode;
  readonly label?: ReactNode;
  /** Shown as a clear control while the field holds text. */
  readonly onClear?: () => void;
  readonly value: string;
};

/**
 * Filter field: magnifier, `type="search"`, and a clear control that only exists
 * while there is something to clear.
 *
 * Composed from shadcn/ui's `InputGroup` rather than a bare `Input` so the two
 * affordances sit inside the control's own border instead of beside it.
 */
export function SearchField({
  autoComplete = 'off',
  className,
  clearLabel = 'Clear search',
  hint,
  label,
  maxLength = 200,
  onClear,
  value,
  ...rest
}: SearchFieldProps) {
  const id = useId();
  const controlId = `${id}-control`;
  const hintId = `${id}-hint`;

  return (
    <Field className={cn(className)}>
      {label === undefined ? null : <FieldLabel htmlFor={controlId}>{label}</FieldLabel>}
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          autoComplete={autoComplete}
          id={controlId}
          maxLength={maxLength}
          type="search"
          value={value}
          aria-describedby={hint === undefined ? undefined : hintId}
          {...rest}
        />
        {onClear && value !== '' ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={onClear} size="icon-xs" aria-label={clearLabel}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {hint === undefined ? null : <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}
