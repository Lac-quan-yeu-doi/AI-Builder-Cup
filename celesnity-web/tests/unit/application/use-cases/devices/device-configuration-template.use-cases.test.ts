import { describe, expect, it, vi } from 'vitest';

import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import { createCreateDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/create-device-configuration-template.use-case';
import { createDeployDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/deploy-device-configuration-template.use-case';
import { createListDeviceConfigurationTemplatesUseCase } from '@/src/application/use-cases/devices/list-device-configuration-templates.use-case';

describe('device configuration template use cases', () => {
  it('delegates immutable template creation, listing, and targeted deployment', async () => {
    const createConfigurationTemplate = vi.fn().mockResolvedValue({ id: 'template-1' });
    const listConfigurationTemplates = vi.fn().mockResolvedValue([{ id: 'template-1' }]);
    const deployConfigurationTemplate = vi.fn().mockResolvedValue({ targetCount: 2 });
    const repository = {
      createConfigurationTemplate,
      listConfigurationTemplates,
      deployConfigurationTemplate,
    } as unknown as DeviceRepository;
    const create = createCreateDeviceConfigurationTemplateUseCase(repository);
    const list = createListDeviceConfigurationTemplatesUseCase(repository);
    const deploy = createDeployDeviceConfigurationTemplateUseCase(repository);
    const templateInput = { name: 'Factory sensors', parameters: { samplingRateHz: 2 } };
    const deploymentInput = {
      templateId: '11111111-1111-4111-8111-111111111111',
      deploymentSite: 'Factory 2',
      deviceType: 'SENSOR' as const,
    };

    await create(templateInput);
    await list();
    await deploy(deploymentInput);

    expect(createConfigurationTemplate).toHaveBeenCalledWith(templateInput);
    expect(listConfigurationTemplates).toHaveBeenCalledOnce();
    expect(deployConfigurationTemplate).toHaveBeenCalledWith(deploymentInput);
  });
});
