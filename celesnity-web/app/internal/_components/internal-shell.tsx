'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { LanguageSwitcher } from '@/app/_components/layout/language-switcher';
import { cn } from '@/app/_components/ui/utils';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';

const LINKS: readonly { readonly href: string; readonly labelKey: TranslationKey }[] = [
  { href: '/_internal/changelogs', labelKey: 'internal.nav.changelog' },
  { href: '/_internal/user-guide', labelKey: 'internal.nav.guide' },
];

/**
 * The chrome for the internal pages: a plain header with the two pages and
 * the language toggle, and nothing of the workspace. These pages are read by
 * someone taking delivery of the product, not someone working in it, so the
 * sidebar and the composer would only be in the way.
 */
export function InternalShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3">
          <span className="text-body-md font-[650] tracking-[-0.02em]">Celesnity</span>
          <nav className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-body-sm transition-colors',
                    active
                      ? 'bg-accent font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {t(link.labelKey)}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
