import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  validatePublication,
  type PublicationViolation,
  type TutorialDefinition,
  type TutorialStep,
} from '@/src/entities/models/tutorial-definition';

import { tutorialDefinitionArbitrary, tutorialDefinitionsArbitrary } from './tutorial-arbitraries';

const publicationViolations: readonly PublicationViolation[] = [
  'MISSING_ID',
  'MISSING_METADATA',
  'EMPTY_STEPS',
  'UNORDERED_STEPS',
  'AMBIGUOUS_ACTION',
  'AMBIGUOUS_TARGET',
  'MISSING_REQUIRED_FEATURES',
  'MISSING_PREREQUISITES',
  'MISSING_CONTEXT_REQUIREMENTS',
  'INVALID_EXPERIENCE',
  'METADATA_STEP_COUNT_MISMATCH',
];

function malformedDefinition(value: unknown): TutorialDefinition {
  return value as TutorialDefinition;
}

function replaceFirstStep(
  definition: TutorialDefinition,
  replace: (step: TutorialStep) => unknown,
): TutorialDefinition {
  const [firstStep, ...remainingSteps] = definition.steps;
  if (firstStep === undefined) {
    throw new Error('Expected a generated tutorial definition to contain a step.');
  }

  return malformedDefinition({
    ...definition,
    steps: [replace(firstStep), ...remainingSteps],
  });
}

function injectViolation(
  definition: TutorialDefinition,
  violation: PublicationViolation,
): TutorialDefinition {
  switch (violation) {
    case 'MISSING_ID':
      return { ...definition, id: '   ' };
    case 'MISSING_METADATA':
      return malformedDefinition({ ...definition, metadata: undefined });
    case 'EMPTY_STEPS':
      return {
        ...definition,
        metadata: { ...definition.metadata, stepCount: 0 },
        steps: [],
      };
    case 'UNORDERED_STEPS':
      return replaceFirstStep(definition, (step) => ({ ...step, order: 0 }));
    case 'AMBIGUOUS_ACTION':
      return replaceFirstStep(definition, (step) => {
        const action = step.requiredAction ?? {
          id: 'generated-action',
          accessibleName: 'Generated action',
        };
        return { ...step, requiredAction: [action, action] };
      });
    case 'AMBIGUOUS_TARGET':
      return replaceFirstStep(definition, (step) => {
        const target = step.targetControl ?? {
          id: 'generated-target',
          accessibleName: 'Generated target',
          selector: '[data-tutorial-target="generated-target"]',
        };
        return { ...step, targetControl: [target, target] };
      });
    case 'MISSING_REQUIRED_FEATURES':
      return malformedDefinition({ ...definition, requiredFeatures: undefined });
    case 'MISSING_PREREQUISITES':
      return malformedDefinition({ ...definition, prerequisites: undefined });
    case 'MISSING_CONTEXT_REQUIREMENTS':
      return malformedDefinition({ ...definition, contextRequirements: undefined });
    case 'INVALID_EXPERIENCE':
      return malformedDefinition({
        ...definition,
        experience: { mode: 'SIMULATED_CHAT', scenarioId: '', scenarioVersion: 2 },
      });
    case 'METADATA_STEP_COUNT_MISMATCH':
      return {
        ...definition,
        metadata: {
          ...definition.metadata,
          stepCount: definition.metadata.stepCount + 1,
        },
      };
  }
}

describe('validatePublication Property 4', () => {
  // Feature: guided-user-tutorials, Property 4: Every publication violation is reported and the catalog is unchanged
  // **Validates: Requirements 1.11, 1.12**
  it('reports each injected violation and leaves any existing catalog identical', () => {
    fc.assert(
      fc.property(
        tutorialDefinitionArbitrary,
        tutorialDefinitionsArbitrary,
        (validDefinition, existingCatalog) => {
          const catalogReference = existingCatalog;
          const catalogSnapshot = structuredClone(existingCatalog);

          for (const violation of publicationViolations) {
            const result = validatePublication(injectViolation(validDefinition, violation));

            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.violations).toContain(violation);
            }
            expect(existingCatalog).toBe(catalogReference);
            expect(existingCatalog).toEqual(catalogSnapshot);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
