'use client';

import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { Badge } from './badge';
import { Button } from './button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import { Field, FieldDescription, FieldError, FieldTitle } from './field';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import type { FieldShellProps, SelectOption } from './fields';
import { cn } from './utils';

/**
 * Type-to-filter pickers, composed from shadcn/ui's `Popover` + `Command`.
 *
 * `NativeSelect` stays the default — the platform control brings its own
 * keyboard handling and mobile picker for free. These two exist for the lists a
 * native `select` handles badly: hundreds of options (timezones), or a choice of
 * several at once, which `<select multiple>` renders as a scroll box that is
 * close to unusable on touch.
 *
 * Both mirror the chosen value into a hidden input so an uncontrolled `<form>`
 * still reads them back through `FormData`.
 */

function normalise(options: readonly (SelectOption | string)[]): readonly SelectOption[] {
  return options.map((option) =>
    typeof option === 'string' ? { label: option, value: option } : option,
  );
}

export type ComboboxProps = FieldShellProps & {
  readonly data: readonly (SelectOption | string)[];
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly emptyMessage?: string;
  /** Submitted with the surrounding form. */
  readonly name?: string;
  readonly onChange?: (value: string) => void;
  readonly placeholder?: ReactNode;
  readonly searchPlaceholder?: string;
  /** Omit to let the component hold its own value. */
  readonly value?: string;
};

/** Choose one option out of a long list. */
export function Combobox({
  className,
  data,
  defaultValue,
  disabled,
  emptyMessage = 'No match',
  error,
  hint,
  label,
  name,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  value,
}: ComboboxProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? '');
  const current = value ?? internal;
  const options = useMemo(() => normalise(data), [data]);
  const selected = options.find((option) => option.value === current);

  const choose = (next: string) => {
    setInternal(next);
    onChange?.(next);
    setOpen(false);
  };

  return (
    <Field
      className={className}
      data-invalid={error ? true : undefined}
      aria-labelledby={label === undefined ? undefined : `${id}-label`}
    >
      {label === undefined ? null : <FieldTitle id={`${id}-label`}>{label}</FieldTitle>}
      {name ? <input name={name} type="hidden" value={current} readOnly /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className="w-full justify-between font-normal"
            disabled={disabled}
            role="combobox"
            variant="outline"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            aria-labelledby={label === undefined ? undefined : `${id}-label`}
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    disabled={option.disabled}
                    onSelect={() => choose(option.value)}
                    value={option.label}
                  >
                    <CheckIcon
                      className={cn(option.value === current ? 'opacity-100' : 'opacity-0')}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export type MultiComboboxProps = FieldShellProps & {
  readonly data: readonly (SelectOption | string)[];
  readonly disabled?: boolean;
  readonly emptyMessage?: string;
  readonly onChange?: (value: readonly string[]) => void;
  readonly placeholder?: ReactNode;
  readonly searchPlaceholder?: string;
  readonly value: readonly string[];
};

/** Choose several options; each choice becomes a removable chip on the trigger. */
export function MultiCombobox({
  className,
  data,
  disabled,
  emptyMessage = 'No match',
  error,
  hint,
  label,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  value,
}: MultiComboboxProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => normalise(data), [data]);

  const toggle = (next: string) =>
    onChange?.(value.includes(next) ? value.filter((entry) => entry !== next) : [...value, next]);

  return (
    <Field
      className={className}
      data-invalid={error ? true : undefined}
      aria-labelledby={label === undefined ? undefined : `${id}-label`}
    >
      {label === undefined ? null : <FieldTitle id={`${id}-label`}>{label}</FieldTitle>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
            disabled={disabled}
            role="combobox"
            variant="outline"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            aria-labelledby={label === undefined ? undefined : `${id}-label`}
          >
            <span className="flex flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                value.map((entry) => (
                  <Badge key={entry} variant="secondary">
                    {options.find((option) => option.value === entry)?.label ?? entry}
                    {/* A span, not a nested button: the trigger is already one. */}
                    <span
                      className="ml-0.5 rounded-full hover:bg-black/10"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggle(entry);
                      }}
                      aria-hidden="true"
                    >
                      <XIcon className="size-3" />
                    </span>
                  </Badge>
                ))
              )}
            </span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    disabled={option.disabled}
                    onSelect={() => toggle(option.value)}
                    value={option.label}
                    aria-selected={value.includes(option.value)}
                  >
                    <CheckIcon
                      className={cn(value.includes(option.value) ? 'opacity-100' : 'opacity-0')}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
