import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The design system's type scale, as `tailwind-merge` needs to see it.
 *
 * `text-*` is ambiguous in Tailwind — it is both font-size and colour — and
 * `tailwind-merge` resolves that from its built-in list of scale names. A custom
 * step like `text-body-sm` is not on that list, so it gets classified as a
 * colour; then any `text-foreground` later in the same `cn()` call is treated as
 * a conflict and the size is silently dropped.
 *
 * That failure is invisible: no error, no warning, the element just inherits
 * 16px. Registering the steps here is what makes the scale actually apply.
 */
const TYPE_SCALE = [
  'display-1',
  'display-2',
  'heading-1',
  'heading-2',
  'heading-3',
  'title',
  'body-lg',
  'body-md',
  'body-sm',
  'label',
  'caption',
  'micro',
] as const;

/** The radius steps that are not part of Tailwind's own `rounded-*` scale. */
const RADIUS_SCALE = ['2xs', '4xl'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_SCALE] }],
      rounded: [{ rounded: [...RADIUS_SCALE] }],
    },
  },
});

/** Shared class-name merger for the local Minder Ops component library. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
