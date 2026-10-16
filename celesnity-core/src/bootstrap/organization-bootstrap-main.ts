import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@generated/prisma/client';
import { OrganizationLifecycleService } from '@infrastructure/prisma/administration/organization-lifecycle.service';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required bootstrap configuration: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

async function main(): Promise<void> {
  const input = {
    organizationId: required('BOOTSTRAP_ORGANIZATION_ID'),
    slug: required('BOOTSTRAP_ORGANIZATION_SLUG'),
    displayName: required('BOOTSTRAP_ORGANIZATION_NAME'),
    homeRegion: required('BOOTSTRAP_HOME_REGION'),
    identityTenantId: required('BOOTSTRAP_IDENTITY_TENANT_ID'),
    ownerSubject: optional('BOOTSTRAP_OWNER_SUBJECT'),
    ownerEmail: optional('BOOTSTRAP_OWNER_EMAIL'),
  };
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(input.organizationId) ||
    !/^[a-z][a-z0-9-]{1,62}$/u.test(input.slug) ||
    (input.ownerSubject === undefined) !== (input.ownerEmail === undefined) ||
    (input.ownerEmail !== undefined && !/^\S+@\S+\.\S+$/u.test(input.ownerEmail))
  ) {
    throw new Error('Invalid bootstrap organization or owner identifier');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
  });
  try {
    await new OrganizationLifecycleService(prisma).bootstrap(input);
    console.log('Organization bootstrap verified.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Driver errors can contain connection details. Never log the exception here.
  console.error('Organization bootstrap failed; rollout must remain closed.');
  process.exitCode = 1;
});
