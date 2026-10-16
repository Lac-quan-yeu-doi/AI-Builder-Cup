import { describe, expect, it, vi } from 'vitest';

import { createCreateDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/create-device-configuration-template.controller';
import { createDeployDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/deploy-device-configuration-template.controller';

describe('device configuration template controllers', () => {
  it('normalizes a template name and calls its use case once', async () => {
    const useCase = vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: '11111111-1111-4111-8111-111111111111',
        organizationId: '22222222-2222-4222-8222-222222222222',
        version: 1,
        createdBy: 'operator-1',
        createdAt: '2026-09-06T12:00:00.000Z',
        ...input,
      }),
    );
    const controller = createCreateDeviceConfigurationTemplateController(useCase);

    const result = await controller({
      name: ' Factory sensors ',
      parameters: { samplingRateHz: 2, logLevel: 'WARNING' },
    });

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith({
      name: 'Factory sensors',
      parameters: { samplingRateHz: 2, logLevel: 'WARNING' },
    });
    expect(result.name).toBe('Factory sensors');
  });

  it('rejects an unbounded group target before calling the use case', async () => {
    const useCase = vi.fn();
    const controller = createDeployDeviceConfigurationTemplateController(useCase);

    await expect(
      controller({ templateId: '11111111-1111-4111-8111-111111111111' }),
    ).rejects.toMatchObject({ name: 'InputParseError' });
    expect(useCase).not.toHaveBeenCalled();
  });
});
