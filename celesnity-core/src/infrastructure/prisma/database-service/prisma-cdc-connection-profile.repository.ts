import { Injectable } from '@nestjs/common';

import type { ICdcConnectionProfileRepository } from '@application/database-service/interfaces/i-cdc-connection-profile-repository';
import type { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import type { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';
import { CdcConnectionProfileMapper } from '@infrastructure/prisma/database-service/cdc-connection-profile.mapper';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaCdcConnectionProfileRepository implements ICdcConnectionProfileRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CdcConnectionProfileMapper,
  ) {}

  public async findByDatabaseService(
    organizationId: string,
    databaseServiceId: ConnectionId,
  ): Promise<CdcConnectionProfile | undefined> {
    const record = await this.prisma.client.databaseServiceCdcConnectionProfile.findFirst({
      where: {
        organizationId,
        databaseServiceId: databaseServiceId.value,
      },
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  public async create(profile: CdcConnectionProfile): Promise<void> {
    await this.prisma.client.databaseServiceCdcConnectionProfile.create({
      data: this.mapper.toInsertPersistence(profile),
    });
  }

  public async update(profile: CdcConnectionProfile, expectedRevision: number): Promise<boolean> {
    const result = await this.prisma.client.databaseServiceCdcConnectionProfile.updateMany({
      where: {
        id: profile.id.value,
        organizationId: profile.organizationId,
        databaseServiceId: profile.databaseServiceId.value,
        revision: expectedRevision,
      },
      data: this.mapper.toPersistence(profile),
    });
    return guardHeld(result);
  }

  public async delete(organizationId: string, databaseServiceId: ConnectionId): Promise<boolean> {
    const result = await this.prisma.client.databaseServiceCdcConnectionProfile.deleteMany({
      where: {
        organizationId,
        databaseServiceId: databaseServiceId.value,
      },
    });
    return guardHeld(result);
  }
}
