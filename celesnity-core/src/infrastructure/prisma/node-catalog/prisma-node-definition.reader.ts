import { Injectable } from '@nestjs/common';

import type {
  INodeDefinitionReader,
  NodeDefinitionCountQuery,
  NodeDefinitionReadQuery,
} from '@application/node-catalog/interfaces/i-node-definition-reader';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import {
  NODE_DEFINITION_SELECTION,
  NodeDefinitionMapper,
} from '@infrastructure/prisma/node-catalog/node-definition.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { Prisma } from '@generated/prisma/client';

@Injectable()
export class PrismaNodeDefinitionReader implements INodeDefinitionReader {
  private readonly mapper = new NodeDefinitionMapper();

  public constructor(private readonly prisma: PrismaService) {}

  public async list(query: NodeDefinitionReadQuery): Promise<readonly NodeDefinition[]> {
    const records = await this.prisma.client.nodeDefinition.findMany({
      where: this.where(query),
      orderBy: { [query.sortBy]: query.sortDirection.toLowerCase() },
      skip: query.skip,
      take: query.take,
      select: NODE_DEFINITION_SELECTION,
    });
    return records.map((record) => this.mapper.toDomain(record));
  }

  public count(query: NodeDefinitionCountQuery): Promise<number> {
    return this.prisma.client.nodeDefinition.count({ where: this.where(query) });
  }

  public async findByType(type: string): Promise<NodeDefinition | undefined> {
    const record = await this.prisma.client.nodeDefinition.findUnique({
      where: { type },
      select: NODE_DEFINITION_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  private where(query: NodeDefinitionCountQuery): Prisma.NodeDefinitionWhereInput {
    const keyword = query.keyword;
    return {
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(keyword === undefined
        ? {}
        : {
            OR: [
              { type: { contains: keyword, mode: 'insensitive' } },
              { label: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
            ],
          }),
    };
  }
}
