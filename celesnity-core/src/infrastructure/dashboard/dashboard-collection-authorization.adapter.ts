import type { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';
import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';

export class DashboardCollectionAuthorizationAdapter implements IDashboardCollectionAuthorizationReader {
  public constructor(private readonly authorization: CollectionAuthorizationService) {}

  public async requireAccess(
    collectionId: string,
    principal: DashboardPrincipal,
    access: 'VIEW' | 'CURATE',
  ): Promise<void> {
    try {
      await this.authorization.requireAccess(collectionId, principal, access);
    } catch (error: unknown) {
      if (error instanceof ChartCollectionError) throw DashboardError.accessDenied();
      throw error;
    }
  }
}
