import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';

export type ListDeviceLogsUseCase = ReturnType<typeof createListDeviceLogsUseCase>;

export const createListDeviceLogsUseCase = (repository: DeviceRepository) => (deviceId: string) =>
  repository.listLogs(deviceId, { limit: 100 });
