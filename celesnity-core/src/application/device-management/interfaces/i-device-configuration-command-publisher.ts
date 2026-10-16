import type { Device } from '@domain/device-management/models/device';
import type { DeviceConfigurationCommand } from '@domain/device-management/models/device-configuration';

export interface IDeviceConfigurationCommandPublisher {
  publish(device: Device, command: DeviceConfigurationCommand): Promise<void>;
  clear(device: Device): Promise<void>;
}
