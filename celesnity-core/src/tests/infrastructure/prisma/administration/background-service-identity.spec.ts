import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@generated/prisma/client';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { decideAccess } from '@application/administration/access-policy';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { BackgroundIdentityBinding } from '@infrastructure/prisma/administration/background-identity.binding';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';

jest.mock('@generated/prisma/client', () => ({ PrismaClient: jest.fn() }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

function record(org = 'org-a') {
  return {
    organizationId: org,
    purpose: 'BACKGROUND',
    identityId: `service-${org}`,
    enabled: true,
    permissions: ['workspace:read', 'workspace:write'],
    features: ['AUTOMATIONS'],
    organization: { status: 'ACTIVE', identityTenantId: `tenant-${org}`, mfaRequired: true },
    identity: {
      status: 'ACTIVE',
      provider: 'organization-service',
      subject: `background:${org}`,
      memberships: [
        {
          id: `membership-${org}`,
          organizationId: org,
          role: 'SERVICE_ACCOUNT',
          status: 'ACTIVE',
          expiresAt: null as Date | null,
        },
      ],
    },
  };
}

function setup() {
  const contexts = new AuthenticatedContextStore();
  const row = record();
  const read = jest.fn().mockResolvedValue(row);
  jest.mocked(PrismaClient).mockImplementation(
    () =>
      ({
        organizationServiceIdentity: { findUnique: read },
        $extends: () => ({}),
      }) as unknown as PrismaClient,
  );
  const prisma = new PrismaService(
    new ConfigService({
      DATABASE_URL: 'postgresql://unused',
      DEFAULT_ORGANIZATION_ID: 'must-not-use-default',
    }),
    new PrismaTransactionContext(),
    contexts,
  );
  new BackgroundIdentityBinding(contexts, prisma);
  return { contexts, row, read, prisma };
}

describe('Persisted organization background identities', () => {
  it('requires persistence wiring and never creates a synthetic fallback', async () => {
    const work = jest.fn();
    await expect(
      new AuthenticatedContextStore().runBackground('org-a', work, 'AUTOMATIONS'),
    ).rejects.toThrow('resolver is required');
    expect(work).not.toHaveBeenCalled();
  });

  it('uses a persisted audit actor, exact organization and explicit grants without claiming human MFA', async () => {
    const { contexts, read } = setup();
    const result = await contexts.runBackground('org-a', () => contexts.require(), 'AUTOMATIONS');
    expect(result).toMatchObject({
      identityId: 'service-org-a',
      membershipId: 'membership-org-a',
      role: 'SERVICE_ACCOUNT',
      organizationId: 'org-a',
      mfaVerified: false,
      servicePermissions: ['workspace:read', 'workspace:write'],
      visibleFeatures: ['AUTOMATIONS'],
    });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId_purpose: { organizationId: 'org-a', purpose: 'BACKGROUND' } } }),
    );
    expect(contexts.current()).toBeUndefined();
    expect(decideAccess(result, { permission: 'organization:manage' }).allowed).toBe(false);
  });

  it.each([
    [
      'disabled binding',
      (r: ReturnType<typeof record>) => {
        r.enabled = false;
      },
    ],
    [
      'suspended organization',
      (r: ReturnType<typeof record>) => {
        r.organization.status = 'SUSPENDED';
      },
    ],
    [
      'revoked identity',
      (r: ReturnType<typeof record>) => {
        r.identity.status = 'DISABLED';
      },
    ],
    [
      'human provider',
      (r: ReturnType<typeof record>) => {
        r.identity.provider = 'google';
      },
    ],
    [
      'revoked membership',
      (r: ReturnType<typeof record>) => {
        r.identity.memberships[0]!.status = 'INACTIVE';
      },
    ],
    [
      'expired membership',
      (r: ReturnType<typeof record>) => {
        r.identity.memberships[0]!.expiresAt = new Date(0);
      },
    ],
    [
      'elevated role',
      (r: ReturnType<typeof record>) => {
        r.identity.memberships[0]!.role = 'ORG_OWNER';
      },
    ],
    [
      'foreign membership',
      (r: ReturnType<typeof record>) => {
        r.identity.memberships[0]!.organizationId = 'org-b';
      },
    ],
    [
      'foreign binding',
      (r: ReturnType<typeof record>) => {
        r.organizationId = 'org-b';
      },
    ],
    [
      'excess permission',
      (r: ReturnType<typeof record>) => {
        r.permissions.push('organization:manage');
      },
    ],
    [
      'unknown feature',
      (r: ReturnType<typeof record>) => {
        r.features.push('ROOT');
      },
    ],
  ])('denies %s before executing work', async (_name, mutate) => {
    const { contexts, row } = setup();
    mutate(row);
    const work = jest.fn();
    await expect(contexts.runBackground('org-a', work, 'AUTOMATIONS')).rejects.toThrow(
      'service identity',
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('rechecks revocation on the next job; no process-local authorization cache', async () => {
    const { contexts, row, read } = setup();
    await contexts.runBackground('org-a', () => 'ok', 'AUTOMATIONS');
    row.enabled = false;
    await expect(contexts.runBackground('org-a', () => 'unsafe', 'AUTOMATIONS')).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('fails closed on missing bindings and database failures', async () => {
    const { contexts, read } = setup();
    const work = jest.fn();
    read.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(contexts.runBackground('org-a', work, 'AUTOMATIONS')).rejects.toThrow();
    await expect(contexts.runBackground('org-a', work, 'AUTOMATIONS')).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
  });

  it('intersects the required job feature and permission with stored grants', async () => {
    const { contexts, row } = setup();
    await expect(contexts.runBackground('org-a', () => 'unsafe', 'DEVICES')).rejects.toThrow(
      'FEATURE_ACCESS_DENIED',
    );
    row.permissions = ['workspace:read'];
    await expect(contexts.runBackground('org-a', () => 'unsafe', 'AUTOMATIONS')).rejects.toThrow(
      'PERMISSION_DENIED',
    );
  });

  it('keeps concurrent organization contexts and audit actors distinct', async () => {
    const { contexts, read } = setup();
    read.mockImplementation(async ({ where }: { where: { organizationId_purpose: { organizationId: string } } }) =>
      record(where.organizationId_purpose.organizationId),
    );
    const results = await Promise.all(
      ['org-a', 'org-b'].map((org) =>
        contexts.runBackground(
          org,
          async () => {
            await Promise.resolve();
            return contexts.require().identityId;
          },
          'AUTOMATIONS',
        ),
      ),
    );
    expect(results).toEqual(['service-org-a', 'service-org-b']);
    expect(contexts.current()).toBeUndefined();
  });

  it('re-resolves service grants on delegated room calls rather than deriving human group privileges', async () => {
    const { prisma, row } = setup();
    jest.spyOn(prisma, 'findAgentRoomDelegationBinding').mockResolvedValue({
      organizationId: 'org-a',
      agentName: 'chat-assistant',
      mfaVerifiedUntil: null,
      organization: row.organization,
      boundBy: {
        id: 'service-org-a',
        subject: 'background:org-a',
        status: 'ACTIVE',
        identityTenantId: 'service:org-a',
        email: null,
        memberships: [{ id: 'membership-org-a', organizationId: 'org-a', role: 'SERVICE_ACCOUNT' }],
      },
    } as NonNullable<Awaited<ReturnType<PrismaService['findAgentRoomDelegationBinding']>>>);
    const repository = new PrismaAgentRoomDelegationRepository(prisma);
    expect(await repository.resolve('room', 'background:org-a')).toMatchObject({
      servicePermissions: row.permissions,
      agentName: 'chat-assistant',
    });
    row.enabled = false;
    await expect(repository.resolve('room', 'background:org-a')).rejects.toThrow();
  });
});
