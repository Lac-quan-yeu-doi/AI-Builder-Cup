import { DEFAULT_DATABASE_DISCOVERY_CONFIG } from '@application/metadata-crawler/metadata-crawler.use-cases';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { PrismaMetadataCrawlerRepository } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';
const DATABASE_SERVICE_ID = '33333333-3333-4333-8333-333333333333';

function crawler(): MetadataCrawler {
  return MetadataCrawler.create({
    id: CRAWLER_ID,
    databaseServiceId: DATABASE_SERVICE_ID,
    name: 'Production crawler',
    scheduleCron: '0 1 * * *',
    scheduleTimezone: 'Europe/London',
    nextRunAt: new Date('2026-09-03T00:00:00.000Z'),
    discoveryConfig: DEFAULT_DATABASE_DISCOVERY_CONFIG,
    now: new Date('2026-09-02T16:00:00.000Z'),
  });
}

describe('PrismaMetadataCrawlerRepository', () => {
  it('writes the authenticated organization into the nested database assignment', async () => {
    const create = jest.fn(async () => ({}));
    const repository = new PrismaMetadataCrawlerRepository(
      {
        organizationId: ORGANIZATION_ID,
        client: { metadataCrawler: { create } },
      } as unknown as PrismaService,
      new MetadataCrawlerMapper(),
    );

    await repository.create(crawler());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          databaseMetadataCrawler: {
            create: {
              databaseService: { connect: { id: DATABASE_SERVICE_ID } },
              organization: { connect: { id: ORGANIZATION_ID } },
            },
          },
        }),
      }),
    );
  });

  it('fails closed when a crawler assignment is created without an organization context', async () => {
    const create = jest.fn();
    const repository = new PrismaMetadataCrawlerRepository(
      {
        organizationId: undefined,
        client: { metadataCrawler: { create } },
      } as unknown as PrismaService,
      new MetadataCrawlerMapper(),
    );

    await expect(repository.create(crawler())).rejects.toThrow(
      'Metadata crawler assignment requires an authenticated organization.',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
