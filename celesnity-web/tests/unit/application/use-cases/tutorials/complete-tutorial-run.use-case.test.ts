import { describe, expect, it, vi } from 'vitest';

import { createCompleteTutorialRunUseCase } from '@/src/application/use-cases/tutorials/complete-tutorial-run.use-case';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';

const completedAt = '2027-02-03T04:05:06.000Z';

function progress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    tutorialId: 'tutorial-1',
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId: 'step-final',
    completedStepIds: ['step-1', 'step-final'],
    contextSelections: [],
    updatedAt: '2027-02-03T04:00:00.000Z',
    ...overrides,
  };
}

function createFixture() {
  const calls: string[] = [];
  const completions = new Map<string, CompletionRecord>();
  const save = vi.fn(async (record: ProgressRecord) => {
    calls.push(`save:${record.status}`);
    return record;
  });
  const saveCompletion = vi.fn(async (runId: string) => {
    calls.push(`saveCompletion:${runId}`);
    const existing = completions.get(runId);
    if (existing !== undefined) {
      return existing;
    }

    const completion = { runId, completedAt };
    completions.set(runId, completion);
    return completion;
  });
  const complete = createCompleteTutorialRunUseCase({
    progressRepository: { save, saveCompletion },
    now: () => completedAt,
  });

  return { calls, completions, complete, save, saveCompletion };
}

describe('complete tutorial run use case', () => {
  it('persists COMPLETED status before returning one completion outcome', async () => {
    const fixture = createFixture();
    const original = progress();

    const result = await fixture.complete({ runId: 'run-1', progress: original });

    expect(result).toEqual({
      ok: true,
      progress: {
        ...original,
        status: 'COMPLETED',
        updatedAt: completedAt,
      },
      completion: { runId: 'run-1', completedAt },
    });
    expect(fixture.calls).toEqual(['save:COMPLETED', 'saveCompletion:run-1']);
    expect(original.status).toBe('IN_PROGRESS');
    expect(original.currentStepId).toBe('step-final');
  });

  it('reuses the run-keyed completion record for a repeated completion request', async () => {
    const fixture = createFixture();
    const first = await fixture.complete({ runId: 'run-1', progress: progress() });
    if (!first.ok) {
      throw new Error('Expected the first completion request to succeed.');
    }

    const repeated = await fixture.complete({
      runId: 'run-1',
      progress: first.progress,
    });

    expect(repeated).toEqual(first);
    expect(fixture.save).toHaveBeenCalledTimes(1);
    expect(fixture.saveCompletion).toHaveBeenCalledTimes(2);
    expect(fixture.completions.size).toBe(1);
  });
});
