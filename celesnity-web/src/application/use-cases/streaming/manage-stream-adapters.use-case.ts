import type { StreamingRepository } from '@/src/application/repositories/streaming.repository.interface';
import type { CreateMqttStreamAdapterInput } from '@/src/entities/models/streaming';

export type ManageStreamAdaptersUseCase = ReturnType<typeof createManageStreamAdaptersUseCase>;

export const createManageStreamAdaptersUseCase = (repository: StreamingRepository) => ({
  list: () => repository.list(),
  create: (input: CreateMqttStreamAdapterInput) => repository.create(input),
  pause: (id: string) => repository.pause(id),
  resume: (id: string) => repository.resume(id),
  rotateCredential: (id: string) => repository.rotateCredential(id),
  archive: (id: string) => repository.archive(id),
});
