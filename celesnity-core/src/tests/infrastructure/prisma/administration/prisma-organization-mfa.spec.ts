import { PrismaAdministrationRepository } from '@infrastructure/prisma/administration/prisma-administration.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('Organization MFA policy persistence', () => {
  const organization = {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const repository = new PrismaAdministrationRepository({
    client: { organization },
  } as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());

  it('exposes only the active tenant organization policy', async () => {
    organization.findFirst.mockResolvedValue({ mfaRequired: false });
    await expect(repository.mfaPolicy('tenant-1')).resolves.toEqual({ mfaRequired: false });
    expect(organization.findFirst).toHaveBeenCalledWith({
      where: { identityTenantId: 'tenant-1', status: 'ACTIVE' },
      select: { mfaRequired: true },
    });
  });
  it('does not default unknown tenants to password-only access', async () => {
    organization.findFirst.mockResolvedValue(null);
    await expect(repository.mfaPolicy('missing')).rejects.toThrow();
  });
  it('resolves an active organization slug to its tenant before login', async () => {
    organization.findFirst.mockResolvedValue({
      identityTenantId: 'tenant-2',
      mfaRequired: false,
    });
    await expect(repository.loginContext('dat-test-org')).resolves.toEqual({
      identityTenantId: 'tenant-2',
      mfaRequired: false,
    });
    expect(organization.findFirst).toHaveBeenCalledWith({
      where: { slug: 'dat-test-org', status: 'ACTIVE' },
      select: { identityTenantId: true, mfaRequired: true },
    });
  });
  it('fails closed when an organization has no tenant binding', async () => {
    organization.findFirst.mockResolvedValue({ identityTenantId: null, mfaRequired: false });
    await expect(repository.loginContext('unbound-org')).rejects.toThrow();
  });
  it('binds enabling to the current organization and tenant', async () => {
    organization.updateMany.mockResolvedValue({ count: 1 });
    organization.findUniqueOrThrow.mockResolvedValue({ mfaRequired: true });
    await repository.enableMfa('org-1', 'tenant-1');
    expect(organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org-1', identityTenantId: 'tenant-1' },
      data: { mfaRequired: true },
    });
  });
  it('rejects a tenant mismatch', async () => {
    organization.updateMany.mockResolvedValue({ count: 0 });
    await expect(repository.enableMfa('org-1', 'foreign')).rejects.toThrow();
    expect(organization.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
