import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createGetScriptUseCase } from '@/src/application/use-cases/scripts/get-script.use-case';
import { createListActiveConnectionsUseCase } from '@/src/application/use-cases/scripts/list-active-connections.use-case';
import { createListScriptVersionsUseCase } from '@/src/application/use-cases/scripts/list-script-versions.use-case';
import { createListScriptsUseCase } from '@/src/application/use-cases/scripts/list-scripts.use-case';
import { createLoadScriptVersionSourceUseCase } from '@/src/application/use-cases/scripts/load-script-version-source.use-case';
import { createSaveAndRunScriptUseCase } from '@/src/application/use-cases/scripts/save-and-run-script.use-case';
import { createSaveScriptUseCase } from '@/src/application/use-cases/scripts/save-script.use-case';
import { CoreApiScriptRepository } from '@/src/infrastructure/repositories/core-api-script.repository';
import { createGetScriptController } from '@/src/interface-adapters/controllers/scripts/get-script.controller';
import { createListActiveConnectionsController } from '@/src/interface-adapters/controllers/scripts/list-active-connections.controller';
import { createListScriptVersionsController } from '@/src/interface-adapters/controllers/scripts/list-script-versions.controller';
import { createListScriptsController } from '@/src/interface-adapters/controllers/scripts/list-scripts.controller';
import { createLoadScriptVersionSourceController } from '@/src/interface-adapters/controllers/scripts/load-script-version-source.controller';
import { createSaveAndRunScriptController } from '@/src/interface-adapters/controllers/scripts/save-and-run-script.controller';
import { createSaveScriptController } from '@/src/interface-adapters/controllers/scripts/save-script.controller';

export function createScriptsModule() {
  const scriptsModule = createTypedModule();

  scriptsModule
    .bind(DI_SYMBOLS.ScriptRepository)
    .toClass(CoreApiScriptRepository, [DI_SYMBOLS.CoreApiClient]);
  scriptsModule
    .bind(DI_SYMBOLS.ListScriptsUseCase)
    .toHigherOrderFunction(createListScriptsUseCase, [DI_SYMBOLS.ScriptRepository]);
  scriptsModule
    .bind(DI_SYMBOLS.GetScriptUseCase)
    .toHigherOrderFunction(createGetScriptUseCase, [DI_SYMBOLS.ScriptRepository]);
  scriptsModule
    .bind(DI_SYMBOLS.ListScriptVersionsUseCase)
    .toHigherOrderFunction(createListScriptVersionsUseCase, [DI_SYMBOLS.ScriptRepository]);
  scriptsModule
    .bind(DI_SYMBOLS.LoadScriptVersionSourceUseCase)
    .toHigherOrderFunction(createLoadScriptVersionSourceUseCase, [DI_SYMBOLS.ScriptRepository]);
  scriptsModule
    .bind(DI_SYMBOLS.ListActiveConnectionsUseCase)
    .toHigherOrderFunction(createListActiveConnectionsUseCase, [DI_SYMBOLS.ScriptRepository]);
  scriptsModule
    .bind(DI_SYMBOLS.SaveScriptUseCase)
    .toHigherOrderFunction(createSaveScriptUseCase, [DI_SYMBOLS.ScriptRepository]);
  scriptsModule
    .bind(DI_SYMBOLS.SaveAndRunScriptUseCase)
    .toHigherOrderFunction(createSaveAndRunScriptUseCase, [DI_SYMBOLS.ScriptRepository]);

  scriptsModule
    .bind(DI_SYMBOLS.ListScriptsController)
    .toHigherOrderFunction(createListScriptsController, [DI_SYMBOLS.ListScriptsUseCase]);
  scriptsModule
    .bind(DI_SYMBOLS.GetScriptController)
    .toHigherOrderFunction(createGetScriptController, [DI_SYMBOLS.GetScriptUseCase]);
  scriptsModule
    .bind(DI_SYMBOLS.ListScriptVersionsController)
    .toHigherOrderFunction(createListScriptVersionsController, [
      DI_SYMBOLS.ListScriptVersionsUseCase,
    ]);
  scriptsModule
    .bind(DI_SYMBOLS.LoadScriptVersionSourceController)
    .toHigherOrderFunction(createLoadScriptVersionSourceController, [
      DI_SYMBOLS.LoadScriptVersionSourceUseCase,
    ]);
  scriptsModule
    .bind(DI_SYMBOLS.ListActiveConnectionsController)
    .toHigherOrderFunction(createListActiveConnectionsController, [
      DI_SYMBOLS.ListActiveConnectionsUseCase,
    ]);
  scriptsModule
    .bind(DI_SYMBOLS.SaveScriptController)
    .toHigherOrderFunction(createSaveScriptController, [DI_SYMBOLS.SaveScriptUseCase]);
  scriptsModule
    .bind(DI_SYMBOLS.SaveAndRunScriptController)
    .toHigherOrderFunction(createSaveAndRunScriptController, [DI_SYMBOLS.SaveAndRunScriptUseCase]);

  return scriptsModule;
}
