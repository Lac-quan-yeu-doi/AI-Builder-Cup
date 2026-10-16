import { backgroundContexts } from '../administration/background-principal.fixture';
import { DeviceContactMonitorService } from '@application/device-management/device-contact-monitor.service';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { DeviceRecord } from '@domain/device-management/models/device';

const NOW = new Date('2026-09-05T12:00:00.000Z');
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('DeviceContactMonitorService', () => {
  it('raises one organization-scoped critical alert after the contact deadline', async () => {
    const contexts = backgroundContexts();
    const candidate = device();
    const createAlert = jest.fn(async (alert) => {
      expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
      return alert;
    });
    const repository = {
      findLostContactCandidates: jest.fn().mockResolvedValue([candidate]),
      markLostContact: jest.fn(async () => ({ ...candidate, contactStatus: 'LOST_CONTACT' })),
      createAlert,
    } as unknown as IDeviceRepository;
    const unitOfWork: IUnitOfWork = {
      commit: async (work) => work({ record: jest.fn() }),
    };
    const monitor = new DeviceContactMonitorService(
      repository,
      unitOfWork,
      { now: () => NOW },
      { next: () => '22222222-2222-4222-8222-222222222222' },
      contexts,
      { info: jest.fn(), error: jest.fn() },
      100,
    );

    await expect(monitor.monitorOnce()).resolves.toBe(1);
    expect(repository.markLostContact).toHaveBeenCalledWith(
      candidate.id,
      candidate.contactDeadlineAt,
      NOW.toISOString(),
    );
    expect(createAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: candidate.id,
        type: 'LOSS_OF_CONTACT',
        severity: 'CRITICAL',
        status: 'RAISED',
      }),
    );
    expect(contexts.current()).toBeUndefined();
  });
});

function device(): DeviceRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    organizationId: ORGANIZATION_ID,
    publicKey: 'dev_gateway',
    adapterId: '44444444-4444-4444-8444-444444444444',
    adapterKey: 'adp_factory',
    tenantId: '55555555-5555-4555-8555-555555555555',
    tenantStorageKey: 'tnt_factory',
    externalDeviceId: 'gateway-1',
    deviceType: 'GATEWAY',
    name: 'Factory gateway',
    model: 'CEL-GW100',
    lifecycleState: 'COMMISSIONED',
    brokerUrl: 'mqtts://mqtt.example.test:8883',
    topics: { telemetry: 'telemetry', firmwareEvents: 'events', firmwareCommands: 'commands' },
    qos: 1,
    credentials: {
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    },
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    desiredConfigurationVersion: 0,
    appliedConfigurationVersion: 0,
    reportedConfigurationVersion: 0,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    lastSeenAt: '2026-09-05T11:55:00.000Z',
    contactDeadlineAt: '2026-09-05T11:58:00.000Z',
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T11:55:00.000Z',
  };
}
