import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';

export class ArchiveDashboardUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
    private readonly clock: IClock,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly dashboardId: string;
  }): Promise<void> {
    const dashboard = await this.repository.findById(
      input.principal.organizationId,
      input.dashboardId,
    );
    if (dashboard === null || dashboard.archivedAt !== null) throw DashboardError.notFound();
    await this.collections.requireAccess(dashboard.collectionId, input.principal, 'CURATE');
    await this.repository.archive({
      organizationId: input.principal.organizationId,
      dashboardId: dashboard.id,
      archivedAt: this.clock.now().toISOString(),
    });
  }
}
