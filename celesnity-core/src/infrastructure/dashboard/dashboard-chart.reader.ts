import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardChartReader } from '@application/dashboard/interfaces/i-dashboard-chart.reader';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';

export class DashboardChartReader implements IDashboardChartReader {
  public constructor(
    private readonly charts: ICanonicalChartRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
  ) {}

  public async requireViewableChart(
    input: Parameters<IDashboardChartReader['requireViewableChart']>[0],
  ): Promise<void> {
    const current = await this.charts.findCanonicalById(
      input.principal.organizationId,
      input.chartId,
    );
    const chart = current?.chart;
    if (
      current === null ||
      chart === undefined ||
      chart.organizationId !== input.principal.organizationId ||
      chart.collectionId === null ||
      chart.collectionId === undefined ||
      chart.archivedAt !== null
    ) {
      throw DashboardError.accessDenied();
    }

    await this.collections.requireAccess(chart.collectionId, input.principal, 'VIEW');

    if (input.revisionNumber === null || current.revision.revisionNumber === input.revisionNumber) {
      return;
    }

    const revisions = await this.charts.listRevisions(
      input.principal.organizationId,
      input.chartId,
    );
    if (!revisions.some((revision) => revision.revisionNumber === input.revisionNumber)) {
      throw DashboardError.validation('A pinned chart revision is unavailable.');
    }
  }
}
