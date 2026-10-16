import type { LoadNodePaletteUseCase } from '@/src/application/use-cases/node-catalog/load-node-palette.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentNodePalette,
  type NodePaletteGroupViewModel,
} from '@/src/interface-adapters/presenters/node-definition.presenter';

import { paletteKeywordSchema } from './node-catalog.schemas';

export type LoadNodePaletteController = ReturnType<typeof createLoadNodePaletteController>;

export const createLoadNodePaletteController =
  (
    useCase: LoadNodePaletteUseCase,
  ): ((keyword?: string) => Promise<readonly NodePaletteGroupViewModel[]>) =>
  async (keyword) => {
    const parsed = paletteKeywordSchema.safeParse(keyword);
    if (!parsed.success) {
      throw new InputParseError('Invalid node palette keyword', { cause: parsed.error });
    }
    return presentNodePalette(await useCase(parsed.data));
  };
