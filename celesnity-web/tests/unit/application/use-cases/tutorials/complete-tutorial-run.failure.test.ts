import { describe, expect, it, vi } from 'vitest';

import { createCompleteTutorialRunUseCase } from '@/src/application/use-cases/tutorials/complete-tutorial-run.use-case';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';

const completedAt = '2027-02-03T04:05:06.000Z';

function finalStepProgress(): ProgressRecord {
  return {
    tutorialId: 'tutorial-1',
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId: 'step-final',
    completedStepIds: ['step-1', 'step-final'],
    contextSelections: [],
    updatedAt: '2027-02-03T04:00:00.000Z',
  };
}

describe('complete tutorial run persistence failures', () => {
  // Validates: Requirements 11.7, 11.8
  it('identifies status persistence failure and retains the pre-completion final-step state', async () => {
    const failure = new Error('Unable to persist completed status.');
    const original = finalStepProgress();
    const save = vi.fn<(record: ProgressRecord) => Promise<ProgressRecord>>();
    save.mockRejectedValue(failure);
    const saveCompletion = vi.fn<(runId: string) => Promise<CompletionRecord>>();
    const complete = createCompleteTutorialRunUseCase({
      progressRepository: { save, saveCompletion },
      now: () => completedAt,
    });

    const result = await complete({ runId: 'run-1', progress: original });

    expect(result).toEqual({ ok: false, progress: original, error: failure });
    expect(result.progress.status).toBe('IN_PROGRESS');
    expect(result.progress.currentStepId).toBe('step-final');
    expect(saveCompletion).not.toHaveBeenCalled();
  });

  // Validates: Requirements 11.7, 11.8
  it('identifies completion-record persistence failure and retains the pre-completion final-step state', async () => {
    const failure = new Error('Unable to persist completion record.');
    const original = finalStepProgress();
    const save = vi.fn(async (record: ProgressRecord) => record);
    const saveCompletion = vi.fn<(runId: string) => Promise<CompletionRecord>>();
    saveCompletion.mockRejectedValue(failure);
    const complete = createCompleteTutorialRunUseCase({
      progressRepository: { save, saveCompletion },
      now: () => completedAt,
    });

    const result = await complete({ runId: 'run-1', progress: original });

    expect(result).toEqual({ ok: false, progress: original, error: failure });
    expect(result.progress.status).toBe('IN_PROGRESS');
    expect(result.progress.currentStepId).toBe('step-final');
    expect(save).toHaveBeenCalledWith({
      ...original,
      status: 'COMPLETED',
      updatedAt: completedAt,
    });
  });
});
