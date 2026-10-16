// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TutorialOverlayHost } from '@/app/_components/tutorials/tutorial-overlay-host';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import {
  type TutorialSurface,
  useTutorialSessionStore,
} from '@/app/_stores/tutorial-session.store';
import { renderUi as render } from '@/tests/support/render-ui';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/di/container', () => ({
  getInjection: vi.fn((token: string) => {
    if (token === 'ListTutorialCatalogController') {
      return vi.fn(async () => ({ tutorials: [], noResults: true }));
    }
    if (token === 'OpenTutorialDetailController') {
      return vi.fn(async () => ({
        tutorialId: 'tutorial-1',
        metadata: {
          title: 'Connect a database',
          summary: 'Register a source and verify it.',
          category: 'Getting started',
          learningOutcomes: ['Register a source'],
          estimatedMinutes: 6,
          stepCount: 2,
        },
        prerequisiteStates: [],
        contextSelectors: [],
        startEnabled: true,
      }));
    }
    return vi.fn();
  }),
}));

const surfaceCases = [
  ['catalog', 'Tutorial catalog'],
  ['detail', 'Tutorial details'],
  ['onboarding', 'Learn the workspace as you go'],
  ['walkthrough', 'Tutorial walkthrough'],
] as const satisfies readonly (readonly [Exclude<TutorialSurface, 'none'>, string])[];

function setOpenSurface(openSurface: TutorialSurface) {
  act(() => {
    useTutorialSessionStore.setState({ openSurface });
  });
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
  useTutorialSessionStore.setState({ openSurface: 'none' });
});

describe('TutorialOverlayHost', () => {
  it('renders no overlay landmark when no tutorial surface is open', () => {
    render(createElement(TutorialOverlayHost));

    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('routes exactly one localized overlay surface from the session store', () => {
    render(createElement(TutorialOverlayHost));

    for (const [surface, accessibleName] of surfaceCases) {
      setOpenSurface(surface);

      const landmark = screen.getByRole('complementary', { name: accessibleName });
      expect(landmark.getAttribute('data-tutorial-surface')).toBe(surface);
      expect(screen.getAllByRole('complementary')).toHaveLength(1);
    }
  });

  it('uses the shared Card viewport boundary for narrow and wide layouts', () => {
    useTutorialSessionStore.setState({ openSurface: 'catalog' });
    render(createElement(TutorialOverlayHost));

    const landmark = screen.getByRole('complementary', { name: 'Tutorial catalog' });
    const classes = new Set(landmark.className.split(' '));

    expect(landmark.getAttribute('data-slot')).toBe('card');
    expect(classes.has('h-dvh')).toBe(true);
    expect(classes.has('w-full')).toBe(true);
    expect(classes.has('max-w-full')).toBe(true);
    expect(classes.has('overflow-x-hidden')).toBe(true);
    expect(classes.has('min-[1024px]:left-auto')).toBe(true);
    expect(classes.has('min-[1024px]:w-[24rem]')).toBe(true);
  });
});
