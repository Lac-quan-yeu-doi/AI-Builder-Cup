import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { applyCompletion, isFinalStep } from '@/src/entities/models/tutorial-run';
import {
  progressRecordArbitrary,
  tutorialDefinitionArbitrary,
} from '@/tests/unit/entities/tutorial-arbitraries';

type ForwardLabel = 'Next' | 'Finish';

function forwardLabel(step: TutorialStep, steps: readonly TutorialStep[]): ForwardLabel {
  return isFinalStep(step, steps) ? 'Finish' : 'Next';
}

function finalStepOf(steps: readonly TutorialStep[]): TutorialStep {
  const finalStep = steps.at(-1);

  if (finalStep === undefined) {
    throw new Error('Expected a non-empty tutorial step collection');
  }

  return finalStep;
}

describe('tutorial run Property 29', () => {
  // Feature: guided-user-tutorials, Property 29: Finish applies completion without advancing past the final step
  // **Validates: Requirements 8.17, 8.18**
  it('labels only the final complete step Finish and applies completion without advancing beyond it', () => {
    fc.assert(
      fc.property(
        tutorialDefinitionArbitrary,
        progressRecordArbitrary,
        (definition, generatedRecord) => {
          const finalStep = finalStepOf(definition.steps);
          const record: ProgressRecord = {
            ...generatedRecord,
            tutorialId: definition.id,
            status: 'IN_PROGRESS',
            currentStepId: finalStep.id,
            completedStepIds: Array.from(
              new Set([...generatedRecord.completedStepIds, finalStep.id]),
            ),
          };

          for (const step of definition.steps) {
            expect(forwardLabel(step, definition.steps)).toBe(
              step.id === finalStep.id ? 'Finish' : 'Next',
            );
          }

          const completed = applyCompletion(record);

          expect(completed.status).toBe('COMPLETED');
          expect(completed.currentStepId).toBe(finalStep.id);
          expect(completed.completedStepIds).toEqual(record.completedStepIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
