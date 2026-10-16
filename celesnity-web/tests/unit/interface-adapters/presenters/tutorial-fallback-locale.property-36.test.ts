import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type TutorialDefinition,
  type TutorialStep,
} from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import {
  type LocalizedCompletionContent,
  presentCompletionSummary,
} from '@/src/interface-adapters/presenters/completion.presenter';
import {
  type InstructionalContentPartViewModel,
  type LocalizedWalkthroughContent,
  presentWalkthroughStep,
} from '@/src/interface-adapters/presenters/walkthrough.presenter';
import {
  tutorialDefinitionArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

const localizedTextArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ,.:-]{0,79}$/);
const localizedContentPartArbitrary: fc.Arbitrary<InstructionalContentPartViewModel> = fc.record({
  kind: fc.constantFrom('text', 'emphasis', 'action-callout'),
  text: localizedTextArbitrary,
});

const localePairArbitrary = fc.constantFrom(
  {
    selectedLocale: 'en' as const,
    fallbackLocale: { code: 'vi' as const, name: 'Tiếng Việt' },
  },
  {
    selectedLocale: 'vi' as const,
    fallbackLocale: { code: 'en' as const, name: 'English' },
  },
);

const fallbackScenarioArbitrary = fc.record({
  definition: tutorialDefinitionArbitrary,
  localePair: localePairArbitrary,
  tutorialTitle: localizedTextArbitrary,
  stepTitle: localizedTextArbitrary,
  stepContent: fc.array(localizedContentPartArbitrary, { minLength: 1, maxLength: 5 }),
  targetAccessibleName: localizedTextArbitrary,
  completionTitle: localizedTextArbitrary,
  completionOutcomes: fc.array(localizedTextArbitrary, { minLength: 1, maxLength: 5 }),
  recommendationTitle: localizedTextArbitrary,
});

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

describe('tutorial presenters Property 36', () => {
  // Feature: guided-user-tutorials, Property 36: Missing localized content names a Fallback Locale before falling back
  // **Validates: Requirements 13.17**
  it('identifies the named fallback locale whenever selected-locale content is unavailable', () => {
    fc.assert(
      fc.property(
        fallbackScenarioArbitrary,
        ({
          definition: candidate,
          localePair,
          tutorialTitle,
          stepTitle,
          stepContent,
          targetAccessibleName,
          completionTitle,
          completionOutcomes,
          recommendationTitle,
        }) => {
          const definition = asTutorialDefinition(candidate);
          const step = definition.steps[0];
          if (step === undefined) {
            throw new Error('Generated tutorial definition must have a first step.');
          }

          const progress: ProgressRecord = {
            tutorialId: definition.id,
            memberId: 'member-property-36',
            organizationId: 'organization-property-36',
            status: 'IN_PROGRESS',
            currentStepId: step.id,
            completedStepIds: [],
            contextSelections: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          };
          const walkthroughFallback: LocalizedWalkthroughContent = {
            tutorialTitle,
            stepTitle,
            content: stepContent,
            targetAccessibleName,
          };
          const completionFallback: LocalizedCompletionContent = {
            title: completionTitle,
            outcomes: completionOutcomes,
            nextRecommendationTitle: recommendationTitle,
          };
          const walkthrough = presentWalkthroughStep({
            definition,
            step,
            progress,
            locale: localePair.selectedLocale,
            fallbackLocale: localePair.fallbackLocale,
            localizedContent: {
              [localePair.fallbackLocale.code]: walkthroughFallback,
            },
          });
          const completion = presentCompletionSummary({
            definition,
            completion: {
              runId: `completed-${definition.id}`,
              completedAt: '2026-01-01T00:00:00.000Z',
            },
            nextRecommendation: {
              id: `next-${definition.id}`,
              title: definition.metadata.title,
            },
            locale: localePair.selectedLocale,
            fallbackLocale: localePair.fallbackLocale,
            localizedContent: {
              [localePair.fallbackLocale.code]: completionFallback,
            },
          });

          expect(walkthrough.selectedLocale).toBe(localePair.selectedLocale);
          expect(walkthrough.fallbackLocale).toEqual(localePair.fallbackLocale);
          expect(walkthrough.tutorialTitle).toBe(tutorialTitle);
          expect(walkthrough.stepTitle).toBe(stepTitle);
          expect(walkthrough.content).toEqual(stepContent);
          if (step.targetControl !== undefined) {
            expect(walkthrough.targetAccessibleName).toBe(targetAccessibleName);
          }

          expect(completion.selectedLocale).toBe(localePair.selectedLocale);
          expect(completion.fallbackLocale).toEqual(localePair.fallbackLocale);
          expect(completion.title).toBe(completionTitle);
          expect(completion.outcomes).toEqual(completionOutcomes);
          expect(completion.nextRecommendation?.title).toBe(recommendationTitle);
        },
      ),
      { numRuns: 100 },
    );
  });
});
