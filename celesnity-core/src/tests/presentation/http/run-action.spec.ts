import type { ActionActor, ActionDefinition } from '@application/actions/action.types';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import type { PendingAction } from '@application/actions/pending-action.model';
import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { runAction, unwrapCompleted } from '@presentation/http/run-action';

const actor: ActionActor = { source: 'agent', runId: 'run-1', identityId: null };

function buildAuditLog(): IActionAuditLog & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    record: (...args): Promise<void> => {
      calls.push(args);
      return Promise.resolve();
    },
  };
}

function buildPendingActions(): Pick<PendingActionUseCases, 'propose'> & {
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  return {
    calls,
    propose: (actionName, input, proposeActor, rationale = null): Promise<PendingAction> => {
      calls.push([actionName, input, proposeActor, rationale]);
      return Promise.resolve({
        id: 'pending-1',
        actionName,
        input,
        actor: proposeActor,
        status: 'pending',
        rationale,
        result: null,
        errorMessage: null,
        createdAt: '2026-08-23T00:00:00.000Z',
        decidedAt: null,
        expiresAt: '2026-08-24T00:00:00.000Z',
      });
    },
  };
}

function buildAction(
  overrides: Partial<ActionDefinition<{ value: string }, string>> = {},
): ActionDefinition<{ value: string }, string> {
  return {
    name: 'test.action',
    permission: 'write',
    auditRequired: false,
    approvalRequired: false,
    run: (input: { value: string }): Promise<string> => Promise.resolve(input.value),
    ...overrides,
  };
}

describe('runAction', () => {
  it('runs the action and returns its result', async () => {
    const auditLog = buildAuditLog();
    const result = await runAction(
      buildAction(),
      { value: 'ok' },
      actor,
      auditLog,
      buildPendingActions(),
    );

    expect(result).toEqual({ kind: 'completed', value: 'ok' });
    expect(unwrapCompleted(result)).toBe('ok');
  });

  it('records an audit entry when auditRequired is true', async () => {
    const auditLog = buildAuditLog();
    await runAction(
      buildAction({ auditRequired: true }),
      { value: 'ok' },
      actor,
      auditLog,
      buildPendingActions(),
    );

    expect(auditLog.calls).toEqual([['test.action', actor, { value: 'ok' }]]);
  });

  it('does not record an audit entry when auditRequired is false', async () => {
    const auditLog = buildAuditLog();
    await runAction(
      buildAction({ auditRequired: false }),
      { value: 'ok' },
      actor,
      auditLog,
      buildPendingActions(),
    );

    expect(auditLog.calls).toEqual([]);
  });

  it('proposes a pending action and never runs it directly when approvalRequired is true', async () => {
    const auditLog = buildAuditLog();
    const pendingActions = buildPendingActions();
    const run = jest.fn((input: { value: string }): Promise<string> =>
      Promise.resolve(input.value),
    );

    const result = await runAction(
      buildAction({ approvalRequired: true, run }),
      { value: 'ok' },
      actor,
      auditLog,
      pendingActions,
    );

    expect(result).toEqual({
      kind: 'pending_approval',
      pendingActionId: 'pending-1',
      actionName: 'test.action',
    });
    expect(run).not.toHaveBeenCalled();
    expect(pendingActions.calls).toEqual([['test.action', { value: 'ok' }, actor, null]]);
  });

  it('forwards a rationale to propose when one is given', async () => {
    const auditLog = buildAuditLog();
    const pendingActions = buildPendingActions();

    await runAction(
      buildAction({ approvalRequired: true }),
      { value: 'ok' },
      actor,
      auditLog,
      pendingActions,
      'no longer needed',
    );

    expect(pendingActions.calls).toEqual([
      ['test.action', { value: 'ok' }, actor, 'no longer needed'],
    ]);
  });

  it('requires approval when an override of true is given, even though the action defaults to false', async () => {
    const auditLog = buildAuditLog();
    const pendingActions = buildPendingActions();
    const run = jest.fn((input: { value: string }): Promise<string> =>
      Promise.resolve(input.value),
    );

    const result = await runAction(
      buildAction({ approvalRequired: false, run }),
      { value: 'ok' },
      actor,
      auditLog,
      pendingActions,
      undefined,
      true,
    );

    expect(result.kind).toBe('pending_approval');
    expect(run).not.toHaveBeenCalled();
  });

  it('skips approval when an override of false is given, even though the action defaults to true', async () => {
    const auditLog = buildAuditLog();
    const pendingActions = buildPendingActions();
    const run = jest.fn((input: { value: string }): Promise<string> =>
      Promise.resolve(input.value),
    );

    const result = await runAction(
      buildAction({ approvalRequired: true, run }),
      { value: 'ok' },
      actor,
      auditLog,
      pendingActions,
      undefined,
      false,
    );

    expect(result).toEqual({ kind: 'completed', value: 'ok' });
    expect(run).toHaveBeenCalledWith({ value: 'ok' }, actor);
    expect(pendingActions.calls).toEqual([]);
  });

  it('falls back to the action default when no override is given', async () => {
    const auditLog = buildAuditLog();
    const pendingActions = buildPendingActions();

    const result = await runAction(
      buildAction({ approvalRequired: false }),
      { value: 'ok' },
      actor,
      auditLog,
      pendingActions,
      undefined,
      undefined,
    );

    expect(result).toEqual({ kind: 'completed', value: 'ok' });
  });
});

describe('unwrapCompleted', () => {
  it('throws when given a pending_approval result', () => {
    expect(() =>
      unwrapCompleted({
        kind: 'pending_approval',
        pendingActionId: 'pending-1',
        actionName: 'test.action',
      }),
    ).toThrow(/unexpectedly required approval/);
  });
});
