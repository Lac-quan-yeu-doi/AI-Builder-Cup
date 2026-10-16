import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createRepeatTutorialUseCase } from '@/src/application/use-cases/tutorials/repeat-tutorial.use-case';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';
import {
  progressRecordArbitrary,
  tutorialDefinitionArbitrary,
} from '@/tests/unit/entities/tutorial-arbitraries';

const repeatedAt = '2027-03-04T05:06:07.000Z';
const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/);
const timestampArbitrary = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((timestamp) => new Date(timestamp).toISOString());
const completionRecordsArbitrary = fc.uniqueArray(
  fc.record({
    runId: identifierArbitrary,
    completedAt: timestampArbitrary,
  }),
  { minLength: 1, maxLength: 8, selector: (record) => record.runId },
);

describe('repeat tutorial Property 32', () => {
  // Feature: guided-user-tutorials, Property 32: Repetition resets the run and preserves prior completion records
  // **Validates: Requirements 11.12, 11.13**
  it('creates a fresh first-step run without changing prior completion records', async () => {
    await fc.assert(
      fc.asyncProperty(
        tutorialDefinitionArbitrary,
        progressRecordArbitrary,
        completionRecordsArbitrary,
        async (generatedDefinition, generatedProgress, generatedCompletionRecords) => {
          const definition: TutorialDefinition = generatedDefinition;
          const orderedSteps = [...definition.steps].sort(
            (left, right) => left.order - right.order,
          );
          const firstStep = orderedSteps[0];
          const finalStep = orderedSteps.at(-1);

          if (firstStep === undefined || finalStep === undefined) {
            throw new RangeError('Generated tutorial definitions must contain a step.');
          }

          const completedProgress: ProgressRecord = {
            ...generatedProgress,
            tutorialId: definition.id,
            status: 'COMPLETED',
            currentStepId: finalStep.id,
            completedStepIds: orderedSteps.map((step) => step.id),
            contextSelections: generatedProgress.contextSelections.map((selection) => ({
              requirementId: selection.requirementId,
              resourceType: selection.resourceType,
              resourceId: selection.resourceId,
            })),
          };
          const priorCompletionRecords: CompletionRecord[] = generatedCompletionRecords.map(
            (record) => ({ ...record }),
          );
          const priorCompletionSnapshot = priorCompletionRecords.map((record) => ({
            ...record,
          }));
          const savedRecords: ProgressRecord[] = [];
          const save = vi.fn(async (record: ProgressRecord): Promise<ProgressRecord> => {
            savedRecords.push(record);
            return record;
          });
          const saveCompletion = vi.fn(async (runId: string): Promise<CompletionRecord> => ({
            runId,
            completedAt: repeatedAt,
          }));
          const progressRepository = { save, saveCompletion };
          const repeat = createRepeatTutorialUseCase({
            tutorialRepository: {
              getDefinition: vi.fn(async () => definition),
            },
            progressRepository,
            now: () => repeatedAt,
          });

          const result = await repeat({
            progress: completedProgress,
            confirmed: true,
          });

          expect(result.outcome).toBe('REPEATED');
          if (result.outcome !== 'REPEATED') {
            throw new Error('Confirmed repetition must create a new tutorial run.');
          }

          expect(savedRecords).toHaveLength(1);
          expect(result.run).toBe(savedRecords[0]);
          expect(result.run).not.toBe(completedProgress);
          expect(result.run).toEqual({
            ...completedProgress,
            status: 'IN_PROGRESS',
            currentStepId: firstStep.id,
            completedStepIds: [],
            contextSelections: completedProgress.contextSelections,
            updatedAt: repeatedAt,
          });
          expect(result.run.completedStepIds).toEqual([]);
          expect(result.destinationHref).toBe(firstStep.destinationHref);
          expect(saveCompletion).not.toHaveBeenCalled();
          expect(priorCompletionRecords).toEqual(priorCompletionSnapshot);
          expect(completedProgress.status).toBe('COMPLETED');
          expect(completedProgress.completedStepIds).toEqual(orderedSteps.map((step) => step.id));
        },
      ),
      { numRuns: 100 },
    );
  });
});
