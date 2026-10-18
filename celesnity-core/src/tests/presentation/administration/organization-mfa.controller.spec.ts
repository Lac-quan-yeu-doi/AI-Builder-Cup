import { Reflector } from '@nestjs/core';
import type { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { AdministrationController } from '@presentation/administration/administration.controller';
import { IS_PUBLIC } from '@presentation/http/public.decorator';

describe('Organization MFA controller boundary', () => {
  it('keeps only the login policy endpoints public', async () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC, AdministrationController.prototype.mfaPolicy)).toBe(true);
    expect(reflector.get(IS_PUBLIC, AdministrationController.prototype.loginContext)).toBe(true);
    const useCases = {
      mfaPolicy: jest.fn().mockResolvedValue({ mfaRequired: false }),
      loginContext: jest.fn().mockResolvedValue({
        identityTenantId: 'tenant-1',
        mfaRequired: false,
      }),
    } as unknown as AdministrationUseCases;
    const controller = new AdministrationController(useCases);
    await expect(controller.mfaPolicy('tenant-1')).resolves.toEqual({ mfaRequired: false });
    expect(useCases.mfaPolicy).toHaveBeenCalledWith('tenant-1');
    await expect(controller.loginContext({ organizationSlug: 'dat-test-org' })).resolves.toEqual({
      identityTenantId: 'tenant-1',
      mfaRequired: false,
    });
    expect(useCases.loginContext).toHaveBeenCalledWith('dat-test-org');
  });
});
