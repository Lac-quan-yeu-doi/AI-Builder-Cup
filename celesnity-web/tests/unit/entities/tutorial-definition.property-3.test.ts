import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  validatePublication,
  type TutorialDefinition,
  type TutorialStep,
} from '@/src/entities/models/tutorial-definition';
import {
  tutorialDefinitionArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

function asTutorialDefinition(candidate: GeneratedTutorialDefinition): TutorialDefinition {
  const steps: readonly TutorialStep[] = candidate.steps.map(
    ({ requiredAction, targetControl, ...step }) => ({
      ...step,
      ...(requiredAction === undefined ? {} : { requiredAction }),
      ...(targetControl === undefined ? {} : { targetControl }),
    }),
  );

  return { ...candidate, steps };
}

describe('validatePublication Property 3', () => {
  // Feature: guided-user-tutorials, Property 3: A definition satisfying every publication rule publishes
  // **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10**
  it('publishes every fully valid tutorial definition', () => {
    fc.assert(
      fc.property(tutorialDefinitionArbitrary, (candidate) => {
        expect(validatePublication(asTutorialDefinition(candidate))).toEqual({ ok: true });
      }),
      { numRuns: 100 },
    );
  });
});
