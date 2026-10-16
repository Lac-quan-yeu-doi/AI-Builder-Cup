import { resolveVisibleWorkspaceFeatures } from '@infrastructure/prisma/administration/prisma-workspace-feature-access';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

function prismaWith(findMany: jest.Mock): PrismaService {
  return {
    client: { authorizationGroupMember: { findMany } },
  } as unknown as PrismaService;
}

describe('resolveVisibleWorkspaceFeatures', () => {
  it('preserves unrestricted access when no configured group applies', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await expect(
      resolveVisibleWorkspaceFeatures(prismaWith(findMany), 'org-a', 'identity-a', 'VIEWER'),
    ).resolves.toBeNull();
    expect(findMany).toHaveBeenCalledWith({
      where: {
        identityId: 'identity-a',
        group: { organizationId: 'org-a', featureVisibilityConfigured: true },
      },
      select: { group: { select: { visibleFeatures: true } } },
    });
  });

  it('returns the union from configured groups, including an explicitly empty policy', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { group: { visibleFeatures: ['HOME', 'DEVICES'] } },
        { group: { visibleFeatures: ['DEVICES', 'ANALYTICS', 'UNKNOWN'] } },
        { group: { visibleFeatures: [] } },
      ]);
    await expect(
      resolveVisibleWorkspaceFeatures(prismaWith(findMany), 'org-a', 'identity-a', 'VIEWER'),
    ).resolves.toEqual(['HOME', 'DEVICES', 'ANALYTICS']);
  });

  it.each(['ORG_OWNER', 'ORG_ADMIN', 'PLATFORM_ADMIN'])(
    '%s always remains unrestricted',
    async (role) => {
      const findMany = jest.fn();
      await expect(
        resolveVisibleWorkspaceFeatures(prismaWith(findMany), 'org-a', 'identity-a', role),
      ).resolves.toBeNull();
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});
