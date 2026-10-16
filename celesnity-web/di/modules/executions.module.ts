import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createCancelExecutionUseCase } from '@/src/application/use-cases/executions/cancel-execution.use-case';
import { createGetExecutionLogsUseCase } from '@/src/application/use-cases/executions/get-execution-logs.use-case';
import { createGetExecutionUseCase } from '@/src/application/use-cases/executions/get-execution.use-case';
import { createListExecutionsUseCase } from '@/src/application/use-cases/executions/list-executions.use-case';
import { createMonitorExecutionUseCase } from '@/src/application/use-cases/executions/monitor-execution.use-case';
import { createRerunExecutionUseCase } from '@/src/application/use-cases/executions/rerun-execution.use-case';
import { CoreApiExecutionRepository } from '@/src/infrastructure/repositories/core-api-execution.repository';
import { createCancelExecutionController } from '@/src/interface-adapters/controllers/executions/cancel-execution.controller';
import { createGetExecutionLogsController } from '@/src/interface-adapters/controllers/executions/get-execution-logs.controller';
import { createGetExecutionController } from '@/src/interface-adapters/controllers/executions/get-execution.controller';
import { createListExecutionsController } from '@/src/interface-adapters/controllers/executions/list-executions.controller';
import { createMonitorExecutionController } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import { createRerunExecutionController } from '@/src/interface-adapters/controllers/executions/rerun-execution.controller';

export function createExecutionsModule() {
  const executionsModule = createTypedModule();

  executionsModule
    .bind(DI_SYMBOLS.ExecutionRepository)
    .toClass(CoreApiExecutionRepository, [DI_SYMBOLS.CoreApiClient]);
  executionsModule
    .bind(DI_SYMBOLS.ListExecutionsUseCase)
    .toHigherOrderFunction(createListExecutionsUseCase, [DI_SYMBOLS.ExecutionRepository]);
  executionsModule
    .bind(DI_SYMBOLS.GetExecutionUseCase)
    .toHigherOrderFunction(createGetExecutionUseCase, [DI_SYMBOLS.ExecutionRepository]);
  executionsModule
    .bind(DI_SYMBOLS.CancelExecutionUseCase)
    .toHigherOrderFunction(createCancelExecutionUseCase, [DI_SYMBOLS.ExecutionRepository]);
  executionsModule
    .bind(DI_SYMBOLS.GetExecutionLogsUseCase)
    .toHigherOrderFunction(createGetExecutionLogsUseCase, [DI_SYMBOLS.ExecutionRepository]);
  executionsModule
    .bind(DI_SYMBOLS.RerunExecutionUseCase)
    .toHigherOrderFunction(createRerunExecutionUseCase, [DI_SYMBOLS.ExecutionRepository]);
  executionsModule
    .bind(DI_SYMBOLS.MonitorExecutionUseCase)
    .toHigherOrderFunction(createMonitorExecutionUseCase, [
      DI_SYMBOLS.ExecutionRepository,
      DI_SYMBOLS.ExecutionProgressService,
      DI_SYMBOLS.SchedulerService,
    ]);

  executionsModule
    .bind(DI_SYMBOLS.ListExecutionsController)
    .toHigherOrderFunction(createListExecutionsController, [DI_SYMBOLS.ListExecutionsUseCase]);
  executionsModule
    .bind(DI_SYMBOLS.GetExecutionController)
    .toHigherOrderFunction(createGetExecutionController, [DI_SYMBOLS.GetExecutionUseCase]);
  executionsModule
    .bind(DI_SYMBOLS.CancelExecutionController)
    .toHigherOrderFunction(createCancelExecutionController, [DI_SYMBOLS.CancelExecutionUseCase]);
  executionsModule
    .bind(DI_SYMBOLS.GetExecutionLogsController)
    .toHigherOrderFunction(createGetExecutionLogsController, [DI_SYMBOLS.GetExecutionLogsUseCase]);
  executionsModule
    .bind(DI_SYMBOLS.RerunExecutionController)
    .toHigherOrderFunction(createRerunExecutionController, [DI_SYMBOLS.RerunExecutionUseCase]);
  executionsModule
    .bind(DI_SYMBOLS.MonitorExecutionController)
    .toHigherOrderFunction(createMonitorExecutionController, [DI_SYMBOLS.MonitorExecutionUseCase]);

  return executionsModule;
}
