import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type {
  DashboardSummary,
  IDashboardRepository,
} from '@application/dashboard/interfaces/i-dashboard.repository';

export class ListDashboardsUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly collectionId: string;
  }): Promise<readonly DashboardSummary[]> {
    await this.collections.requireAccess(input.collectionId, input.principal, 'VIEW');
    return this.repository.listByCollection(input.principal.organizationId, input.collectionId);
  }
}
