import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Toaster } from '@/app/_components/ui/sonner';
import { LocaleHydration } from '@/app/_i18n/locale-hydration';
import { defaultLocale } from '@/app/_i18n/locales';

/*
 * globals.css carries Tailwind, the shadcn/ui style layer, and the Celesnity
 * design tokens the vendored components in `app/_components/ui` are written
 * against.
 */
import './globals.css';

/*
 * No webfont. The ChatGPT skin's own type is the platform system stack — SF Pro
 * on macOS and iOS, Segoe UI Variable on Windows, Roboto on Android — so
 * loading one would be loading a face the skin does not use, and a face that is
 * already on the device cannot reflow when it arrives.
 *
 * Two things the previous Roboto loader was carrying, and where they went. The
 * variable axis served `font-[650]` and `font-semibold`: SF Pro and Segoe UI
 * Variable are both variable, so those land exactly, and on a platform whose
 * default is a static family 650 rounds up rather than failing. The
 * `vietnamese` subset served the workspace's full Vietnamese dictionary: every
 * face in the stack carries Vietnamese, which is why the stack is ordered by
 * platform rather than falling back to a generic sans first.
 *
 * The stack itself lives on `--font-sans` in globals.css, with the rest of the
 * skin.
 */

export const metadata: Metadata = {
  title: {
    default: 'Celesnity',
    template: '%s | Celesnity',
  },
  description: 'A trusted data engineering workspace for Spark, Iceberg, MinIO, and Trino.',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <body className="antialiased">
        <LocaleHydration />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
