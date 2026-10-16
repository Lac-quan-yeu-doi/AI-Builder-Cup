import type { AdvanceWorkflowRunService } from '@application/data-workflow/advance-workflow-run.service';
import { DataWorkflowWorkerService } from '@application/data-workflow/data-workflow-worker.service';
import type { IWorkflowRunClaimStore } from '@application/data-workflow/interfaces/i-workflow-run-claim-store';
import type { WorkflowRunAuthorizationService } from '@application/data-workflow/workflow-run-authorization.service';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { backgroundContexts } from '@tests/application/administration/background-principal.fixture';
import type { DataWorkflowRun } from '@domain/data-workflow/models/workflow-persistence';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-17T11:00:00.000Z');

describe('DataWorkflowWorkerService', () => {
  it('claims once with a bounded lease and establishes organization context before advance', async () => {
    const claimDue = jest
      .fn()
      .mockResolvedValue([
        { runId: RUN_ID, organizationId: ORGANIZATION_ID, leaseToken: 'lease-a' },
      ]);
    const contexts = backgroundContexts();
    const authorize = jest.fn(async () => {
      expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
      expect(contexts.require().identityId).not.toBe(ACTOR_ID);
      return authorizedRun('lease-a');
    });
    const advance = jest.fn(async () => {
      expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
      expect(contexts.require().identityId).toBe(ACTOR_ID);
    });
    const worker = service(claimDue, authorize, advance, contexts);

    await expect(worker.tick()).resolves.toBe(1);
    expect(claimDue).toHaveBeenCalledWith({
      limit: 2,
      owner: 'worker-a',
      now,
      leaseMs: 30_000,
      reconciliationMs: 5_000,
    });
    expect(authorize).toHaveBeenCalledWith(RUN_ID, 'lease-a');
    expect(advance).toHaveBeenCalledWith({ runId: RUN_ID, leaseToken: 'lease-a' });
  });

  it('does not dispatch after the initiating principal was revoked', async () => {
    const claimDue = jest
      .fn()
      .mockResolvedValue([
        { runId: RUN_ID, organizationId: ORGANIZATION_ID, leaseToken: 'lease-a' },
      ]);
    const revoked = new Error('WORKFLOW_ACCESS_DENIED');
    const authorize = jest.fn().mockRejectedValue(revoked);
    const advance = jest.fn();
    const worker = service(claimDue, authorize, advance, backgroundContexts());

    await expect(worker.tick()).rejects.toThrow(revoked);
    expect(advance).not.toHaveBeenCalled();
  });

  it('does not reuse a stale claim token after another worker reclaimed the expired lease', async () => {
    const claimDue = jest
      .fn()
      .mockResolvedValueOnce([
        { runId: RUN_ID, organizationId: ORGANIZATION_ID, leaseToken: 'old' },
      ])
      .mockResolvedValueOnce([
        { runId: RUN_ID, organizationId: ORGANIZATION_ID, leaseToken: 'new' },
      ]);
    const authorize = jest.fn(async (_runId: string, leaseToken: string) =>
      authorizedRun(leaseToken),
    );
    const advance = jest.fn(async ({ leaseToken }: { readonly leaseToken: string }) => {
      if (leaseToken === 'old') throw new Error('WORKFLOW_RUN_LEASE_MISMATCH');
    });
    const worker = service(claimDue, authorize, advance, backgroundContexts());

    await expect(worker.tick()).rejects.toThrow('WORKFLOW_RUN_LEASE_MISMATCH');
    await expect(worker.tick()).resolves.toBe(1);
    expect(advance).toHaveBeenLastCalledWith({ runId: RUN_ID, leaseToken: 'new' });
  });

  it('leaves recovery to the durable advance path so a committed node execution is not duplicated', async () => {
    const claimDue = jest
      .fn()
      .mockResolvedValue([
        { runId: RUN_ID, organizationId: ORGANIZATION_ID, leaseToken: 'lease-recovery' },
      ]);
    const authorize = jest.fn(async () => authorizedRun('lease-recovery'));
    const advance = jest.fn();
    const worker = service(claimDue, authorize, advance, backgroundContexts());

    await worker.tick();

    // The worker passes only the fenced run identity. AdvanceWorkflowRunService
    // reloads attempts and its executor returns an already-associated execution.
    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith({ runId: RUN_ID, leaseToken: 'lease-recovery' });
  });
});

function service(
  claimDue: jest.MockedFunction<IWorkflowRunClaimStore['claimDue']>,
  authorize: jest.Mock,
  advance: jest.Mock,
  contexts: AuthenticatedContextStore,
): DataWorkflowWorkerService {
  return new DataWorkflowWorkerService(
    { claimDue },
    { authorize } as unknown as WorkflowRunAuthorizationService,
    { tick: advance } as unknown as AdvanceWorkflowRunService,
    contexts,
    { now: () => now },
    { batchSize: 2, leaseMs: 30_000, reconciliationMs: 5_000 },
    'worker-a',
  );
}

function authorizedRun(leaseToken: string): DataWorkflowRun {
  return {
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
    workflowId: '44444444-4444-4444-8444-444444444444',
    versionId: '55555555-5555-4555-8555-555555555555',
    actor: ACTOR_ID,
    parameters: {},
    triggerContext: {},
    status: 'RUNNING',
    revision: 1,
    leaseOwner: 'worker-a',
    leaseToken,
    leaseExpiresAt: new Date(now.getTime() + 30_000),
    nextReconciliationAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
