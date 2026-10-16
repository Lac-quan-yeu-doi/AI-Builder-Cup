import { afterEach, describe, expect, it } from 'vitest';

import {
  type TutorialCatalogViewState,
  useTutorialSessionStore,
} from '@/app/_stores/tutorial-session.store';

const initialCatalogView: TutorialCatalogViewState = {
  search: '',
  filters: [],
  scrollTop: 0,
};

afterEach(() => {
  useTutorialSessionStore.setState({
    openSurface: 'none',
    activeRunId: null,
    catalogView: initialCatalogView,
  });
});

describe('useTutorialSessionStore', () => {
  it('starts with no open surface or active run and an empty catalog view', () => {
    const state = useTutorialSessionStore.getState();

    expect(state.openSurface).toBe('none');
    expect(state.activeRunId).toBeNull();
    expect(state.catalogView).toEqual(initialCatalogView);
  });

  it('updates the open surface and active run without changing the catalog view', () => {
    const originalCatalogView = useTutorialSessionStore.getState().catalogView;

    useTutorialSessionStore.getState().setOpenSurface('walkthrough');
    useTutorialSessionStore.getState().setActiveRunId('run-42');

    const state = useTutorialSessionStore.getState();
    expect(state.openSurface).toBe('walkthrough');
    expect(state.activeRunId).toBe('run-42');
    expect(state.catalogView).toBe(originalCatalogView);
  });

  it('replaces the catalog view with immutable state that survives surface changes', () => {
    const originalCatalogView = useTutorialSessionStore.getState().catalogView;
    const filters = ['IN_PROGRESS', 'PAUSED'] as const;
    const catalogView: TutorialCatalogViewState = {
      search: 'streaming',
      filters,
      scrollTop: 360,
    };

    useTutorialSessionStore.getState().setCatalogView(catalogView);
    useTutorialSessionStore.getState().setOpenSurface('detail');
    useTutorialSessionStore.getState().setOpenSurface('catalog');

    const state = useTutorialSessionStore.getState();
    expect(state.catalogView).toEqual(catalogView);
    expect(state.catalogView).not.toBe(catalogView);
    expect(state.catalogView.filters).not.toBe(filters);
    expect(originalCatalogView).toEqual(initialCatalogView);
  });
});
