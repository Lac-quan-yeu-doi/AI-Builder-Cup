import type { NodeCatalogRepository } from '@/src/application/repositories/node-catalog.repository.interface';

export type GetNodeDefinitionUseCase = ReturnType<typeof createGetNodeDefinitionUseCase>;

export const createGetNodeDefinitionUseCase =
  (repository: NodeCatalogRepository) => (nodeType: string) =>
    repository.getDefinition(nodeType);
