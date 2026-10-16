import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { createDashboard, type Dashboard } from '@domain/dashboard/models/dashboard';

export class CreateDashboardUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly collectionId: string;
    readonly title: string;
    readonly description: string | null;
  }): Promise<Dashboard> {
    await this.collections.requireAccess(input.collectionId, input.principal, 'CURATE');
    return this.repository.create(
      createDashboard({
        id: this.ids.next(),
        organizationId: input.principal.organizationId,
        collectionId: input.collectionId,
        title: input.title,
        description: input.description,
        createdByIdentityId: input.principal.identityId,
        initialTabId: this.ids.next(),
        now: this.clock.now().toISOString(),
      }),
    );
  }
}
