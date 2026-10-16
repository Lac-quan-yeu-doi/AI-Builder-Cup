import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowRunErrorCode } from '@application/data-workflow/workflow-run.error';
import { WorkflowRunAuthorizationService } from '@application/data-workflow/workflow-run-authorization.service';
import type { DataWorkflowRun } from '@domain/data-workflow/models/workflow-persistence';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-09-17T11:00:00.000Z');

describe('WorkflowRunAuthorizationService', () => {
  it('revalidates the initiating actor and every pinned pipeline before a claimed run advances', async () => {
    const access: jest.Mocked<IWorkflowAccess> = {
      require: jest.fn(),
      requirePipeline: jest.fn(),
    };
    const service = authorizationService(access);

    await expect(service.authorize(RUN_ID, 'lease-a')).resolves.toEqual(run());
    expect(access.require).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, identityId: 'initiator-id' },
      'RUN',
      WORKFLOW_ID,
    );
    expect(access.requirePipeline).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, identityId: 'initiator-id' },
      { pipelineId: 'pipeline-id', versionNumber: 7 },
    );
  });

  it('refuses an expired or revoked claim before any pipeline can be dispatched', async () => {
    const access: jest.Mocked<IWorkflowAccess> = {
      require: jest.fn(),
      requirePipeline: jest.fn(),
    };
    const expired = authorizationService(access, {
      ...run(),
      leaseExpiresAt: now,
    });
    await expect(expired.authorize(RUN_ID, 'lease-a')).rejects.toMatchObject({
      code: WorkflowRunErrorCode.LEASE_MISMATCH,
    });
    expect(access.require).not.toHaveBeenCalled();

    access.require.mockRejectedValueOnce(new Error('WORKFLOW_ACCESS_DENIED'));
    await expect(authorizationService(access).authorize(RUN_ID, 'lease-a')).rejects.toThrow(
      'WORKFLOW_ACCESS_DENIED',
    );
    expect(access.requirePipeline).not.toHaveBeenCalled();
  });
});

function authorizationService(
  access: IWorkflowAccess,
  currentRun: DataWorkflowRun = run(),
): WorkflowRunAuthorizationService {
  const workflows: Pick<IWorkflowRepository, 'findVersionById'> = {
    findVersionById: jest.fn().mockResolvedValue({
      id: VERSION_ID,
      organizationId: ORGANIZATION_ID,
      workflowId: WORKFLOW_ID,
      versionNumber: 1,
      graph: {
        nodes: [
          { id: 'trigger', type: 'TRIGGER' },
          { id: 'pipeline', type: 'PIPELINE', pipelineId: 'pipeline-id', versionNumber: 7 },
        ],
        edges: [
          {
            id: 'edge',
            sourceNodeId: 'trigger',
            sourcePort: 'out',
            targetNodeId: 'pipeline',
            targetPort: 'in',
          },
        ],
      },
      trigger: {},
      publishedAt: now,
    }),
  };
  const runs: Pick<IWorkflowRunRepository, 'find'> = {
    find: jest.fn().mockResolvedValue(currentRun),
  };
  return new WorkflowRunAuthorizationService(
    workflows as IWorkflowRepository,
    runs as IWorkflowRunRepository,
    access,
    { now: () => now },
  );
}

function run(): DataWorkflowRun {
  return {
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
    workflowId: WORKFLOW_ID,
    versionId: VERSION_ID,
    actor: 'initiator-id',
    parameters: {},
    triggerContext: {},
    status: 'RUNNING',
    revision: 2,
    leaseOwner: 'worker-a',
    leaseToken: 'lease-a',
    leaseExpiresAt: new Date(now.getTime() + 30_000),
    nextReconciliationAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
