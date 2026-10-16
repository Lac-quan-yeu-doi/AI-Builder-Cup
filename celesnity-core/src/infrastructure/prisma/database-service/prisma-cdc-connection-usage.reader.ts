import { Injectable } from '@nestjs/common';

import type { ICdcConnectionUsageReader } from '@application/database-service/interfaces/i-cdc-connection-usage-reader';
import type { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaCdcConnectionUsageReader implements ICdcConnectionUsageReader {
  public constructor(private readonly prisma: PrismaService) {}

  public async hasActiveCdcSubscriptions(
    organizationId: string,
    databaseServiceId: ConnectionId,
  ): Promise<boolean> {
    const count = await this.prisma.client.dataWorkflowWatchSourceSubscription.count({
      where: {
        organizationId,
        enabled: true,
        watchSource: {
          databaseServiceId: databaseServiceId.value,
          enabled: true,
          trigger: { path: ['mode'], equals: 'CDC' },
        },
      },
    });
    return count > 0;
  }
}
