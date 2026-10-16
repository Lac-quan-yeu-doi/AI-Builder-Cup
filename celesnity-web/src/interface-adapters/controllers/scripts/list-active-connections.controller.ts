import type { ListActiveConnectionsUseCase } from '@/src/application/use-cases/scripts/list-active-connections.use-case';
import {
  presentActiveConnectionOptions,
  type ActiveConnectionOptionViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

export type ListActiveConnectionsController = ReturnType<
  typeof createListActiveConnectionsController
>;

export const createListActiveConnectionsController =
  (
    useCase: ListActiveConnectionsUseCase,
  ): (() => Promise<readonly ActiveConnectionOptionViewModel[]>) =>
  async () =>
    presentActiveConnectionOptions(await useCase());
