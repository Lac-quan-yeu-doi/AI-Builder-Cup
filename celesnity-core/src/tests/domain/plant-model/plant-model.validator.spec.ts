import { PlantModelErrorCode } from '@domain/plant-model/errors/plant-model.errors';
import type { PlantModelDraft, PlantNodeType } from '@domain/plant-model/models/plant-model';
import { validatePlantDraft } from '@domain/plant-model/plant-model.validator';

const types: readonly PlantNodeType[] = [
  { id: 'source-type', name: 'Source', properties: [] },
  {
    id: 'middle-type',
    name: 'Work center',
    properties: [{ id: 'code', key: 'code', name: 'Code', type: 'text', required: true, order: 0 }],
  },
  { id: 'sink-type', name: 'Sink', properties: [] },
];

function model(): PlantModelDraft {
  return {
    nodeTypes: types,
    nodes: [
      {
        id: 'source',
        name: 'Cutting',
        nodeTypeId: 'source-type',
        position: { x: 0, y: 0 },
        routingRole: 'source',
        values: {},
        localProperties: [],
      },
      {
        id: 'middle',
        name: 'Sewing',
        nodeTypeId: 'middle-type',
        position: { x: 100, y: 0 },
        routingRole: 'intermediate',
        values: { code: 'SEW_1' },
        localProperties: [],
      },
      {
        id: 'sink',
        name: 'Dispatch',
        nodeTypeId: 'sink-type',
        position: { x: 200, y: 0 },
        routingRole: 'sink',
        values: {},
        localProperties: [],
      },
    ],
    relationships: [
      { id: 'route-1', kind: 'routes-to', sourceNodeId: 'source', targetNodeId: 'middle' },
      { id: 'route-2', kind: 'routes-to', sourceNodeId: 'middle', targetNodeId: 'sink' },
    ],
  };
}

describe('plant model validation', () => {
  it('allows incomplete routes in a draft but rejects them for publication', () => {
    const draft: PlantModelDraft = { ...model(), relationships: [] };
    expect(() => validatePlantDraft(draft)).not.toThrow();
    expect(() => validatePlantDraft(draft, true)).toThrow(
      expect.objectContaining({ code: PlantModelErrorCode.VALIDATION }),
    );
  });

  it('allows route cycles but rejects containment cycles', () => {
    const cyclicRoutes: PlantModelDraft = {
      ...model(),
      relationships: [
        ...model().relationships,
        { id: 'route-3', kind: 'routes-to' as const, sourceNodeId: 'sink', targetNodeId: 'source' },
      ],
    };
    expect(() => validatePlantDraft(cyclicRoutes, true)).not.toThrow();
    const cyclicContainment: PlantModelDraft = {
      ...model(),
      relationships: [
        {
          id: 'contains-1',
          kind: 'contains' as const,
          sourceNodeId: 'source',
          targetNodeId: 'middle',
        },
        {
          id: 'contains-2',
          kind: 'contains' as const,
          sourceNodeId: 'middle',
          targetNodeId: 'source',
        },
      ],
    };
    expect(() => validatePlantDraft(cyclicContainment)).toThrow('cycle');
  });

  it('enforces one active parent', () => {
    const draft: PlantModelDraft = {
      ...model(),
      relationships: [
        {
          id: 'contains-1',
          kind: 'contains' as const,
          sourceNodeId: 'source',
          targetNodeId: 'middle',
        },
        {
          id: 'contains-2',
          kind: 'contains' as const,
          sourceNodeId: 'sink',
          targetNodeId: 'middle',
        },
      ],
    };
    expect(() => validatePlantDraft(draft)).toThrow('only one parent');
  });

  it('validates typed and required property values', () => {
    const original = model();
    const badType: PlantModelDraft = {
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === 'middle' ? { ...node, values: { code: 42 } } : node,
      ),
    };
    expect(() => validatePlantDraft(badType)).toThrow('wrong type');
    const missing: PlantModelDraft = {
      ...original,
      nodes: original.nodes.map((node) => (node.id === 'middle' ? { ...node, values: {} } : node)),
    };
    expect(() => validatePlantDraft(missing)).not.toThrow();
    expect(() => validatePlantDraft(missing, true)).toThrow('missing required property');
  });

  it('validates the optional node-card display setting', () => {
    const original = model();
    const malformed = {
      ...original,
      nodeTypes: original.nodeTypes.map((type) =>
        type.id === 'middle-type'
          ? {
              ...type,
              properties: type.properties.map((property) => ({
                ...property,
                showOnCard: 'yes',
              })),
            }
          : type,
      ),
    } as unknown as PlantModelDraft;

    expect(() => validatePlantDraft(malformed)).toThrow('node-card display setting');
  });

  it('allows a deprecated option to remain selected for published-history compatibility', () => {
    const original = model();
    const choice = {
      id: 'status',
      key: 'status',
      name: 'Status',
      type: 'single-select' as const,
      required: false,
      order: 1,
      options: [{ id: 'active', label: 'Active', deprecated: true }],
    };
    const draft: PlantModelDraft = {
      ...original,
      nodeTypes: original.nodeTypes.map((type) =>
        type.id === 'middle-type' ? { ...type, properties: [...type.properties, choice] } : type,
      ),
      nodes: original.nodes.map((node) =>
        node.id === 'middle' ? { ...node, values: { ...node.values, status: 'active' } } : node,
      ),
    };
    expect(() => validatePlantDraft(draft)).not.toThrow();
  });

  it('distinguishes catalog single-select and multi-select values', () => {
    const original = model();
    const binding = {
      mode: 'choices' as const,
      catalog: 'iceberg',
      schema: 'demo',
      table: 'plant_statuses',
      valueColumn: 'status',
      labelColumn: 'label',
      filters: [],
    };
    const catalogProperties = [
      {
        id: 'primary-status',
        key: 'primary_status',
        name: 'Primary status',
        type: 'catalog-choices' as const,
        required: false,
        order: 1,
        catalogBinding: binding,
      },
      {
        id: 'allowed-statuses',
        key: 'allowed_statuses',
        name: 'Allowed statuses',
        type: 'catalog-multi-select' as const,
        required: false,
        order: 2,
        catalogBinding: binding,
      },
    ];
    const withValues = (values: Readonly<Record<string, string | readonly string[]>>) => ({
      ...original,
      nodeTypes: original.nodeTypes.map((type) =>
        type.id === 'middle-type'
          ? { ...type, properties: [...type.properties, ...catalogProperties] }
          : type,
      ),
      nodes: original.nodes.map((node) =>
        node.id === 'middle' ? { ...node, values: { ...node.values, ...values } } : node,
      ),
    });

    expect(() =>
      validatePlantDraft(
        withValues({
          'primary-status': 'running',
          'allowed-statuses': ['running', 'maintenance'],
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validatePlantDraft(
        withValues({ 'primary-status': ['running'], 'allowed-statuses': 'running' }),
      ),
    ).toThrow('wrong type');
  });
});
