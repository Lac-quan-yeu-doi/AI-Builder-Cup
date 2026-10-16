import { describe, expect, it, vi } from 'vitest';

import { createListDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/list-device-lifecycle.controller';
import { createReplaceDeviceController } from '@/src/interface-adapters/controllers/devices/replace-device.controller';
import { createTransitionDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/transition-device-lifecycle.controller';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

describe('device lifecycle controllers', () => {
  it('validates and delegates one lifecycle transition', async () => {
    const useCase = vi.fn().mockResolvedValue(device());
    const controller = createTransitionDeviceLifecycleController(useCase);
    const result = await controller({
      id: DEVICE_ID,
      state: 'PROVISIONED',
    });
    expect(useCase).toHaveBeenCalledOnce();
    expect(result.lifecycleState).toBe('MANUFACTURED');
  });

  it('rejects an invalid lifecycle device UUID before the use case', async () => {
    const useCase = vi.fn();
    const controller = createTransitionDeviceLifecycleController(useCase);
    await expect(controller({ id: 'invalid', state: 'PROVISIONED' })).rejects.toMatchObject({
      name: 'InputParseError',
    });
    expect(useCase).not.toHaveBeenCalled();
  });

  it('copies lifecycle history returned to the UI', async () => {
    const transition = {
      id: '22222222-2222-4222-8222-222222222222',
      deviceId: DEVICE_ID,
      toState: 'MANUFACTURED' as const,
      operatorId: 'factory-tool',
      transitionedAt: '2026-08-24T00:00:00.000Z',
    };
    const controller = createListDeviceLifecycleController(vi.fn().mockResolvedValue([transition]));
    const result = await controller(DEVICE_ID);
    expect(result).toEqual([transition]);
    expect(result[0]).not.toBe(transition);
  });

  it('validates a replacement and presents the registration', async () => {
    const useCase = vi.fn().mockResolvedValue({
      device: device(),
      credential: { username: 'dev-1', password: 'secret' },
    });
    const controller = createReplaceDeviceController(useCase);
    const result = await controller({
      id: DEVICE_ID,
      externalDeviceId: 'sensor-002',
      name: 'Replacement sensor',
      model: 'CEL-T100',
    });
    expect(useCase).toHaveBeenCalledOnce();
    expect(result.credential.password).toBe('secret');
  });
});

function device() {
  return {
    id: DEVICE_ID,
    deviceKey: 'dev-1',
    adapterId: '33333333-3333-4333-8333-333333333333',
    adapterKey: 'adp-1',
    tenantStorageKey: 'tenant-1',
    externalDeviceId: 'sensor-001',
    deviceType: 'SENSOR' as const,
    name: 'Sensor',
    model: 'CEL-T100',
    lifecycleState: 'MANUFACTURED' as const,
    brokerUrl: 'mqtt://localhost:1883',
    topics: { telemetry: 't', firmwareEvents: 'e', firmwareCommands: 'c' },
    qos: 1 as const,
    desiredState: 'ACTIVE' as const,
    status: 'ACTIVE' as const,
    generation: 1,
    observedGeneration: 1,
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}
