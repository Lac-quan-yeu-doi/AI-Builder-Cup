import type { RepeatTutorialUseCase } from '@/src/application/use-cases/tutorials/repeat-tutorial.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentRepeatTutorial,
  type RepeatTutorialViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

import { repeatTutorialInputSchema, type RepeatTutorialInput } from './tutorial.schemas';

export type RepeatTutorialController = ReturnType<typeof createRepeatTutorialController>;

export const createRepeatTutorialController =
  (
    useCase: RepeatTutorialUseCase,
  ): ((input: RepeatTutorialInput) => Promise<RepeatTutorialViewModel>) =>
  async (input) => {
    const parsed = repeatTutorialInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial repeat input', { cause: parsed.error });
    }

    return presentRepeatTutorial(await useCase(parsed.data));
  };
