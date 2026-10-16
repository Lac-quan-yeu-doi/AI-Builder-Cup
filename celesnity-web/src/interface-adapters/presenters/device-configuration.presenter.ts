import type {
  DeviceConfiguration,
  DeviceConfigurationTemplate,
  DeviceConfigurationTemplateDeployment,
} from '@/src/entities/models/device';

export type DeviceConfigurationViewModel = DeviceConfiguration;

export const presentDeviceConfiguration = (
  configuration: DeviceConfiguration,
): DeviceConfigurationViewModel => ({
  ...configuration,
  parameters: { ...configuration.parameters },
});

export type DeviceConfigurationTemplateViewModel = DeviceConfigurationTemplate;
export type DeviceConfigurationTemplateDeploymentViewModel = DeviceConfigurationTemplateDeployment;

export const presentDeviceConfigurationTemplate = (
  template: DeviceConfigurationTemplate,
): DeviceConfigurationTemplateViewModel => ({
  ...template,
  parameters: { ...template.parameters },
});

export const presentDeviceConfigurationTemplateDeployment = (
  deployment: DeviceConfigurationTemplateDeployment,
): DeviceConfigurationTemplateDeploymentViewModel => ({
  ...deployment,
  template: presentDeviceConfigurationTemplate(deployment.template),
  configurations: deployment.configurations.map(presentDeviceConfiguration),
  failures: deployment.failures.map((failure) => ({ ...failure })),
});
