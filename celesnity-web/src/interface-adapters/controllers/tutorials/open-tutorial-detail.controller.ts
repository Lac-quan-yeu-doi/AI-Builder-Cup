import type { OpenTutorialDetailUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentTutorialDetail,
  type DetailViewModel,
} from '@/src/interface-adapters/presenters/tutorial-detail.presenter';

import { openTutorialDetailInputSchema, type OpenTutorialDetailInput } from './tutorial.schemas';

export type OpenTutorialDetailController = ReturnType<typeof createOpenTutorialDetailController>;

export const createOpenTutorialDetailController =
  (
    useCase: OpenTutorialDetailUseCase,
  ): ((input: OpenTutorialDetailInput) => Promise<DetailViewModel>) =>
  async (input) => {
    const parsed = openTutorialDetailInputSchema.safeParse(input);

    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial detail input', { cause: parsed.error });
    }

    return presentTutorialDetail(await useCase(parsed.data));
  };
