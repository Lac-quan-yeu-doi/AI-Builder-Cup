import { ConfigService } from '@nestjs/config';

import type { VerifiedIdentityToken } from '@application/administration/identity-token.verifier';
import { PrismaIdentityAccessRepository } from '@infrastructure/prisma/administration/prisma-identity-access.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

const token: VerifiedIdentityToken = {
  subject: 'customer-owner-subject',
  tenantId: 'customer-tenant',
  email: 'owner@example.com',
  emailVerified: true,
  authenticationTime: 1_700_000_000,
  mfaVerified: true,
};

function identity() {
  return {
    id: 'identity-id',
    status: 'ACTIVE',
  };
}

function repository(client: object): PrismaIdentityAccessRepository {
  return new PrismaIdentityAccessRepository(
    { client } as unknown as PrismaService,
    new ConfigService({
      CELESNITY_AUTH_MODE: 'identity-platform',
      DEFAULT_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
    }),
  );
}

describe('PrismaIdentityAccessRepository', () => {
  it('denies a valid identity when Control Plane has not provisioned its tenant organization', async () => {
    const client = {
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue(identity()),
        update: jest.fn().mockResolvedValue(identity()),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      organizationMembership: {},
    };

    await expect(repository(client).resolve(token)).resolves.toBeUndefined();
    expect(client.organization.findUnique).toHaveBeenCalledWith({
      where: { identityTenantId: token.tenantId },
    });
    expect(client.userIdentity.findFirst).not.toHaveBeenCalled();
    expect(client.userIdentity.update).not.toHaveBeenCalled();
  });

  it('denies an identity not pre-provisioned by onboarding or invitation', async () => {
    const client = {
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'organization-id', status: 'ACTIVE' }),
      },
      organizationMembership: {},
    };

    await expect(repository(client).resolve(token)).resolves.toBeUndefined();
    expect(client.userIdentity.update).not.toHaveBeenCalled();
  });

  it('denies a valid identity when the provisioned organization has no active membership', async () => {
    const client = {
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue(identity()),
        update: jest.fn().mockResolvedValue(identity()),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'organization-id', status: 'ACTIVE' }),
      },
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(repository(client).resolve(token)).resolves.toBeUndefined();
    expect(client.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: {
        identityId: 'identity-id',
        organizationId: 'organization-id',
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
    });
  });

  it('authorizes only an existing active tenant membership', async () => {
    const client = {
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue(identity()),
        update: jest.fn().mockResolvedValue(identity()),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'organization-id',
          status: 'ACTIVE',
          mfaRequired: true,
        }),
      },
      authorizationGroupMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organizationMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'membership-id',
          organizationId: 'organization-id',
          role: 'ORG_MEMBER',
        }),
      },
    };

    await expect(repository(client).resolve(token)).resolves.toMatchObject({
      identityId: 'identity-id',
      organizationId: 'organization-id',
      membershipId: 'membership-id',
      role: 'ORG_MEMBER',
      subject: token.subject,
    });
  });
});
