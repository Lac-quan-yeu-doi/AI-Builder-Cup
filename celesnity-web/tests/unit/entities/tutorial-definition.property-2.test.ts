import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  tutorialDefinitionArbitrary,
  type GeneratedTutorialDefinition,
} from './tutorial-arbitraries';

type TutorialRevision =
  Pick<GeneratedTutorialDefinition, 'metadata'> | Pick<GeneratedTutorialDefinition, 'steps'>;

function reviseTutorialDefinition(
  definition: GeneratedTutorialDefinition,
  revision: TutorialRevision,
): GeneratedTutorialDefinition {
  return { ...definition, ...revision };
}

describe('tutorial definition revisions', () => {
  // Feature: guided-user-tutorials, Property 2: Identifier is preserved across revisions
  // **Validates: Requirements 1.2**
  it('retains the original identifier when metadata or steps are revised', () => {
    fc.assert(
      fc.property(
        tutorialDefinitionArbitrary,
        tutorialDefinitionArbitrary,
        (definition, revisionSource) => {
          const metadataRevision = reviseTutorialDefinition(definition, {
            metadata: revisionSource.metadata,
          });
          const stepsRevision = reviseTutorialDefinition(definition, {
            steps: revisionSource.steps,
          });

          expect(metadataRevision.metadata).toEqual(revisionSource.metadata);
          expect(metadataRevision.id).toBe(definition.id);
          expect(stepsRevision.steps).toEqual(revisionSource.steps);
          expect(stepsRevision.id).toBe(definition.id);
        },
      ),
      { numRuns: 100 },
    );
  });
});
