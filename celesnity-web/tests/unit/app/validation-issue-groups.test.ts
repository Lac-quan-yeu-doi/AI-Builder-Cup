import { describe, expect, it } from 'vitest';

import { groupValidationIssues } from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/validation-issue-groups';
import type { PipelineValidationIssue } from '@/src/entities/models/pipeline';

// What Core returns for a freshly dropped source node on a database whose
// crawler has never run: six rules fired, in the order two validators happened
// to run, with the one that explains the other five reported last.
const freshSourceNode: readonly PipelineValidationIssue[] = [
  {
    code: 'NODE_CONFIG_REQUIRED',
    message: 'Database schema is required.',
    severity: 'ERROR',
    nodeId: 'node-kasa3',
    field: 'schemaName',
  },
  {
    code: 'NODE_CONFIG_REQUIRED',
    message: 'Database table is required.',
    severity: 'ERROR',
    nodeId: 'node-kasa3',
    field: 'tableName',
  },
  {
    code: 'CATALOG_SOURCE_INVALID',
    message:
      'Select a current metadata relation from the assigned crawler for this database service.',
    severity: 'ERROR',
    nodeId: 'node-kasa3',
    field: 'catalogRelationId',
  },
  {
    code: 'GRAPH_TARGET_REQUIRED',
    message: 'The graph requires at least one target node.',
    severity: 'ERROR',
  },
  {
    code: 'NODE_NOT_CONNECTED',
    message: 'The node is not connected.',
    severity: 'WARNING',
    nodeId: 'node-kasa3',
  },
  {
    code: 'SOURCE_SCHEMA_UNAVAILABLE',
    message:
      'Column metadata is unavailable. Run the metadata crawler or refresh the catalog before configuring field-aware transformations.',
    severity: 'WARNING',
    nodeId: 'node-kasa3',
  },
];

describe('groupValidationIssues', () => {
  it('puts the thing that blocks the others first', () => {
    const groups = groupValidationIssues(freshSourceNode);

    expect(groups[0]?.needsMetadata).toBe(true);
    expect(groups[0]?.messages[0]).toContain('Column metadata is unavailable');
  });

  it('says one act once', () => {
    // Schema, table and relation are the same unfinished choice on one node.
    const groups = groupValidationIssues(freshSourceNode);
    const nodeConfig = groups.find((group) => group.messages.length > 1);

    expect(nodeConfig?.nodeId).toBe('node-kasa3');
    expect(nodeConfig?.messages).toEqual([
      'Database schema is required.',
      'Database table is required.',
      'Select a current metadata relation from the assigned crawler for this database service.',
    ]);
  });

  it('turns six rows into four', () => {
    // The three that name one unfinished choice become one. The rest are
    // separate fixes and stay separate.
    expect(groupValidationIssues(freshSourceNode)).toHaveLength(4);
  });

  it('keeps graph-shape issues apart even when they name a node', () => {
    // "not connected" and "needs a target" are two different fixes, so they
    // stay two rows rather than collapsing into the node they mention.
    const groups = groupValidationIssues(freshSourceNode);
    const messages = groups.flatMap((group) => group.messages);

    expect(messages).toContain('The graph requires at least one target node.');
    expect(messages).toContain('The node is not connected.');
    expect(groups.filter((group) => group.messages.length === 1)).toHaveLength(3);
  });

  it('never mixes a blocking issue into a runtime check', () => {
    for (const group of groupValidationIssues(freshSourceNode)) {
      expect(group.key).toBeTruthy();
      expect(['ERROR', 'WARNING']).toContain(group.severity);
    }
    const blocking = groupValidationIssues(freshSourceNode).filter(
      (group) => group.severity === 'ERROR',
    );
    expect(blocking.flatMap((group) => group.messages)).not.toContain('The node is not connected.');
  });

  it('returns nothing for a graph with nothing wrong', () => {
    expect(groupValidationIssues([])).toEqual([]);
  });
});
