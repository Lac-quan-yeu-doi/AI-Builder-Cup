'use client';

import Link from 'next/link';

import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

import type { GuideSidebar as GuideSidebarModel } from './guide-loader';

/**
 * The guide's table of contents, grouped the way `_sidebar.json` groups the
 * modules. Each entry is a real link to its own page, so a section can be
 * bookmarked or handed to someone as a URL.
 */
export function GuideSidebar({
  sidebar,
  activeSlug,
}: {
  readonly sidebar: GuideSidebarModel;
  readonly activeSlug: string;
}) {
  const { locale, t } = useTranslation();

  return (
    <nav aria-label={t('internal.guide.toc')} className="flex flex-col gap-6">
      {sidebar.sections.map((section) => (
        <div key={section.title.en} className="flex flex-col gap-1">
          <h2 className="m-0 mb-1 px-2 text-caption font-[650] tracking-[0.04em] text-muted-foreground uppercase">
            {section.title[locale]}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {section.items.map((item) => {
              const active = item.slug === activeSlug;
              return (
                <li key={item.slug}>
                  <Link
                    href={`/_internal/user-guide/${item.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-2 py-1.5 text-body-sm leading-snug transition-colors',
                      active
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item.title[locale]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
