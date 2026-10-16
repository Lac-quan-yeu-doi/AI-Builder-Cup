import type { ActionActor, ActionDefinition } from '@application/actions/action.types';
import type { IActionResolver } from '@application/actions/interfaces/i-action-resolver';
import type { IPendingActionRepository } from '@application/actions/interfaces/i-pending-action.repository';
import type { PendingAction } from '@application/actions/pending-action.model';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

const actor: ActionActor = { source: 'agent', runId: 'run-1', identityId: null };

function buildUseCases(
  resolver: IActionResolver,
  options?: { now?: Date; ttlMs?: number },
): {
  useCases: PendingActionUseCases;
  repository: IPendingActionRepository;
  advanceTo: (next: Date) => void;
} {
  let stored: PendingAction | null = null;
  const repository: IPendingActionRepository = {
    create: jest.fn((pendingAction: PendingAction): Promise<PendingAction> => {
      stored = pendingAction;
      return Promise.resolve(pendingAction);
    }),
    findById: jest.fn((): Promise<PendingAction | null> => Promise.resolve(stored)),
    update: jest.fn((pendingAction: PendingAction): Promise<PendingAction> => {
      stored = pendingAction;
      return Promise.resolve(pendingAction);
    }),
    list: jest.fn((): Promise<readonly PendingAction[]> => Promise.resolve(stored ? [stored] : [])),
  };
  let now = options?.now ?? new Date('2026-08-23T00:00:00.000Z');
  const clock: IClock = { now: () => now };
  const ids: IIdGenerator = { next: () => 'pending-1' };
  const useCases = new PendingActionUseCases(
    repository,
    resolver,
    clock,
    ids,
    options?.ttlMs ?? 3_600_000,
  );
  return {
    useCases,
    repository,
    // Lets a test advance time after `propose` without a second `buildUseCases` call.
    advanceTo: (next: Date) => {
      now = next;
    },
  };
}

function buildResolver(action: ActionDefinition<unknown, unknown> | undefined): IActionResolver {
  return { resolve: () => action };
}

describe('PendingActionUseCases', () => {
  it('proposes a pending action with status pending', async () => {
    const { useCases } = buildUseCases(buildResolver(undefined));
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);

    expect(pending).toMatchObject({
      id: 'pending-1',
      actionName: 'chart.delete',
      status: 'pending',
      rationale: null,
      decidedAt: null,
    });
  });

  it('sets expiresAt to createdAt plus the configured TTL', async () => {
    const { useCases } = buildUseCases(buildResolver(undefined), { ttlMs: 3_600_000 });
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);

    expect(pending.expiresAt).toBe('2026-08-23T01:00:00.000Z');
  });

  it('stores a rationale when the caller supplies one', async () => {
    const { useCases } = buildUseCases(buildResolver(undefined));
    const pending = await useCases.propose(
      'chart.delete',
      { chartId: 'chart-1' },
      actor,
      'stale, no longer referenced',
    );

    expect(pending.rationale).toBe('stale, no longer referenced');
  });

  it('list forwards the filter to the repository', async () => {
    const { useCases, repository } = buildUseCases(buildResolver(undefined));

    await useCases.list({ status: 'pending', actorSource: 'agent', runId: 'run-1' });

    expect(repository.list).toHaveBeenCalledWith({
      status: 'pending',
      actorSource: 'agent',
      runId: 'run-1',
    });
  });

  it('approve runs the resolved action and marks it approved with the result', async () => {
    const run = jest.fn((): Promise<string> => Promise.resolve('deleted'));
    const action: ActionDefinition<unknown, unknown> = {
      name: 'chart.delete',
      permission: 'write',
      auditRequired: true,
      approvalRequired: true,
      run,
    };
    const { useCases } = buildUseCases(buildResolver(action));
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);

    const approved = await useCases.approve(pending.id);

    expect(run).toHaveBeenCalledWith({ chartId: 'chart-1' }, actor);
    expect(approved).toMatchObject({ status: 'approved', result: 'deleted', errorMessage: null });
    expect(approved.decidedAt).not.toBeNull();
  });

  it('approve records the error and still marks approved when the action throws', async () => {
    const run = jest.fn((): Promise<string> => Promise.reject(new Error('boom')));
    const action: ActionDefinition<unknown, unknown> = {
      name: 'chart.delete',
      permission: 'write',
      auditRequired: true,
      approvalRequired: true,
      run,
    };
    const { useCases } = buildUseCases(buildResolver(action));
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);

    await expect(useCases.approve(pending.id)).rejects.toThrow('boom');
  });

  it('approve throws when the pending action was already decided', async () => {
    const action: ActionDefinition<unknown, unknown> = {
      name: 'chart.delete',
      permission: 'write',
      auditRequired: true,
      approvalRequired: true,
      run: jest.fn((): Promise<string> => Promise.resolve('deleted')),
    };
    const { useCases } = buildUseCases(buildResolver(action));
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);
    await useCases.reject(pending.id);

    await expect(useCases.approve(pending.id)).rejects.toThrow('already');
  });

  it('approve throws when the action name is not registered', async () => {
    const { useCases } = buildUseCases(buildResolver(undefined));
    const pending = await useCases.propose('chart.unknown', {}, actor);

    await expect(useCases.approve(pending.id)).rejects.toThrow('No action named');
  });

  it('approve throws once the pending action has expired', async () => {
    const action: ActionDefinition<unknown, unknown> = {
      name: 'chart.delete',
      permission: 'write',
      auditRequired: true,
      approvalRequired: true,
      run: jest.fn((): Promise<string> => Promise.resolve('deleted')),
    };
    const { useCases, advanceTo } = buildUseCases(buildResolver(action), { ttlMs: 3_600_000 });
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);
    advanceTo(new Date('2026-08-23T01:00:00.001Z'));

    await expect(useCases.approve(pending.id)).rejects.toThrow('expired');
  });

  it('reject throws once the pending action has expired', async () => {
    const { useCases, advanceTo } = buildUseCases(buildResolver(undefined), { ttlMs: 3_600_000 });
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);
    advanceTo(new Date('2026-08-23T01:00:00.001Z'));

    await expect(useCases.reject(pending.id)).rejects.toThrow('expired');
  });

  it('approve at exactly the expiry instant is still too late', async () => {
    // `>=`, not `>`: an action proposed with a 1-hour TTL is not approvable
    // AT the one-hour mark, only strictly before it — a boundary a caller
    // could otherwise race by submitting at exactly that instant.
    const { useCases, advanceTo } = buildUseCases(buildResolver(undefined), { ttlMs: 3_600_000 });
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);
    advanceTo(new Date('2026-08-23T01:00:00.000Z'));

    await expect(useCases.reject(pending.id)).rejects.toThrow('expired');
  });

  it('reject marks the pending action rejected without running anything', async () => {
    const { useCases } = buildUseCases(buildResolver(undefined));
    const pending = await useCases.propose('chart.delete', { chartId: 'chart-1' }, actor);

    const rejected = await useCases.reject(pending.id);

    expect(rejected.status).toBe('rejected');
    expect(rejected.decidedAt).not.toBeNull();
  });

  it('findById throws PendingActionError.notFound for an unknown id', async () => {
    const { useCases } = buildUseCases(buildResolver(undefined));

    await expect(useCases.findById('missing')).rejects.toThrow('Pending action not found');
  });
});
