import {
  isOrganizationScopedModel,
  scopePrismaArguments,
} from '@infrastructure/prisma/prisma.service';

describe('organization persistence boundary', () => {
  const organizationId = '20000000-0000-4000-8000-000000000001';

  it('overrides a browser-supplied organization on reads and writes', () => {
    expect(
      scopePrismaArguments(
        'findMany',
        { where: { organizationId: 'attacker', status: 'ACTIVE' } },
        organizationId,
      ),
    ).toEqual({
      where: { organizationId, status: 'ACTIVE' },
    });
    expect(
      scopePrismaArguments(
        'create',
        { data: { organizationId: 'attacker', name: 'asset' } },
        organizationId,
      ),
    ).toEqual({
      data: { organizationId, name: 'asset' },
    });
  });

  it('scopes both lookup and creation sides of an upsert', () => {
    expect(
      scopePrismaArguments(
        'upsert',
        { where: { id: 'asset' }, create: { name: 'asset' }, update: { name: 'new' } },
        organizationId,
      ),
    ).toEqual({
      where: { id: 'asset', organizationId },
      create: { name: 'asset', organizationId },
      update: { name: 'new' },
    });
  });

  it.each([
    'Device',
    'MeasurementPoint',
    'DeviceLifecycleTransition',
    'DeviceProvisioningAttempt',
    'DeviceAlert',
    'DeviceLog',
    'DeviceConfigurationTemplate',
    'FirmwareRelease',
    'FirmwareDeployment',
    'FirmwareCampaign',
    'FirmwareCampaignTarget',
  ])('treats %s as organization scoped', (model) => {
    expect(isOrganizationScopedModel(model)).toBe(true);
  });
});
