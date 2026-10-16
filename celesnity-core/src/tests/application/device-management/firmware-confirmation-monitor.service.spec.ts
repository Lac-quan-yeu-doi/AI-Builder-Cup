import { backgroundContexts } from '../administration/background-principal.fixture';
import { FirmwareConfirmationMonitorService } from '@application/device-management/firmware-confirmation-monitor.service';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { FirmwareDeploymentRecord } from '@domain/device-management/models/firmware';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('FirmwareConfirmationMonitorService', () => {
  it('marks rebooting firmware rolled back when no confirming heartbeat arrives', async () => {
    const contexts = backgroundContexts();
    const deployment = rebootingDeployment();
    const updateDeployment = jest.fn(async () => {
      expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
      return { ...deployment, status: 'ROLLED_BACK' as const };
    });
    const repository = {
      findRebootingTimedOut: jest.fn().mockResolvedValue([deployment]),
      updateDeployment,
    } as unknown as IFirmwareRepository;
    const monitor = new FirmwareConfirmationMonitorService(
      repository,
      { now: () => NOW },
      contexts,
      { info: jest.fn(), error: jest.fn() },
      300,
      100,
    );

    await expect(monitor.monitorOnce()).resolves.toBe(1);
    expect(repository.findRebootingTimedOut).toHaveBeenCalledWith(100, '2026-09-06T11:55:00.000Z');
    expect(updateDeployment).toHaveBeenCalledWith(
      deployment.id,
      'REBOOTING',
      'ROLLED_BACK',
      95,
      NOW.toISOString(),
      'Device did not confirm the new firmware with a post-reboot heartbeat.',
    );
    expect(contexts.current()).toBeUndefined();
  });
});

function rebootingDeployment(): FirmwareDeploymentRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: ORGANIZATION_ID,
    deviceId: '33333333-3333-4333-8333-333333333333',
    releaseId: '44444444-4444-4444-8444-444444444444',
    releaseVersion: '1.2.0',
    status: 'REBOOTING',
    progressPercent: 95,
    previousVersion: '1.1.0',
    eventTokenHash: 'hash',
    requestedBy: '55555555-5555-4555-8555-555555555555',
    requestedAt: '2026-09-06T11:45:00.000Z',
    startedAt: '2026-09-06T11:46:00.000Z',
    updatedAt: '2026-09-06T11:50:00.000Z',
  };
}
