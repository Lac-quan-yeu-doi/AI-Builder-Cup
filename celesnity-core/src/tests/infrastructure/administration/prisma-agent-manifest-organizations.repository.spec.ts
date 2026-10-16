import { PrismaAgentManifestOrganizationsRepository } from '@infrastructure/prisma/administration/prisma-agent-manifest-organizations.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('Agent manifest organization inventory persistence', () => {
  it('selects every active tenant-bound organization, not the bootstrap organization', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'organization-a', identityTenantId: 'tenant-a' },
      { id: 'organization-b', identityTenantId: 'tenant-b' },
    ]);
    const prisma = { client: { organization: { findMany } } } as unknown as PrismaService;
    const repository = new PrismaAgentManifestOrganizationsRepository(prisma);
    await expect(repository.listActive()).resolves.toEqual([
      { organizationId: 'organization-a', identityTenantId: 'tenant-a' },
      { organizationId: 'organization-b', identityTenantId: 'tenant-b' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', identityTenantId: { not: null } },
      select: { id: true, identityTenantId: true }, orderBy: { id: 'asc' },
    });
  });
});
