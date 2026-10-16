import type { DeviceAlert } from '@/src/entities/models/device';

export interface DeviceAlertViewModel extends DeviceAlert {
  readonly canAcknowledge: boolean;
  readonly canClear: boolean;
}

export function presentDeviceAlert(alert: DeviceAlert): DeviceAlertViewModel {
  return {
    ...alert,
    snapshot: { ...alert.snapshot },
    canAcknowledge: alert.status === 'RAISED',
    canClear: alert.status !== 'CLEARED',
  };
}
