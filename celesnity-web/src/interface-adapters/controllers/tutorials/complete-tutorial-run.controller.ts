import type { CompleteTutorialRunUseCase } from '@/src/application/use-cases/tutorials/complete-tutorial-run.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentCompleteTutorialRun,
  type CompleteTutorialRunViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

import { completeTutorialRunInputSchema, type CompleteTutorialRunInput } from './tutorial.schemas';

export type CompleteTutorialRunController = ReturnType<typeof createCompleteTutorialRunController>;

export const createCompleteTutorialRunController =
  (
    useCase: CompleteTutorialRunUseCase,
  ): ((input: CompleteTutorialRunInput) => Promise<CompleteTutorialRunViewModel>) =>
  async (input) => {
    const parsed = completeTutorialRunInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial completion input', { cause: parsed.error });
    }

    return presentCompleteTutorialRun(await useCase(parsed.data));
  };
