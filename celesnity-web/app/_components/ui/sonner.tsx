'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      /*
       * Celesnity addition: pinned rather than read from `next-themes`.
       * `useTheme()` here had no `ThemeProvider` mounted anywhere in the tree,
       * so it always resolved to 'system' and Sonner fell back to the OS
       * `prefers-color-scheme` — which rendered dark toasts inside a light-only
       * app. The workspace ships light today (`globals.css` pins
       * `color-scheme: light`); when the `.dark` class is turned on, this
       * should follow that class, not the OS.
       */
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
