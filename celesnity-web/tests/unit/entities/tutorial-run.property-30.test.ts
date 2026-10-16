import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyCompletion } from '@/src/entities/models/tutorial-run';
import { progressRecordArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

describe('applyCompletion Property 30', () => {
  // Feature: guided-user-tutorials, Property 30: Completion is a single idempotent outcome
  // **Validates: Requirements 11.1, 11.6**
  it('produces one completed outcome while repeated completion preserves all run data', () => {
    fc.assert(
      fc.property(
        progressRecordArbitrary,
        fc.integer({ min: 1, max: 10 }),
        (record, repeatCount) => {
          const completed = applyCompletion(record);
          let repeated = completed;

          for (let repeat = 0; repeat < repeatCount; repeat += 1) {
            repeated = applyCompletion(repeated);
          }

          expect(completed).toEqual({ ...record, status: 'COMPLETED' });
          expect(repeated).toBe(completed);
          expect(repeated).toEqual({ ...record, status: 'COMPLETED' });
        },
      ),
      { numRuns: 100 },
    );
  });
});
