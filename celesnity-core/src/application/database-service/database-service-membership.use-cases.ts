import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDatabaseSourceUsageReader } from '@application/database-service/interfaces/i-database-source-usage-reader';
import type {
  DatabaseServiceListPage,
  DatabaseServiceListQuery,
} from '@application/database-service/read-models/database-service.view';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';

export type ListAvailableDatabaseServicesQuery = Omit<
  DatabaseServiceListQuery,
  'databaseName' | 'excludeDatabaseName'
> & { readonly databaseName: string };

export interface AttachDatabaseServiceCommand {
  readonly databaseServiceId: string;
  readonly databaseName: string;
}

export type DetachDatabaseServiceCommand = AttachDatabaseServiceCommand;

/**
 * Coordinates catalog membership without leaking Prisma or catalog transport
 * details into the database-service application boundary.
 */
export class DatabaseServiceMembershipUseCases {
  public constructor(
    private readonly memberships: IDatabaseServiceMembershipRepository,
    private readonly catalogs: IDatabaseCatalogReader,
    private readonly databaseServices: IDatabaseServiceRepository,
    private readonly reader: IDatabaseServiceReader,
    private readonly sourceUsage: IDatabaseSourceUsageReader,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
  ) {}

  public async listAvailable(
    query: ListAvailableDatabaseServicesQuery,
  ): Promise<DatabaseServiceListPage> {
    const databaseName = requiredDatabaseName(query.databaseName);
    await this.requireCatalog(databaseName);
    return this.reader.listActive({
      search: query.search,
      connectorType: query.connectorType,
      verificationStatus: query.verificationStatus,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      databaseName: undefined,
      excludeDatabaseName: databaseName,
    });
  }

  public async attach(command: AttachDatabaseServiceCommand): Promise<void> {
    const databaseName = requiredDatabaseName(command.databaseName);
    await this.requireCatalog(databaseName);
    const databaseServiceId = ConnectionId.from(command.databaseServiceId);
    const source = await this.databaseServices.findById(databaseServiceId);
    if (source === undefined || source.isArchived) {
      throw ConnectionError.databaseServiceNotFound();
    }

    await this.unitOfWork.commit(async () => {
      await this.memberships.attach(databaseServiceId.value, databaseName, this.clock.now());
    });
  }

  public async detach(command: DetachDatabaseServiceCommand): Promise<void> {
    const databaseName = requiredDatabaseName(command.databaseName);
    const databaseServiceId = ConnectionId.from(command.databaseServiceId);

    await this.unitOfWork.commit(async () => {
      if (!(await this.memberships.lockExisting(databaseServiceId.value, databaseName))) {
        return;
      }
      const pipelines = await this.sourceUsage.listUsingPipelines(
        databaseName,
        databaseServiceId.value,
      );
      if (pipelines.length > 0) {
        throw ConnectionError.datasourceUsedByPipelines(pipelines);
      }
      await this.memberships.detach(databaseServiceId.value, databaseName);
    });
  }

  private async requireCatalog(databaseName: string): Promise<void> {
    if (!(await this.catalogs.exists(databaseName))) {
      throw ConnectionError.databaseNotFound();
    }
  }
}

function requiredDatabaseName(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw ConnectionError.validation(ConnectionMessage.catalogDatabaseRequired);
  }
  return normalized;
}
