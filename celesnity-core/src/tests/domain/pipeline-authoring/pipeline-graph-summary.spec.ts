import type { PipelineGraph, PipelineNode } from '@domain/pipeline-authoring/models/pipeline';
import { summarizePipelineGraph } from '@domain/pipeline-authoring/models/pipeline-graph-summary';

function node(overrides: Partial<PipelineNode> & Pick<PipelineNode, 'id'>): PipelineNode {
  return {
    definitionType: 'FILTER',
    position: { x: 0, y: 0 },
    config: {},
    ...overrides,
  };
}

function graph(...nodes: readonly PipelineNode[]): PipelineGraph {
  return { nodes, edges: [] };
}

describe('summarizePipelineGraph', () => {
  it('reads the database the target node writes into', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({ id: 'source', definitionType: 'POSTGRES_SOURCE' }),
        node({
          id: 'target',
          definitionType: 'ICEBERG_TARGET',
          config: { databaseName: 'nhamay_saigonfood', tableName: 'san_luong_theo_ca' },
        }),
      ),
    );

    expect(summary.targetDatabase).toBe('nhamay_saigonfood');
  });

  it('matches the target node type case-insensitively and trims the name', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({
          id: 'target',
          definitionType: ' iceberg_target ',
          config: { databaseName: '  demo  ' },
        }),
      ),
    );

    expect(summary.targetDatabase).toBe('demo');
  });

  it('reports no database for a draft that has no target node yet', () => {
    const summary = summarizePipelineGraph(graph(node({ id: 'only-source' })));

    expect(summary.targetDatabase).toBeNull();
  });

  it('reports no database when the targets name more than one', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({ id: 'a', definitionType: 'ICEBERG_TARGET', config: { databaseName: 'demo' } }),
        node({ id: 'b', definitionType: 'ICEBERG_TARGET', config: { databaseName: 'other' } }),
      ),
    );

    // "Which database does this pipeline belong to" has no single answer here,
    // so the summary says so rather than picking the first one it saw.
    expect(summary.targetDatabase).toBeNull();
  });

  it('keeps one database when several targets agree on it', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({ id: 'a', definitionType: 'ICEBERG_TARGET', config: { databaseName: 'demo' } }),
        node({ id: 'b', definitionType: 'ICEBERG_TARGET', config: { databaseName: 'demo' } }),
      ),
    );

    expect(summary.targetDatabase).toBe('demo');
  });

  it('ignores a target whose database name is blank or not a string', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({ id: 'a', definitionType: 'ICEBERG_TARGET', config: { databaseName: '   ' } }),
        node({ id: 'b', definitionType: 'ICEBERG_TARGET', config: { databaseName: 42 } }),
      ),
    );

    expect(summary.targetDatabase).toBeNull();
  });

  it('collects source connections from an explicit resourceId', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({ id: 'a', definitionType: 'POSTGRES_SOURCE', resourceId: 'connection:svc-1' }),
        node({ id: 'b', definitionType: 'POSTGRES_SOURCE', resourceId: 'connection:svc-2' }),
      ),
    );

    expect(summary.sourceConnectionIds).toEqual(['svc-1', 'svc-2']);
  });

  it('falls back to config.connectionId, the way the validator and compiler do', () => {
    const summary = summarizePipelineGraph(
      graph(node({ id: 'a', definitionType: 'MYSQL_SOURCE', config: { connectionId: 'svc-9' } })),
    );

    expect(summary.sourceConnectionIds).toEqual(['svc-9']);
  });

  it('deduplicates a connection two nodes read through', () => {
    const summary = summarizePipelineGraph(
      graph(
        node({ id: 'a', resourceId: 'connection:svc-1' }),
        node({ id: 'b', config: { connectionId: 'svc-1' } }),
      ),
    );

    expect(summary.sourceConnectionIds).toEqual(['svc-1']);
  });

  it('ignores a resourceId that names something other than a connection', () => {
    const summary = summarizePipelineGraph(
      graph(node({ id: 'a', resourceId: 'iceberg:iceberg' }), node({ id: 'b', resourceId: '' })),
    );

    expect(summary.sourceConnectionIds).toEqual([]);
  });
});
