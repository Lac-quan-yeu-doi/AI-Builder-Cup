import type { ListScriptVersionsUseCase } from '@/src/application/use-cases/scripts/list-script-versions.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentScriptVersions,
  type ScriptVersionViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

import { scriptIdSchema } from './script.schemas';

export type ListScriptVersionsController = ReturnType<typeof createListScriptVersionsController>;

export const createListScriptVersionsController =
  (
    useCase: ListScriptVersionsUseCase,
  ): ((scriptId: string) => Promise<readonly ScriptVersionViewModel[]>) =>
  async (scriptId) => {
    const parsed = scriptIdSchema.safeParse(scriptId);
    if (!parsed.success) {
      throw new InputParseError('Invalid script identifier', { cause: parsed.error });
    }
    return presentScriptVersions(await useCase(parsed.data));
  };
