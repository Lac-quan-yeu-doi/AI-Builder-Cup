'use client';

import type { ComponentProps, ReactNode } from 'react';

import { FieldBlock } from '@/app/_components/ui/fields';
import { Input } from '@/app/_components/ui/input';
import { cn } from '@/app/_components/ui/utils';

export type FileInputProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'onChange' | 'className'
> & {
  readonly error?: ReactNode;
  /** Hint shown under the control. */
  readonly hint?: ReactNode;
  readonly label?: ReactNode;
  /** Receives the chosen file, or `null` when the picker is cleared. */
  readonly onChange?: (file: File | null) => void;
};

/**
 * Single-file picker — the workspace's first upload primitive; extend here, not
 * per-feature.
 *
 * Was a Mantine `FileInput`. The kit it belonged to is gone, and the platform
 * control already brings the picker dialog and the chosen file's name, so this
 * is the native input wearing the kit's field chrome rather than a JS
 * re-implementation of a file button.
 */
export function FileInput({ error, hint, label, onChange, ...rest }: FileInputProps) {
  return (
    <FieldBlock error={error} hint={hint} label={label}>
      <Input
        className={cn(
          'file:mr-3 file:cursor-pointer file:rounded-md file:border-0',
          'file:bg-secondary file:px-2.5 file:py-1 file:text-secondary-foreground',
        )}
        onChange={(event) => onChange?.(event.currentTarget.files?.[0] ?? null)}
        type="file"
        {...rest}
      />
    </FieldBlock>
  );
}
