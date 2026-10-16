import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  clearCatalogViewState,
  filterCatalog,
  type CatalogTutorial,
} from '@/src/entities/models/tutorial-catalog';

import {
  catalogViewStateArbitrary,
  tutorialDefinitionsArbitrary,
  tutorialStatusValues,
  type GeneratedTutorialStatus,
} from './tutorial-arbitraries';

interface CatalogTutorialFixture extends CatalogTutorial {
  readonly id: string;
  readonly status: GeneratedTutorialStatus;
}

const catalogArbitrary: fc.Arbitrary<readonly CatalogTutorialFixture[]> =
  tutorialDefinitionsArbitrary.chain((definitions) =>
    fc
      .array(fc.constantFrom(...tutorialStatusValues), {
        minLength: definitions.length,
        maxLength: definitions.length,
      })
      .map((statuses) =>
        definitions.map((definition, index) => ({
          id: definition.id,
          title: definition.metadata.title,
          summary: definition.metadata.summary,
          category: definition.metadata.category,
          status: statuses[index] ?? 'NOT_STARTED',
        })),
      ),
  );

describe('tutorial catalog Property 7', () => {
  // Feature: guided-user-tutorials, Property 7: Clearing search and filters restores the full catalog from the start
  // **Validates: Requirements 2.10**
  it('clears the view state and restores the original full catalog order from the start', () => {
    fc.assert(
      fc.property(catalogViewStateArbitrary, catalogArbitrary, (viewState, catalog) => {
        const clearedViewState = clearCatalogViewState(viewState);
        const visibleCatalog = filterCatalog(
          catalog,
          clearedViewState.search,
          clearedViewState.filters,
        );

        expect(clearedViewState).toEqual({
          search: '',
          filters: [],
          scrollTop: 0,
        });
        expect(visibleCatalog).toBe(catalog);
        expect(visibleCatalog.map(({ id }) => id)).toEqual(catalog.map(({ id }) => id));
      }),
      { numRuns: 100 },
    );
  });
});
