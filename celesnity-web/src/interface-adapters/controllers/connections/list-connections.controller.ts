import type { ListConnectionsUseCase } from '@/src/application/use-cases/connections/list-connections.use-case';
import {
  presentConnections,
  type ConnectionViewModel,
} from '@/src/interface-adapters/presenters/connection.presenter';

export type ListConnectionsController = ReturnType<typeof createListConnectionsController>;

export const createListConnectionsController =
  (useCase: ListConnectionsUseCase): (() => Promise<readonly ConnectionViewModel[]>) =>
  async () =>
    presentConnections(await useCase());
