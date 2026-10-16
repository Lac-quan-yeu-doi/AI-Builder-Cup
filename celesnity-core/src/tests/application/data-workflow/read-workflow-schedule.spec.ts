import { GetWorkflowScheduleUseCase } from '@application/data-workflow/read-workflow-schedule.use-case';
import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowScheduleRepository } from '@application/data-workflow/interfaces/i-workflow-schedule-repository';

const actor: WorkflowActor = { organizationId: 'org-a', identityId: 'identity-a' };
const workflow = {
  id: 'workflow-a',
  organizationId: actor.organizationId,
  paused: true,
  draft: { nodes: [{ id: 'trigger', type: 'TRIGGER' }], edges: [] },
};
const schedule = {
  id: 'schedule-a',
  organizationId: actor.organizationId,
  workflowId: workflow.id,
  versionId: 'version-a',
  actor: 'confidential-identity',
  triggerKind: 'CALENDAR' as const,
  nextDueAt: new Date('2026-09-19T07:00:00.000Z'),
  coalescedCount: 2,
  revision: 4,
  enabled: true,
  createdAt: new Date('2026-09-18T00:00:00.000Z'),
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
};

describe('GetWorkflowScheduleUseCase', () => {
  it('authorizes and returns only the current schedule for the workflow tenant', async () => {
    const access = { require: jest.fn() } as unknown as jest.Mocked<IWorkflowAccess>;
    const result = await new GetWorkflowScheduleUseCase(
      {
        find: jest.fn(async () => workflow),
        findVersionById: jest.fn(),
      } as unknown as IWorkflowRepository,
      { findCurrent: jest.fn(async () => schedule) } as unknown as IWorkflowScheduleRepository,
      access,
    ).execute(actor, workflow.id);

    expect(result).toEqual({ workflow, schedule });
    expect(access.require).toHaveBeenCalledWith(actor, 'READ', workflow.id);
  });

  it('hides a schedule returned from a different tenant or workflow', async () => {
    const result = await new GetWorkflowScheduleUseCase(
      {
        find: jest.fn(async () => workflow),
        findVersionById: jest.fn(),
      } as unknown as IWorkflowRepository,
      {
        findCurrent: jest.fn(async () => ({
          ...schedule,
          organizationId: 'org-b',
          workflowId: 'workflow-b',
        })),
      } as unknown as IWorkflowScheduleRepository,
      { require: jest.fn() } as unknown as IWorkflowAccess,
    ).execute(actor, workflow.id);

    expect(result).toEqual({ workflow, schedule: undefined });
  });
});
