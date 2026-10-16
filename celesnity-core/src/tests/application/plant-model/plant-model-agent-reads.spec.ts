import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IPlantModelRepository } from '@application/plant-model/interfaces/i-plant-model.repository';
import type { PlantCatalogLookupUseCases } from '@application/plant-model/plant-catalog-lookup.use-cases';
import { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { PlantSite } from '@domain/plant-model/models/plant-model';

const site: PlantSite = {
  id: 'b0000000-0000-4000-8000-000000000001',
  name: 'Factory 1',
  code: 'FACTORY_1',
  timezone: 'Asia/Ho_Chi_Minh',
  revision: 2,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
  draft: {
    nodeTypes: [
      {
        id: 'type-equipment',
        name: 'Equipment',
        properties: [
          {
            id: 'property-status',
            key: 'status',
            name: 'Live status',
            type: 'catalog-scalar',
            required: false,
            order: 0,
            catalogBinding: {
              mode: 'scalar',
              catalog: 'iceberg',
              schema: 'operations',
              table: 'equipment_status',
              valueColumn: 'status',
              filters: [],
            },
          },
        ],
      },
    ],
    nodes: [
      {
        id: 'node-a',
        name: 'Filler A',
        nodeTypeId: 'type-equipment',
        routingRole: 'source',
        position: { x: 0, y: 0 },
        values: {},
        localProperties: [],
      },
      {
        id: 'node-b',
        name: 'Packing B',
        nodeTypeId: 'type-equipment',
        routingRole: 'sink',
        position: { x: 100, y: 0 },
        values: {},
        localProperties: [],
      },
    ],
    relationships: [
      {
        id: 'route-a-b',
        kind: 'routes-to',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-b',
      },
    ],
  },
};

describe('PlantModelUseCases agent reads', () => {
  it('pages concise summaries and traverses only the requested neighborhood', async () => {
    const useCases = createUseCases();
    await expect(useCases.listNodes(site.id, { query: 'filler', limit: 1 })).resolves.toMatchObject(
      {
        total: 1,
        hasMore: false,
        nodes: [{ id: 'node-a', name: 'Filler A', outgoingRouteCount: 1 }],
      },
    );
    await expect(
      useCases.traverseRoutes(site.id, 'node-a', { direction: 'downstream', depth: 1 }),
    ).resolves.toMatchObject({
      originNodeId: 'node-a',
      nodes: [{ id: 'node-b', name: 'Packing B' }],
      relationships: [{ id: 'route-a-b' }],
    });
  });

  it('resolves only the binding stored on the requested node property', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue({ kind: 'scalar', available: true, value: 'running' });
    const useCases = createUseCases({ resolve } as unknown as PlantCatalogLookupUseCases);

    await expect(
      useCases.resolveNodeCatalogProperty(site.id, 'node-a', 'property-status'),
    ).resolves.toMatchObject({
      nodeId: 'node-a',
      propertyName: 'Live status',
      resolution: { value: 'running' },
    });
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'equipment_status', valueColumn: 'status' }),
      {},
    );
  });
});

function createUseCases(catalogLookups = {} as PlantCatalogLookupUseCases): PlantModelUseCases {
  const unitOfWork: IUnitOfWork = { commit: (work) => work({ record: () => undefined }) };
  return new PlantModelUseCases(
    repositoryStub(),
    unitOfWork,
    { now: () => new Date('2026-09-13T01:00:00.000Z') },
    { next: () => '00000000-0000-4000-8000-000000000099' },
    new AuthenticatedContextStore(),
    catalogLookups,
  );
}

function repositoryStub(): IPlantModelRepository {
  return {
    list: async () => [site],
    find: async (id) => (id === site.id ? site : undefined),
    create: async () => true,
    save: async () => 'SAVED',
    publish: async () => 'PUBLISHED',
    listVersions: async () => [],
    findVersion: async () => undefined,
    referenceData: async () => undefined,
    listDashboards: async () => [],
    associateDashboard: async () => 'SAVED',
    removeDashboard: async () => undefined,
  };
}
