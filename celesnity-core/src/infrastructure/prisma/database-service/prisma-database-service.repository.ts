import { Injectable } from '@nestjs/common';

import { DatabaseServiceMapper } from '@infrastructure/prisma/database-service/database-service.mapper';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type {
  ConnectionId,
  ConnectionName,
} from '@domain/database-service/value-objects/connection-value-objects';

@Injectable()
export class PrismaDatabaseServiceRepository implements IDatabaseServiceRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: DatabaseServiceMapper,
  ) {}

  public async findById(id: ConnectionId): Promise<DatabaseService | undefined> {
    const record = await this.prisma.client.databaseService.findUnique({
      where: { id: id.value },
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  public async existsByName(name: ConnectionName, excludingId?: ConnectionId): Promise<boolean> {
    const match = await this.prisma.client.databaseService.findFirst({
      where: {
        name: name.value,
        id: excludingId === undefined ? undefined : { not: excludingId.value },
      },
      // Existence only needs to know whether a row is there, so one indexed
      // column is fetched instead of counting the whole matching set.
      select: { id: true },
    });
    return match !== null;
  }

  public async create(connection: DatabaseService): Promise<void> {
    try {
      await this.prisma.client.databaseService.create({
        data: this.mapper.toInsertPersistence(connection),
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        // The name check in the use case is advisory; this is the authoritative
        // one, because only the unique index sees concurrent inserts.
        throw ConnectionError.nameConflict();
      }
      throw error;
    }
  }

  public async update(connection: DatabaseService, expectedUpdatedAt: Date): Promise<boolean> {
    try {
      const result = await this.prisma.client.databaseService.updateMany({
        where: {
          id: connection.id.value,
          archivedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: this.mapper.toPersistence(connection),
      });
      return guardHeld(result);
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw ConnectionError.nameConflict();
      }
      throw error;
    }
  }
}
