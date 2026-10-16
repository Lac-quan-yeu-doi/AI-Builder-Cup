import type { AdvanceTutorialStepUseCase } from '@/src/application/use-cases/tutorials/advance-tutorial-step.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentAdvanceTutorialStep,
  type AdvanceTutorialStepViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

import { advanceTutorialStepInputSchema, type AdvanceTutorialStepInput } from './tutorial.schemas';

export type AdvanceTutorialStepController = ReturnType<typeof createAdvanceTutorialStepController>;

export const createAdvanceTutorialStepController =
  (
    useCase: AdvanceTutorialStepUseCase,
  ): ((input: AdvanceTutorialStepInput) => Promise<AdvanceTutorialStepViewModel>) =>
  async (input) => {
    const parsed = advanceTutorialStepInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial step advance input', { cause: parsed.error });
    }

    return presentAdvanceTutorialStep(await useCase(parsed.data));
  };
