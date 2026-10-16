import type { PrismaClient } from '@generated/prisma/client';
import { OrganizationLifecycleService } from '@infrastructure/prisma/administration/organization-lifecycle.service';

const input = {
  organizationId: '1d24c20b-340e-4ef4-8ca4-890863092c27',
  slug: 'celesnity',
  displayName: 'Celesnity',
  homeRegion: 'europe-west2',
  identityTenantId: 'existing-tenant',
  ownerSubject: 'existing-owner-subject',
  ownerEmail: 'owner@example.com',
};

function setup() {
  const organization = {
    id: input.organizationId,
    slug: input.slug,
    displayName: input.displayName,
    homeRegion: input.homeRegion,
    identityTenantId: input.identityTenantId,
    status: 'ACTIVE',
  };
  const owner = {
    id: 'owner-identity-id',
    email: input.ownerEmail,
    status: 'ACTIVE',
  };
  const membership = {
    identityId: owner.id,
    organizationId: input.organizationId,
    role: 'ORG_OWNER',
    status: 'ACTIVE',
  };
  const transaction = {
    organization: {
      findUnique: jest.fn().mockResolvedValue(organization),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organizationServiceIdentity: {
      findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
      create: jest.fn(),
    },
    userIdentity: { findUnique: jest.fn().mockResolvedValue(owner), create: jest.fn() },
    organizationMembership: {
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn().mockResolvedValue({ id: 'owner-membership-id' }),
      findUnique: jest.fn().mockResolvedValue(membership),
      create: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof transaction) => Promise<void>) =>
      callback(transaction),
    ),
  } as unknown as PrismaClient;
  return { service: new OrganizationLifecycleService(prisma), transaction };
}

describe('OrganizationLifecycleService existing-organization bootstrap', () => {
  it('verifies an approved active owner even when other owners and a legacy placeholder exist', async () => {
    const { service, transaction } = setup();

    await service.bootstrap(input);

    expect(transaction.organization.findFirst).not.toHaveBeenCalled();
    expect(transaction.organization.create).not.toHaveBeenCalled();
    expect(transaction.userIdentity.create).not.toHaveBeenCalled();
    expect(transaction.organizationMembership.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('does not enroll a new owner when the organization already has one', async () => {
    const { service, transaction } = setup();
    transaction.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(service.bootstrap(input)).rejects.toThrow(
      'Approved bootstrap owner does not match an active owner',
    );
    expect(transaction.organizationMembership.create).not.toHaveBeenCalled();
  });

  it('does not create an identity for an unrecognized approved subject when owners exist', async () => {
    const { service, transaction } = setup();
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    transaction.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(service.bootstrap(input)).rejects.toThrow(
      'Approved bootstrap owner does not match an active owner',
    );
    expect(transaction.userIdentity.create).not.toHaveBeenCalled();
  });

  it('rejects a tenant that differs from the enrolled organization', async () => {
    const { service, transaction } = setup();

    await expect(
      service.bootstrap({ ...input, identityTenantId: 'another-tenant' }),
    ).rejects.toThrow('Bootstrap organization conflicts with the approved configuration');
    expect(transaction.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('still blocks creating a second organization while an unowned placeholder exists', async () => {
    const { service, transaction } = setup();
    transaction.organization.findUnique.mockResolvedValue(null);
    transaction.organization.findFirst.mockResolvedValue({ id: 'placeholder-id' });

    await expect(service.bootstrap(input)).rejects.toThrow(
      'The existing bootstrap organization must receive its first owner',
    );
    expect(transaction.organization.create).not.toHaveBeenCalled();
  });
});

describe('OrganizationLifecycleService service identity provisioning', () => {
  it('does not reactivate an existing disabled Agent identity during bootstrap', async () => {
    const { service, transaction } = setup();
    transaction.organizationServiceIdentity.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.organizationId_purpose.purpose === 'AGENT'
          ? { purpose: 'AGENT', enabled: false }
          : { purpose: 'BACKGROUND', enabled: true },
      ),
    );

    await service.bootstrap(input);

    expect(transaction.organizationServiceIdentity.create).not.toHaveBeenCalled();
  });

  it('enables a newly provisioned Agent', async () => {
    const { service, transaction } = setup();
    transaction.organizationServiceIdentity.findUnique.mockResolvedValue(null);

    await service.bootstrap(input);

    expect(transaction.organizationServiceIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: 'AGENT', enabled: true }),
    });
    expect(transaction.organizationServiceIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: 'BACKGROUND', enabled: true }),
    });
  });
});

const ownerlessInput = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  slug: 'celesnity-bootstrap',
  displayName: 'Celesnity Bootstrap',
  homeRegion: 'europe-west1',
  identityTenantId: 'existing-tenant',
};

function existingOrganization(activeOwners: number) {
  const transaction = {
    organization: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        id: ownerlessInput.organizationId,
        slug: ownerlessInput.slug,
        displayName: ownerlessInput.displayName,
        homeRegion: ownerlessInput.homeRegion,
        identityTenantId: ownerlessInput.identityTenantId,
        status: 'ACTIVE',
      }),
    },
    organizationServiceIdentity: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }) },
    organizationMembership: {
      count: jest.fn().mockResolvedValue(activeOwners),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    userIdentity: { findUnique: jest.fn(), create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof transaction) => Promise<void>) =>
      callback(transaction),
    ),
  } as unknown as PrismaClient;
  return { transaction, service: new OrganizationLifecycleService(prisma) };
}

describe('OrganizationLifecycleService existing-owner bootstrap', () => {
  it('preserves multiple active owners without choosing a first owner', async () => {
    const { transaction, service } = existingOrganization(11);
    await expect(service.bootstrap(ownerlessInput)).resolves.toBeUndefined();
    expect(transaction.userIdentity.findUnique).not.toHaveBeenCalled();
    expect(transaction.userIdentity.create).not.toHaveBeenCalled();
    expect(transaction.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('requires an approved owner pair when no active owner exists', async () => {
    const { transaction, service } = existingOrganization(0);
    await expect(service.bootstrap(ownerlessInput)).rejects.toThrow(
      'First-owner identifiers are required',
    );
    expect(transaction.userIdentity.create).not.toHaveBeenCalled();
  });

  it('creates the first owner only for an unowned organization with both approved identifiers', async () => {
    const { transaction, service } = existingOrganization(0);
    transaction.userIdentity.findUnique.mockResolvedValue(null);
    await expect(
      service.bootstrap({
        ...ownerlessInput,
        ownerSubject: 'approved-uid',
        ownerEmail: 'owner@example.test',
      }),
    ).resolves.toBeUndefined();
    expect(transaction.userIdentity.create).toHaveBeenCalledTimes(1);
    expect(transaction.organizationMembership.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a nominated owner that is not an active owner', async () => {
    const { transaction, service } = existingOrganization(11);
    await expect(
      service.bootstrap({
        ...ownerlessInput,
        ownerSubject: 'different',
        ownerEmail: 'other@example.test',
      }),
    ).rejects.toThrow('Approved bootstrap owner does not match');
    expect(transaction.organizationMembership.findFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched tenant rather than adopting another organization', async () => {
    const { transaction, service } = existingOrganization(11);
    await expect(
      service.bootstrap({ ...ownerlessInput, identityTenantId: 'other-tenant' }),
    ).rejects.toThrow('Bootstrap organization conflicts');
    expect(transaction.organizationMembership.count).not.toHaveBeenCalled();
  });
});
