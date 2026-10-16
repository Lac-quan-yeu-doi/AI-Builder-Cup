import { Injectable } from '@nestjs/common';

import type { Prisma } from '@generated/prisma/client';
import {
  DatabaseServiceMapper,
  NON_SECRET_DATABASE_SERVICE_SELECTION,
} from '@infrastructure/prisma/database-service/database-service.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type {
  DatabaseServiceListPage,
  DatabaseServiceListQuery,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';

const MAX_PAGE_SIZE = 500;

@Injectable()
export class PrismaDatabaseServiceReader implements IDatabaseServiceReader {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: DatabaseServiceMapper,
  ) {}

  public async listActive(query: DatabaseServiceListQuery): Promise<DatabaseServiceListPage> {
    const page = Math.max(1, Math.floor(query.page));
    const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(query.pageSize)));
    const where: Prisma.DatabaseServiceWhereInput = { archivedAt: null };
    const search = query.search?.trim();
    if (search !== undefined && search.length > 0) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { connectorType: { contains: search, mode: 'insensitive' } },
      ];
    }
    const databaseName = query.databaseName?.trim();
    if (databaseName !== undefined && databaseName.length > 0) {
      where.memberships = { some: { databaseName } };
    } else {
      const excludedDatabaseName = query.excludeDatabaseName?.trim();
      if (excludedDatabaseName !== undefined && excludedDatabaseName.length > 0) {
        where.memberships = { none: { databaseName: excludedDatabaseName } };
      }
    }
    if (query.connectorType !== undefined) {
      where.connectorType = query.connectorType;
    }
    if (query.verificationStatus !== undefined) {
      where.verificationStatus = query.verificationStatus;
    }
    const orderBy = {
      [query.sortBy]: query.sortDirection,
    } as Prisma.DatabaseServiceOrderByWithRelationInput;
    const [records, total] = await Promise.all([
      this.prisma.client.databaseService.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: NON_SECRET_DATABASE_SERVICE_SELECTION,
      }),
      this.prisma.client.databaseService.count({ where }),
    ]);
    return {
      items: records.map((record) => this.mapper.toView(record)),
      page,
      pageSize,
      total,
    };
  }

  public async findActiveById(id: string): Promise<DatabaseServiceView | undefined> {
    const record = await this.prisma.client.databaseService.findFirst({
      where: { id, archivedAt: null },
      select: NON_SECRET_DATABASE_SERVICE_SELECTION,
    });
    return record === null ? undefined : this.mapper.toView(record);
  }
}
