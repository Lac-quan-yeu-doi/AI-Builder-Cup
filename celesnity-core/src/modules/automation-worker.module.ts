import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import { AutomationWorkflowSchedulerService } from '@application/automation-workflow/automation-workflow-scheduler.service';
import { AutomationWorkflowSchedulerWorker } from '@infrastructure/worker/automation-workflow/automation-workflow-scheduler.worker';
import { RedpandaAutomationWorkflowConsumer } from '@infrastructure/messaging/automation-workflow/redpanda-automation-workflow.consumer';
import { AutomationWorkflowModule } from '@modules/automation-workflow.module';

/**
 * Background-only composition for automation workflows: the schedule poller
 * and the event consumer that drive `AutomationWorkflowUseCases`. It
 * intentionally does not import API controllers. The use-cases themselves are
 * provided by AutomationWorkflowModule, imported here.
 */
@Module({
  imports: [AutomationWorkflowModule],
  providers: [
    RedpandaAutomationWorkflowConsumer,
    {
      provide: AutomationWorkflowSchedulerService,
      inject: [AutomationWorkflowUseCases, ConfigService],
      useFactory: (
        useCases: AutomationWorkflowUseCases,
        config: ConfigService,
      ): AutomationWorkflowSchedulerService =>
        new AutomationWorkflowSchedulerService(
          useCases,
          config.getOrThrow<number>('AGENT_AUTOMATION_SCHEDULE_BATCH_SIZE'),
          new Logger(AutomationWorkflowSchedulerService.name),
        ),
    },
    {
      provide: AutomationWorkflowSchedulerWorker,
      inject: [AutomationWorkflowSchedulerService, ConfigService],
      useFactory: (
        scheduler: AutomationWorkflowSchedulerService,
        config: ConfigService,
      ): AutomationWorkflowSchedulerWorker =>
        new AutomationWorkflowSchedulerWorker(scheduler, {
          pollIntervalMs: config.getOrThrow<number>('AGENT_AUTOMATION_SCHEDULE_INTERVAL_MS'),
        }),
    },
  ],
  exports: [RedpandaAutomationWorkflowConsumer, AutomationWorkflowSchedulerWorker],
})
export class AutomationWorkerModule {}
