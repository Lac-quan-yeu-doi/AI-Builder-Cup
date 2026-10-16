import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type TutorialCatalogViewState,
  useTutorialSessionStore,
} from '@/app/_stores/tutorial-session.store';

import { catalogViewStateArbitrary } from '../entities/tutorial-arbitraries';

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

describe('useTutorialSessionStore Property 8', () => {
  // Feature: guided-user-tutorials, Property 8: Catalog View State round-trips through detail
  // **Validates: Requirements 2.11, 2.12**
  it('restores every preserved catalog view state after returning from detail', () => {
    fc.assert(
      fc.property(catalogViewStateArbitrary, (catalogView) => {
        useTutorialSessionStore.getState().setCatalogView(catalogView);
        useTutorialSessionStore.getState().setOpenSurface('detail');

        const preservedCatalogView = useTutorialSessionStore.getState().catalogView;
        expect(preservedCatalogView).toEqual(catalogView);

        useTutorialSessionStore.getState().setOpenSurface('catalog');

        expect(useTutorialSessionStore.getState().catalogView).toEqual(catalogView);
      }),
      { numRuns: 100 },
    );
  });
});
