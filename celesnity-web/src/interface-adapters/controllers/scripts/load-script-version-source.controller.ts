import type { LoadScriptVersionSourceUseCase } from '@/src/application/use-cases/scripts/load-script-version-source.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentPublishedScriptSource,
  type PublishedScriptSourceViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

import { scriptVersionInputSchema } from './script.schemas';

export type LoadScriptVersionSourceController = ReturnType<
  typeof createLoadScriptVersionSourceController
>;

export const createLoadScriptVersionSourceController =
  (
    useCase: LoadScriptVersionSourceUseCase,
  ): ((scriptId: string, versionNumber: number) => Promise<PublishedScriptSourceViewModel>) =>
  async (scriptId, versionNumber) => {
    const parsed = scriptVersionInputSchema.safeParse({ scriptId, versionNumber });
    if (!parsed.success) {
      throw new InputParseError('Invalid script version identifier', { cause: parsed.error });
    }
    return presentPublishedScriptSource(
      await useCase(parsed.data.scriptId, parsed.data.versionNumber),
    );
  };
