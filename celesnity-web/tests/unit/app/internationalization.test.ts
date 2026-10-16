// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  workspaceFooterNavigation,
  workspaceNavigation,
  workspaceNavigationGroups,
} from '@/app/_components/layout/workspace-navigation';
import { en } from '@/app/_i18n/en';
import { defaultLocale, isLocale, localeLabels, locales } from '@/app/_i18n/locales';
import { createTranslator, dictionaries, translate } from '@/app/_i18n/translate';
import { localeStorageKey, useLocaleStore } from '@/app/_stores/locale.store';

describe('internationalization dictionaries', () => {
  // Validates Requirements 13.15 and 13.16 by enforcing exact key parity for
  // every interface label and localized content entry, including tutorials.
  it('defines exactly the same keys in every locale', () => {
    const expectedKeys = Object.keys(en).sort();

    for (const locale of locales) {
      expect(Object.keys(dictionaries[locale]).sort(), locale).toEqual(expectedKeys);
    }
  });

  it('never leaves a translation empty and labels every locale', () => {
    for (const locale of locales) {
      expect(localeLabels[locale], locale).toBeTruthy();
      for (const [key, value] of Object.entries(dictionaries[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('translates through the requested locale', () => {
    expect(translate('vi', 'nav.section.dataSourceConnection')).toBe('Kết nối nguồn dữ liệu');
    expect(translate('en', 'nav.group.dataSource')).toBe('Data Connectors');
    expect(createTranslator('en')('nav.query')).toBe('Query');
  });

  // Validates Requirement 13.17 with the member's selected locale retained for
  // the notice while the named fallback locale is interpolated explicitly.
  it('localizes the tutorial fallback notice and identifies the named fallback locale', () => {
    const fallbackLocale = localeLabels[defaultLocale];
    const notice = translate('vi', 'tutorial.fallbackLocaleNotice', { fallbackLocale });

    expect(notice).toBe(
      'Nội dung hướng dẫn này không có trong ngôn ngữ bạn đã chọn. Nội dung sẽ được hiển thị bằng English.',
    );
    expect(notice).toContain(fallbackLocale);
  });

  it('interpolates named placeholders and keeps unmatched ones literal', () => {
    expect(translate('en', 'state.itemCount', { count: 3 })).toBe('3 items');
    expect(translate('vi', 'state.itemCount', { count: 3 })).toBe('3 mục');
    expect(translate('en', 'state.itemCount', { other: 3 })).toBe('{count} items');
    expect(translate('en', 'state.itemCount')).toBe('{count} items');
  });

  it('rejects unsupported locale values at the boundary', () => {
    expect(isLocale('vi')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('keeps every navigation label translatable', () => {
    for (const item of workspaceNavigation) {
      expect(Object.hasOwn(en, item.labelKey), item.href).toBe(true);
    }
  });

  it('lists containers rather than their parts', () => {
    // A destination a container already holds as a tab must not also be offered
    // here. Seven came out on that rule; each is reached inside the object that
    // owns it, and each keeps its own feature in `route-features.ts`. The rule
    // cuts both ways: what no container holds has to stay, or it becomes
    // reachable only by typing the URL, which is what happened to Scripts.
    expect(
      workspaceNavigationGroups.map((group) => ({
        labelKey: group.labelKey,
        items: group.items.map((item) => [item.labelKey, item.href]),
      })),
    ).toEqual([
      { labelKey: undefined, items: [['nav.chat', '/chat']] },
      {
        labelKey: 'nav.group.data',
        items: [
          ['nav.databases', '/catalog/databases'],
          ['nav.streaming', '/streaming'],
          ['nav.plantModel', '/plant-model'],
          ['nav.analytics', '/analytics'],
        ],
      },
      {
        labelKey: 'nav.group.tools',
        items: [
          ['nav.query', '/sql'],
          // Top-level because no container holds it: a script reads one source
          // and has its own workbench.
          ['nav.scripts', '/scripts'],
          ['nav.dataWorkflows', '/data-workflows'],
          ['nav.skills', '/skills'],
          ['nav.plugins', '/plugins'],
          ['nav.automations', '/automations'],
        ],
      },
      {
        labelKey: 'nav.group.resources',
        items: [
          ['nav.documents', '/documents'],
          ['nav.guide', '/guide'],
        ],
      },
    ]);

    expect(workspaceFooterNavigation.map((item) => [item.labelKey, item.href])).toEqual([
      ['nav.administration', '/administration'],
    ]);
  });

  it('does not offer a destination that a container already holds', () => {
    const offered = workspaceNavigationGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    // Parts of the database flow, and the devices filed under a stream adapter.
    for (const folded of [
      '/connections',
      '/source-schema',
      '/metadata-crawler',
      '/pipelines',
      '/executions',
      '/catalog/tables',
      '/devices',
    ]) {
      expect(offered, folded).not.toContain(folded);
    }
  });
});

describe('locale store', () => {
  afterEach(() => {
    window.localStorage.clear();
    useLocaleStore.setState({ locale: defaultLocale });
  });

  it('starts at the default locale so the server and first client render match', () => {
    expect(useLocaleStore.getState().locale).toBe(defaultLocale);
  });

  it('persists the selected locale', () => {
    useLocaleStore.getState().setLocale('vi');

    expect(useLocaleStore.getState().locale).toBe('vi');
    expect(window.localStorage.getItem(localeStorageKey)).toBe(
      JSON.stringify({ state: { locale: 'vi' }, version: 0 }),
    );
  });

  it('adopts a previously persisted locale when rehydration runs after mount', async () => {
    window.localStorage.setItem(
      localeStorageKey,
      JSON.stringify({ state: { locale: 'vi' }, version: 0 }),
    );

    expect(useLocaleStore.getState().locale).toBe(defaultLocale);
    await useLocaleStore.persist.rehydrate();
    expect(useLocaleStore.getState().locale).toBe('vi');
  });

  it('ignores a corrupted persisted locale', async () => {
    window.localStorage.setItem(
      localeStorageKey,
      JSON.stringify({ state: { locale: 'kl' }, version: 0 }),
    );

    await useLocaleStore.persist.rehydrate();
    expect(useLocaleStore.getState().locale).toBe(defaultLocale);
  });
});
