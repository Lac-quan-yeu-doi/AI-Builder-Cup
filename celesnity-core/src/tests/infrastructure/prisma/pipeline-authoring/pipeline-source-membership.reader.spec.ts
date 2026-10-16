import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaPipelineSourceMembershipReader } from '@infrastructure/prisma/pipeline-authoring/prisma-pipeline-source-membership.reader';

describe('PrismaPipelineSourceMembershipReader', () => {
  it('locks source memberships in stable id order and reports missing rows', async () => {
    const requestedIds: string[] = [];
    const queryRaw = jest.fn().mockImplementation((_strings: TemplateStringsArray, ...values: unknown[]) => {
      const id = values[2];
      if (typeof id === 'string') requestedIds.push(id);
      return Promise.resolve(id === '11111111-1111-4111-8111-111111111111' ? [{ database_service_id: id }] : []);
    });
    const prisma = {
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      client: { $queryRaw: queryRaw },
    } as unknown as PrismaService;
    const reader = new PrismaPipelineSourceMembershipReader(prisma);

    await expect(
      reader.lockAndListMissing('kasadata', [
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
      ]),
    ).resolves.toEqual(['22222222-2222-4222-8222-222222222222']);
    expect(requestedIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('does not open a query for an empty source set', async () => {
    const queryRaw = jest.fn();
    const prisma = {
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      client: { $queryRaw: queryRaw },
    } as unknown as PrismaService;
    const reader = new PrismaPipelineSourceMembershipReader(prisma);

    await expect(reader.lockAndListMissing('kasadata', [])).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
