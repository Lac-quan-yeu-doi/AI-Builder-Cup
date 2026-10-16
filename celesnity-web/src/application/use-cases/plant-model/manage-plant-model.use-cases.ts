import type { PlantModelRepository } from '@/src/application/repositories/plant-model.repository.interface';

export const createPlantModelUseCases = (repository: PlantModelRepository) => ({
  listSites: () => repository.listSites(),
  createSite: (input: Parameters<PlantModelRepository['createSite']>[0]) =>
    repository.createSite(input),
  get: (siteId: string) => repository.get(siteId),
  save: (siteId: string, draft: Parameters<PlantModelRepository['save']>[1], revision: number) =>
    repository.save(siteId, draft, revision),
  listTemplates: () => repository.listTemplates(),
  applyTemplate: (siteId: string, templateId: string, revision: number) =>
    repository.applyTemplate(siteId, templateId, revision),
  publish: (siteId: string, revision: number, note?: string) =>
    repository.publish(siteId, revision, note),
  listVersions: (siteId: string) => repository.listVersions(siteId),
  diffVersions: (siteId: string, from: number, to: number) =>
    repository.diffVersions(siteId, from, to),
  resolveCatalog: (
    binding: Parameters<PlantModelRepository['resolveCatalog']>[0],
    values: Parameters<PlantModelRepository['resolveCatalog']>[1],
  ) => repository.resolveCatalog(binding, values),
  listDashboards: (siteId: string) => repository.listDashboards(siteId),
  associateDashboard: (
    siteId: string,
    dashboardId: string,
    input: Parameters<PlantModelRepository['associateDashboard']>[2],
  ) => repository.associateDashboard(siteId, dashboardId, input),
  removeDashboard: (siteId: string, dashboardId: string) =>
    repository.removeDashboard(siteId, dashboardId),
});
export type PlantModelUseCases = ReturnType<typeof createPlantModelUseCases>;
