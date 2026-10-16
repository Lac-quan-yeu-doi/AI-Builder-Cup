import { Injectable } from '@nestjs/common';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaDatabaseServiceMembershipRepository
  implements IDatabaseServiceMembershipRepository
{
  public constructor(private readonly prisma: PrismaService) {}

  public async listDatabaseNames(databaseServiceId: string): Promise<readonly string[]> {
    const rows = await this.prisma.client.databaseServiceMembership.findMany({
      where: { organizationId: this.organizationId(), databaseServiceId },
      select: { databaseName: true },
      orderBy: { databaseName: 'asc' },
    });
    return rows.map((row) => row.databaseName).sort((left, right) => left.localeCompare(right));
  }

  public async listDatabaseServiceIds(databaseName: string): Promise<readonly string[]> {
    const rows = await this.prisma.client.databaseServiceMembership.findMany({
      where: { organizationId: this.organizationId(), databaseName },
      select: { databaseServiceId: true },
      orderBy: { databaseServiceId: 'asc' },
    });
    return rows.map((row) => row.databaseServiceId);
  }

  public async exists(databaseServiceId: string, databaseName: string): Promise<boolean> {
    const row = await this.prisma.client.databaseServiceMembership.findFirst({
      where: {
        organizationId: this.organizationId(),
        databaseServiceId,
        databaseName,
      },
      select: { databaseServiceId: true },
    });
    return row !== null;
  }

  public async hasAny(databaseServiceId: string): Promise<boolean> {
    const row = await this.prisma.client.databaseServiceMembership.findFirst({
      where: { organizationId: this.organizationId(), databaseServiceId },
      select: { databaseServiceId: true },
    });
    return row !== null;
  }

  public async lockExisting(databaseServiceId: string, databaseName: string): Promise<boolean> {
    const organizationId = this.organizationId();
    const rows = await this.prisma.client.$queryRaw<readonly { readonly database_service_id: string }[]>`
      SELECT membership.database_service_id
      FROM "celesnity_app"."database_service_memberships" AS membership
      WHERE membership.organization_id = ${organizationId}::uuid
        AND membership.database_service_id = ${databaseServiceId}::uuid
        AND membership.database_name = ${databaseName}
      FOR UPDATE
    `;
    return rows.length > 0;
  }

  public async attach(
    databaseServiceId: string,
    databaseName: string,
    createdAt: Date,
  ): Promise<void> {
    try {
      await this.prisma.client.databaseServiceMembership.create({
        data: {
          organizationId: this.organizationId(),
          databaseServiceId,
          databaseName,
          createdAt,
        },
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return;
      throw error;
    }
  }

  public async detach(databaseServiceId: string, databaseName: string): Promise<void> {
    await this.prisma.client.databaseServiceMembership.deleteMany({
      where: {
        organizationId: this.organizationId(),
        databaseServiceId,
        databaseName,
      },
    });
  }

  private organizationId(): string {
    const organizationId = this.prisma.organizationId;
    if (organizationId === undefined) {
      throw new Error('An authenticated organization context is required for datasource membership.');
    }
    return organizationId;
  }
}
