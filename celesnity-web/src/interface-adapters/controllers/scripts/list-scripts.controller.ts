import type { ListScriptsUseCase } from '@/src/application/use-cases/scripts/list-scripts.use-case';
import {
  presentScripts,
  type ScriptViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

export type ListScriptsController = ReturnType<typeof createListScriptsController>;

export const createListScriptsController =
  (useCase: ListScriptsUseCase): (() => Promise<readonly ScriptViewModel[]>) =>
  async () =>
    presentScripts(await useCase());
