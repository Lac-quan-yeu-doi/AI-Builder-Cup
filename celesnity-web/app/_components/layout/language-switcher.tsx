'use client';

import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import { localeLabels, localeShortLabels, locales } from '@/app/_i18n/locales';

/**
 * Segmented two-letter toggle. A labelled `select` cost the header roughly
 * 150px and two interactions; with a handful of locales a pressed-state group
 * switches in one click and leaves the width to navigation.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div
      aria-label={t('language.label')}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
      role="group"
    >
      {locales.map((option) => {
        const active = option === locale;

        return (
          <button
            aria-pressed={active}
            className={cn(
              'rounded-full px-2 py-1 text-caption font-[650] tracking-[0.04em]',
              active
                ? 'bg-accent text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            key={option}
            onClick={() => setLocale(option)}
            title={localeLabels[option]}
            type="button"
          >
            <span aria-hidden="true">{localeShortLabels[option]}</span>
            <span className="sr-only">{localeLabels[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
