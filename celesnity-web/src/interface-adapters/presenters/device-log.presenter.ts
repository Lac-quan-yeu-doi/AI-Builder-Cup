import type { DeviceLogEntry } from '@/src/entities/models/device';

export type DeviceLogViewModel = DeviceLogEntry;

export const presentDeviceLog = (entry: DeviceLogEntry): DeviceLogViewModel => ({
  ...entry,
  context: { ...entry.context },
});
