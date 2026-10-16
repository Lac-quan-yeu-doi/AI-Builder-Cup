import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ICatalogNamespaceMetadataRepository } from '@application/catalog-exploration/interfaces/i-catalog-namespace-metadata.repository';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaCatalogNamespaceMetadataRepository implements ICatalogNamespaceMetadataRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async listDescriptions(
    catalog: string,
    namespaces: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (namespaces.length === 0) return new Map();
    const rows = await this.prisma.client.catalogNamespaceDescription.findMany({
      where: { catalog, namespace: { in: [...namespaces] }, description: { not: null } },
      select: { namespace: true, description: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.description === null ? [] : [[row.namespace, row.description] as const],
      ),
    );
  }

  public async setDescription(
    catalog: string,
    namespace: string,
    description: string | undefined,
  ): Promise<void> {
    const existing = await this.prisma.client.catalogNamespaceDescription.findFirst({
      where: { catalog, namespace },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.client.catalogNamespaceDescription.updateMany({
        where: { id: existing.id },
        data: { description: description ?? null },
      });
      return;
    }
    await this.prisma.client.catalogNamespaceDescription.create({
      // PrismaService replaces this sentinel with the authenticated organization
      // before the query reaches Prisma. Supplying the field here keeps the
      // generated unchecked-create contract honest and prevents an unscoped write.
      data: {
        id: randomUUID(),
        organizationId: '00000000-0000-0000-0000-000000000000',
        catalog,
        namespace,
        description: description ?? null,
      },
    });
  }
}
