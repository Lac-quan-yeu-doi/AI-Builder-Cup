import type { PlantModelRepository } from '@/src/application/repositories/plant-model.repository.interface';
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
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface SingleResponse<T> {
  readonly success: true;
  readonly data: T;
}
interface CollectionResponse<T> {
  readonly success: true;
  readonly data: readonly T[];
}

export class CoreApiPlantModelRepository implements PlantModelRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listSites(): Promise<readonly PlantSiteSummary[]> {
    return (await this.request<CollectionResponse<PlantSiteSummary>>('/plant-sites')).data.map(
      copySummary,
    );
  }
  public async createSite(input: {
    readonly name: string;
    readonly code: string;
  }): Promise<PlantSite> {
    return copySite(
      (
        await this.request<SingleResponse<PlantSite>>('/plant-sites', {
          method: 'POST',
          body: JSON.stringify(input),
        })
      ).data,
    );
  }
  public async get(siteId: string): Promise<PlantSite> {
    return copySite(
      (await this.request<SingleResponse<PlantSite>>(`${sitePath(siteId)}/model`)).data,
    );
  }
  public async save(
    siteId: string,
    draft: PlantModelDraft,
    expectedRevision: number,
  ): Promise<PlantSite> {
    return copySite(
      (
        await this.request<SingleResponse<PlantSite>>(`${sitePath(siteId)}/model`, {
          method: 'PUT',
          body: JSON.stringify({ draft, expectedRevision }),
        })
      ).data,
    );
  }
  public async listTemplates(): Promise<readonly PlantModelTemplate[]> {
    return (
      await this.request<CollectionResponse<PlantModelTemplate>>('/plant-model-templates')
    ).data.map((value) => structuredClone(value));
  }
  public async applyTemplate(
    siteId: string,
    templateId: string,
    expectedRevision: number,
  ): Promise<PlantSite> {
    return copySite(
      (
        await this.request<SingleResponse<PlantSite>>(
          `${sitePath(siteId)}/model/template-applications`,
          {
            method: 'POST',
            body: JSON.stringify({ templateId, expectedRevision }),
          },
        )
      ).data,
    );
  }
  public async publish(
    siteId: string,
    expectedRevision: number,
    note?: string,
  ): Promise<PlantSite> {
    return copySite(
      (
        await this.request<SingleResponse<PlantSite>>(`${sitePath(siteId)}/model/publish`, {
          method: 'POST',
          body: JSON.stringify({ expectedRevision, ...(note === undefined ? {} : { note }) }),
        })
      ).data,
    );
  }
  public async listVersions(siteId: string): Promise<readonly PlantModelVersion[]> {
    return (
      await this.request<CollectionResponse<PlantModelVersion>>(
        `${sitePath(siteId)}/model/versions`,
      )
    ).data.map((value) => ({ ...value }));
  }
  public async diffVersions(siteId: string, from: number, to: number): Promise<PlantVersionDiff> {
    const query = new URLSearchParams({ from: String(from), to: String(to) });
    return structuredClone(
      (
        await this.request<SingleResponse<PlantVersionDiff>>(
          `${sitePath(siteId)}/model/versions/diff?${query.toString()}`,
        )
      ).data,
    );
  }
  public async resolveCatalog(
    binding: PlantCatalogBinding,
    nodeValues: Readonly<Record<string, PlantPropertyValue>>,
  ): Promise<PlantCatalogLookupResult> {
    return structuredClone(
      (
        await this.request<SingleResponse<PlantCatalogLookupResult>>(
          '/plant-model-catalog-lookups',
          {
            method: 'POST',
            body: JSON.stringify({ binding, nodeValues }),
          },
        )
      ).data,
    );
  }

  public async listDashboards(siteId: string): Promise<readonly PlantDashboardAssociation[]> {
    return (
      await this.request<CollectionResponse<PlantDashboardAssociation>>(
        `${sitePath(siteId)}/dashboards`,
      )
    ).data.map((value) => ({ ...value }));
  }

  public async associateDashboard(
    siteId: string,
    dashboardId: string,
    input: {
      readonly role: PlantDashboardRole;
      readonly displayOrder: number;
      readonly isDefault: boolean;
    },
  ): Promise<readonly PlantDashboardAssociation[]> {
    return (
      await this.request<CollectionResponse<PlantDashboardAssociation>>(
        `${sitePath(siteId)}/dashboards/${encodeURIComponent(dashboardId)}`,
        { method: 'PUT', body: JSON.stringify(input) },
      )
    ).data.map((value) => ({ ...value }));
  }

  public async removeDashboard(siteId: string, dashboardId: string): Promise<void> {
    await this.request<void>(`${sitePath(siteId)}/dashboards/${encodeURIComponent(dashboardId)}`, {
      method: 'DELETE',
    });
  }

  private async request<T>(path: string, init: RequestInit = { method: 'GET' }): Promise<T> {
    try {
      return await this.transport.request<T>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function sitePath(id: string): string {
  return `/plant-sites/${encodeURIComponent(id)}`;
}
function copySite(site: PlantSite): PlantSite {
  return structuredClone(site);
}
function copySummary(site: PlantSiteSummary): PlantSiteSummary {
  return { ...site };
}
