import type { ManageStreamAdaptersUseCase } from '@/src/application/use-cases/streaming/manage-stream-adapters.use-case';
import type { CreateMqttStreamAdapterInput } from '@/src/entities/models/streaming';
import {
  presentStreamAdapter,
  presentStreamAdapterRegistration,
} from '@/src/interface-adapters/presenters/streaming.presenter';

export type ManageStreamAdaptersController = ReturnType<
  typeof createManageStreamAdaptersController
>;

export const createManageStreamAdaptersController = (useCase: ManageStreamAdaptersUseCase) => {
  const list = async () => (await useCase.list()).map(presentStreamAdapter);
  return Object.assign(list, {
    list,
    create: async (input: CreateMqttStreamAdapterInput) =>
      presentStreamAdapterRegistration(await useCase.create(input)),
    pause: async (id: string) => presentStreamAdapter(await useCase.pause(id)),
    resume: async (id: string) => presentStreamAdapter(await useCase.resume(id)),
    rotateCredential: async (id: string) =>
      presentStreamAdapterRegistration(await useCase.rotateCredential(id)),
    archive: (id: string) => useCase.archive(id),
  });
};
