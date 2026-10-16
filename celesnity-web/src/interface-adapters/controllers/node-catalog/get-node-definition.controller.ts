import type { GetNodeDefinitionUseCase } from '@/src/application/use-cases/node-catalog/get-node-definition.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentNodeDefinition,
  type NodeDefinitionViewModel,
} from '@/src/interface-adapters/presenters/node-definition.presenter';

import { nodeTypeSchema } from './node-catalog.schemas';

export type GetNodeDefinitionController = ReturnType<typeof createGetNodeDefinitionController>;

export const createGetNodeDefinitionController =
  (useCase: GetNodeDefinitionUseCase): ((nodeType: string) => Promise<NodeDefinitionViewModel>) =>
  async (nodeType) => {
    const parsed = nodeTypeSchema.safeParse(nodeType);
    if (!parsed.success) {
      throw new InputParseError('Invalid node type', { cause: parsed.error });
    }
    return presentNodeDefinition(await useCase(parsed.data));
  };
