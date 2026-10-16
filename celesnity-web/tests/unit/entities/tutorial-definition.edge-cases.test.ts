import { describe, expect, it } from 'vitest';

import {
  validatePublication,
  type TutorialDefinition,
  type TutorialMetadata,
} from '@/src/entities/models/tutorial-definition';

function createDefinition(id: string, title = 'Create a connection'): TutorialDefinition {
  return {
    id,
    metadata: {
      title,
      summary: 'Connect a data source to the workspace.',
      category: 'Connections',
      learningOutcomes: ['Create a connection'],
      estimatedMinutes: 5,
      stepCount: 1,
    },
    steps: [
      {
        id: `${id}-step-1`,
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
  };
}

function withMetadataRecords(
  definition: TutorialDefinition,
  metadata: readonly TutorialMetadata[],
): TutorialDefinition {
  return { ...definition, metadata } as unknown as TutorialDefinition;
}

describe('tutorial publication edge cases', () => {
  it('publishes when feature, prerequisite, and context requirement sets are explicitly empty', () => {
    const candidate = createDefinition('tutorial-empty-requirements');

    expect(validatePublication(candidate)).toEqual({ ok: true });
  });

  it('supports publishing multiple distinct valid tutorials', () => {
    const candidates = [
      createDefinition('tutorial-create-connection'),
      createDefinition('tutorial-create-pipeline', 'Create a pipeline'),
    ];

    expect(candidates.map(validatePublication)).toEqual([{ ok: true }, { ok: true }]);
  });

  it('rejects a definition associated with multiple metadata records', () => {
    const candidate = createDefinition('tutorial-multiple-metadata');
    const secondMetadata: TutorialMetadata = {
      ...candidate.metadata,
      title: 'Duplicate metadata',
    };

    expect(
      validatePublication(withMetadataRecords(candidate, [candidate.metadata, secondMetadata])),
    ).toEqual({
      ok: false,
      violations: ['MISSING_METADATA'],
    });
  });
});
