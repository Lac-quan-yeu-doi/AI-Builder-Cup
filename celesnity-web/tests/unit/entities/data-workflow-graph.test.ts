import { describe, expect, it } from 'vitest';

import {
  createManualWorkflowDraft,
  fromWorkflowGraphDto,
  removeWorkflowEdge,
  removeWorkflowNode,
  replaceWorkflowNode,
  toWorkflowGraphDto,
  validateSchedule,
  validateTrigger,
} from '@/src/entities/models/data-workflow-graph';

describe('data workflow graph DTOs', () => {
  it('removes connections when a conditional branch is deleted', () => {
    const split = {
      id: 'split',
      type: 'CONDITIONAL_SPLIT' as const,
      mode: 'ALL_MATCH' as const,
      position: { x: 100, y: 0 },
      branches: [
        {
          id: 'first',
          condition: { op: 'eq' as const, path: ['trigger', 'status'], value: 'SUCCEEDED' },
        },
        {
          id: 'second',
          condition: { op: 'eq' as const, path: ['trigger', 'status'], value: 'FAILED' },
        },
        { id: 'fallback', fallback: true as const },
      ],
    };
    const graph = {
      nodes: [split],
      edges: ['first', 'second', 'fallback'].map((sourcePortId) => ({
        id: sourcePortId,
        sourceNodeId: 'split',
        sourcePortId,
        targetNodeId: 'next',
        targetPortId: 'in',
      })),
    };

    const result = replaceWorkflowNode(graph, {
      ...split,
      branches: split.branches.filter((branch) => branch.id !== 'second'),
    });

    expect(result.nodes[0]).toMatchObject({ branches: [{ id: 'first' }, { id: 'fallback' }] });
    expect(result.edges.map((edge) => edge.sourcePortId)).toEqual(['first', 'fallback']);
  });
  it('round-trips an Outcome node and both fixed route ports', () => {
    const graph = {
      nodes: [
        { id: 'outcome', type: 'PIPELINE_OUTCOME' as const, position: { x: 100, y: 50 } },
        { id: 'next', type: 'JOIN' as const, position: { x: 300, y: 50 } },
      ],
      edges: ['success', 'error'].map((sourcePortId) => ({
        id: sourcePortId,
        sourceNodeId: 'outcome',
        sourcePortId,
        targetNodeId: 'next',
        targetPortId: 'in',
      })),
    };
    const dto = toWorkflowGraphDto(graph);
    expect(dto.nodes[0]).toEqual({
      id: 'outcome',
      type: 'PIPELINE_OUTCOME',
      position: { x: 100, y: 50 },
    });
    expect(dto.edges.map((edge) => edge.sourcePortId)).toEqual(['success', 'error']);
    expect(fromWorkflowGraphDto(dto).nodes[0]).toMatchObject({
      type: 'PIPELINE_OUTCOME',
      position: { x: 100, y: 50 },
    });
  });

  it('serializes a bounded run-data conditional branch without changing legacy conditions', () => {
    const graph = {
      nodes: [
        {
          id: 'load',
          type: 'PIPELINE' as const,
          pipelineId: 'pipeline-1',
          versionNumber: 3,
          position: { x: 0, y: 0 },
        },
        {
          id: 'split',
          type: 'CONDITIONAL_SPLIT' as const,
          conditionKind: 'RUN_DATA' as const,
          mode: 'ALL_MATCH' as const,
          position: { x: 100, y: 0 },
          branches: [
            {
              id: 'has-failed',
              runDataCondition: {
                targetNodeId: 'target-orders',
                quantifier: 'COUNT' as const,
                predicate: { column: 'status', operator: 'EQ' as const, value: 'failed' },
                count: { operator: 'GTE' as const, threshold: 2 },
              },
            },
            { id: 'fallback', fallback: true as const },
          ],
        },
      ],
      edges: [
        {
          id: 'load-split',
          sourceNodeId: 'load',
          sourcePortId: 'out',
          targetNodeId: 'split',
          targetPortId: 'in',
        },
      ],
    };
    const dto = toWorkflowGraphDto(graph);
    expect(dto.nodes[1]).toMatchObject({ conditionKind: 'RUN_DATA', mode: 'ALL_MATCH' });
    expect(fromWorkflowGraphDto(dto).nodes[1]).toMatchObject({
      conditionKind: 'RUN_DATA',
      branches: expect.arrayContaining([
        expect.objectContaining({
          runDataCondition: expect.objectContaining({ quantifier: 'COUNT' }),
        }),
      ]),
    });
  });
  it('creates a manual trigger and preserves authoring positions', () => {
    const draft = createManualWorkflowDraft('Daily ingest');
    const graph = {
      ...draft.graph,
      nodes: [
        ...draft.graph.nodes,
        {
          id: 'pipeline-1',
          type: 'PIPELINE' as const,
          pipelineId: 'pipeline-1',
          versionNumber: 3,
          position: { x: 320, y: 48 },
        },
      ],
      edges: [
        {
          id: 'trigger-to-pipeline',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'pipeline-1',
          targetPortId: 'in',
        },
      ],
    };

    expect(toWorkflowGraphDto(graph)).toEqual({
      nodes: [
        { id: 'trigger', type: 'TRIGGER', position: { x: 48, y: 160 } },
        {
          id: 'pipeline-1',
          type: 'PIPELINE',
          pipelineId: 'pipeline-1',
          versionNumber: 3,
          position: { x: 320, y: 48 },
        },
      ],
      edges: graph.edges,
    });
  });

  it('uses the legacy default layout when a stored graph has no positions', () => {
    const graph = fromWorkflowGraphDto({
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        { id: 'pipeline-1', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
      ],
      edges: [],
    });

    expect(graph.nodes.map((node) => node.position)).toEqual([
      { x: 48, y: 120 },
      { x: 298, y: 120 },
    ]);
  });

  it('validates Core calendar fields and interval trigger shapes', () => {
    expect(
      validateSchedule({
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON'],
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    ).toEqual(undefined);
    expect(
      validateSchedule({ type: 'CALENDAR', timeOfDay: '7:00', weekdays: ['MON'], timezone: 'UTC' }),
    ).toMatch(/valid time/i);
    expect(
      validateSchedule({ type: 'CALENDAR', timeOfDay: '07:00', weekdays: [], timezone: 'UTC' }),
    ).toMatch(/at least one day/i);
    expect(
      validateSchedule({
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['MON'],
        timezone: 'UTC',
      }),
    ).toBeUndefined();
    expect(
      validateSchedule({ type: 'INTERVAL', everySeconds: 9, anchorAt: '2026-09-18T00:00:00.000Z' }),
    ).toMatch(/at least 10/i);
    expect(
      validateSchedule({
        type: 'INTERVAL',
        everySeconds: 10,
        anchorAt: '2026-09-18T00:00:00.000Z',
      }),
    ).toEqual(undefined);
  });

  it('serializes and validates a polling Watch Source trigger without advertising deletes', () => {
    const trigger = {
      type: 'WATCH_SOURCE' as const,
      mode: 'POLLING' as const,
      databaseServiceId: 'database-service-1',
      everySeconds: 600,
      relations: [
        {
          schema: 'public',
          table: 'orders',
          cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
        },
      ],
    };
    expect(validateTrigger(trigger)).toBeUndefined();
    expect(validateTrigger({ ...trigger, everySeconds: 9 })).toMatch(/at least 10/i);
    expect(
      toWorkflowGraphDto({
        nodes: [{ id: 'trigger', type: 'TRIGGER', trigger, position: { x: 0, y: 0 } }],
        edges: [],
      }).nodes,
    ).toEqual([{ id: 'trigger', type: 'TRIGGER', config: trigger, position: { x: 0, y: 0 } }]);
  });

  it('validates CDC event filters and its fixed aggregation window', () => {
    const trigger = {
      type: 'WATCH_SOURCE' as const,
      mode: 'CDC' as const,
      databaseServiceId: 'database-service-1',
      aggregationWindowSeconds: 10,
      relations: [{ schema: 'public', table: 'orders' }],
      changeTypes: ['INSERT', 'UPDATE', 'DELETE'] as const,
    };
    expect(validateTrigger(trigger)).toBeUndefined();
    expect(validateTrigger({ ...trigger, aggregationWindowSeconds: 301 })).toMatch(
      /between 1 and 300/i,
    );
    expect(validateTrigger({ ...trigger, changeTypes: [] })).toMatch(/at least one CDC/i);
  });

  it('removes a node together with its connected edges while preserving the trigger', () => {
    const graph = {
      nodes: [
        ...createManualWorkflowDraft().graph.nodes,
        {
          id: 'pipeline-1',
          type: 'PIPELINE' as const,
          pipelineId: 'pipeline-1',
          versionNumber: 1,
          position: { x: 300, y: 0 },
        },
      ],
      edges: [
        {
          id: 'trigger-pipeline',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'pipeline-1',
          targetPortId: 'in',
        },
      ],
    };

    expect(removeWorkflowNode(graph, 'pipeline-1')).toEqual({
      nodes: [expect.objectContaining({ id: 'trigger' })],
      edges: [],
    });
    expect(removeWorkflowNode(graph, 'trigger')).toBe(graph);
  });

  it('removes only the selected workflow edge', () => {
    const graph = {
      nodes: createManualWorkflowDraft().graph.nodes,
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'pipeline-1',
          targetPortId: 'in',
        },
        {
          id: 'edge-2',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'pipeline-2',
          targetPortId: 'in',
        },
      ],
    };

    expect(removeWorkflowEdge(graph, 'edge-1').edges).toEqual([
      expect.objectContaining({ id: 'edge-2' }),
    ]);
  });
});
