import { describe, expect, it } from 'vitest';

import {
  validatePublication,
  type TutorialDefinition,
  type TutorialStep,
} from '@/src/entities/models/tutorial-definition';

function definition(overrides: Partial<TutorialDefinition> = {}): TutorialDefinition {
  return {
    id: 'tutorial-1',
    metadata: {
      title: 'Create a connection',
      summary: 'Connect a data source to the workspace.',
      category: 'Connections',
      learningOutcomes: ['Create a connection'],
      estimatedMinutes: 5,
      stepCount: 1,
    },
    steps: [
      {
        id: 'step-1',
        order: 1,
        title: 'Open connections',
        instructionalContent: 'Open the connections destination.',
        destinationFeature: 'CONNECTIONS',
        destinationHref: '/workspace/connections',
      },
    ],
    requiredFeatures: [],
    prerequisites: [],
    contextRequirements: [],
    ...overrides,
  };
}

function malformedDefinition(value: unknown): TutorialDefinition {
  return value as TutorialDefinition;
}

function firstStep(value: TutorialDefinition): TutorialStep {
  const step = value.steps.at(0);
  if (step === undefined) {
    throw new Error('Expected the test definition to contain a step.');
  }
  return step;
}

describe('validatePublication', () => {
  it('accepts a complete definition with ordered steps and explicit requirement sets', () => {
    expect(validatePublication(definition())).toEqual({ ok: true });
  });

  it('reports missing identity, metadata, steps, and explicit requirement sets together', () => {
    const result = validatePublication(
      malformedDefinition({
        id: '   ',
        metadata: undefined,
        steps: undefined,
      }),
    );

    expect(result).toEqual({
      ok: false,
      violations: [
        'MISSING_ID',
        'MISSING_METADATA',
        'EMPTY_STEPS',
        'MISSING_REQUIRED_FEATURES',
        'MISSING_PREREQUISITES',
        'MISSING_CONTEXT_REQUIREMENTS',
      ],
    });
  });

  it('rejects non-contiguous step ordering and a metadata step-count mismatch', () => {
    const valid = definition();
    const step = firstStep(valid);
    const result = validatePublication(
      definition({
        metadata: { ...valid.metadata, stepCount: 3 },
        steps: [{ ...step, order: 2 }],
      }),
    );

    expect(result).toEqual({
      ok: false,
      violations: ['UNORDERED_STEPS', 'METADATA_STEP_COUNT_MISMATCH'],
    });
  });

  it('rejects multiple metadata records and ambiguous action or target values', () => {
    const valid = definition();
    const step = firstStep(valid);
    const action = { id: 'create-connection', accessibleName: 'Create connection' };
    const target = {
      id: 'create-button',
      accessibleName: 'Create connection',
      selector: '[data-tutorial-target="create-button"]',
    };

    const result = validatePublication(
      malformedDefinition({
        ...valid,
        metadata: [valid.metadata, valid.metadata],
        steps: [
          {
            ...step,
            requiredAction: [action, action],
            targetControl: [target, target],
          },
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      violations: ['MISSING_METADATA', 'AMBIGUOUS_ACTION', 'AMBIGUOUS_TARGET'],
    });
  });

  it('returns each violation at most once across multiple invalid steps', () => {
    const valid = definition();
    const step = firstStep(valid);

    const result = validatePublication(
      malformedDefinition({
        ...valid,
        metadata: { ...valid.metadata, stepCount: 2 },
        steps: [
          { ...step, order: 2, requiredAction: [], targetControl: [] },
          { ...step, id: 'step-2', order: 1, requiredAction: [], targetControl: [] },
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      violations: ['UNORDERED_STEPS', 'AMBIGUOUS_ACTION', 'AMBIGUOUS_TARGET'],
    });
  });
});
