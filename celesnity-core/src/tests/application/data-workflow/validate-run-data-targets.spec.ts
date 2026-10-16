import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowTargetSchemaReader } from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';
import { ValidateRunDataTargetsUseCase } from '@application/data-workflow/validate-run-data-targets.use-case';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

const actor: WorkflowActor = { organizationId: 'organization-1', identityId: 'identity-1' };

function graph(): WorkflowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER' },
      { id: 'load', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 4 },
      {
        id: 'route',
        type: 'CONDITIONAL_SPLIT',
        conditionKind: 'RUN_DATA',
        mode: 'FIRST_MATCH',
        branches: [
          {
            id: 'large-order',
            runDataCondition: {
              targetNodeId: 'target-1',
              quantifier: 'ANY',
              predicate: { column: 'amount', operator: 'GTE', value: 1000 },
            },
          },
          { id: 'other', fallback: true },
        ],
      },
      { id: 'follow-up', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
    ],
    edges: [
      {
        id: 'start',
        sourceNodeId: 'trigger',
        sourcePortId: 'out',
        targetNodeId: 'load',
        targetPortId: 'in',
      },
      {
        id: 'inspect',
        sourceNodeId: 'load',
        sourcePortId: 'out',
        targetNodeId: 'route',
        targetPortId: 'in',
      },
      {
        id: 'large-order-route',
        sourceNodeId: 'route',
        sourcePortId: 'large-order',
        targetNodeId: 'follow-up',
        targetPortId: 'in',
      },
    ],
  };
}

describe('ValidateRunDataTargetsUseCase', () => {
  let access: jest.Mocked<IWorkflowAccess>;
  let schemas: jest.Mocked<IWorkflowTargetSchemaReader>;
  let validate: ValidateRunDataTargetsUseCase;

  beforeEach(() => {
    access = { require: jest.fn(), requirePipeline: jest.fn() };
    schemas = { describe: jest.fn() };
    validate = new ValidateRunDataTargetsUseCase(access, schemas);
  });

  it('authorizes the direct input pipeline and validates a typed predicate against its target', async () => {
    schemas.describe.mockResolvedValue([
      {
        targetNodeId: 'target-1',
        tableName: 'orders',
        schemaStatus: 'KNOWN',
        columns: [{ id: 'amount', name: 'amount', type: 'decimal(10,2)', nullable: false }],
      },
    ]);

    await expect(validate.execute(actor, graph())).resolves.toBeUndefined();

    expect(access.requirePipeline).toHaveBeenCalledWith(actor, {
      pipelineId: 'pipeline-1',
      versionNumber: 4,
    });
    expect(schemas.describe).toHaveBeenCalledWith({
      pipelineId: 'pipeline-1',
      versionNumber: 4,
    });
  });

  it('rejects a predicate column that is absent from the pinned target schema', async () => {
    schemas.describe.mockResolvedValue([
      {
        targetNodeId: 'target-1',
        tableName: 'orders',
        schemaStatus: 'KNOWN',
        columns: [{ id: 'status', name: 'status', type: 'string', nullable: false }],
      },
    ]);

    await expect(validate.execute(actor, graph())).rejects.toMatchObject({
      code: 'WORKFLOW_GRAPH_INVALID',
      issues: [{ code: 'RUN_DATA_COLUMN_NOT_FOUND', nodeId: 'route' }],
    });
  });

  it('rejects a comparison value incompatible with the target column type', async () => {
    schemas.describe.mockResolvedValue([
      {
        targetNodeId: 'target-1',
        tableName: 'orders',
        schemaStatus: 'KNOWN',
        columns: [{ id: 'amount', name: 'amount', type: 'string', nullable: false }],
      },
    ]);

    await expect(validate.execute(actor, graph())).rejects.toMatchObject({
      code: 'WORKFLOW_GRAPH_INVALID',
      issues: [{ code: 'RUN_DATA_PREDICATE_INVALID', nodeId: 'route' }],
    });
  });

  it('rejects a pipeline output plan that exceeds the supported predicate bound at publish time', async () => {
    schemas.describe.mockResolvedValue([
      {
        targetNodeId: 'target-1',
        tableName: 'orders',
        schemaStatus: 'KNOWN',
        columns: [{ id: 'amount', name: 'amount', type: 'decimal(10,2)', nullable: false }],
      },
    ]);
    const manyPredicates: WorkflowGraph = {
      ...graph(),
      nodes: graph().nodes.map((node) =>
        node.id === 'route' && node.type === 'CONDITIONAL_SPLIT'
          ? {
              ...node,
              conditionKind: 'RUN_DATA' as const,
              branches: [
                ...Array.from({ length: 129 }, (_, index) => ({
                  id: `branch-${String(index)}`,
                  runDataCondition: {
                    targetNodeId: 'target-1',
                    quantifier: 'ANY' as const,
                    predicate: { column: 'amount', operator: 'GTE' as const, value: 100 },
                  },
                })),
                { id: 'other', fallback: true as const },
              ],
            }
          : node,
      ),
    };

    await expect(validate.execute(actor, manyPredicates)).rejects.toMatchObject({
      code: 'WORKFLOW_GRAPH_INVALID',
      issues: expect.arrayContaining([{ code: 'RUN_DATA_PLAN_LIMIT_EXCEEDED', nodeId: 'route' }]),
    });
  });

  it('does not query target metadata when access to the pinned pipeline is denied', async () => {
    access.requirePipeline.mockRejectedValue(new Error('forbidden'));

    await expect(validate.execute(actor, graph())).rejects.toThrow('forbidden');
    expect(schemas.describe).not.toHaveBeenCalled();
  });
});
