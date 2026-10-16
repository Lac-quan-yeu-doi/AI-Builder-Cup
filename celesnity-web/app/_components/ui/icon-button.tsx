'use client';

import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';

type ButtonProps = ComponentProps<typeof Button>;

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children' | 'aria-label'> {
  /** Accessible name. The glyph carries no text, so this is the only label. */
  readonly label: string;
  readonly size?: 'xs' | 'sm' | 'default' | 'lg';
  readonly children: ReactNode;
}

const SIZES = {
  xs: 'icon-xs',
  sm: 'icon-sm',
  default: 'icon',
  lg: 'icon-lg',
} as const;

/**
 * A square button holding one glyph.
 *
 * Kept as its own component rather than folded into `Button`: an icon-only
 * control has no visible text, so its accessible name has to be a required
 * prop instead of something a caller can forget.
 */
export function IconButton({
  className,
  label,
  size = 'default',
  variant = 'ghost',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      className={cn('shrink-0', className)}
      size={SIZES[size]}
      title={label}
      variant={variant}
      {...rest}
    >
      {children}
    </Button>
  );
}
