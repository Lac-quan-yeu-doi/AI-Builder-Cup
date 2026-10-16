import { FirebaseIdentityAdministrationService } from '@infrastructure/identity/firebase-identity-administration.service';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

describe('FirebaseIdentityAdministrationService.enableMfa', () => {
  it('enables TOTP for the organization tenant supplied by the authenticated context', async () => {
    const service = Object.create(
      FirebaseIdentityAdministrationService.prototype,
    ) as FirebaseIdentityAdministrationService;
    const updateTenant = jest.fn().mockResolvedValue({});
    Reflect.set(service, 'tenants', { updateTenant });
    await service.enableMfa('tenant-1');
    expect(updateTenant).toHaveBeenCalledWith('tenant-1', {
      multiFactorConfig: {
        state: 'ENABLED',
        providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }],
      },
    });
  });
});

describe('FirebaseIdentityAdministrationService.deleteUser', () => {
  it('treats an already absent tenant user as a successful retry', async () => {
    const service = Object.create(
      FirebaseIdentityAdministrationService.prototype,
    ) as FirebaseIdentityAdministrationService;
    Reflect.set(service, 'tenants', {
      authForTenant: () => ({
        deleteUser: jest.fn(async () => {
          throw Object.assign(new Error('User not found'), { code: 'auth/user-not-found' });
        }),
      }),
    });

    await expect(service.deleteUser('tenant-id', 'missing-user')).resolves.toBeUndefined();
  });

  it('does not hide other Identity Platform failures', async () => {
    const service = Object.create(
      FirebaseIdentityAdministrationService.prototype,
    ) as FirebaseIdentityAdministrationService;
    Reflect.set(service, 'tenants', {
      authForTenant: () => ({
        deleteUser: jest.fn(async () => {
          throw Object.assign(new Error('Identity Platform failed'), {
            code: 'auth/internal-error',
          });
        }),
      }),
    });

    await expect(service.deleteUser('tenant-id', 'user-1')).rejects.toMatchObject({
      code: 'auth/internal-error',
    });
  });
});
