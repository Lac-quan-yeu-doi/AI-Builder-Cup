import type { OpenTutorialWalkthroughUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-walkthrough.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentActiveWalkthrough,
  type ActiveWalkthroughViewModel,
} from '@/src/interface-adapters/presenters/active-walkthrough.presenter';

import {
  openTutorialWalkthroughInputSchema,
  type OpenTutorialWalkthroughInput,
} from './tutorial.schemas';

export type OpenTutorialWalkthroughController = ReturnType<
  typeof createOpenTutorialWalkthroughController
>;

export const createOpenTutorialWalkthroughController =
  (
    useCase: OpenTutorialWalkthroughUseCase,
  ): ((input: OpenTutorialWalkthroughInput) => Promise<ActiveWalkthroughViewModel>) =>
  async (input) => {
    const parsed = openTutorialWalkthroughInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid active tutorial walkthrough input', {
        cause: parsed.error,
      });
    }
    return presentActiveWalkthrough(await useCase(parsed.data));
  };
