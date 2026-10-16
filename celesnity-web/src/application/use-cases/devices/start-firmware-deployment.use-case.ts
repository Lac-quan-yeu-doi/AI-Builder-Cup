import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export interface StartFirmwareDeploymentInput {
  readonly deviceId: string;
  readonly releaseId: string;
}

export type StartFirmwareDeploymentUseCase = ReturnType<
  typeof createStartFirmwareDeploymentUseCase
>;

export const createStartFirmwareDeploymentUseCase =
  (repository: DeviceRepository) => (input: StartFirmwareDeploymentInput) =>
    repository.startFirmwareDeployment(input.deviceId, input.releaseId);
