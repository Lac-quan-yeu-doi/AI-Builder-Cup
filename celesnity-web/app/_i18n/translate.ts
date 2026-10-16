import type { Dictionary, TranslationKey } from './en';
import { en } from './en';
import type { Locale } from './locales';
import { defaultLocale } from './locales';
import { vi } from './vi';

export const dictionaries: Readonly<Record<Locale, Dictionary>> = { en, vi };

export type TranslationValues = Readonly<Record<string, string | number>>;

export type Translator = (key: TranslationKey, values?: TranslationValues) => string;

function interpolate(template: string, values: TranslationValues | undefined): string {
  if (values === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

/**
 * Resolves a key for a locale and falls back to the default locale so a missing
 * translation degrades to readable text instead of a raw key.
 */
export function translate(locale: Locale, key: TranslationKey, values?: TranslationValues): string {
  const template = dictionaries[locale][key] || dictionaries[defaultLocale][key];
  return interpolate(template, values);
}

export function createTranslator(locale: Locale): Translator {
  return (key, values) => translate(locale, key, values);
}
