import type {
  DeviceLogEntry,
  DeviceLogKind,
  DeviceLogLevel,
} from '@domain/device-management/models/device-log';

export interface DeviceLogFilter {
  readonly deviceId: string;
  readonly level?: DeviceLogLevel;
  readonly kind?: DeviceLogKind;
  readonly limit: number;
}

export interface IDeviceLogRepository {
  create(entry: DeviceLogEntry): Promise<DeviceLogEntry | 'SOURCE_EVENT_CONFLICT'>;
  findBySourceEventId(sourceEventId: string): Promise<DeviceLogEntry | undefined>;
  list(filter: DeviceLogFilter): Promise<readonly DeviceLogEntry[]>;
}
