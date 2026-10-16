import {
  isWorkspaceFeature,
  unrestrictedWorkspaceFeatures,
  type WorkspaceFeature,
} from '@application/administration/workspace-feature';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

export async function resolveVisibleWorkspaceFeatures(
  prisma: PrismaService,
  organizationId: string,
  identityId: string,
  role: string,
): Promise<readonly WorkspaceFeature[] | null> {
  if (unrestrictedWorkspaceFeatures(role)) return null;

  const memberships = await prisma.client.authorizationGroupMember.findMany({
    where: {
      identityId,
      group: { organizationId, featureVisibilityConfigured: true },
    },
    select: { group: { select: { visibleFeatures: true } } },
  });
  if (memberships.length === 0) return null;

  return [
    ...new Set(
      memberships.flatMap(({ group }) => group.visibleFeatures).filter(isWorkspaceFeature),
    ),
  ];
}
