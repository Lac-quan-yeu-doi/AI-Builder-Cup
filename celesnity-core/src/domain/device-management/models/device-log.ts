export type DeviceLogLevel = 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
export type DeviceLogKind = 'OPERATIONAL' | 'FAULT';

export interface DeviceLogEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly sourceEventId: string;
  readonly level: DeviceLogLevel;
  readonly kind: DeviceLogKind;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
  readonly receivedAt: string;
}
