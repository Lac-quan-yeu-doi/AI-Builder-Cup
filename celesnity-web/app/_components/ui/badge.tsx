import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/app/_components/ui/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',

        // Celesnity addition: status tones on the `status-*` scales rather than
        // raw Tailwind scales. `-light` is the surface and `-dark` is the ink on
        // it, so one decision covers both skies. This is the only place these
        // four tones are defined — `PageAlert` and the two status badges now
        // route through `BadgeVariant` instead of each picking its own shades.
        info: 'bg-status-info-light text-status-info-dark [a&]:hover:bg-status-info-light/70',
        success:
          'bg-status-success-light text-status-success-dark [a&]:hover:bg-status-success-light/70',
        warning:
          'bg-status-warning-light text-status-warning-dark [a&]:hover:bg-status-warning-light/70',
        danger: 'bg-destructive/10 text-destructive [a&]:hover:bg-destructive/15',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

/** The tone names a status badge can carry, for callers that map onto them. */
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export { Badge, badgeVariants, type BadgeVariant };
