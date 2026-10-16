import type { ResumeTutorialRunUseCase } from '@/src/application/use-cases/tutorials/resume-tutorial-run.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentResumeTutorialRun,
  type ResumeTutorialRunViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

import { resumeTutorialRunInputSchema, type ResumeTutorialRunInput } from './tutorial.schemas';

export type ResumeTutorialRunController = ReturnType<typeof createResumeTutorialRunController>;

export const createResumeTutorialRunController =
  (
    useCase: ResumeTutorialRunUseCase,
  ): ((input: ResumeTutorialRunInput) => Promise<ResumeTutorialRunViewModel>) =>
  async (input) => {
    const parsed = resumeTutorialRunInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid tutorial resume input', { cause: parsed.error });
    }

    return presentResumeTutorialRun(await useCase(parsed.data));
  };
