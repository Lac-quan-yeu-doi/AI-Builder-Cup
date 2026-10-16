import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { filterCatalog, type CatalogTutorial } from '@/src/entities/models/tutorial-catalog';
const tutorialStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'] as const;
type TutorialStatus = (typeof tutorialStatuses)[number];
interface TutorialFixture extends CatalogTutorial {
  readonly id: string;
  readonly status: TutorialStatus;
}
const searchableCharacters = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
const searchableTextArbitrary = fc
  .array(fc.constantFrom(...searchableCharacters), { minLength: 1, maxLength: 32 })
  .map((characters) => characters.join(''));
const tutorialArbitrary: fc.Arbitrary<TutorialFixture> = fc.record({
  id: fc.uuid(),
  title: searchableTextArbitrary,
  summary: searchableTextArbitrary,
  category: searchableTextArbitrary,
  status: fc.constantFrom(...tutorialStatuses),
});
const scenarioArbitrary = fc
  .uniqueArray(tutorialArbitrary, {
    minLength: 1,
    maxLength: 20,
    selector: (tutorial) => tutorial.id,
  })
  .chain((catalog) =>
    fc
      .record({
        anchor: fc.constantFrom(...catalog),
        searchField: fc.constantFrom('title', 'summary', 'category') as fc.Arbitrary<
          'title' | 'summary' | 'category'
        >,
        uppercaseSearch: fc.boolean(),
        leadingWhitespace: fc.constantFrom('', ' ', '  ', '\t'),
        trailingWhitespace: fc.constantFrom('', ' ', '  ', '\n'),
        additionalStatuses: fc.uniqueArray(fc.constantFrom(...tutorialStatuses)),
      })
      .map(
        ({
          anchor,
          searchField,
          uppercaseSearch,
          leadingWhitespace,
          trailingWhitespace,
          additionalStatuses,
        }) => {
          const fieldValue = anchor[searchField];
          const casedSearch = uppercaseSearch ? fieldValue.toUpperCase() : fieldValue.toLowerCase();
          const statusFilters = [...new Set([anchor.status, ...additionalStatuses])];
          return {
            catalog,
            searchTerm: `${leadingWhitespace}${casedSearch}${trailingWhitespace}`,
            statusFilters,
          };
        },
      ),
  );
function matchesSearch(tutorial: TutorialFixture, normalizedSearch: string): boolean {
  return [tutorial.title, tutorial.summary, tutorial.category].some((value) =>
    value.toLowerCase().includes(normalizedSearch),
  );
}
describe('filterCatalog Property 6', () => {
  // Feature: guided-user-tutorials, Property 6: Filters combine with search as conjunction
  // **Validates: Requirements 2.8**
  it('returns every and only tutorial satisfying search and the active status filter', () => {
    fc.assert(
      fc.property(scenarioArbitrary, ({ catalog, searchTerm, statusFilters }) => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const expected = catalog.filter(
          (tutorial) =>
            matchesSearch(tutorial, normalizedSearch) && statusFilters.includes(tutorial.status),
        );
        const actual = filterCatalog(catalog, searchTerm, statusFilters);
        expect(actual).toEqual(expected);
        expect(
          actual.every(
            (tutorial) =>
              matchesSearch(tutorial, normalizedSearch) && statusFilters.includes(tutorial.status),
          ),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
