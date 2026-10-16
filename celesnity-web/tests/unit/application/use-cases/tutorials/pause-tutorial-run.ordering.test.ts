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
const pausedProgress: ProgressRecord = {
  ...progress,
  status: 'PAUSED',
  currentStepId: 'step-2',
  updatedAt: pausedAt,
};

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise was not initialized.');
      }
      resolvePromise(value);
    },
  };
}

function dependencies(save: (record: ProgressRecord) => Promise<ProgressRecord>) {
  return {
    progressRepository: { save },
    identitySessionRepository: { signOut: vi.fn(async () => undefined) },
  };
}

function input(trigger: PauseTutorialRunTrigger) {
  return { progress, steps, pausedAt, trigger } as const;
}

describe('pause tutorial run ordering and failure', () => {
  it('persists PAUSED and the resume point before confirming the pause', async () => {
    const persistence = deferred<ProgressRecord>();
    const save = vi.fn(() => persistence.promise);
    const deps = dependencies(save);
    let confirmed = false;

    const resultPromise = createPauseTutorialRunUseCase(deps)(input('USER_REQUEST'));
    void resultPromise.then(() => {
      confirmed = true;
    });

    await Promise.resolve();

    expect(save).toHaveBeenCalledWith(pausedProgress);
    expect(confirmed).toBe(false);

    persistence.resolve(pausedProgress);

    await expect(resultPromise).resolves.toEqual({ ok: true, progress: pausedProgress });
    expect(confirmed).toBe(true);
  });

  it('ends the authenticated session only after pause persistence succeeds', async () => {
    const persistence = deferred<ProgressRecord>();
    const calls: string[] = [];
    const save = vi.fn(() => {
      calls.push('pause-requested');
      return persistence.promise.then((savedProgress) => {
        calls.push('pause-persisted');
        return savedProgress;
      });
    });
    const deps = dependencies(save);
    deps.identitySessionRepository.signOut.mockImplementation(async () => {
      calls.push('sign-out');
    });

    const resultPromise = createPauseTutorialRunUseCase(deps)(input('SIGN_OUT'));

    await Promise.resolve();

    expect(calls).toEqual(['pause-requested']);
    expect(deps.identitySessionRepository.signOut).not.toHaveBeenCalled();

    persistence.resolve(pausedProgress);

    await expect(resultPromise).resolves.toEqual({ ok: true, progress: pausedProgress });
    expect(calls).toEqual(['pause-requested', 'pause-persisted', 'sign-out']);
  });

  it('checkpoints current progress before persisting PAUSED after access loss', async () => {
    const checkpoint = deferred<ProgressRecord>();
    const calls: string[] = [];
    const save = vi.fn((record: ProgressRecord) => {
      if (record.status === 'IN_PROGRESS') {
        calls.push('checkpoint-requested');
        return checkpoint.promise.then((savedProgress) => {
          calls.push('checkpoint-persisted');
          return savedProgress;
        });
      }

      calls.push('pause-persisted');
      return Promise.resolve(record);
    });
    const deps = dependencies(save);

    const resultPromise = createPauseTutorialRunUseCase(deps)(input('ACCESS_LOSS'));

    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenNthCalledWith(1, progress);
    expect(calls).toEqual(['checkpoint-requested']);

    checkpoint.resolve(progress);

    await expect(resultPromise).resolves.toEqual({ ok: true, progress: pausedProgress });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, pausedProgress);
    expect(calls).toEqual(['checkpoint-requested', 'checkpoint-persisted', 'pause-persisted']);
  });

  it('retains the visible IN_PROGRESS run when pause persistence fails', async () => {
    const error = new Error('progress persistence unavailable');
    const save = vi.fn(async (): Promise<ProgressRecord> => {
      throw error;
    });
    const deps = dependencies(save);

    const result = await createPauseTutorialRunUseCase(deps)(input('SIGN_OUT'));

    expect(result).toEqual({ ok: false, progress, error });
    expect(result.progress).toBe(progress);
    expect(result.progress.status).toBe('IN_PROGRESS');
    expect(result.progress.currentStepId).toBe('step-2');
    expect(deps.identitySessionRepository.signOut).not.toHaveBeenCalled();
  });
});
