import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { progressPercentage } from '@/src/entities/models/tutorial-progress';

const validProgressCountsArbitrary = fc
  .integer({ min: 1, max: 10_000 })
  .chain((totalSteps) =>
    fc
      .integer({ min: 0, max: totalSteps })
      .map((completedDistinct) => ({ completedDistinct, totalSteps })),
  );

describe('progressPercentage Property 24', () => {
  // Feature: guided-user-tutorials, Property 24: Progress Percentage formula, rounding, and bounds
  // **Validates: Requirements 9.2, 9.3, 9.4**
  it('calculates the bounded whole-number percentage with halves rounded upward', () => {
    fc.assert(
      fc.property(validProgressCountsArbitrary, ({ completedDistinct, totalSteps }) => {
        const expectedPercentage = Math.floor(
          (completedDistinct * 200 + totalSteps) / (totalSteps * 2),
        );
        const percentage = progressPercentage(completedDistinct, totalSteps);

        expect(percentage).toBe(expectedPercentage);
        expect(Number.isInteger(percentage)).toBe(true);
        expect(percentage).toBeGreaterThanOrEqual(0);
        expect(percentage).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });
});
