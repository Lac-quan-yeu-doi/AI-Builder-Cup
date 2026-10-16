import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@generated/prisma/client';

class AuthorizationReadinessError extends Error {
  public constructor(
    public readonly reason: string,
    public readonly organizationSlug?: string,
  ) {
    super(reason);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (process.env.AUTHORIZATION_READINESS_PHASE === 'pre-migration') {
      const tables = await prisma.$queryRaw<{ organizations: string | null }[]>`
        SELECT to_regclass('celesnity_app.organizations')::text AS organizations
      `;
      // A new database has no tenant to validate until migration/bootstrap.
      // Existing tenants must satisfy readiness before destructive migrations.
      if (tables[0]?.organizations === null) {
        console.log('Fresh database: authorization will be checked after bootstrap.');
        return;
      }
    }
    const organizations = await prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        slug: true,
        serviceIdentities: {
          include: {
            identity: {
              select: {
                provider: true,
                status: true,
                memberships: {
                  select: { organizationId: true, role: true, status: true, expiresAt: true },
                },
              },
            },
          },
        },
        memberships: { where: { role: 'ORG_OWNER', status: 'ACTIVE' }, select: { id: true } },
      },
    });
    if (organizations.length === 0) throw new AuthorizationReadinessError('NO_ACTIVE_ORGANIZATION');
    for (const organization of organizations) {
      if (organization.memberships.length === 0)
        throw new AuthorizationReadinessError('NO_ACTIVE_OWNER', organization.slug);
      for (const purpose of ['BACKGROUND', 'AGENT'] as const) {
        const binding = organization.serviceIdentities.find((item) => item.purpose === purpose);
        const membership = binding?.identity.memberships.find(
          (item) =>
            item.organizationId === organization.id &&
            item.role === 'SERVICE_ACCOUNT' &&
            item.status === 'ACTIVE' &&
            (item.expiresAt === null || item.expiresAt > new Date()),
        );
        if (
          !binding ||
          !membership ||
          binding.identity.provider !== 'organization-service' ||
          binding.identity.status !== 'ACTIVE' ||
          (purpose === 'BACKGROUND' &&
            (!binding.enabled ||
              !['workspace:read', 'workspace:write'].every((value) =>
                binding.permissions.includes(value),
              ) ||
              !['EXECUTIONS', 'CRAWLER', 'AUTOMATIONS', 'DEVICES'].every((value) =>
                binding.features.includes(value),
              )))
        ) {
          throw new AuthorizationReadinessError(`UNUSABLE_${purpose}_IDENTITY`, organization.slug);
        }
      }
    }
    console.log(
      `Authorization prerequisites verified for ${organizations.length} active organization(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Only validation reason codes and slugs are safe to print. Driver errors may
  // contain the database connection string and must remain redacted.
  if (error instanceof AuthorizationReadinessError) {
    console.error(
      `Authorization readiness failed: ${error.reason}${error.organizationSlug ? ` (${error.organizationSlug})` : ''}; rollout must remain closed.`,
    );
  } else {
    console.error('Authorization readiness failed; rollout must remain closed.');
  }
  process.exitCode = 1;
});
