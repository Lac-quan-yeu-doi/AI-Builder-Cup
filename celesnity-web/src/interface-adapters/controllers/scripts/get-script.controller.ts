import type { GetScriptUseCase } from '@/src/application/use-cases/scripts/get-script.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentScript,
  type ScriptViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

import { scriptIdSchema } from './script.schemas';

export type GetScriptController = ReturnType<typeof createGetScriptController>;

export const createGetScriptController =
  (useCase: GetScriptUseCase): ((id: string) => Promise<ScriptViewModel>) =>
  async (id) => {
    const parsed = scriptIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid script identifier', { cause: parsed.error });
    }
    return presentScript(await useCase(parsed.data));
  };
