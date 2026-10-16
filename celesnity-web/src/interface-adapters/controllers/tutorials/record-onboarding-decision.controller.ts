import type { RecordOnboardingDecisionUseCase } from '@/src/application/use-cases/tutorials/record-onboarding-decision.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentRecordedOnboardingDecision,
  type RecordedOnboardingDecisionViewModel,
} from '@/src/interface-adapters/presenters/onboarding.presenter';

import {
  recordOnboardingDecisionInputSchema,
  type RecordOnboardingDecisionInput,
} from './tutorial.schemas';

export type RecordOnboardingDecisionController = ReturnType<
  typeof createRecordOnboardingDecisionController
>;

export const createRecordOnboardingDecisionController =
  (
    useCase: RecordOnboardingDecisionUseCase,
  ): ((input: RecordOnboardingDecisionInput) => Promise<RecordedOnboardingDecisionViewModel>) =>
  async (input) => {
    const parsed = recordOnboardingDecisionInputSchema.safeParse(input);

    if (!parsed.success) {
      throw new InputParseError('Invalid onboarding decision input', { cause: parsed.error });
    }

    return presentRecordedOnboardingDecision(await useCase(parsed.data));
  };
