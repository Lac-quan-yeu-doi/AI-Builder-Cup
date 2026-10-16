import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type {
  IPlantModelRepository,
  PlantSaveResult,
} from '@application/plant-model/interfaces/i-plant-model.repository';
import type {
  PlantDashboardAssociation,
  PlantModelDraft,
  PlantModelVersionSnapshot,
  PlantReferenceData,
  PlantSite,
} from '@domain/plant-model/models/plant-model';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const SITE_SELECTION = {
  id: true,
  name: true,
  code: true,
  timezone: true,
  draft: true,
  revision: true,
  latestPublishedVersion: true,
  publishedRevision: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaPlantModelRepository implements IPlantModelRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(): Promise<readonly PlantSite[]> {
    const records = await this.prisma.client.plantSite.findMany({
      orderBy: { updatedAt: 'desc' },
      select: SITE_SELECTION,
    });
    return records.map(toSite);
  }

  public async find(id: string): Promise<PlantSite | undefined> {
    const record = await this.prisma.client.plantSite.findFirst({
      where: { id },
      select: SITE_SELECTION,
    });
    return record === null ? undefined : toSite(record);
  }

  public async create(site: PlantSite, referenceData: PlantReferenceData): Promise<boolean> {
    try {
      await this.prisma.client.plantSite.create({
        data: {
          id: site.id,
          name: site.name,
          code: site.code,
          timezone: site.timezone,
          draft: json(site.draft),
          referenceData: json(referenceData),
          revision: site.revision,
          createdAt: new Date(site.createdAt),
          updatedAt: new Date(site.updatedAt),
        },
      });
      return true;
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return false;
      throw error;
    }
  }

  public async save(
    id: string,
    draft: PlantModelDraft,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<PlantSaveResult> {
    const result = await this.prisma.client.plantSite.updateMany({
      where: { id, revision: expectedRevision },
      data: {
        draft: json(draft),
        revision: expectedRevision + 1,
        updatedAt: new Date(updatedAt),
      },
    });
    return result.count === 1 ? 'SAVED' : 'VERSION_CONFLICT';
  }

  public async publish(
    id: string,
    snapshot: PlantModelVersionSnapshot,
    expectedRevision: number,
  ): Promise<'PUBLISHED' | 'VERSION_CONFLICT' | 'ALREADY_PUBLISHED'> {
    const result = await this.prisma.client.plantSite.updateMany({
      where: {
        id,
        revision: expectedRevision,
        OR: [{ publishedRevision: null }, { publishedRevision: { not: expectedRevision } }],
      },
      data: {
        latestPublishedVersion: snapshot.number,
        publishedRevision: expectedRevision,
        updatedAt: new Date(snapshot.publishedAt),
      },
    });
    if (result.count !== 1) {
      const site = await this.prisma.client.plantSite.findFirst({
        where: { id },
        select: { revision: true, publishedRevision: true },
      });
      return site?.revision === expectedRevision && site.publishedRevision === expectedRevision
        ? 'ALREADY_PUBLISHED'
        : 'VERSION_CONFLICT';
    }
    await this.prisma.client.plantModelVersion.create({
      data: {
        id: snapshot.id,
        siteId: id,
        versionNumber: snapshot.number,
        revision: snapshot.revision,
        snapshot: json(snapshot.draft),
        note: snapshot.note,
        publishedBy: snapshot.publishedBy,
        publishedAt: new Date(snapshot.publishedAt),
      },
    });
    return 'PUBLISHED';
  }

  public async listVersions(siteId: string): Promise<readonly PlantModelVersionSnapshot[]> {
    const records = await this.prisma.client.plantModelVersion.findMany({
      where: { siteId },
      orderBy: { versionNumber: 'desc' },
    });
    return records.map(toVersion);
  }

  public async findVersion(
    siteId: string,
    version: number,
  ): Promise<PlantModelVersionSnapshot | undefined> {
    const record = await this.prisma.client.plantModelVersion.findFirst({
      where: { siteId, versionNumber: version },
    });
    return record === null ? undefined : toVersion(record);
  }

  public async referenceData(siteId: string): Promise<PlantReferenceData | undefined> {
    const record = await this.prisma.client.plantSite.findFirst({
      where: { id: siteId },
      select: { referenceData: true },
    });
    return record === null ? undefined : (record.referenceData as unknown as PlantReferenceData);
  }

  public async listDashboards(siteId: string): Promise<readonly PlantDashboardAssociation[]> {
    const records = await this.prisma.client.plantDashboardAssociation.findMany({
      where: { siteId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return records.map((record) => ({
      siteId: record.siteId,
      dashboardId: record.dashboardId,
      role: record.role as PlantDashboardAssociation['role'],
      displayOrder: record.displayOrder,
      isDefault: record.isDefault,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  public async associateDashboard(
    input: Parameters<IPlantModelRepository['associateDashboard']>[0],
  ): Promise<'SAVED' | 'DASHBOARD_NOT_FOUND'> {
    const organizationId = this.prisma.organizationId;
    if (organizationId === undefined) return 'DASHBOARD_NOT_FOUND';
    const dashboard = await this.prisma.client.dashboard.findFirst({
      where: { id: input.dashboardId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (dashboard === null) return 'DASHBOARD_NOT_FOUND';
    if (input.isDefault) {
      await this.prisma.client.plantDashboardAssociation.updateMany({
        where: { siteId: input.siteId, isDefault: true },
        data: { isDefault: false, updatedAt: new Date(input.now) },
      });
    }
    await this.prisma.client.plantDashboardAssociation.upsert({
      where: { siteId_dashboardId: { siteId: input.siteId, dashboardId: input.dashboardId } },
      create: {
        organizationId,
        siteId: input.siteId,
        dashboardId: input.dashboardId,
        role: input.role,
        displayOrder: input.displayOrder,
        isDefault: input.isDefault,
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now),
      },
      update: {
        role: input.role,
        displayOrder: input.displayOrder,
        isDefault: input.isDefault,
        updatedAt: new Date(input.now),
      },
    });
    return 'SAVED';
  }

  public async removeDashboard(siteId: string, dashboardId: string): Promise<void> {
    await this.prisma.client.plantDashboardAssociation.deleteMany({
      where: { siteId, dashboardId },
    });
  }
}

type SiteRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly timezone: string;
  readonly draft: Prisma.JsonValue;
  readonly revision: number;
  readonly latestPublishedVersion: number | null;
  readonly publishedRevision: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

function toSite(record: SiteRecord): PlantSite {
  return {
    id: record.id,
    name: record.name,
    code: record.code,
    timezone: record.timezone,
    draft: record.draft as unknown as PlantModelDraft,
    revision: record.revision,
    ...(record.latestPublishedVersion === null
      ? {}
      : { latestPublishedVersion: record.latestPublishedVersion }),
    ...(record.publishedRevision === null ? {} : { publishedRevision: record.publishedRevision }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toVersion(record: {
  readonly id: string;
  readonly versionNumber: number;
  readonly revision: number;
  readonly snapshot: Prisma.JsonValue;
  readonly note: string | null;
  readonly publishedBy: string;
  readonly publishedAt: Date;
}): PlantModelVersionSnapshot {
  return {
    id: record.id,
    number: record.versionNumber,
    revision: record.revision,
    draft: record.snapshot as unknown as PlantModelDraft,
    ...(record.note === null ? {} : { note: record.note }),
    publishedBy: record.publishedBy,
    publishedAt: record.publishedAt.toISOString(),
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
