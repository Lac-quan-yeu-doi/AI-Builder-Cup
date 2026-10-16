import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Locale } from '@/app/_i18n/locales';
import { defaultLocale, isLocale } from '@/app/_i18n/locales';

interface LocaleState {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
}

export const localeStorageKey = 'celesnity.locale';

/**
 * Interaction state only: the selected locale. `skipHydration` keeps the first
 * client render identical to the server render; `LocaleHydration` rehydrates
 * from storage inside an effect, which avoids a hydration mismatch.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: localeStorageKey,
      partialize: (state) => ({ locale: state.locale }),
      merge: (persisted, current) => {
        const candidate = (persisted as { locale?: unknown } | undefined)?.locale;
        return { ...current, locale: isLocale(candidate) ? candidate : current.locale };
      },
      skipHydration: true,
    },
  ),
);
