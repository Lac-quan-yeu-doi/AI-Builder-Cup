import type { RerunExecutionUseCase } from '@/src/application/use-cases/executions/rerun-execution.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ScriptExecutionVersion } from '@/src/application/use-cases/executions/rerun-execution.use-case';
import {
  presentRerunOutcome,
  type RerunOutcomeViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';

import { rerunExecutionInputSchema } from './execution.schemas';

export type RerunExecutionController = ReturnType<typeof createRerunExecutionController>;

export const createRerunExecutionController =
  (
    useCase: RerunExecutionUseCase,
  ): ((execution: ScriptExecutionVersion) => Promise<RerunOutcomeViewModel>) =>
  async (execution) => {
    const parsed = rerunExecutionInputSchema.safeParse(execution);
    if (!parsed.success) {
      throw new InputParseError('Invalid execution rerun input', { cause: parsed.error });
    }
    return presentRerunOutcome(await useCase(parsed.data));
  };
