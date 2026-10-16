import type {
  Device,
  DeviceRegistration,
  IssuedDeviceCredential,
} from '@/src/entities/models/device';

export interface DeviceViewModel extends Device {
  readonly isReady: boolean;
  readonly canActivate: boolean;
  readonly canSuspend: boolean;
  readonly connectivity: 'never-seen' | 'online' | 'lost-contact';
}

export interface DeviceRegistrationViewModel {
  readonly device: DeviceViewModel;
  readonly credential: IssuedDeviceCredential;
}

export function presentDevice(device: Device): DeviceViewModel {
  return {
    ...device,
    topics: { ...device.topics },
    isReady: device.status === 'ACTIVE' && device.generation === device.observedGeneration,
    canActivate: device.desiredState === 'SUSPENDED',
    canSuspend: device.desiredState === 'ACTIVE',
    connectivity:
      device.contactStatus === 'NEVER_SEEN'
        ? 'never-seen'
        : device.contactStatus === 'ONLINE'
          ? 'online'
          : 'lost-contact',
  };
}

export function presentDeviceRegistration(
  registration: DeviceRegistration,
): DeviceRegistrationViewModel {
  return {
    device: presentDevice(registration.device),
    credential: { ...registration.credential },
  };
}
