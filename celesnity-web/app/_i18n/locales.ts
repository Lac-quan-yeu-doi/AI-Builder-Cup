export const locales = ['en', 'vi'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeLabels: Readonly<Record<Locale, string>> = {
  en: 'English',
  vi: 'Tiếng Việt',
};

/**
 * Two-letter codes for the compact header switcher. They are display shorthand
 * only — `localeLabels` stays the accessible name of every option.
 */
export const localeShortLabels: Readonly<Record<Locale, string>> = {
  en: 'EN',
  vi: 'VI',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.includes(value as Locale);
}
