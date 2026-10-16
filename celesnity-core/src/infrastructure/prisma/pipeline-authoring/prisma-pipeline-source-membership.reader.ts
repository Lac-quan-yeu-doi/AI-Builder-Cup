import { Injectable } from '@nestjs/common';

import type { IPipelineSourceMembershipReader } from '@application/pipeline-authoring/interfaces/i-pipeline-source-membership-reader';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Locks the exact membership rows a pipeline save depends on. The query runs
 * through PrismaService's ambient transaction client, so detach and save
 * serialize on the same PostgreSQL row lock.
 */
@Injectable()
export class PrismaPipelineSourceMembershipReader implements IPipelineSourceMembershipReader {
  public constructor(private readonly prisma: PrismaService) {}

  public async lockAndListMissing(
    databaseName: string,
    databaseServiceIds: readonly string[],
  ): Promise<readonly string[]> {
    if (databaseServiceIds.length === 0) return [];
    const organizationId = this.prisma.organizationId;
    if (organizationId === undefined) {
      throw new Error('An authenticated organization context is required for pipeline membership.');
    }

    const missing: string[] = [];
    const ids = [...new Set(databaseServiceIds)].sort((left, right) => left.localeCompare(right));
    for (const databaseServiceId of ids) {
      const rows = await this.prisma.client.$queryRaw<
        readonly { readonly database_service_id: string }[]
      >`
        SELECT membership.database_service_id
        FROM "celesnity_app"."database_service_memberships" AS membership
        WHERE membership.organization_id = ${organizationId}::uuid
          AND membership.database_name = ${databaseName}
          AND membership.database_service_id = ${databaseServiceId}::uuid
        FOR UPDATE
      `;
      if (rows.length === 0) missing.push(databaseServiceId);
    }
    return missing;
  }
}
