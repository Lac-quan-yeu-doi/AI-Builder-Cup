'use client';

import { useEffect } from 'react';

import { useLocaleStore } from '@/app/_stores/locale.store';

/**
 * Rehydrates the persisted locale after mount and keeps `<html lang>` in sync.
 * Render once, inside the root layout.
 */
export function LocaleHydration() {
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    void useLocaleStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
