import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { tutorialDefinitionsArbitrary } from './tutorial-arbitraries';

describe('tutorial definition catalog identifiers', () => {
  // Feature: guided-user-tutorials, Property 1: Identifier uniqueness across the catalog
  // **Validates: Requirements 1.1**
  it('exposes only tutorial definitions with distinct identifiers', () => {
    fc.assert(
      fc.property(tutorialDefinitionsArbitrary, (catalog) => {
        const identifiers = catalog.map((definition) => definition.id);

        expect(new Set(identifiers).size).toBe(identifiers.length);
      }),
      { numRuns: 100 },
    );
  });
});
