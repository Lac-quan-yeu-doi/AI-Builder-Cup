'use client';

import { useId } from 'react';

import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from './field';
import type { FieldShellProps, SelectOption } from './fields';
import { RadioGroup, RadioGroupItem } from './radio-group';

export type RadioGroupFieldProps = FieldShellProps & {
  readonly data: readonly (SelectOption | string)[];
  readonly disabled?: boolean;
  readonly name?: string;
  readonly onChange?: (value: string) => void;
  readonly value: string;
};

/**
 * One choice out of a few, all visible at once.
 *
 * Radix already gives the group its `radiogroup` role and roving focus; what it
 * leaves to the caller is the per-option `id`/`htmlFor` pair, without which the
 * option label is decoration rather than a click target.
 */
export function RadioGroupField({
  className,
  data,
  disabled,
  error,
  hint,
  label,
  name,
  onChange,
  value,
}: RadioGroupFieldProps) {
  const id = useId();

  return (
    <Field
      className={className}
      data-invalid={error ? true : undefined}
      aria-labelledby={label === undefined ? undefined : `${id}-label`}
    >
      {label === undefined ? null : <FieldTitle id={`${id}-label`}>{label}</FieldTitle>}
      <RadioGroup
        disabled={disabled}
        name={name}
        onValueChange={onChange}
        value={value}
        aria-labelledby={label === undefined ? undefined : `${id}-label`}
      >
        {data.map((option) => {
          const item = typeof option === 'string' ? { label: option, value: option } : option;
          const itemId = `${id}-${item.value}`;

          return (
            <Field key={item.value} orientation="horizontal">
              <RadioGroupItem disabled={item.disabled} id={itemId} value={item.value} />
              <FieldLabel htmlFor={itemId} className="font-normal">
                {item.label}
              </FieldLabel>
            </Field>
          );
        })}
      </RadioGroup>
      {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
