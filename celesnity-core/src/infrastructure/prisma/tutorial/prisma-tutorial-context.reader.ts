import { Injectable } from '@nestjs/common';

import type {
  TutorialContextReader,
  TutorialContextResource,
} from '@application/tutorial/tutorial-context.reader';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const DATABASE_SERVICE = 'DATABASE_SERVICE';

@Injectable()
export class PrismaTutorialContextReader implements TutorialContextReader {
  public constructor(private readonly prisma: PrismaService) {}

  public async listAuthorized(resourceType: string): Promise<readonly TutorialContextResource[]> {
    if (resourceType !== DATABASE_SERVICE) return [];
    const rows = await this.prisma.client.databaseService.findMany({
      where: { archivedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, resourceType: DATABASE_SERVICE }));
  }
}
