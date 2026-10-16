import { PreviewWorkflowCalendarUseCase } from '@application/data-workflow/preview-workflow-calendar.use-case';
import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

const actor: WorkflowActor = { organizationId: 'org-a', identityId: 'identity-a' };
const draft: WorkflowGraph = {
  nodes: [
    {
      id: 'trigger',
      type: 'TRIGGER',
      config: {
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        timezone: 'UTC',
      },
    },
  ],
  edges: [],
};

const workflow = {
  id: 'workflow-a',
  organizationId: actor.organizationId,
  revision: 1,
  publishedVersion: 1,
  draft,
};

describe('PreviewWorkflowCalendarUseCase', () => {
  const access = { require: jest.fn() } as unknown as jest.Mocked<IWorkflowAccess>;
  const workflows = {
    find: jest.fn(async () => workflow),
    findVersion: jest.fn(),
  } as unknown as jest.Mocked<IWorkflowRepository>;
  const triggerSchedule = { next: jest.fn() } as unknown as jest.Mocked<IWorkflowTriggerSchedule>;
  const clock = { now: jest.fn(() => new Date('2026-09-18T00:00:00.000Z')) } as jest.Mocked<IClock>;

  beforeEach(() => jest.clearAllMocks());

  it('authorizes and returns a bounded sequence from the draft calendar trigger', async () => {
    triggerSchedule.next
      .mockReturnValueOnce(new Date('2026-09-18T07:00:00.000Z'))
      .mockReturnValueOnce(new Date('2026-09-19T07:00:00.000Z'));
    const preview = new PreviewWorkflowCalendarUseCase(workflows, access, triggerSchedule, clock);

    await expect(
      preview.execute(actor, workflow.id, { source: 'DRAFT', count: 2 }),
    ).resolves.toEqual({
      source: 'DRAFT',
      trigger: {
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        timezone: 'UTC',
      },
      occurrences: [new Date('2026-09-18T07:00:00.000Z'), new Date('2026-09-19T07:00:00.000Z')],
    });
    expect(access.require).toHaveBeenCalledWith(actor, 'READ', workflow.id);
    expect(triggerSchedule.next).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'CALENDAR' }),
      new Date('2026-09-18T07:00:00.000Z'),
    );
  });

  it('uses the immutable published graph only when the caller selects it', async () => {
    workflows.findVersion.mockResolvedValueOnce({
      id: 'version-a',
      organizationId: actor.organizationId,
      workflowId: workflow.id,
      versionNumber: 1,
      graph: workflow.draft,
      trigger: { triggerNodeId: 'trigger' },
      publishedAt: new Date('2026-09-17T00:00:00.000Z'),
    });
    triggerSchedule.next.mockReturnValueOnce(new Date('2026-09-18T07:00:00.000Z'));
    const preview = new PreviewWorkflowCalendarUseCase(workflows, access, triggerSchedule, clock);

    await expect(
      preview.execute(actor, workflow.id, { source: 'PUBLISHED', count: 1 }),
    ).resolves.toMatchObject({
      source: 'PUBLISHED',
      occurrences: [new Date('2026-09-18T07:00:00.000Z')],
    });
    expect(workflows.findVersion).toHaveBeenCalledWith(workflow.id, 1);
  });

  it('rejects an unbounded preview and does not leak trigger-parser failures', async () => {
    const preview = new PreviewWorkflowCalendarUseCase(workflows, access, triggerSchedule, clock);

    await expect(
      preview.execute(actor, workflow.id, { source: 'DRAFT', count: 21 }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_GRAPH_INVALID',
    });
    triggerSchedule.next.mockImplementationOnce(() => {
      throw new Error('untrusted cron parser detail');
    });
    await expect(
      preview.execute(actor, workflow.id, { source: 'DRAFT', count: 1 }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_GRAPH_INVALID',
      message: 'The workflow graph is invalid.',
    });
  });
});
