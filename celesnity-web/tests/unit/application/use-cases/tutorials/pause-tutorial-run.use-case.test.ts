import { describe, expect, it, vi } from 'vitest';

import {
  createPauseTutorialRunUseCase,
  type PauseTutorialRunTrigger,
} from '@/src/application/use-cases/tutorials/pause-tutorial-run.use-case';
import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

const progress: ProgressRecord = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-2',
  completedStepIds: ['step-1'],
  contextSelections: [],
  updatedAt: '2026-09-04T00:00:00.000Z',
};

const steps: readonly TutorialStep[] = [
  {
    id: 'step-1',
    order: 1,
    title: 'Choose a source',
    instructionalContent: 'Choose the source to inspect.',
    destinationFeature: 'CONNECTIONS',
    destinationHref: '/connections',
  },
  {
    id: 'step-2',
    order: 2,
    title: 'Inspect the schema',
    instructionalContent: 'Inspect the selected source schema.',
    destinationFeature: 'SOURCE_SCHEMA',
    destinationHref: '/catalog/source-schema',
  },
];

const pausedAt = '2026-09-04T01:00:00.000Z';

function dependencies(save: (record: ProgressRecord) => Promise<ProgressRecord>) {
  return {
    progressRepository: { save },
    identitySessionRepository: { signOut: vi.fn(async () => undefined) },
  };
}

function input(trigger: PauseTutorialRunTrigger) {
  return { progress, steps, pausedAt, trigger } as const;
}

describe('pause tutorial run use case', () => {
  it.each(['USER_REQUEST', 'PANEL_CLOSE'] as const)(
    'persists PAUSED with the first incomplete step before confirming a %s pause',
    async (trigger) => {
      const save = vi.fn(async (record: ProgressRecord) => record);
      const deps = dependencies(save);

      const result = await createPauseTutorialRunUseCase(deps)(input(trigger));

      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith({
        ...progress,
        status: 'PAUSED',
        currentStepId: 'step-2',
        updatedAt: pausedAt,
      });
      expect(result).toEqual({
        ok: true,
        progress: {
          ...progress,
          status: 'PAUSED',
          currentStepId: 'step-2',
          updatedAt: pausedAt,
        },
      });
      expect(progress.status).toBe('IN_PROGRESS');
    },
  );

  it('persists the pause before ending the identity session during sign-out', async () => {
    const calls: string[] = [];
    const save = vi.fn(async (record: ProgressRecord) => {
      calls.push(`save:${record.status}`);
      return record;
    });
    const deps = dependencies(save);
    deps.identitySessionRepository.signOut.mockImplementation(async () => {
      calls.push('signOut');
    });

    const result = await createPauseTutorialRunUseCase(deps)(input('SIGN_OUT'));

    expect(calls).toEqual(['save:PAUSED', 'signOut']);
    expect(result.ok).toBe(true);
  });

  it('checkpoints current progress before persisting PAUSED after access loss', async () => {
    const save = vi.fn(async (record: ProgressRecord) => record);
    const deps = dependencies(save);

    const result = await createPauseTutorialRunUseCase(deps)(input('ACCESS_LOSS'));

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, progress);
    expect(save).toHaveBeenNthCalledWith(2, {
      ...progress,
      status: 'PAUSED',
      currentStepId: 'step-2',
      updatedAt: pausedAt,
    });
    expect(result.ok).toBe(true);
  });

  it('retains the unchanged IN_PROGRESS state and does not sign out when pause persistence fails', async () => {
    const error = new Error('progress persistence unavailable');
    const save = vi.fn(async (): Promise<ProgressRecord> => {
      throw error;
    });
    const deps = dependencies(save);

    const result = await createPauseTutorialRunUseCase(deps)(input('SIGN_OUT'));

    expect(result).toEqual({ ok: false, progress, error });
    expect(result.progress).toBe(progress);
    expect(result.progress.status).toBe('IN_PROGRESS');
    expect(deps.identitySessionRepository.signOut).not.toHaveBeenCalled();
  });
});
