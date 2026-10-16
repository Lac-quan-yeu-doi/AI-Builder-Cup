import { describe, expect, it } from 'vitest';

import type { PlantModelDraft } from '@/src/entities/models/plant-model';
import { plantDraftEqual, publishIssues } from '@/src/entities/models/plant-model';

function draft(): PlantModelDraft {
  return {
    nodeTypes: [
      { id: 'source-type', name: 'Source', properties: [] },
      {
        id: 'sink-type',
        name: 'Sink',
        properties: [
          { id: 'code', key: 'code', name: 'Code', type: 'text', required: true, order: 0 },
        ],
      },
    ],
    nodes: [
      {
        id: 'source',
        name: 'Cutting',
        nodeTypeId: 'source-type',
        routingRole: 'source',
        position: { x: 0, y: 0 },
        values: {},
        localProperties: [],
      },
      {
        id: 'sink',
        name: 'Dispatch',
        nodeTypeId: 'sink-type',
        routingRole: 'sink',
        position: { x: 100, y: 0 },
        values: { code: 'DSP_1' },
        localProperties: [],
      },
    ],
    relationships: [
      { id: 'route', kind: 'routes-to', sourceNodeId: 'source', targetNodeId: 'sink' },
    ],
  };
}

describe('plant model entity helpers', () => {
  it('reports publish issues against the affected node', () => {
    const model = draft();
    const incomplete = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.id === 'sink' ? { ...node, values: { code: '' } } : node,
      ),
      relationships: [],
    };
    expect(publishIssues(incomplete)).toEqual(
      expect.arrayContaining([
        { nodeId: 'source', message: 'plantModel.validation.route' },
        { nodeId: 'sink', message: 'plantModel.validation.required' },
        { nodeId: 'sink', message: 'plantModel.validation.route' },
      ]),
    );
  });

  it('detects persisted and local draft equality structurally', () => {
    expect(plantDraftEqual(draft(), structuredClone(draft()))).toBe(true);
    expect(plantDraftEqual(draft(), { ...draft(), relationships: [] })).toBe(false);
  });
});
