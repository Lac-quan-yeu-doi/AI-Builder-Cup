// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TutorialCatalogPanel } from '@/app/_components/tutorials/tutorial-catalog-panel';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import type { ListTutorialCatalogController } from '@/src/interface-adapters/controllers/tutorials/list-tutorial-catalog.controller';
import type { CatalogViewModel } from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

const tutorial = {
  id: 'pipeline-basics',
  title: 'Build a streaming pipeline',
  summary: 'Create and inspect a workspace pipeline.',
  category: 'Streaming',
  learningOutcomes: ['Create a pipeline', 'Inspect pipeline status'],
  estimatedMinutes: 12,
  stepCount: 4,
  status: 'IN_PROGRESS',
  progressPercentage: 50,
} as const;

const populatedCatalog: CatalogViewModel = {
  tutorials: [tutorial],
  noResults: false,
};

const emptyCatalog: CatalogViewModel = {
  tutorials: [],
  noResults: true,
};

function resetTutorialSession(): void {
  useTutorialSessionStore.setState({
    openSurface: 'none',
    activeRunId: null,
    catalogView: { search: '', filters: [], scrollTop: 0 },
  });
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
  resetTutorialSession();
});

describe('TutorialCatalogPanel', () => {
  it('renders complete card metadata, status, and progress from the presenter ViewModel', async () => {
    const listCatalog: ListTutorialCatalogController = vi.fn(async () => populatedCatalog);

    render(
      createElement(TutorialCatalogPanel, {
        listCatalog,
        onClose: vi.fn(),
        onSelectTutorial: vi.fn(),
      }),
    );

    expect(await screen.findByRole('heading', { name: tutorial.title })).toBeTruthy();
    expect(screen.getByText(tutorial.summary)).toBeTruthy();
    expect(screen.getByText(tutorial.category)).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.queryByText('Filter tutorials by status')).toBeNull();
    expect(screen.getByText('12 minutes')).toBeTruthy();
    expect(screen.getByText('4 steps')).toBeTruthy();
    expect(screen.getByText('Create a pipeline')).toBeTruthy();
    expect(screen.getByText('Inspect pipeline status')).toBeTruthy();
    expect(screen.getByText('50% complete')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '50% complete' })).toBeTruthy();
  });

  it('applies search, then clears a no-results state from the list start', async () => {
    const listCatalog: ListTutorialCatalogController = vi.fn(async (input) =>
      input.searchTerm === '' ? populatedCatalog : emptyCatalog,
    );

    render(
      createElement(TutorialCatalogPanel, {
        listCatalog,
        onClose: vi.fn(),
        onSelectTutorial: vi.fn(),
      }),
    );

    await screen.findByRole('heading', { name: tutorial.title });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tutorials' }), {
      target: { value: '  missing tutorial  ' },
    });

    expect(await screen.findByText('No matching tutorials')).toBeTruthy();
    const results = screen.getByRole('region', { name: '0 tutorials' });
    results.scrollTop = 180;
    fireEvent.click(screen.getByText('Clear tutorial search'));

    await screen.findByRole('heading', { name: tutorial.title });
    expect(useTutorialSessionStore.getState().catalogView).toEqual({
      search: '',
      filters: [],
      scrollTop: 0,
    });
    expect(results.scrollTop).toBe(0);
  });

  it('preserves the live view before detail and restores it when the catalog remounts', async () => {
    const listCatalog: ListTutorialCatalogController = vi.fn(async () => populatedCatalog);
    const onSelectTutorial = vi.fn();
    useTutorialSessionStore.setState({
      catalogView: {
        search: 'pipeline',
        filters: [],
        scrollTop: 96,
      },
    });

    const view = render(
      createElement(TutorialCatalogPanel, {
        listCatalog,
        onClose: vi.fn(),
        onSelectTutorial,
      }),
    );

    await screen.findByRole('heading', { name: tutorial.title });
    const results = screen.getByRole('region', { name: '1 tutorials' });
    expect(results.scrollTop).toBe(96);
    results.scrollTop = 144;

    fireEvent.click(screen.getByRole('button', { name: 'View tutorial details' }));

    expect(onSelectTutorial).toHaveBeenCalledWith(tutorial.id);
    expect(useTutorialSessionStore.getState().catalogView).toEqual({
      search: 'pipeline',
      filters: [],
      scrollTop: 144,
    });

    view.unmount();
    render(
      createElement(TutorialCatalogPanel, {
        listCatalog,
        onClose: vi.fn(),
        onSelectTutorial,
      }),
    );

    await screen.findByRole('heading', { name: tutorial.title });
    expect(
      (screen.getByRole('searchbox', { name: 'Search tutorials' }) as HTMLInputElement).value,
    ).toBe('pipeline');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('region', { name: '1 tutorials' }).scrollTop).toBe(144);
  });
});

describe('TutorialCatalogPanel focus management', () => {
  it('moves focus to the first available tutorial after the catalog loads', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    render(
      createElement(TutorialCatalogPanel, {
        listCatalog: vi.fn(async () => populatedCatalog),
        onClose: vi.fn(),
        onSelectTutorial: vi.fn(),
      }),
    );

    const firstTutorial = await screen.findByRole('button', { name: 'View tutorial details' });
    await waitFor(() => expect(document.activeElement).toBe(firstTutorial));
    opener.remove();
  });

  it('moves focus to the catalog heading when no tutorial is available', async () => {
    render(
      createElement(TutorialCatalogPanel, {
        listCatalog: vi.fn(async () => emptyCatalog),
        onClose: vi.fn(),
        onSelectTutorial: vi.fn(),
      }),
    );

    const heading = screen.getByRole('heading', { name: 'Guided tutorials' });
    await screen.findByText('No tutorials are available');
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect((heading as HTMLElement).tabIndex).toBe(-1);
  });

  it('restores the opener on close or a workspace navigation fallback when it disappears', async () => {
    const navigation = document.createElement('nav');
    const fallback = document.createElement('button');
    fallback.textContent = 'Workspace home';
    navigation.append(fallback);
    const opener = document.createElement('button');
    opener.textContent = 'Tutorials';
    document.body.append(navigation, opener);
    opener.focus();

    const view = render(
      createElement(TutorialCatalogPanel, {
        listCatalog: vi.fn(async () => populatedCatalog),
        onClose: vi.fn(),
        onSelectTutorial: vi.fn(),
      }),
    );
    await screen.findByRole('button', { name: 'View tutorial details' });
    view.unmount();
    expect(document.activeElement).toBe(opener);

    opener.focus();
    const replacementView = render(
      createElement(TutorialCatalogPanel, {
        listCatalog: vi.fn(async () => populatedCatalog),
        onClose: vi.fn(),
        onSelectTutorial: vi.fn(),
      }),
    );
    await screen.findByRole('button', { name: 'View tutorial details' });
    opener.remove();
    replacementView.unmount();
    expect(document.activeElement).toBe(fallback);
    navigation.remove();
  });
});
