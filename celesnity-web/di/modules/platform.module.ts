import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { publicEnvironment } from '@/src/infrastructure/configuration/public-environment';
import { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import { BrowserSchedulerService } from '@/src/infrastructure/services/browser-scheduler.service';
import { EventSourceExecutionProgressService } from '@/src/infrastructure/services/event-source-execution-progress.service';
import { EventSourceQueryProgressService } from '@/src/infrastructure/services/event-source-query-progress.service';

export function createPlatformModule() {
  const platformModule = createTypedModule();

  platformModule.bind(DI_SYMBOLS.CoreApiClient).toClass(CoreApiClient);
  platformModule
    .bind(DI_SYMBOLS.AgentApiClient)
    .toFactory(() => new CoreApiClient({ baseUrl: publicEnvironment.agentApiUrl }));
  platformModule.bind(DI_SYMBOLS.SchedulerService).toClass(BrowserSchedulerService);
  platformModule
    .bind(DI_SYMBOLS.ExecutionProgressService)
    .toClass(EventSourceExecutionProgressService);
  platformModule.bind(DI_SYMBOLS.QueryProgressService).toClass(EventSourceQueryProgressService);

  return platformModule;
}
