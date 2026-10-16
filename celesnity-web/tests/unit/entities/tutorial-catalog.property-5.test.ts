import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { filterCatalog, type CatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import {
  tutorialDefinitionsArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

type SearchField = 'title' | 'summary' | 'category';

interface CatalogFixture extends CatalogTutorial {
  readonly id: string;
}

interface SearchCase {
  readonly definitions: readonly GeneratedTutorialDefinition[];
  readonly searchTerm: string;
}

const searchFieldArbitrary = fc.constantFrom<SearchField>('title', 'summary', 'category');
const arbitrarySearchTerm = fc.stringMatching(/^[A-Za-z0-9 ,.:-]{0,40}$/);
const surroundingWhitespaceArbitrary = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 5 })
  .map((characters) => characters.join(''));

const matchingSearchCaseArbitrary: fc.Arbitrary<SearchCase> = tutorialDefinitionsArbitrary.chain(
  (definitions) =>
    fc
      .tuple(fc.integer({ min: 0, max: definitions.length - 1 }), searchFieldArbitrary)
      .chain(([tutorialIndex, field]) => {
        const definition = definitions[tutorialIndex];
        if (definition === undefined) {
          return fc.constant({ definitions, searchTerm: '' });
        }

        const fieldValue = definition.metadata[field];

        return fc
          .tuple(
            fc.integer({ min: 0, max: fieldValue.length - 1 }),
            fc.integer({ min: 1, max: fieldValue.length }),
          )
          .map(([start, requestedLength]) => ({
            definitions,
            searchTerm: fieldValue.slice(start, start + requestedLength),
          }));
      }),
);

const searchCaseArbitrary: fc.Arbitrary<SearchCase> = fc.oneof(
  matchingSearchCaseArbitrary,
  fc.tuple(tutorialDefinitionsArbitrary, arbitrarySearchTerm).map(([definitions, searchTerm]) => ({
    definitions,
    searchTerm,
  })),
);

function toCatalog(definitions: readonly GeneratedTutorialDefinition[]): readonly CatalogFixture[] {
  return definitions.map(({ id, metadata }) => ({
    id,
    title: metadata.title,
    summary: metadata.summary,
    category: metadata.category,
    status: 'NOT_STARTED',
  }));
}

function expectedMatches(
  catalog: readonly CatalogFixture[],
  rawSearchTerm: string,
): readonly CatalogFixture[] {
  const normalizedTerm = rawSearchTerm.trim().toLowerCase();

  return catalog.filter(
    ({ title, summary, category }) =>
      normalizedTerm.length === 0 ||
      title.toLowerCase().includes(normalizedTerm) ||
      summary.toLowerCase().includes(normalizedTerm) ||
      category.toLowerCase().includes(normalizedTerm),
  );
}

describe('filterCatalog Property 5', () => {
  // Feature: guided-user-tutorials, Property 5: Search trims and matches case-insensitively across title, summary, and category
  // **Validates: Requirements 2.7**
  it('returns exactly the metadata matches regardless of surrounding whitespace or letter case', () => {
    fc.assert(
      fc.property(
        searchCaseArbitrary,
        surroundingWhitespaceArbitrary,
        surroundingWhitespaceArbitrary,
        ({ definitions, searchTerm }, leadingWhitespace, trailingWhitespace) => {
          const catalog = toCatalog(definitions);
          const expected = expectedMatches(catalog, searchTerm);
          const paddedLowerCaseTerm = `${leadingWhitespace}${searchTerm.toLowerCase()}${trailingWhitespace}`;
          const paddedUpperCaseTerm = `${leadingWhitespace}${searchTerm.toUpperCase()}${trailingWhitespace}`;

          expect(filterCatalog(catalog, searchTerm, [])).toEqual(expected);
          expect(filterCatalog(catalog, paddedLowerCaseTerm, [])).toEqual(expected);
          expect(filterCatalog(catalog, paddedUpperCaseTerm, [])).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
