import {
  AutomationWorkflowSchedulerService,
  type AutomationWorkflowSchedulerLogger,
} from '@application/automation-workflow/automation-workflow-scheduler.service';
import type { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';

const noopLogger: AutomationWorkflowSchedulerLogger = { error: () => undefined };

function makeWorkflow(id: string): AutomationWorkflow {
  return AutomationWorkflow.create({
    id,
    organizationId: 'org-1',
    name: 'Daily digest',
    status: 'enabled',
    triggerType: 'SCHEDULE',
    scheduleCron: '0 9 * * *',
    scheduleTimezone: 'UTC',
    createdBy: 'user-1',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  });
}

describe('AutomationWorkflowSchedulerService.tick', () => {
  it('claims due workflows and dispatches each one, returning the claimed count', async () => {
    const due = [makeWorkflow('wf-1'), makeWorkflow('wf-2')];
    const dispatched: string[] = [];
    const useCases = {
      claimDueSchedules: jest.fn(async () => due),
      dispatchScheduledWorkflow: jest.fn(async (workflow: AutomationWorkflow) => {
        dispatched.push(workflow.id);
      }),
    } as unknown as AutomationWorkflowUseCases;

    const service = new AutomationWorkflowSchedulerService(useCases, 10, noopLogger);
    const count = await service.tick();

    expect(useCases.claimDueSchedules).toHaveBeenCalledWith(10, expect.any(Date));
    expect(dispatched).toEqual(['wf-1', 'wf-2']);
    expect(count).toBe(2);
  });

  it('dispatching one claimed workflow failing does not block the next one', async () => {
    const due = [makeWorkflow('wf-1'), makeWorkflow('wf-2')];
    const dispatched: string[] = [];
    const useCases = {
      claimDueSchedules: jest.fn(async () => due),
      dispatchScheduledWorkflow: jest.fn(async (workflow: AutomationWorkflow) => {
        if (workflow.id === 'wf-1') throw new Error('boom');
        dispatched.push(workflow.id);
      }),
    } as unknown as AutomationWorkflowUseCases;

    const service = new AutomationWorkflowSchedulerService(useCases, 10, noopLogger);
    const count = await service.tick();

    expect(dispatched).toEqual(['wf-2']);
    expect(count).toBe(2);
  });

  it('returns 0 when nothing is due', async () => {
    const useCases = {
      claimDueSchedules: jest.fn(async () => []),
      dispatchScheduledWorkflow: jest.fn(),
    } as unknown as AutomationWorkflowUseCases;

    const service = new AutomationWorkflowSchedulerService(useCases, 10, noopLogger);
    expect(await service.tick()).toBe(0);
    expect(useCases.dispatchScheduledWorkflow).not.toHaveBeenCalled();
  });
});
