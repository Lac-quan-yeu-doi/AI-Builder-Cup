import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  CreateCollectionRecord,
  IChartCollectionRepository,
  MoveCollectionRecord,
  RenameCollectionRecord,
  ArchiveCollectionRecord,
  SetCollectionGrantRecord,
} from '@application/chart-collection/interfaces/i-chart-collection.repository';
import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';
import {
  effectiveCollectionAccess,
  validateCollectionMove,
  type ChartCollection,
  type CollectionAccess,
  type CollectionPrincipal,
} from '@domain/chart-collection/models/chart-collection';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaChartCollectionRepository implements IChartCollectionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(
    organizationId: string,
    collectionId: string,
  ): Promise<ChartCollection | null> {
    const row = await this.prisma.client.chartCollection.findFirst({
      where: { id: collectionId, organizationId },
    });
    return row ? toCollection(row) : null;
  }

  public async list(organizationId: string): Promise<readonly ChartCollection[]> {
    const rows = await this.prisma.client.chartCollection.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toCollection);
  }

  public async ensurePersonalCollection(principal: CollectionPrincipal): Promise<ChartCollection> {
    const existing = await this.prisma.client.chartCollection.findFirst({
      where: {
        organizationId: principal.organizationId,
        ownerIdentityId: principal.identityId,
        type: 'PERSONAL',
      },
    });
    if (existing) return toCollection(existing);
    try {
      const created = await this.prisma.client.chartCollection.create({
        data: {
          id: randomUUID(),
          organizationId: principal.organizationId,
          ownerIdentityId: principal.identityId,
          type: 'PERSONAL',
          name: 'Personal',
        },
      });
      return toCollection(created);
    } catch (error: unknown) {
      // Two requests may initialise the same user's Personal Collection at
      // once. The migration's partial unique index makes one insert win; the
      // loser re-reads the winner instead of surfacing a spurious 500.
      const raced = await this.prisma.client.chartCollection.findFirst({
        where: {
          organizationId: principal.organizationId,
          ownerIdentityId: principal.identityId,
          type: 'PERSONAL',
        },
      });
      if (raced) return toCollection(raced);
      throw error;
    }
  }

  public async effectiveAccess(
    collectionId: string,
    principal: CollectionPrincipal,
  ): Promise<CollectionAccess> {
    const grants = await this.prisma.client.chartCollectionGrant.findMany({
      where: {
        collectionId,
        authorizationGroup: {
          organizationId: principal.organizationId,
          members: { some: { identityId: principal.identityId } },
        },
      },
      select: { access: true },
    });
    return effectiveCollectionAccess(grants.map((grant) => grant.access as CollectionAccess));
  }

  public async create(input: CreateCollectionRecord): Promise<ChartCollection> {
    if (input.parentId)
      await this.requireParentInOrganization(input.organizationId, input.parentId);
    const row = await this.prisma.client.chartCollection.create({
      data: { ...input, id: randomUUID() },
    });
    return toCollection(row);
  }

  public async move(input: MoveCollectionRecord): Promise<ChartCollection> {
    const collection = await this.findById(input.organizationId, input.collectionId);
    if (!collection) throw ChartCollectionError.notFound();
    validateCollectionMove(collection, input.parentId);
    if (input.parentId) {
      await this.requireParentInOrganization(input.organizationId, input.parentId);
      await this.requireNoDescendantCycle(collection.id, input.parentId, input.organizationId);
    }
    const row = await this.prisma.client.chartCollection.update({
      where: { id: collection.id },
      data: { parentId: input.parentId },
    });
    return toCollection(row);
  }

  public async rename(input: RenameCollectionRecord): Promise<ChartCollection> {
    const collection = await this.findById(input.organizationId, input.collectionId);
    if (!collection) throw ChartCollectionError.notFound();
    const row = await this.prisma.client.chartCollection.update({
      where: { id: collection.id },
      data: { name: input.name },
    });
    return toCollection(row);
  }

  public async archive(input: ArchiveCollectionRecord): Promise<void> {
    const collection = await this.findById(input.organizationId, input.collectionId);
    if (!collection) throw ChartCollectionError.notFound();
    await this.prisma.client.chartCollection.update({
      where: { id: collection.id },
      data: { archivedAt: new Date(input.archivedAt) },
    });
  }

  public async setGrant(input: SetCollectionGrantRecord): Promise<void> {
    const collection = await this.findById(input.organizationId, input.collectionId);
    if (!collection) throw ChartCollectionError.notFound();
    await this.prisma.client.chartCollectionGrant.upsert({
      where: {
        collectionId_authorizationGroupId: {
          collectionId: input.collectionId,
          authorizationGroupId: input.authorizationGroupId,
        },
      },
      create: {
        id: randomUUID(),
        collectionId: input.collectionId,
        authorizationGroupId: input.authorizationGroupId,
        access: input.access,
      },
      update: { access: input.access },
    });
  }

  private async requireParentInOrganization(
    organizationId: string,
    parentId: string,
  ): Promise<void> {
    const parent = await this.findById(organizationId, parentId);
    if (!parent)
      throw ChartCollectionError.moveInvalid('Parent must belong to the same organization.');
  }

  private async requireNoDescendantCycle(
    collectionId: string,
    candidateParentId: string,
    organizationId: string,
  ): Promise<void> {
    let ancestorId: string | null = candidateParentId;
    while (ancestorId) {
      if (ancestorId === collectionId) {
        throw ChartCollectionError.moveInvalid('A collection cannot become its own descendant.');
      }
      const ancestor = await this.findById(organizationId, ancestorId);
      ancestorId = ancestor?.parentId ?? null;
    }
  }
}

function toCollection(row: {
  id: string;
  organizationId: string;
  parentId: string | null;
  ownerIdentityId: string | null;
  type: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChartCollection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentId: row.parentId,
    ownerIdentityId: row.ownerIdentityId,
    type: row.type as ChartCollection['type'],
    name: row.name,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
