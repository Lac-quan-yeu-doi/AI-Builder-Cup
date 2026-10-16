import { parseWorkflowGraph } from '@application/data-workflow/workflow-graph-input';

const runDataCondition = {
  targetNodeId: 'orders-target',
  quantifier: 'ANY',
  predicate: { column: 'amount', operator: 'GT', value: 100 },
};

function input(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER' },
      { id: 'source', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
      {
        id: 'gate',
        type: 'CONDITIONAL_SPLIT',
        conditionKind: 'RUN_DATA',
        mode: 'FIRST_MATCH',
        branches: [
          { id: 'matched', runDataCondition },
          { id: 'otherwise', fallback: true },
        ],
        ...overrides,
      },
      { id: 'next', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
      { id: 'fallback', type: 'PIPELINE', pipelineId: 'pipeline-3', versionNumber: 1 },
    ],
    edges: [
      {
        id: 'trigger-source',
        sourceNodeId: 'trigger',
        sourcePortId: 'out',
        targetNodeId: 'source',
        targetPortId: 'in',
      },
      {
        id: 'source-gate',
        sourceNodeId: 'source',
        sourcePortId: 'out',
        targetNodeId: 'gate',
        targetPortId: 'in',
      },
      {
        id: 'gate-next',
        sourceNodeId: 'gate',
        sourcePortId: 'matched',
        targetNodeId: 'next',
        targetPortId: 'in',
      },
      {
        id: 'gate-fallback',
        sourceNodeId: 'gate',
        sourcePortId: 'otherwise',
        targetNodeId: 'fallback',
        targetPortId: 'in',
      },
    ],
  };
}

describe('run-data workflow graph input', () => {
  it('parses the explicit RUN_DATA discriminator and preserves its typed condition', () => {
    const parsed = parseWorkflowGraph(input());
    const gate = parsed.nodes.find((node) => node.id === 'gate');
    expect(gate).toEqual({
      id: 'gate',
      type: 'CONDITIONAL_SPLIT',
      conditionKind: 'RUN_DATA',
      mode: 'FIRST_MATCH',
      branches: [
        {
          id: 'matched',
          runDataCondition: {
            targetNodeId: 'orders-target',
            quantifier: 'ANY',
            predicate: { column: 'amount', operator: 'GT', value: 100 },
          },
        },
        { id: 'otherwise', fallback: true },
      ],
    });
  });

  it('requires a value for comparisons and rejects values on empty checks', () => {
    const noComparisonValue = input({
      branches: [
        {
          id: 'matched',
          runDataCondition: {
            targetNodeId: 'orders-target',
            quantifier: 'ANY',
            predicate: { column: 'amount', operator: 'EQ' },
          },
        },
        { id: 'otherwise', fallback: true },
      ],
    });
    expect(() => parseWorkflowGraph(noComparisonValue)).toThrow();

    const emptyWithValue = input({
      branches: [
        {
          id: 'matched',
          runDataCondition: {
            targetNodeId: 'orders-target',
            quantifier: 'ANY',
            predicate: { column: 'status', operator: 'IS_EMPTY', value: '' },
          },
        },
        { id: 'otherwise', fallback: true },
      ],
    });
    expect(() => parseWorkflowGraph(emptyWithValue)).toThrow();
  });

  it('requires a nonnegative integer Count threshold and Count-only configuration', () => {
    const countCondition = (threshold: number) => ({
      targetNodeId: 'orders-target',
      quantifier: 'COUNT',
      predicate: { column: 'amount', operator: 'GT', value: 100 },
      count: { operator: 'GTE', threshold },
    });
    expect(() =>
      parseWorkflowGraph(
        input({
          branches: [
            { id: 'matched', runDataCondition: countCondition(-1) },
            { id: 'otherwise', fallback: true },
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      parseWorkflowGraph(
        input({
          branches: [
            {
              id: 'matched',
              runDataCondition: {
                targetNodeId: 'orders-target',
                quantifier: 'ANY',
                predicate: { column: 'amount', operator: 'GT', value: 100 },
                count: { operator: 'GTE', threshold: 2 },
              },
            },
            { id: 'otherwise', fallback: true },
          ],
        }),
      ),
    ).toThrow();
  });

  it('rejects unknown condition discriminators and unsupported comparison values', () => {
    expect(() => parseWorkflowGraph(input({ conditionKind: 'UNSUPPORTED' }))).toThrow();
    expect(() =>
      parseWorkflowGraph(
        input({
          branches: [
            {
              id: 'matched',
              runDataCondition: {
                targetNodeId: 'orders-target',
                quantifier: 'ANY',
                predicate: { column: 'amount', operator: 'GT', value: true },
              },
            },
            { id: 'otherwise', fallback: true },
          ],
        }),
      ),
    ).toThrow();
  });

  it('continues to parse an unmarked legacy condition without reinterpreting it', () => {
    const legacy = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        { id: 'source', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
        {
          id: 'gate',
          type: 'CONDITIONAL_SPLIT',
          mode: 'FIRST_MATCH',
          branches: [
            {
              id: 'matched',
              condition: { op: 'eq', path: ['source', 'status'], value: 'SUCCEEDED' },
            },
          ],
        },
        { id: 'next', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'trigger-source',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'source',
          targetPortId: 'in',
        },
        {
          id: 'source-gate',
          sourceNodeId: 'source',
          sourcePortId: 'out',
          targetNodeId: 'gate',
          targetPortId: 'in',
        },
        {
          id: 'gate-next',
          sourceNodeId: 'gate',
          sourcePortId: 'matched',
          targetNodeId: 'next',
          targetPortId: 'in',
        },
      ],
    };
    expect(parseWorkflowGraph(legacy).nodes.find((node) => node.id === 'gate')).toEqual(
      legacy.nodes[2],
    );
  });
});
