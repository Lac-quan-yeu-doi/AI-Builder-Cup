import { backgroundContexts } from '../administration/background-principal.fixture';
import { DeviceReconcilerService } from '@application/device-management/device-reconciler.service';
import type { IDeviceCredentialVault } from '@application/device-management/interfaces/i-device-credential-vault';
import type { IDevicePrincipalProvisioner } from '@application/device-management/interfaces/i-device-principal-provisioner';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-05T00:00:00.000Z');

describe('DeviceReconcilerService organization boundary', () => {
  it('runs provisioning and persistence inside the candidate organization context', async () => {
    const contexts = backgroundContexts();
    const candidate = {
      id: '22222222-2222-4222-8222-222222222222',
      publicKey: 'dev_2222',
      organizationId: ORGANIZATION_ID,
      adapterId: '33333333-3333-4333-8333-333333333333',
      adapterKey: 'adp_3333',
      tenantId: '44444444-4444-4444-8444-444444444444',
      tenantStorageKey: 'tnt_factory',
      externalDeviceId: 'gateway-01',
      deviceType: 'GATEWAY' as const,
      name: 'Factory gateway',
      model: 'CEL-GW100',
      lifecycleState: 'MANUFACTURED' as const,
      brokerUrl: 'mqtt://localhost:1883',
      topics: {
        telemetry: 'telemetry',
        firmwareEvents: 'events',
        firmwareCommands: 'commands',
      },
      qos: 1 as const,
      desiredState: 'ACTIVE' as const,
      status: 'PROVISIONING' as const,
      generation: 1,
      observedGeneration: 0,
      expectedCheckInIntervalSeconds: 60,
      missedCheckInThreshold: 3,
      contactStatus: 'NEVER_SEEN' as const,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      credentials: {
        ciphertext: 'ciphertext',
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      },
      attemptId: '55555555-5555-4555-8555-555555555555',
    };
    const completeReconciliation = jest.fn(async () => {
      expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
    });
    const repository = {
      claimReconciliation: jest.fn().mockResolvedValue([candidate]),
      listBoundActiveSensorTelemetryTopics: jest.fn().mockResolvedValue(['sensor/telemetry']),
      schedulePrincipalReconciliation: jest.fn(),
      completeReconciliation,
      failReconciliation: jest.fn(),
    } as unknown as IDeviceRepository;
    const vault = {
      decrypt: jest.fn().mockResolvedValue({ password: 'secret' }),
    } as unknown as IDeviceCredentialVault;
    const provisioner = {
      apply: jest.fn(async () => {
        expect(contexts.require().organizationId).toBe(ORGANIZATION_ID);
      }),
    } as IDevicePrincipalProvisioner;
    const clock: IClock = { now: () => NOW };
    const logger = { info: jest.fn(), error: jest.fn() };
    const reconciler = new DeviceReconcilerService(
      repository,
      vault,
      provisioner,
      clock,
      logger,
      10,
      contexts,
    );

    await expect(reconciler.reconcileOnce()).resolves.toBe(1);

    expect(completeReconciliation).toHaveBeenCalledWith(
      candidate.id,
      candidate.generation,
      candidate.attemptId,
      NOW.toISOString(),
    );
    expect(provisioner.apply).toHaveBeenCalledWith(candidate, { password: 'secret' }, [
      'telemetry',
      'sensor/telemetry',
    ]);
    expect(repository.failReconciliation).not.toHaveBeenCalled();
    expect(contexts.current()).toBeUndefined();
  });

  it('removes a sensor cloud principal and schedules its bound gateway ACL', async () => {
    const contexts = backgroundContexts();
    const candidate = {
      id: '22222222-2222-4222-8222-222222222222',
      publicKey: 'dev_sensor',
      organizationId: ORGANIZATION_ID,
      adapterId: '33333333-3333-4333-8333-333333333333',
      adapterKey: 'adp_3333',
      tenantId: '44444444-4444-4444-8444-444444444444',
      tenantStorageKey: 'tnt_factory',
      externalDeviceId: 'sensor-01',
      deviceType: 'SENSOR' as const,
      gatewayId: '66666666-6666-4666-8666-666666666666',
      name: 'Factory sensor',
      model: 'CEL-S100',
      lifecycleState: 'COMMISSIONED' as const,
      brokerUrl: 'mqtt://localhost:1883',
      topics: {
        telemetry: 'sensor/telemetry',
        firmwareEvents: 'events',
        firmwareCommands: 'commands',
      },
      qos: 1 as const,
      desiredState: 'ACTIVE' as const,
      status: 'PROVISIONING' as const,
      generation: 1,
      observedGeneration: 0,
      expectedCheckInIntervalSeconds: 60,
      missedCheckInThreshold: 3,
      contactStatus: 'NEVER_SEEN' as const,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      credentials: {
        ciphertext: 'ciphertext',
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      },
      attemptId: '55555555-5555-4555-8555-555555555555',
    };
    const repository = {
      claimReconciliation: jest.fn().mockResolvedValue([candidate]),
      listBoundActiveSensorTelemetryTopics: jest.fn(),
      schedulePrincipalReconciliation: jest.fn().mockResolvedValue(undefined),
      completeReconciliation: jest.fn().mockResolvedValue(undefined),
      failReconciliation: jest.fn(),
    } as unknown as IDeviceRepository;
    const provisioner = { apply: jest.fn().mockResolvedValue(undefined) };
    const reconciler = new DeviceReconcilerService(
      repository,
      {
        encrypt: jest.fn(),
        decrypt: jest.fn().mockResolvedValue({ username: 'dev_sensor', password: 'secret' }),
      },
      provisioner,
      { now: () => NOW },
      { info: jest.fn(), error: jest.fn() },
      10,
      contexts,
    );

    await reconciler.reconcileOnce();

    expect(provisioner.apply).toHaveBeenCalledWith(candidate, expect.any(Object), []);
    expect(repository.listBoundActiveSensorTelemetryTopics).not.toHaveBeenCalled();
    expect(repository.schedulePrincipalReconciliation).toHaveBeenCalledWith(
      candidate.gatewayId,
      NOW.toISOString(),
    );
  });
});
