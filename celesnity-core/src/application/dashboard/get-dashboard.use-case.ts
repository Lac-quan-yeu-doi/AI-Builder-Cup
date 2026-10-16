import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type { Dashboard } from '@domain/dashboard/models/dashboard';

export class GetDashboardUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly dashboardId: string;
  }): Promise<Dashboard> {
    const dashboard = await this.repository.findById(
      input.principal.organizationId,
      input.dashboardId,
    );
    if (dashboard === null || dashboard.archivedAt !== null) throw DashboardError.notFound();
    await this.collections.requireAccess(dashboard.collectionId, input.principal, 'VIEW');
    return dashboard;
  }
}
