import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { resumePoint } from '@/src/entities/models/tutorial-progress';
import {
  progressRecordArbitrary,
  tutorialDefinitionArbitrary,
} from '@/tests/unit/entities/tutorial-arbitraries';

const resumePointScenarioArbitrary = tutorialDefinitionArbitrary.chain((definition) =>
  fc.integer({ min: 0, max: definition.steps.length - 1 }).chain((firstIncompleteIndex) => {
    const expectedResumePoint = definition.steps[firstIncompleteIndex];

    if (expectedResumePoint === undefined) {
      throw new RangeError('Generated resume point must reference a tutorial step.');
    }

    const laterStepCount = definition.steps.length - firstIncompleteIndex - 1;

    return fc
      .tuple(
        progressRecordArbitrary,
        fc.array(fc.boolean(), { minLength: laterStepCount, maxLength: laterStepCount }),
      )
      .map(([record, completedLaterSteps]) => ({
        expectedResumePoint,
        record: {
          ...record,
          tutorialId: definition.id,
          currentStepId: expectedResumePoint.id,
          completedStepIds: [
            ...definition.steps.slice(0, firstIncompleteIndex).map((step) => step.id),
            ...definition.steps
              .slice(firstIncompleteIndex + 1)
              .filter((_, index) => completedLaterSteps[index])
              .map((step) => step.id),
          ],
        },
        steps: definition.steps,
      }));
  }),
);

describe('resumePoint Property 28', () => {
  // Feature: guided-user-tutorials, Property 28: The Resume Point is the first incomplete step
  // **Validates: Requirements 10.16**
  it('returns the first incomplete step in tutorial order', () => {
    fc.assert(
      fc.property(resumePointScenarioArbitrary, ({ expectedResumePoint, record, steps }) => {
        expect(resumePoint(record, steps)).toBe(expectedResumePoint);
      }),
      { numRuns: 100 },
    );
  });
});
