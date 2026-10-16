import type { DeviceRecord } from '@domain/device-management/models/device';

export interface IDevicePrincipalProvisioner {
  apply(
    device: DeviceRecord,
    credentials: Readonly<Record<string, string>>,
    authorizedTelemetryTopics: readonly string[],
  ): Promise<void>;
}
