import { Injectable } from '@nestjs/common';

import type {
  CatalogSourceBinding,
  ICatalogSourceBindingResolver,
} from '@application/node-catalog/interfaces/i-catalog-source-binding-resolver';
import { CatalogNamespaceType } from '@generated/prisma/enums';
import { currentMetadataSnapshotRunWhere } from '@infrastructure/prisma/metadata-crawler/current-metadata-snapshot';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaCatalogSourceBindingResolver implements ICatalogSourceBindingResolver {
  public constructor(private readonly prisma: PrismaService) {}

  public async resolve(
    databaseServiceId: string,
    namespaceId: string,
    relationId: string,
  ): Promise<CatalogSourceBinding | undefined> {
    const namespace = await this.prisma.client.catalogNamespace.findFirst({
      where: {
        id: namespaceId,
        databaseServiceId,
        namespaceType: CatalogNamespaceType.SCHEMA,
        deletedAt: null,
        lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
      },
      select: { id: true, name: true },
    });
    if (namespace === null) {
      return undefined;
    }

    const relation = await this.prisma.client.catalogRelation.findFirst({
      where: {
        id: relationId,
        namespaceId: namespace.id,
        deletedAt: null,
        lastSeenRun: currentMetadataSnapshotRunWhere(databaseServiceId),
      },
      select: {
        id: true,
        name: true,
        columns: {
          where: { deletedAt: null },
          orderBy: [{ ordinalPosition: 'asc' }, { id: 'asc' }],
          select: { name: true, canonicalType: true, nullable: true },
        },
      },
    });
    if (relation === null) {
      return undefined;
    }

    return {
      databaseServiceId,
      namespaceId: namespace.id,
      relationId: relation.id,
      schemaName: namespace.name,
      tableName: relation.name,
      columns: relation.columns.map((column) => ({
        name: column.name,
        dataType: column.canonicalType,
        nullable: column.nullable,
      })),
    };
  }
}
