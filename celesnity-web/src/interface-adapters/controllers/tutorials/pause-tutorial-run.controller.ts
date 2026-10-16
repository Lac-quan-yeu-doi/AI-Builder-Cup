import type { PauseTutorialRunUseCase } from '@/src/application/use-cases/tutorials/pause-tutorial-run.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentPauseTutorialRun,
  type PauseTutorialRunViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

import { pauseTutorialRunInputSchema, type PauseTutorialRunInput } from './tutorial.schemas';

export type PauseTutorialRunController = ReturnType<typeof createPauseTutorialRunController>;

export const createPauseTutorialRunController =
  (
    useCase: PauseTutorialRunUseCase,
  ): ((input: PauseTutorialRunInput) => Promise<PauseTutorialRunViewModel>) =>
  async (input) => {
    const parsed = pauseTutorialRunInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial pause input', { cause: parsed.error });
    }

    return presentPauseTutorialRun(await useCase(parsed.data));
  };
