import { Injectable } from '@nestjs/common';

import type {
  ArchiveDashboardRecord,
  DashboardSummary,
  IDashboardRepository,
  SaveDashboardRecord,
} from '@application/dashboard/interfaces/i-dashboard.repository';
import type { Dashboard } from '@domain/dashboard/models/dashboard';
import type { Prisma } from '@generated/prisma/client';
import {
  toDashboard,
  toDashboardCardRows,
  toDashboardCreateData,
  toDashboardFilterRows,
  toDashboardMappingRows,
  toDashboardTabRows,
} from '@infrastructure/prisma/dashboard/dashboard-prisma.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const aggregateInclude = {
  tabs: { orderBy: { order: 'asc' } },
  cards: { orderBy: [{ y: 'asc' }, { x: 'asc' }] },
  filters: { orderBy: { order: 'asc' } },
  mappings: true,
} satisfies Prisma.DashboardInclude;

@Injectable()
export class PrismaDashboardRepository implements IDashboardRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(dashboard: Dashboard): Promise<Dashboard> {
    await this.prisma.transaction(async (client) => {
      await client.dashboard.create({ data: toDashboardCreateData(dashboard) });
      await writeChildren(client, dashboard);
    });
    return dashboard;
  }

  public async copy(dashboard: Dashboard): Promise<Dashboard> {
    return this.create(dashboard);
  }

  public async findById(organizationId: string, dashboardId: string): Promise<Dashboard | null> {
    const row = await this.prisma.client.dashboard.findFirst({
      where: { id: dashboardId, organizationId },
      include: aggregateInclude,
    });
    return row ? toDashboard(row) : null;
  }

  public async listByCollection(
    organizationId: string,
    collectionId: string,
  ): Promise<readonly DashboardSummary[]> {
    const rows = await this.prisma.client.dashboard.findMany({
      where: { organizationId, collectionId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        collectionId: true,
        title: true,
        description: true,
        currentRevision: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      collectionId: row.collectionId,
      title: row.title,
      description: row.description,
      revision: row.currentRevision,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  public async saveCompleteDraft(input: SaveDashboardRecord): Promise<Dashboard | null> {
    return this.prisma.transaction(async (client) => {
      const update = await client.dashboard.updateMany({
        where: {
          id: input.dashboard.id,
          organizationId: input.dashboard.organizationId,
          currentRevision: input.expectedRevision,
          archivedAt: null,
        },
        data: {
          collectionId: input.dashboard.collectionId,
          title: input.dashboard.title,
          description: input.dashboard.description,
          currentRevision: input.dashboard.revision,
          updatedAt: new Date(input.dashboard.updatedAt),
        },
      });
      if (update.count !== 1) return null;
      await deleteChildren(client, input.dashboard.id);
      await writeChildren(client, input.dashboard);
      return input.dashboard;
    });
  }

  public async archive(input: ArchiveDashboardRecord): Promise<void> {
    await this.prisma.client.dashboard.updateMany({
      where: { id: input.dashboardId, organizationId: input.organizationId },
      data: {
        archivedAt: new Date(input.archivedAt),
        updatedAt: new Date(input.archivedAt),
      },
    });
  }
}

async function deleteChildren(
  client: Prisma.TransactionClient,
  dashboardId: string,
): Promise<void> {
  await client.dashboardFilterMapping.deleteMany({ where: { dashboardId } });
  await client.dashboardFilter.deleteMany({ where: { dashboardId } });
  await client.dashboardCard.deleteMany({ where: { dashboardId } });
  await client.dashboardTab.deleteMany({ where: { dashboardId } });
}

async function writeChildren(
  client: Prisma.TransactionClient,
  dashboard: Dashboard,
): Promise<void> {
  await client.dashboardTab.createMany({ data: toDashboardTabRows(dashboard) });
  if (dashboard.cards.length > 0) {
    await client.dashboardCard.createMany({ data: toDashboardCardRows(dashboard) });
  }
  if (dashboard.filters.length > 0) {
    await client.dashboardFilter.createMany({ data: toDashboardFilterRows(dashboard) });
  }
  if (dashboard.mappings.length > 0) {
    await client.dashboardFilterMapping.createMany({ data: toDashboardMappingRows(dashboard) });
  }
}
