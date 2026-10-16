import type {
  DeviceConfiguration,
  DeviceConfigurationRecord,
  DeviceConfigurationStatus,
  DeviceConfigurationTemplate,
} from '@domain/device-management/models/device-configuration';

export interface IDeviceConfigurationRepository {
  nextVersion(deviceId: string): Promise<number>;
  create(
    configuration: DeviceConfigurationRecord,
  ): Promise<DeviceConfiguration | 'VERSION_CONFLICT'>;
  list(deviceId: string): Promise<readonly DeviceConfiguration[]>;
  findTimedOut(
    limit: number,
    dispatchedBefore: string,
  ): Promise<readonly DeviceConfigurationRecord[]>;
  findById(id: string): Promise<DeviceConfigurationRecord | undefined>;
  confirmApplied(
    deviceId: string,
    version: number,
    confirmedAt: string,
  ): Promise<DeviceConfiguration | undefined>;
  updateStatus(
    id: string,
    expectedStatus: DeviceConfigurationStatus,
    status: DeviceConfigurationStatus,
    now: string,
    error?: string,
  ): Promise<DeviceConfiguration | undefined>;
  nextTemplateVersion(name: string): Promise<number>;
  createTemplate(
    template: DeviceConfigurationTemplate,
  ): Promise<DeviceConfigurationTemplate | 'VERSION_CONFLICT'>;
  listTemplates(): Promise<readonly DeviceConfigurationTemplate[]>;
  findTemplateById(id: string): Promise<DeviceConfigurationTemplate | undefined>;
}
