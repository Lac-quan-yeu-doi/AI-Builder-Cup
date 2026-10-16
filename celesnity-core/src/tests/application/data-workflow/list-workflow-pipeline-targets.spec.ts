import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import { ListWorkflowPipelineTargetsUseCase } from '@application/data-workflow/list-workflow-pipeline-targets.use-case';

describe('ListWorkflowPipelineTargetsUseCase', () => {
  const actor = { organizationId: 'org-1', identityId: 'user-1' };
  const pipeline = { pipelineId: 'pipeline-1', versionNumber: 4 };

  it('checks pipeline access before reading its target schema', async () => {
    const denied = new Error('denied');
    const access = { requirePipeline: jest.fn().mockRejectedValue(denied) };
    const schemas = { describe: jest.fn() };
    const useCase = new ListWorkflowPipelineTargetsUseCase(
      access as unknown as IWorkflowAccess,
      schemas,
    );

    await expect(useCase.execute(actor, pipeline)).rejects.toBe(denied);
    expect(access.requirePipeline).toHaveBeenCalledWith(actor, pipeline);
    expect(schemas.describe).not.toHaveBeenCalled();
  });

  it('returns the target schema from the authorized pinned pipeline version', async () => {
    const result = [{ targetNodeId: 'target-node', tableName: 'orders', columns: [] }];
    const access = { requirePipeline: jest.fn().mockResolvedValue(undefined) };
    const schemas = { describe: jest.fn().mockResolvedValue(result) };
    const useCase = new ListWorkflowPipelineTargetsUseCase(
      access as unknown as IWorkflowAccess,
      schemas,
    );

    await expect(useCase.execute(actor, pipeline)).resolves.toBe(result);
    expect(schemas.describe).toHaveBeenCalledWith(pipeline);
  });
});
