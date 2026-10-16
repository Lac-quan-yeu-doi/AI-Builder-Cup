---
name: internationalization
description: Use when adding or changing any user-visible string, adding a translation key, adding a locale, or formatting dates and numbers for display
---

# Internationalization (en / vi)

## Overview

Two locales: `en` (default, source of truth) and `vi`. Keys are flat strings, the
dictionary is typed, and the active locale is client state.

```text
app/_i18n/locales.ts            locales, Locale, defaultLocale, localeLabels, isLocale
app/_i18n/en.ts                 source of truth: keys + TranslationKey + Dictionary
app/_i18n/vi.ts                 typed as Dictionary — a missing key is a compile error
app/_i18n/translate.ts          dictionaries, translate(), createTranslator(), {placeholder}
app/_i18n/use-translation.ts    useTranslation() -> { locale, setLocale, t }
app/_i18n/locale-hydration.tsx  rehydrates persisted locale, syncs <html lang>
app/_stores/locale.store.ts     Zustand persisted locale
app/_components/layout/language-switcher.tsx
```

## Adding a string

1. Add the key to `app/_i18n/en.ts` using `<area>.<element>`
   (`connections.emptyTitle`, `executions.cancelAction`). Placeholders are
   `{name}`.
2. Add the same key with the Vietnamese text to `app/_i18n/vi.ts`. Skipping this
   is a type error, not a runtime surprise.
3. Use it in a client component:

   ```tsx
   'use client';
   const { t } = useTranslation();
   return <h1>{t('connections.emptyTitle')}</h1>;
   ```

4. With values: `t('state.itemCount', { count: rows.length })`.
5. `npx vitest run tests/unit/app/internationalization.test.ts` — key parity,
   empty values, and interpolation are all covered.

## Rules

- No literal user-visible text in JSX, and none in `aria-label`, `title`,
  `placeholder`, or `alt` either.
- Never build a key at runtime (`t(\`nav.${slug}\`)`). Keys must be statically
analyzable; store a `labelKey: TranslationKey`in data instead — see`workspace-navigation.ts`.
- Do not concatenate translated fragments. One key per sentence, with
  placeholders.
- Technical identifiers stay untranslated: SQL, table and column names, script
  names, statuses coming from the Core API, log output.
- `t` is only available in client components. A server component that needs text
  either takes it as a prop or uses `translate(defaultLocale, key)` knowingly.
- Only `en.ts` defines keys. Never add a key to `vi.ts` alone.

## Known limitation

Route `metadata` (page titles) renders on the server before the persisted locale
is known, so titles stay in `defaultLocale`. Translating them requires moving the
locale into the URL or a cookie — a deliberate, separate change; do not bolt the
store onto `generateMetadata`.

## Adding a locale

1. Add the code to `locales` and a label to `localeLabels` in `locales.ts`.
2. Create `app/_i18n/<code>.ts` typed as `Dictionary`.
3. Register it in `dictionaries` in `translate.ts`.
4. Tests iterate `locales`, so parity is enforced automatically.

## Formatting

Format dates and numbers with `Intl` using the active locale, not hand-rolled
strings. Existing display helpers live next to their screens
(`execution-format.ts`, `sql/_components/format.ts`); extend those rather than
formatting inline in JSX.
