import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardChartReader } from '@application/dashboard/interfaces/i-dashboard-chart.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { requireDashboardCharts } from '@application/dashboard/dashboard-chart-access.service';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import { validateDashboard, type Dashboard } from '@domain/dashboard/models/dashboard';

export class SaveDashboardUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
    private readonly charts: IDashboardChartReader,
    private readonly clock: IClock,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly dashboardId: string;
    readonly expectedRevision: number;
    readonly draft: Dashboard;
  }): Promise<Dashboard> {
    const existing = await this.repository.findById(
      input.principal.organizationId,
      input.dashboardId,
    );
    if (existing === null || existing.archivedAt !== null) throw DashboardError.notFound();
    if (input.draft.id !== existing.id || input.draft.organizationId !== existing.organizationId) {
      throw DashboardError.validation('Draft identity does not match the dashboard.');
    }
    if (existing.revision !== input.expectedRevision) throw DashboardError.revisionConflict();

    await this.collections.requireAccess(existing.collectionId, input.principal, 'CURATE');
    if (input.draft.collectionId !== existing.collectionId) {
      await this.collections.requireAccess(input.draft.collectionId, input.principal, 'CURATE');
    }
    await requireDashboardCharts(input.draft, input.principal, this.charts);

    const dashboard: Dashboard = {
      ...input.draft,
      organizationId: existing.organizationId,
      revision: input.expectedRevision + 1,
      createdByIdentityId: existing.createdByIdentityId,
      archivedAt: null,
      createdAt: existing.createdAt,
      updatedAt: this.clock.now().toISOString(),
    };
    validateDashboard(dashboard);
    const saved = await this.repository.saveCompleteDraft({
      dashboard,
      expectedRevision: input.expectedRevision,
    });
    if (saved === null) throw DashboardError.revisionConflict();
    return saved;
  }
}
