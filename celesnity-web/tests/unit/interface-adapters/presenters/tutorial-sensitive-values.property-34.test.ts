import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { completeTutorialRunInputSchema } from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
import { presentCompletionSummary } from '@/src/interface-adapters/presenters/completion.presenter';
import { presentTutorialCatalog } from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';
import { presentTutorialDetail } from '@/src/interface-adapters/presenters/tutorial-detail.presenter';
import { presentWalkthroughStep } from '@/src/interface-adapters/presenters/walkthrough.presenter';
import { sensitiveValuePayloadArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

const completedAt = '2026-10-01T10:00:00.000Z';
const fallbackLocale = { code: 'en', name: 'English' } as const;

function expectSensitiveValuesOmitted(output: unknown, sensitiveValues: readonly string[]): void {
  const serializedOutput = JSON.stringify(output);

  for (const sensitiveValue of sensitiveValues) {
    expect(serializedOutput).not.toContain(sensitiveValue);
  }
}

describe('tutorial presentation Property 34', () => {
  // Feature: guided-user-tutorials, Property 34: Sensitive Values never appear in records, surfaces, or descriptions
  // **Validates: Requirements 12.7**
  it('rejects sensitive record fields and omits sensitive values from every tutorial ViewModel', () => {
    fc.assert(
      fc.property(sensitiveValuePayloadArbitrary, ({ payload, sensitiveValues }) => {
        const definition: TutorialDefinition = {
          ...payload,
          id: 'connect-source',
          metadata: {
            ...payload,
            title: 'Connect a data source',
            summary: 'Create a reusable workspace connection.',
            category: 'Connections',
            learningOutcomes: ['Create a connection'],
            estimatedMinutes: 5,
            stepCount: 1,
          },
          steps: [
            {
              ...payload,
              id: 'create-connection',
              order: 1,
              title: 'Create the connection',
              instructionalContent: 'Enter the connection details and save.',
              destinationFeature: 'CONNECTIONS',
              destinationHref: '/workspace/connections/new',
              targetControl: {
                ...payload,
                id: 'save-connection',
                accessibleName: 'Save connection',
                selector: '[data-tutorial="save-connection"]',
              },
            },
          ],
          requiredFeatures: ['CONNECTIONS'],
          prerequisites: [],
          contextRequirements: [],
        };
        const progress: ProgressRecord = {
          tutorialId: definition.id,
          memberId: 'member-1',
          organizationId: 'organization-1',
          status: 'IN_PROGRESS',
          currentStepId: 'create-connection',
          completedStepIds: [],
          contextSelections: [],
          updatedAt: '2026-10-01T09:00:00.000Z',
        };

        const sensitiveProgressBoundary = completeTutorialRunInputSchema.safeParse({
          runId: 'run-1',
          progress: { ...progress, ...payload },
        });
        expect(sensitiveProgressBoundary.success).toBe(false);

        const catalogView = presentTutorialCatalog([
          {
            ...payload,
            id: definition.id,
            title: definition.metadata.title,
            summary: definition.metadata.summary,
            category: definition.metadata.category,
            learningOutcomes: definition.metadata.learningOutcomes,
            estimatedMinutes: definition.metadata.estimatedMinutes,
            stepCount: definition.metadata.stepCount,
            status: progress.status,
          },
        ]);
        const detailView = presentTutorialDetail({
          ...payload,
          tutorialId: definition.id,
          experience: { mode: 'WORKSPACE' },
          metadata: definition.metadata,
          prerequisiteStates: [
            {
              ...payload,
              id: 'connection-ready',
              description: 'A connection is available.',
              satisfied: false,
              remediation: {
                ...payload,
                label: 'Create connection',
                href: '/workspace/connections',
              },
            },
          ],
          contextSelectors: [
            {
              ...payload,
              id: 'connection:1',
              requirementId: 'connection',
              resourceType: 'CONNECTION',
              options: [
                {
                  ...payload,
                  id: 'connection-1',
                  name: 'Warehouse',
                  resourceType: 'CONNECTION',
                },
              ],
              selectedResource: {
                ...payload,
                id: 'connection-1',
                name: 'Warehouse',
                resourceType: 'CONNECTION',
              },
            },
          ],
          startEnabled: true,
        });
        const step = definition.steps[0];
        if (step === undefined) {
          throw new Error('Expected the generated tutorial fixture to have one step.');
        }
        const walkthroughView = presentWalkthroughStep({
          definition,
          step,
          progress,
          locale: 'en',
          fallbackLocale,
        });
        const completionView = presentCompletionSummary({
          ...payload,
          definition,
          completion: { ...payload, runId: 'run-1', completedAt },
          nextRecommendation: {
            ...payload,
            id: 'next-tutorial',
            title: 'Build a pipeline',
          },
          locale: 'en',
          fallbackLocale,
        });

        for (const output of [catalogView, detailView, walkthroughView, completionView]) {
          expectSensitiveValuesOmitted(output, sensitiveValues);
        }
        expectSensitiveValuesOmitted(walkthroughView.targetAccessibleName, sensitiveValues);
      }),
      { numRuns: 100 },
    );
  });
});
