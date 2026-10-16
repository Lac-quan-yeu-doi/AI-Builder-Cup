import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IPlantModelRepository } from '@application/plant-model/interfaces/i-plant-model.repository';
import type { PlantCatalogLookupUseCases } from '@application/plant-model/plant-catalog-lookup.use-cases';
import { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { PlantDashboardAssociation, PlantSite } from '@domain/plant-model/models/plant-model';

const site: PlantSite = {
  id: 'b0000000-0000-4000-8000-000000000001',
  name: 'Factory 1',
  code: 'FACTORY_1',
  timezone: 'Asia/Ho_Chi_Minh',
  draft: { nodeTypes: [], nodes: [], relationships: [] },
  revision: 1,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
};
const dashboardId = 'd0000000-0000-4000-8000-000000000001';

describe('PlantModelUseCases dashboard associations', () => {
  it('associates a tenant-visible dashboard and returns ordered associations', async () => {
    let values: readonly PlantDashboardAssociation[] = [];
    const repository = repositoryStub({
      listDashboards: async () => values,
      associateDashboard: async (input) => {
        values = [
          {
            siteId: input.siteId,
            dashboardId: input.dashboardId,
            role: input.role,
            displayOrder: input.displayOrder,
            isDefault: input.isDefault,
            createdAt: input.now,
            updatedAt: input.now,
          },
        ];
        return 'SAVED';
      },
    });
    const useCases = createUseCases(repository);

    await expect(
      useCases.associateDashboard(site.id, dashboardId, {
        role: 'overview',
        displayOrder: 0,
        isDefault: true,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ dashboardId, role: 'overview', isDefault: true }),
    ]);
  });

  it('does not expose a dashboard rejected by the organization boundary', async () => {
    const useCases = createUseCases(
      repositoryStub({ associateDashboard: async () => 'DASHBOARD_NOT_FOUND' }),
    );

    await expect(
      useCases.associateDashboard(site.id, dashboardId, {
        role: 'custom',
        displayOrder: 0,
        isDefault: false,
      }),
    ).rejects.toMatchObject({
      code: 'PLANT_MODEL_NOT_FOUND',
      message: 'The dashboard was not found.',
    });
  });
});

function createUseCases(repository: IPlantModelRepository): PlantModelUseCases {
  const unitOfWork: IUnitOfWork = {
    commit: (work) => work({ record: () => undefined }),
  };
  return new PlantModelUseCases(
    repository,
    unitOfWork,
    { now: () => new Date('2026-09-13T01:00:00.000Z') },
    { next: () => '00000000-0000-4000-8000-000000000099' },
    new AuthenticatedContextStore(),
    {} as PlantCatalogLookupUseCases,
  );
}

function repositoryStub(override: Partial<IPlantModelRepository> = {}): IPlantModelRepository {
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
    ...override,
  };
}
