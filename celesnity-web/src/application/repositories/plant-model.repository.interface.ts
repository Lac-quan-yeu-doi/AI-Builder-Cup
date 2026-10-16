import type {
  PlantCatalogBinding,
  PlantCatalogLookupResult,
  PlantDashboardAssociation,
  PlantDashboardRole,
  PlantModelDraft,
  PlantModelTemplate,
  PlantModelVersion,
  PlantPropertyValue,
  PlantSite,
  PlantSiteSummary,
  PlantVersionDiff,
} from '@/src/entities/models/plant-model';

export interface PlantModelRepository {
  listSites(): Promise<readonly PlantSiteSummary[]>;
  createSite(input: { readonly name: string; readonly code: string }): Promise<PlantSite>;
  get(siteId: string): Promise<PlantSite>;
  save(siteId: string, draft: PlantModelDraft, expectedRevision: number): Promise<PlantSite>;
  listTemplates(): Promise<readonly PlantModelTemplate[]>;
  applyTemplate(siteId: string, templateId: string, expectedRevision: number): Promise<PlantSite>;
  publish(siteId: string, expectedRevision: number, note?: string): Promise<PlantSite>;
  listVersions(siteId: string): Promise<readonly PlantModelVersion[]>;
  diffVersions(siteId: string, from: number, to: number): Promise<PlantVersionDiff>;
  resolveCatalog(
    binding: PlantCatalogBinding,
    nodeValues: Readonly<Record<string, PlantPropertyValue>>,
  ): Promise<PlantCatalogLookupResult>;
  listDashboards(siteId: string): Promise<readonly PlantDashboardAssociation[]>;
  associateDashboard(
    siteId: string,
    dashboardId: string,
    input: {
      readonly role: PlantDashboardRole;
      readonly displayOrder: number;
      readonly isDefault: boolean;
    },
  ): Promise<readonly PlantDashboardAssociation[]>;
  removeDashboard(siteId: string, dashboardId: string): Promise<void>;
}
