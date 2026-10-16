import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type RotateDeviceCredentialUseCase = ReturnType<typeof createRotateDeviceCredentialUseCase>;
export const createRotateDeviceCredentialUseCase = (repository: DeviceRepository) => (id: string) =>
  repository.rotateCredential(id);
