import { PrismaAdministrationRepository } from '@infrastructure/prisma/administration/prisma-administration.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

const organizationId = '10000000-0000-4000-8000-000000000001';
const identityId = '20000000-0000-4000-8000-000000000001';
const membershipId = '30000000-0000-4000-8000-000000000001';

describe('PrismaAdministrationRepository account removal', () => {
  it('revokes access before returning the Firebase deletion target', async () => {
    const transaction = transactionFixture();
    transaction.organizationMembership.findFirst.mockResolvedValue(membership());
    transaction.organizationMembership.count.mockResolvedValue(1);
    const repository = new PrismaAdministrationRepository(prismaWith(transaction));

    await expect(repository.prepareAccountRemoval(organizationId, membershipId)).resolves.toEqual({
      identityId,
      identityTenantId: 'tenant-1',
      subject: 'firebase-user-1',
    });
    expect(transaction.organizationMembership.update).toHaveBeenCalledWith({
      where: { id: membershipId },
      data: { status: 'REVOKED' },
    });
    expect(transaction.userIdentity.update).toHaveBeenCalledWith({
      where: { id: identityId },
      data: { status: 'TERMINATED' },
    });
  });

  it('preserves the final active organization owner', async () => {
    const transaction = transactionFixture();
    transaction.organizationMembership.findFirst.mockResolvedValue(
      membership({ role: 'ORG_OWNER' }),
    );
    transaction.organizationMembership.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const repository = new PrismaAdministrationRepository(prismaWith(transaction));

    await expect(
      repository.prepareAccountRemoval(organizationId, membershipId),
    ).rejects.toMatchObject({
      response: { code: 'LAST_ORGANIZATION_OWNER' },
    });
    expect(transaction.userIdentity.update).not.toHaveBeenCalled();
  });

  it('removes organization access and anonymizes the retained identity tombstone', async () => {
    const transaction = transactionFixture();
    transaction.organizationMembership.findFirst.mockResolvedValue({ id: membershipId });
    const repository = new PrismaAdministrationRepository(prismaWith(transaction));

    await repository.completeAccountRemoval(organizationId, membershipId, identityId);

    expect(transaction.authorizationGroupMember.deleteMany).toHaveBeenCalledWith({
      where: { identityId, group: { organizationId } },
    });
    expect(transaction.catalogAccessGrant.deleteMany).toHaveBeenCalledWith({
      where: { organizationId, identityId },
    });
    expect(transaction.organizationMembership.delete).toHaveBeenCalledWith({
      where: { id: membershipId },
    });
    expect(transaction.userIdentity.update).toHaveBeenCalledWith({
      where: { id: identityId },
      data: {
        subject: `deleted:${identityId}`,
        email: null,
        displayName: null,
        emailVerified: false,
        status: 'TERMINATED',
      },
    });
  });
});

describe('PrismaAdministrationRepository catalog tenant boundary', () => {
  it('requires both the user and the selected organization agent to have grants', async () => {
    const catalogAccessGrant = {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'user-allow', effect: 'ALLOW', permissions: ['SELECT'], agentName: null },
        ]),
    };
    const repository = new PrismaAdministrationRepository({
      client: {
        authorizationGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
        catalogAccessGrant,
      },
    } as unknown as PrismaService);
    const hierarchy = [{ type: 'CATALOG' as const, id: 'iceberg' }];
    await expect(
      repository.authorizeCatalog(
        organizationId,
        identityId,
        'SELECT',
        hierarchy,
        'chat-assistant',
      ),
    ).resolves.toEqual({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' });
    catalogAccessGrant.findMany.mockResolvedValueOnce([
      { id: 'agent-allow', effect: 'ALLOW', permissions: ['SELECT'], agentName: 'chat-assistant' },
    ]);
    await expect(
      repository.authorizeCatalog(
        organizationId,
        identityId,
        'SELECT',
        hierarchy,
        'chat-assistant',
      ),
    ).resolves.toEqual({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' });
    catalogAccessGrant.findMany.mockResolvedValueOnce([
      { id: 'user-allow', effect: 'ALLOW', permissions: ['SELECT'], agentName: null },
      { id: 'agent-allow', effect: 'ALLOW', permissions: ['SELECT'], agentName: 'chat-assistant' },
    ]);
    await expect(
      repository.authorizeCatalog(
        organizationId,
        identityId,
        'SELECT',
        hierarchy,
        'chat-assistant',
      ),
    ).resolves.toEqual({
      allowed: true,
      matchedGrantIds: ['user-allow', 'agent-allow'],
      reason: 'EXPLICIT_ALLOW',
    });
    expect(catalogAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ agentName: 'chat-assistant' }]),
        }),
      }),
    );
  });

  it('lets an explicit agent deny override both positive grants', async () => {
    const repository = new PrismaAdministrationRepository({
      client: {
        authorizationGroupMember: { findMany: jest.fn().mockResolvedValue([]) },
        catalogAccessGrant: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'user-allow', effect: 'ALLOW', permissions: ['SELECT'], agentName: null },
            {
              id: 'agent-deny',
              effect: 'DENY',
              permissions: ['SELECT'],
              agentName: 'chat-assistant',
            },
          ]),
        },
      },
    } as unknown as PrismaService);
    await expect(
      repository.authorizeCatalog(
        organizationId,
        identityId,
        'SELECT',
        [{ type: 'CATALOG', id: 'iceberg' }],
        'chat-assistant',
      ),
    ).resolves.toEqual({
      allowed: false,
      matchedGrantIds: ['agent-deny'],
      reason: 'EXPLICIT_DENY',
    });
  });

  it('combines direct and inherited group grants with explicit deny winning', async () => {
    const catalogAccessGrant = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'parent-allow', effect: 'ALLOW', permissions: ['SELECT'] },
        { id: 'table-deny', effect: 'DENY', permissions: ['SELECT'] },
      ]),
    };
    const repository = new PrismaAdministrationRepository({
      client: {
        catalogNamespaceDescription: { findFirst: jest.fn().mockResolvedValue({ id: 'owned' }) },
        authorizationGroupMember: {
          findMany: jest.fn().mockResolvedValue([{ groupId: 'group-a' }]),
        },
        catalogAccessGrant,
      },
    } as unknown as PrismaService);
    await expect(
      repository.authorizeCatalog(organizationId, identityId, 'SELECT', [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: 'iceberg.owned' },
        { type: 'TABLE', id: 'iceberg.owned.employees' },
      ]),
    ).resolves.toEqual({
      allowed: false,
      matchedGrantIds: ['table-deny'],
      reason: 'EXPLICIT_DENY',
    });
    expect(catalogAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          OR: [{ identityId }, { groupId: { in: ['group-a'] } }],
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { resourceType: 'SCHEMA', resourceId: 'iceberg.owned', includeDescendants: true },
                { resourceType: 'TABLE', resourceId: 'iceberg.owned.employees' },
              ]),
            }),
          ]),
        }),
      }),
    );
  });
  it('fails closed for a malformed schema resource identifier', async () => {
    const catalogNamespaceDescription = { findFirst: jest.fn() };
    const repository = new PrismaAdministrationRepository({
      client: { catalogNamespaceDescription },
    } as unknown as PrismaService);

    await expect(
      repository.authorizeCatalog(organizationId, identityId, 'DISCOVER', [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: 'malformed' },
      ]),
    ).resolves.toEqual({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' });
    expect(catalogNamespaceDescription.findFirst).not.toHaveBeenCalled();
  });

  it('denies a schema owned by a different organization before evaluating grants', async () => {
    const catalogNamespaceDescription = { findFirst: jest.fn().mockResolvedValue(null) };
    const authorizationGroupMember = { findMany: jest.fn() };
    const catalogAccessGrant = { findMany: jest.fn() };
    const repository = new PrismaAdministrationRepository({
      client: { catalogNamespaceDescription, authorizationGroupMember, catalogAccessGrant },
    } as unknown as PrismaService);

    await expect(
      repository.authorizeCatalog(organizationId, identityId, 'DISCOVER', [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: 'iceberg.foreign_database' },
      ]),
    ).resolves.toEqual({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' });
    expect(catalogNamespaceDescription.findFirst).toHaveBeenCalledWith({
      where: { organizationId, catalog: 'iceberg', namespace: 'foreign_database' },
      select: { id: true },
    });
    expect(authorizationGroupMember.findMany).not.toHaveBeenCalled();
    expect(catalogAccessGrant.findMany).not.toHaveBeenCalled();
  });

  it('evaluates grants only after confirming namespace ownership', async () => {
    const catalogNamespaceDescription = {
      findFirst: jest.fn().mockResolvedValue({ id: 'namespace-owner-1' }),
    };
    const authorizationGroupMember = { findMany: jest.fn().mockResolvedValue([]) };
    const catalogAccessGrant = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'allow-1', effect: 'ALLOW', permissions: ['DISCOVER'] }]),
    };
    const repository = new PrismaAdministrationRepository({
      client: { catalogNamespaceDescription, authorizationGroupMember, catalogAccessGrant },
    } as unknown as PrismaService);

    await expect(
      repository.authorizeCatalog(organizationId, identityId, 'DISCOVER', [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: 'iceberg.owned_database' },
      ]),
    ).resolves.toEqual({
      allowed: true,
      matchedGrantIds: ['allow-1'],
      reason: 'EXPLICIT_ALLOW',
    });
  });
});

describe('PrismaAdministrationRepository group feature policy', () => {
  it('updates only a group in the authenticated organization and supports an empty policy', async () => {
    const authorizationGroup = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'group-1',
        featureVisibilityConfigured: true,
        visibleFeatures: [],
        members: [],
      }),
    };
    const repository = new PrismaAdministrationRepository({
      client: { authorizationGroup },
    } as unknown as PrismaService);

    await expect(repository.updateGroupFeatures(organizationId, 'group-1', [])).resolves.toEqual(
      expect.objectContaining({ featureVisibilityConfigured: true, visibleFeatures: [] }),
    );
    expect(authorizationGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', organizationId },
      data: { featureVisibilityConfigured: true, visibleFeatures: [] },
    });
  });

  it('does not read back a group when the tenant-scoped update matches nothing', async () => {
    const authorizationGroup = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn(),
    };
    const repository = new PrismaAdministrationRepository({
      client: { authorizationGroup },
    } as unknown as PrismaService);

    await expect(
      repository.updateGroupFeatures(organizationId, 'foreign-group', ['HOME']),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } });
    expect(authorizationGroup.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

function membership(overrides: { readonly role?: string } = {}) {
  return {
    id: membershipId,
    identityId,
    role: overrides.role ?? 'VIEWER',
    status: 'ACTIVE',
    identity: {
      id: identityId,
      provider: 'identity-platform',
      subject: 'firebase-user-1',
      identityTenantId: 'tenant-1',
    },
    organization: { identityTenantId: 'tenant-1' },
  };
}

function transactionFixture() {
  return {
    $queryRaw: jest.fn(async () => []),
    organizationMembership: {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    },
    userIdentity: { update: jest.fn(async () => undefined) },
    authorizationGroupMember: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    catalogAccessGrant: { deleteMany: jest.fn(async () => ({ count: 0 })) },
  };
}

function prismaWith(transaction: ReturnType<typeof transactionFixture>): PrismaService {
  return {
    transaction: (work: (value: typeof transaction) => Promise<unknown>) => work(transaction),
  } as unknown as PrismaService;
}

describe('service identity catalog grants', () => {
  it('lists grantable identity IDs within the current organization', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaAdministrationRepository({
      client: {
        organizationServiceIdentity: { findMany },
      },
    } as unknown as PrismaService);
    await repository.listServiceIdentities(organizationId);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId },
        select: expect.objectContaining({ identityId: true, purpose: true, enabled: true }),
      }),
    );
  });
  it('accepts an active service member and refuses an identity outside the organization', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: membershipId });
    const create = jest.fn().mockResolvedValue({ id: 'grant' });
    const repository = new PrismaAdministrationRepository({
      client: {
        organizationMembership: { findFirst },
        catalogAccessGrant: { create },
      },
    } as unknown as PrismaService);
    const input = {
      identityId,
      resourceType: 'TABLE' as const,
      resourceId: 'iceberg.bronze.events',
      permissions: ['DESCRIBE' as const],
      effect: 'ALLOW' as const,
      includeDescendants: false,
      grantOption: false,
    };
    await repository.createCatalogGrant(organizationId, identityId, input);
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId, identityId, status: 'ACTIVE' },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId, identityId, permissions: ['DESCRIBE'] }),
    });
    findFirst.mockResolvedValue(null);
    await expect(
      repository.createCatalogGrant(organizationId, identityId, input),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
