'use client';

import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';
import { cn } from './utils';

export type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** Accessible name of the reveal control. */
  readonly toggleLabel?: string;
};

/**
 * Password field with a reveal toggle, so a typed secret can be checked without
 * retyping it. shadcn/ui ships no password primitive, so this composes one from
 * `InputGroup`.
 *
 * The toggle suppresses the default `mousedown` so pressing it never pulls
 * focus out of the field mid-edit; the reveal itself rides on `click`, which is
 * also what Enter and Space produce for a keyboard user.
 */
export function PasswordInput({
  className,
  toggleLabel = 'Toggle password visibility',
  ...rest
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? EyeOffIcon : EyeIcon;

  return (
    <InputGroup className={cn(className)}>
      <InputGroupInput type={revealed ? 'text' : 'password'} {...rest} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={() => setRevealed((current) => !current)}
          onMouseDown={(event) => event.preventDefault()}
          size="icon-xs"
          aria-label={toggleLabel}
          aria-pressed={revealed}
        >
          <Icon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
