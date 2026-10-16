import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import { createAdvanceTutorialStepUseCase } from '@/src/application/use-cases/tutorials/advance-tutorial-step.use-case';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

const identityArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/);

interface TransitionScenario {
  readonly runId: string;
  readonly tutorialId: string;
  readonly stepIds: readonly string[];
  readonly currentIndexSeed: number;
  readonly completedFlags: readonly boolean[];
}

const transitionScenarioArbitrary: fc.Arbitrary<TransitionScenario> = fc.record({
  runId: identityArbitrary,
  tutorialId: identityArbitrary,
  stepIds: fc.uniqueArray(identityArbitrary, { minLength: 2, maxLength: 8 }),
  currentIndexSeed: fc.nat(),
  completedFlags: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
});

function createDefinition(tutorialId: string, stepIds: readonly string[]): TutorialDefinition {
  return {
    id: tutorialId,
    metadata: {
      title: 'Generated destination transition tutorial',
      summary: 'Exercises destination readiness while preserving run state.',
      category: 'Generated',
      learningOutcomes: ['Preserve tutorial run state'],
      estimatedMinutes: stepIds.length,
      stepCount: stepIds.length,
    },
    steps: stepIds.map((stepId, index) => ({
      id: stepId,
      order: index + 1,
      title: `Step ${index + 1}`,
      instructionalContent: `Complete generated step ${index + 1}.`,
      destinationFeature: 'QUERY',
      destinationHref: `/query/step-${index + 1}`,
    })),
    requiredFeatures: ['QUERY'],
    prerequisites: [],
    contextRequirements: [],
  };
}

function createProgress(
  tutorialId: string,
  currentStepId: string,
  completedStepIds: readonly string[],
): ProgressRecord {
  return {
    tutorialId,
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId,
    completedStepIds,
    contextSelections: [],
    updatedAt: '2027-01-02T03:04:05.000Z',
  };
}

function createDependencies(
  definition: TutorialDefinition,
  initialProgress: ProgressRecord,
): {
  readonly tutorialRepository: TutorialRepository;
  readonly progressRepository: TutorialProgressRepository;
} {
  return {
    tutorialRepository: {
      async listAccessibleCatalog() {
        throw new Error('Not used when advancing tutorial steps.');
      },
      async getDefinition() {
        return definition;
      },
      async publish() {
        throw new Error('Not used when advancing tutorial steps.');
      },
    },
    progressRepository: {
      async listForMember() {
        return [initialProgress];
      },
      async save(record) {
        return record;
      },
      async getOnboardingDecision() {
        throw new Error('Not used when advancing tutorial steps.');
      },
      async saveOnboardingDecision() {
        throw new Error('Not used when advancing tutorial steps.');
      },
      async saveCompletion() {
        throw new Error('Not used when advancing tutorial steps.');
      },
    },
  };
}

describe('advance tutorial step Property 20', () => {
  // Feature: guided-user-tutorials, Property 20: Destination transitions preserve run identity and completed steps
  // **Validates: Requirements 6.8, 6.9, 8.15**
  it('preserves run identity and completed steps when destination readiness succeeds or fails', async () => {
    await fc.assert(
      fc.asyncProperty(transitionScenarioArbitrary, async (scenario) => {
        const currentIndex = scenario.currentIndexSeed % (scenario.stepIds.length - 1);
        const currentStepId = scenario.stepIds[currentIndex];
        if (currentStepId === undefined) {
          throw new RangeError('Generated transition must reference a current step.');
        }

        const completedStepIds = scenario.stepIds.filter(
          (_stepId, index) => scenario.completedFlags[index] ?? false,
        );
        const definition = createDefinition(scenario.tutorialId, scenario.stepIds);
        const initialProgress = createProgress(
          scenario.tutorialId,
          currentStepId,
          completedStepIds,
        );

        for (const destinationReady of [true, false] as const) {
          const advance = createAdvanceTutorialStepUseCase(
            createDependencies(definition, initialProgress),
          );
          const result = await advance({
            action: 'NEXT',
            runId: scenario.runId,
            tutorialId: scenario.tutorialId,
            targetLocated: true,
            destinationReady,
          });

          expect(result.runId).toBe(scenario.runId);
          expect(
            initialProgress.completedStepIds.every((stepId) =>
              result.progress.completedStepIds.includes(stepId),
            ),
          ).toBe(true);

          if (destinationReady) {
            const nextStepId = scenario.stepIds[currentIndex + 1];
            expect(result.ok).toBe(true);
            expect(result.progress.currentStepId).toBe(nextStepId);
            expect(result.progress.completedStepIds).toEqual(
              initialProgress.completedStepIds.includes(currentStepId)
                ? initialProgress.completedStepIds
                : [...initialProgress.completedStepIds, currentStepId],
            );
          } else {
            expect(result).toEqual({
              ok: false,
              runId: scenario.runId,
              reason: 'DESTINATION_NOT_READY',
              progress: initialProgress,
            });
            expect(result.progress.currentStepId).toBe(currentStepId);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
