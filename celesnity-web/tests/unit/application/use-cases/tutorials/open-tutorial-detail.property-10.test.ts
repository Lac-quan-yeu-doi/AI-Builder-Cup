import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type { WorkspaceContextService } from '@/src/application/services/workspace-context.service.interface';
import {
  createOpenTutorialDetailUseCase,
  type PrerequisiteEvaluation,
  type RemediationAction,
} from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import type { TutorialDefinition, TutorialStep } from '@/src/entities/models/tutorial-definition';
import {
  tutorialDefinitionArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

interface GeneratedEvaluation {
  readonly satisfied: boolean;
  readonly remediation: RemediationAction;
}

const remediationArbitrary: fc.Arbitrary<RemediationAction> = fc.record({
  label: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ,.:-]{0,79}$/),
  href: fc
    .stringMatching(/^[a-z][a-z0-9-]{0,23}$/)
    .map((destination) => `/workspace/${destination}`),
});

const generatedEvaluationArbitrary: fc.Arbitrary<GeneratedEvaluation> = fc.record({
  satisfied: fc.boolean(),
  remediation: remediationArbitrary,
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

function propertyInputArbitrary(): fc.Arbitrary<{
  readonly definition: TutorialDefinition;
  readonly evaluations: readonly PrerequisiteEvaluation[];
}> {
  return tutorialDefinitionArbitrary
    .filter((candidate) => candidate.prerequisites.length > 0)
    .chain((candidate) => {
      const definition = asTutorialDefinition(candidate);
      const prerequisiteCount = definition.prerequisites.length;

      return fc
        .tuple(
          fc.array(generatedEvaluationArbitrary, {
            minLength: prerequisiteCount,
            maxLength: prerequisiteCount,
          }),
          fc.integer({ min: 0, max: prerequisiteCount - 1 }),
        )
        .map(([generatedEvaluations, forcedUnsatisfiedIndex]) => {
          const evaluations = definition.prerequisites.map((prerequisite, index) => {
            const generatedEvaluation = generatedEvaluations[index];
            if (generatedEvaluation === undefined) {
              throw new RangeError('Missing generated prerequisite evaluation.');
            }

            const satisfied =
              index === forcedUnsatisfiedIndex ? false : generatedEvaluation.satisfied;
            return satisfied
              ? ({ id: prerequisite.id, satisfied: true } as const)
              : ({
                  id: prerequisite.id,
                  satisfied: false,
                  remediation: generatedEvaluation.remediation,
                } as const);
          });

          return { definition, evaluations };
        });
    });
}

function createRepository(definition: TutorialDefinition): TutorialRepository {
  return {
    listAccessibleCatalog: () => Promise.resolve([]),
    getDefinition: () => Promise.resolve(definition),
    publish: () => Promise.resolve({ ok: true }),
  };
}

function createFeatureAccessService(definition: TutorialDefinition): TutorialFeatureAccessService {
  return {
    accessibleFeatures: () => Promise.resolve(definition.requiredFeatures),
  };
}

const workspaceContextService: WorkspaceContextService = {
  listAuthorizedResources: () => Promise.resolve([]),
  isResourceStillValid: () => Promise.resolve(false),
};

describe('openTutorialDetail Property 10', () => {
  // Feature: guided-user-tutorials, Property 10: Every prerequisite is evaluated with a remediation when unsatisfied
  // **Validates: Requirements 3.2, 3.3, 3.4**
  it('returns exactly one state per prerequisite and one usable remediation per unsatisfied prerequisite', async () => {
    await fc.assert(
      fc.asyncProperty(propertyInputArbitrary(), async ({ definition, evaluations }) => {
        const openDetail = createOpenTutorialDetailUseCase(
          createRepository(definition),
          createFeatureAccessService(definition),
          workspaceContextService,
        );

        const result = await openDetail({
          tutorialId: definition.id,
          prerequisiteEvaluations: evaluations,
          contextSelections: [],
        });

        expect(result.prerequisiteStates).toHaveLength(definition.prerequisites.length);

        for (const prerequisite of definition.prerequisites) {
          const matchingStates = result.prerequisiteStates.filter(
            (state) => state.id === prerequisite.id,
          );
          const matchingEvaluations = evaluations.filter(
            (evaluation) => evaluation.id === prerequisite.id,
          );

          expect(matchingStates).toHaveLength(1);
          expect(matchingEvaluations).toHaveLength(1);

          const state = matchingStates[0];
          const evaluation = matchingEvaluations[0];
          expect(state).toBeDefined();
          expect(evaluation).toBeDefined();
          if (state === undefined || evaluation === undefined) {
            throw new RangeError('Expected one state and evaluation for every prerequisite.');
          }

          expect(state.description).toBe(prerequisite.description);
          expect(state.satisfied).toBe(evaluation.satisfied);

          if (evaluation.satisfied) {
            expect(state.remediation).toBeNull();
          } else {
            expect(state.remediation).toEqual(evaluation.remediation);
            expect(state.remediation).not.toBeNull();
            expect(state.remediation?.label.trim().length).toBeGreaterThan(0);
            expect(state.remediation?.href).toMatch(/^\/workspace\/[a-z][a-z0-9-]*$/);
            expect(Object.keys(state.remediation ?? {}).sort()).toEqual(['href', 'label']);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
