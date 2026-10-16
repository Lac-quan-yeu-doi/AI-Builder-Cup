import type {
  PlantDashboardAssociation,
  PlantDashboardRole,
  PlantModelDraft,
  PlantModelVersionSnapshot,
  PlantReferenceData,
  PlantSite,
} from '@domain/plant-model/models/plant-model';

export type PlantSaveResult = 'SAVED' | 'VERSION_CONFLICT';
export type PlantDashboardSaveResult = 'SAVED' | 'DASHBOARD_NOT_FOUND';

export interface IPlantModelRepository {
  list(): Promise<readonly PlantSite[]>;
  find(id: string): Promise<PlantSite | undefined>;
  create(site: PlantSite, referenceData: PlantReferenceData): Promise<boolean>;
  save(
    id: string,
    draft: PlantModelDraft,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<PlantSaveResult>;
  publish(
    id: string,
    snapshot: PlantModelVersionSnapshot,
    expectedRevision: number,
  ): Promise<'PUBLISHED' | 'VERSION_CONFLICT' | 'ALREADY_PUBLISHED'>;
  listVersions(siteId: string): Promise<readonly PlantModelVersionSnapshot[]>;
  findVersion(siteId: string, version: number): Promise<PlantModelVersionSnapshot | undefined>;
  referenceData(siteId: string): Promise<PlantReferenceData | undefined>;
  listDashboards(siteId: string): Promise<readonly PlantDashboardAssociation[]>;
  associateDashboard(input: {
    readonly siteId: string;
    readonly dashboardId: string;
    readonly role: PlantDashboardRole;
    readonly displayOrder: number;
    readonly isDefault: boolean;
    readonly now: string;
  }): Promise<PlantDashboardSaveResult>;
  removeDashboard(siteId: string, dashboardId: string): Promise<void>;
}
