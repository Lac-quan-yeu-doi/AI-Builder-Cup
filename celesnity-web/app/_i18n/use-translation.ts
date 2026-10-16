'use client';

import { useMemo } from 'react';

import { useLocaleStore } from '@/app/_stores/locale.store';

import type { Locale } from './locales';
import type { Translator } from './translate';
import { createTranslator } from './translate';

interface UseTranslationResult {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translator;
}

export function useTranslation(): UseTranslationResult {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const t = useMemo(() => createTranslator(locale), [locale]);

  return { locale, setLocale, t };
}
