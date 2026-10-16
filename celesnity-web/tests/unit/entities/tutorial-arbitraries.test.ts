import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

describe('fast-check Vitest integration', () => {
  it('runs a property for 100 generated cases', () => {
    let generatedCases = 0;

    fc.assert(
      fc.property(fc.integer(), (value) => {
        generatedCases += 1;
        return Number.isInteger(value);
      }),
      { numRuns: 100 },
    );

    expect(generatedCases).toBe(100);
  });
});
