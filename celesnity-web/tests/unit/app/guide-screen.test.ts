// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { GuideScreen } from '@/app/(workspace)/guide/_components/guide-screen';
import { workspaceDocuments } from '@/app/_components/documents/document-content';
import { locales } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/documents',
  useRouter: () => ({ replace }),
  useSearchParams: () => params.current,
}));

afterEach(() => {
  cleanup();
  params.current = new URLSearchParams();
  replace.mockReset();
  useLocaleStore.setState({ locale: 'en' });
});

describe('workspace guide', () => {
  it('opens the first chapter when the URL names none', () => {
    render(createElement(GuideScreen));

    expect(screen.getByRole('heading', { level: 1, name: 'How Celesnity works' })).toBeTruthy();
  });

  it('opens the chapter the URL names', () => {
    params.current = new URLSearchParams('doc=pipeline');
    render(createElement(GuideScreen));

    expect(screen.getByRole('heading', { level: 1, name: 'Pipelines' })).toBeTruthy();
  });

  it('puts the chosen chapter in the URL so it can be linked to', () => {
    render(createElement(GuideScreen));

    fireEvent.click(screen.getByRole('button', { name: /Metadata scan/ }));

    expect(replace).toHaveBeenCalledWith('/documents?doc=metadata-scan', { scroll: false });
  });

  it('drops the parameter for the first chapter rather than spelling it out', () => {
    params.current = new URLSearchParams('doc=pipeline');
    render(createElement(GuideScreen));

    fireEvent.click(screen.getByRole('button', { name: /Overview/ }));

    expect(replace).toHaveBeenCalledWith('/documents', { scroll: false });
  });

  it('falls back to the first chapter when the URL names one that does not exist', () => {
    params.current = new URLSearchParams('doc=nonsense');
    render(createElement(GuideScreen));

    expect(screen.getByRole('heading', { level: 1, name: 'How Celesnity works' })).toBeTruthy();
  });
});

describe('guide content', () => {
  it('carries the same chapters in every locale', () => {
    // A chapter present in one language and missing in another would make the
    // guide change shape when the switcher is used.
    const slugsPerLocale = locales.map((locale) =>
      workspaceDocuments(locale).map((document) => document.slug),
    );

    for (const slugs of slugsPerLocale) {
      expect(slugs).toEqual(slugsPerLocale[0]);
    }
  });

  it('gives every chapter a title and a body', () => {
    for (const locale of locales) {
      for (const document of workspaceDocuments(locale)) {
        expect(document.title.trim(), `${locale}/${document.slug}`).not.toBe('');
        expect(document.body.trim().length, `${locale}/${document.slug}`).toBeGreaterThan(200);
      }
    }
  });
});
