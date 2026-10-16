import {
  GetWorkflowRunUseCase,
  ListWorkflowRunsUseCase,
} from '@application/data-workflow/read-workflow-run.use-cases';
import { GetWorkflowUseCase } from '@application/data-workflow/read-workflow.use-cases';
import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowAuthoringErrorCode } from '@application/data-workflow/workflow-authoring.error';
import { WorkflowRunErrorCode } from '@application/data-workflow/workflow-run.error';

const actor: WorkflowActor = { organizationId: 'org-a', identityId: 'identity-a' };

describe('Data Workflow read authorization', () => {
  it('requires explicit workflow read authorization before returning a workflow', async () => {
    const access = { require: jest.fn() } as unknown as jest.Mocked<IWorkflowAccess>;
    const useCase = new GetWorkflowUseCase(
      { find: jest.fn(async () => undefined) } as unknown as IWorkflowRepository,
      access,
    );

    await expect(useCase.execute(actor, 'workflow-a')).rejects.toMatchObject({
      code: WorkflowAuthoringErrorCode.NOT_FOUND,
    });
    expect(access.require).toHaveBeenCalledWith(actor, 'READ', 'workflow-a');
  });

  it('excludes a run snapshot if it no longer belongs to the authorized workflow tenant', async () => {
    const access = { require: jest.fn() } as unknown as jest.Mocked<IWorkflowAccess>;
    const useCase = new ListWorkflowRunsUseCase(
      {
        listByWorkflow: jest.fn(async () => [
          { id: 'run-a', workflowId: 'workflow-a', organizationId: 'org-a' },
        ]),
        findSnapshot: jest.fn(async () => ({
          run: { id: 'run-a', workflowId: 'workflow-a', organizationId: 'org-b' },
          nodeAttempts: [],
          edgeStates: [],
        })),
      } as unknown as IWorkflowRunRepository,
      access,
    );

    await expect(useCase.execute(actor, 'workflow-a', 20)).resolves.toMatchObject({ items: [] });
    expect(access.require).toHaveBeenCalledWith(actor, 'READ', 'workflow-a');
  });

  it('returns 404 when a run belongs to another workflow even if its id exists', async () => {
    const useCase = new GetWorkflowRunUseCase(
      {
        findSnapshot: jest.fn(async () => ({
          run: {
            id: 'run-a',
            workflowId: 'workflow-a',
            organizationId: 'org-a',
          },
          nodeAttempts: [],
          edgeStates: [],
        })),
      } as unknown as IWorkflowRunRepository,
      { require: jest.fn() } as unknown as IWorkflowAccess,
    );

    await expect(useCase.execute(actor, 'workflow-b', 'run-a')).rejects.toMatchObject({
      code: WorkflowRunErrorCode.NOT_FOUND,
    });
  });
});
