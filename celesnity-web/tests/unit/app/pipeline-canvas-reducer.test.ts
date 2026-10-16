import { describe, expect, it } from 'vitest';

import {
  canvasReducer,
  canvasStateFromPipeline,
  isCanvasDirty,
  selectedNode,
  type CanvasState,
} from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/pipeline-canvas.reducer';
import type { PipelineNode } from '@/src/entities/models/pipeline';
import type { PipelineViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

const sourceNode: PipelineNode = {
  id: 'node-1',
  definitionType: 'POSTGRES_SOURCE',
  resourceId: 'connection:connection-1',
  position: { x: 0, y: 0 },
  config: {},
};

const pipeline: PipelineViewModel = {
  id: 'pipeline-1',
  name: 'Daily load',
  description: 'Loads orders',
  status: 'DRAFT',
  version: 3,
  graph: { nodes: [sourceNode], edges: [] },
  createdBy: 'System',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

function loaded(): CanvasState {
  return canvasStateFromPipeline(pipeline);
}

describe('canvas state', () => {
  it('starts clean on the loaded pipeline', () => {
    const state = loaded();

    expect(state.version).toBe(3);
    expect(state.description).toBe('Loads orders');
    expect(isCanvasDirty(state)).toBe(false);
  });

  it('normalizes the legacy crawler mode to Database Service without making the canvas dirty', () => {
    const state = canvasStateFromPipeline({
      ...pipeline,
      graph: {
        nodes: [{ ...sourceNode, config: { sourceMode: 'CATALOG', schemaName: 'public' } }],
        edges: [],
      },
    });

    expect(state.graph.nodes[0]?.config.sourceMode).toBe('DIRECT');
    expect(state.graph.nodes[0]?.config.schemaName).toBe('public');
    expect(isCanvasDirty(state)).toBe(false);
  });

  it('treats renamed metadata as unsaved work', () => {
    const state = canvasReducer(loaded(), { type: 'metadata-changed', name: 'Nightly load' });

    expect(isCanvasDirty(state)).toBe(true);
  });

  it('selects a node as soon as it is dropped', () => {
    const state = canvasReducer(loaded(), {
      type: 'node-added',
      node: { ...sourceNode, id: 'node-2' },
    });

    expect(state.selectedNodeId).toBe('node-2');
    expect(isCanvasDirty(state)).toBe(true);
  });

  it('clears the selection when the selected node is removed', () => {
    const selected = canvasReducer(loaded(), { type: 'node-selected', nodeId: 'node-1' });
    const state = canvasReducer(selected, { type: 'node-removed', nodeId: 'node-1' });

    expect(state.selectedNodeId).toBeUndefined();
    expect(selectedNode(state)).toBeUndefined();
  });

  it('drops stale validation issues once the graph changes', () => {
    const validated = canvasReducer(loaded(), {
      type: 'validated',
      issues: [{ code: 'GRAPH_TARGET_REQUIRED', message: 'Add a target.' }],
    });

    expect(validated.issues).toHaveLength(1);
    expect(
      canvasReducer(validated, { type: 'node-moved', nodeId: 'node-1', position: { x: 5, y: 5 } })
        .issues,
    ).toHaveLength(0);
  });

  it('keeps issues when only the selection changes', () => {
    const validated = canvasReducer(loaded(), {
      type: 'validated',
      issues: [{ code: 'NODE_CONFIG_REQUIRED', message: 'Table is required.', nodeId: 'node-1' }],
    });

    expect(
      canvasReducer(validated, { type: 'node-selected', nodeId: 'node-1' }).issues,
    ).toHaveLength(1);
  });

  it('ignores an edit addressed to a node that is gone', () => {
    const state = loaded();

    expect(canvasReducer(state, { type: 'node-removed', nodeId: 'missing' })).toBe(state);
    expect(
      canvasReducer(state, { type: 'node-config-changed', nodeId: 'missing', change: { a: 1 } }),
    ).toBe(state);
  });

  it('rebases on the saved pipeline and keeps the selection', () => {
    const edited = canvasReducer(
      canvasReducer(loaded(), { type: 'node-selected', nodeId: 'node-1' }),
      { type: 'node-config-changed', nodeId: 'node-1', change: { schemaName: 'public' } },
    );

    expect(isCanvasDirty(edited)).toBe(true);

    const state = canvasReducer(edited, {
      type: 'saved',
      pipeline: { ...pipeline, version: 4, graph: edited.graph },
    });

    expect(state.version).toBe(4);
    expect(state.selectedNodeId).toBe('node-1');
    expect(isCanvasDirty(state)).toBe(false);
  });
});
