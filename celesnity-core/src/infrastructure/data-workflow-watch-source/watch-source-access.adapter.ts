import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWatchSourceAccess,
  WatchSourceMetadata,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-access';
import type {
  WatchSourceCatalogPage,
  WatchSourceCatalogQuery,
  WatchSourceCatalogRelationView,
  WatchSourceCatalogServiceView,
} from '@application/data-workflow-watch-source/read-models/watch-source-catalog.view';
import { roleAllows } from '@application/administration/authorization-policy';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class WatchSourceAccessAdapter implements IWatchSourceAccess {
  public constructor(private readonly prisma: PrismaService) {}

  public async readVerifiedMetadata(
    actor: WorkflowActor,
    databaseServiceId: string,
  ): Promise<WatchSourceMetadata> {
    const membership = await this.prisma.client.organizationMembership.findFirst({
      where: {
        organizationId: actor.organizationId,
        identityId: actor.identityId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { role: true },
    });
    if (membership === null || !roleAllows(membership.role, 'workspace:write')) throw denied();
    const source = await this.prisma.client.databaseService.findFirst({
      where: { id: databaseServiceId, organizationId: actor.organizationId, archivedAt: null },
      select: {
        connectorType: true,
        verificationStatus: true,
        catalogNamespaces: {
          where: { deletedAt: null },
          select: {
            name: true,
            relations: {
              where: { deletedAt: null },
              select: {
                name: true,
                columns: { where: { deletedAt: null }, select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (source === null) throw denied();
    if (source.verificationStatus !== 'SUCCEEDED') throw ConnectionAccessError.notVerified();
    return {
      connectorType: source.connectorType,
      relations: source.catalogNamespaces.flatMap((namespace) =>
        namespace.relations.map((relation) => ({
          schema: namespace.name,
          table: relation.name,
          columns: relation.columns.map((column) => column.name),
        })),
      ),
    };
  }

  public async listCatalogServices(
    actor: WorkflowActor,
    query: WatchSourceCatalogQuery,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogServiceView>> {
    await this.requireWorkspaceWrite(actor);
    const where = {
      organizationId: actor.organizationId,
      archivedAt: null,
      verificationStatus: 'SUCCEEDED' as const,
      ...(query.search === undefined
        ? {}
        : { name: { contains: query.search, mode: 'insensitive' as const } }),
    };
    const [totalItems, services] = await Promise.all([
      this.prisma.client.databaseService.count({ where }),
      this.prisma.client.databaseService.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          name: true,
          memberships: {
            select: { databaseName: true },
            orderBy: { databaseName: 'asc' },
          },
          connectorType: true,
          verificationStatus: true,
          _count: { select: { catalogNamespaces: { where: { deletedAt: null } } } },
        },
      }),
    ]);
    return {
      data: services.map((service) => ({
        id: service.id,
        name: service.name,
        databaseNames: service.memberships.map((membership) => membership.databaseName),
        connectorType: service.connectorType,
        verificationStatus: 'SUCCEEDED',
        metadataAvailable: service._count.catalogNamespaces > 0,
      })),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
    };
  }

  public async listCatalogRelations(
    actor: WorkflowActor,
    databaseServiceId: string,
    query: WatchSourceCatalogQuery,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogRelationView>> {
    await this.requireWorkspaceWrite(actor);
    const service = await this.prisma.client.databaseService.findFirst({
      where: {
        id: databaseServiceId,
        organizationId: actor.organizationId,
        archivedAt: null,
        verificationStatus: 'SUCCEEDED',
      },
      select: { id: true },
    });
    if (service === null) throw denied();
    const relationWhere = {
      namespace: {
        databaseServiceId,
        deletedAt: null,
      },
      deletedAt: null,
      ...(query.search === undefined
        ? {}
        : { name: { contains: query.search, mode: 'insensitive' as const } }),
    };
    const [totalItems, relations] = await Promise.all([
      this.prisma.client.catalogRelation.count({ where: relationWhere }),
      this.prisma.client.catalogRelation.findMany({
        where: relationWhere,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          name: true,
          relationType: true,
          namespace: { select: { name: true } },
          columns: {
            where: { deletedAt: null },
            orderBy: [{ ordinalPosition: 'asc' }, { id: 'asc' }],
            select: { name: true, nativeType: true, nullable: true },
          },
        },
      }),
    ]);
    return {
      data: relations.map((relation) => ({
        schema: relation.namespace.name,
        table: relation.name,
        relationType: relation.relationType,
        columns: relation.columns.map((column) => ({
          name: column.name,
          nativeType: column.nativeType,
          nullable: column.nullable,
        })),
      })),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
    };
  }

  private async requireWorkspaceWrite(actor: WorkflowActor): Promise<void> {
    const membership = await this.prisma.client.organizationMembership.findFirst({
      where: {
        organizationId: actor.organizationId,
        identityId: actor.identityId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { role: true },
    });
    if (membership === null || !roleAllows(membership.role, 'workspace:write')) throw denied();
  }
}

function denied(): ForbiddenException {
  return new ForbiddenException({
    code: 'WATCH_SOURCE_ACCESS_DENIED',
    message: 'You do not have access to this watch source.',
    details: null,
  });
}
