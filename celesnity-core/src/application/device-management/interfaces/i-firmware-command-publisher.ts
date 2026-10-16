import type { Device } from '@domain/device-management/models/device';
import type { FirmwareCommand } from '@domain/device-management/models/firmware';

export interface IFirmwareCommandPublisher {
  publish(device: Device, command: FirmwareCommand): Promise<void>;
}
