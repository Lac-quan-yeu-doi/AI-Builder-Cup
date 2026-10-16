import type { StartTutorialRunUseCase } from '@/src/application/use-cases/tutorials/start-tutorial-run.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentStartTutorialRun,
  type StartTutorialRunViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

import { startTutorialRunInputSchema, type StartTutorialRunInput } from './tutorial.schemas';

export type StartTutorialRunController = ReturnType<typeof createStartTutorialRunController>;

export const createStartTutorialRunController =
  (
    useCase: StartTutorialRunUseCase,
  ): ((input: StartTutorialRunInput) => Promise<StartTutorialRunViewModel>) =>
  async (input) => {
    const parsed = startTutorialRunInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial start input', { cause: parsed.error });
    }

    return presentStartTutorialRun(await useCase(parsed.data));
  };
